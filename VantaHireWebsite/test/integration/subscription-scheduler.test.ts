// @vitest-environment node
import '../setup.integration';
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { db } from '../../server/db';
import {
  organizations,
  organizationMembers,
  organizationSubscriptions,
  subscriptionAlerts,
  subscriptionPlans,
  users,
} from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import {
  addOrganizationMember,
  createOrganizationWithOwner,
  createRecruiterUser,
  ensurePlan,
} from '../utils/db-helpers';
import {
  processGracePeriodExpirations,
  sendSubscriptionRenewalReminders,
} from '../../server/jobScheduler';

const emailMocks = vi.hoisted(() => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  sendContactNotification: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../server/simpleEmailService', () => ({
  getEmailService: vi.fn(async () => emailMocks),
}));

const HAS_DB = !!process.env.DATABASE_URL;
const maybeDescribe = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[TEST] Skipping subscription scheduler tests: DATABASE_URL not set');
}

maybeDescribe('Subscription scheduler tasks', () => {
  const created = {
    userIds: [] as number[],
    orgIds: [] as number[],
    planIds: [] as number[],
    subscriptionIds: [] as number[],
  };
  const createdAlerts: number[] = [];

  beforeAll(() => {
    process.env.BASE_URL = 'http://localhost:5000';
  });

  afterEach(async () => {
    emailMocks.sendEmail.mockClear();
    emailMocks.sendContactNotification.mockClear();

    if (!HAS_DB) return;

    if (createdAlerts.length > 0) {
      await db.delete(subscriptionAlerts)
        .where(inArray(subscriptionAlerts.id, createdAlerts));
    }

    if (created.subscriptionIds.length > 0) {
      await db.delete(organizationSubscriptions)
        .where(inArray(organizationSubscriptions.id, created.subscriptionIds));
    }

    if (created.orgIds.length > 0) {
      await db.delete(organizations)
        .where(inArray(organizations.id, created.orgIds));
    }

    if (created.userIds.length > 0) {
      await db.delete(users)
        .where(inArray(users.id, created.userIds));
    }

    if (created.planIds.length > 0) {
      await db.delete(subscriptionPlans)
        .where(inArray(subscriptionPlans.id, created.planIds));
    }

    createdAlerts.length = 0;
    created.userIds = [];
    created.orgIds = [];
    created.planIds = [];
    created.subscriptionIds = [];
  });

  it('sends 7-day, 3-day, and 1-day renewal reminders', async () => {
    const { plan, created: planCreated } = await ensurePlan(`renew_plan_${Date.now()}`);
    if (planCreated) created.planIds.push(plan.id);

    const now = new Date();
    const reminderDays = [
      { offsetDays: 7, alertType: 'renewal_7day' },
      { offsetDays: 3, alertType: 'renewal_3day' },
      { offsetDays: 1, alertType: 'renewal_1day' },
    ] as const;

    for (const reminder of reminderDays) {
      const owner = await createRecruiterUser({
        username: `reminder_${reminder.offsetDays}_${Date.now()}@example.com`,
        password: 'password',
      });
      created.userIds.push(owner.id);

      const org = await createOrganizationWithOwner({
        name: `Reminder Org ${reminder.offsetDays} ${Date.now()}`,
        ownerId: owner.id,
        billingContactEmail: `billing_${reminder.offsetDays}_${Date.now()}@example.com`,
      });
      created.orgIds.push(org.id);

      const periodEnd = new Date(now.getTime() + reminder.offsetDays * 24 * 60 * 60 * 1000);

      const [subscription] = await db.insert(organizationSubscriptions).values({
        organizationId: org.id,
        planId: plan.id,
        seats: 2,
        billingCycle: 'monthly',
        status: 'active',
        startDate: now,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      }).returning();
      created.subscriptionIds.push(subscription.id);
    }

    await sendSubscriptionRenewalReminders();

    const alerts = await db.query.subscriptionAlerts.findMany({
      where: inArray(subscriptionAlerts.subscriptionId, created.subscriptionIds),
    });
    alerts.forEach(alert => createdAlerts.push(alert.id));

    expect(alerts).toHaveLength(3);
    for (const reminder of reminderDays) {
      const match = alerts.find(alert => alert.alertType === reminder.alertType);
      expect(match).toBeTruthy();
    }

    expect(emailMocks.sendEmail).toHaveBeenCalledTimes(3);
  });

  it('downgrades expired grace period and unseats extra members', async () => {
    const { plan, created: planCreated } = await ensurePlan(`past_due_plan_${Date.now()}`);
    if (planCreated) created.planIds.push(plan.id);

    const freePlanResult = await ensurePlan('free', {
      displayName: 'Free',
      pricePerSeatMonthly: 0,
      pricePerSeatAnnual: 0,
      aiCreditsPerSeatMonthly: 5,
      features: { basic_ats: true },
    });
    if (freePlanResult.created) created.planIds.push(freePlanResult.plan.id);

    const owner = await createRecruiterUser({
      username: `owner_grace_${Date.now()}@example.com`,
      password: 'password',
    });
    const member = await createRecruiterUser({
      username: `member_grace_${Date.now()}@example.com`,
      password: 'password',
    });
    created.userIds.push(owner.id, member.id);

    const org = await createOrganizationWithOwner({
      name: `Grace Org ${Date.now()}`,
      ownerId: owner.id,
      billingContactEmail: `grace_billing_${Date.now()}@example.com`,
    });
    created.orgIds.push(org.id);

    await addOrganizationMember({
      organizationId: org.id,
      userId: member.id,
      role: 'member',
      seatAssigned: true,
    });

    const now = new Date();
    const graceEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [subscription] = await db.insert(organizationSubscriptions).values({
      organizationId: org.id,
      planId: plan.id,
      seats: 3,
      billingCycle: 'monthly',
      status: 'past_due',
      startDate: now,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
      gracePeriodEndDate: graceEnd,
    }).returning();
    created.subscriptionIds.push(subscription.id);

    await processGracePeriodExpirations();

    const updatedSubscription = await db.query.organizationSubscriptions.findFirst({
      where: eq(organizationSubscriptions.id, subscription.id),
    });
    expect(updatedSubscription?.status).toBe('cancelled');
    expect(updatedSubscription?.seats).toBe(1);
    expect(updatedSubscription?.planId).toBe(freePlanResult.plan.id);

    const members = await db.query.organizationMembers.findMany({
      where: eq(organizationMembers.organizationId, org.id),
    });
    const ownerMember = members.find(m => m.role === 'owner');
    const otherMember = members.find(m => m.userId === member.id);

    expect(ownerMember?.seatAssigned).toBe(true);
    expect(otherMember?.seatAssigned).toBe(false);

    expect(emailMocks.sendEmail).toHaveBeenCalled();
    const sentTo = emailMocks.sendEmail.mock.calls.map(call => call[0].to);
    expect(sentTo).toContain(owner.username.toLowerCase());
    expect(sentTo).toContain(member.username.toLowerCase());
  });
});
