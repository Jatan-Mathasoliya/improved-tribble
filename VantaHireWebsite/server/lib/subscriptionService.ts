import { db } from "../db";
import {
  organizationSubscriptions,
  subscriptionPlans,
  paymentTransactions,
  subscriptionAuditLog,
  organizations,
  type OrganizationSubscription,
  type SubscriptionPlan,
  type PaymentTransaction,
  type SubscriptionAuditLog,
  type SubscriptionStatus,
  type BillingCycle,
  type SubscriptionAuditAction,
} from "@shared/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";

// Plan names
export const PLAN_FREE = 'free';
export const PLAN_PRO = 'pro';
export const PLAN_BUSINESS = 'business';

function getEnvInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

const FREE_AI_CREDITS_PER_MONTH = getEnvInt('FREE_AI_CREDITS_PER_MONTH', 5);
const FREE_AI_CREDITS_ROLLOVER_MONTHS = getEnvInt('FREE_AI_CREDITS_ROLLOVER_MONTHS', 3);

// Get all active plans
export async function getActivePlans(): Promise<SubscriptionPlan[]> {
  const plans = await db.query.subscriptionPlans.findMany({
    where: eq(subscriptionPlans.isActive, true),
    orderBy: subscriptionPlans.sortOrder,
  });

  return plans.map((plan: SubscriptionPlan) => {
    if (plan.name !== PLAN_FREE) {
      return plan;
    }
    return {
      ...plan,
      aiCreditsPerSeatMonthly: FREE_AI_CREDITS_PER_MONTH,
      maxCreditRolloverMonths: FREE_AI_CREDITS_ROLLOVER_MONTHS,
    };
  });
}

// Get plan by name
export async function getPlanByName(name: string): Promise<SubscriptionPlan | undefined> {
  return db.query.subscriptionPlans.findFirst({
    where: eq(subscriptionPlans.name, name),
  });
}

// Get plan by ID
export async function getPlanById(id: number): Promise<SubscriptionPlan | undefined> {
  return db.query.subscriptionPlans.findFirst({
    where: eq(subscriptionPlans.id, id),
  });
}

// Get organization subscription
export async function getOrganizationSubscription(orgId: number): Promise<(OrganizationSubscription & {
  plan: SubscriptionPlan;
}) | null> {
  const subscription = await db.query.organizationSubscriptions.findFirst({
    where: eq(organizationSubscriptions.organizationId, orgId),
    with: {
      plan: true,
    },
  });

  return subscription as (OrganizationSubscription & { plan: SubscriptionPlan }) | null;
}

// Create free subscription for new organization
export async function createFreeSubscription(orgId: number): Promise<OrganizationSubscription> {
  const freePlan = await getPlanByName(PLAN_FREE);
  if (!freePlan) {
    throw new Error('Free plan not found');
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1); // 1 month period

  const [subscription] = await db.insert(organizationSubscriptions).values({
    organizationId: orgId,
    planId: freePlan.id,
    seats: 1, // Free plan is fixed at 1 seat
    paidSeats: 0, // Free plan has no paid seats
    billingCycle: 'monthly',
    status: 'active',
    startDate: now,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
  }).returning();

  // Log the creation
  await logSubscriptionAction(orgId, subscription.id, 'created', null, {
    planId: freePlan.id,
    seats: 1,
  });

  return subscription;
}

// Create paid subscription (after successful payment)
export async function createPaidSubscription(
  orgId: number,
  planId: number,
  seats: number,
  billingCycle: BillingCycle,
  cashfreeSubscriptionId?: string,
  cashfreeCustomerId?: string
): Promise<OrganizationSubscription> {
  const now = new Date();
  const periodEnd = new Date(now);

  if (billingCycle === 'annual') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  // Delete existing subscription if any
  const existing = await getOrganizationSubscription(orgId);
  if (existing) {
    await db.delete(organizationSubscriptions)
      .where(eq(organizationSubscriptions.id, existing.id));
  }

  const [subscription] = await db.insert(organizationSubscriptions).values({
    organizationId: orgId,
    planId,
    seats,
    paidSeats: seats, // All seats are paid for in a paid subscription
    billingCycle,
    status: 'active',
    startDate: now,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    cashfreeSubscriptionId,
    cashfreeCustomerId,
  }).returning();

  // Log the upgrade
  await logSubscriptionAction(orgId, subscription.id, 'upgraded', existing ? {
    planId: existing.planId,
    seats: existing.seats,
  } : null, {
    planId,
    seats,
    billingCycle,
  });

  return subscription;
}

// Update subscription seats (for paid seat changes via payment flow)
// Also updates paidSeats since this is called for paid seat additions/removals
// Admin overrides use adminOverrideSubscription() which doesn't update paidSeats
export async function updateSubscriptionSeats(
  subscriptionId: number,
  newSeats: number,
  performedBy?: number
): Promise<OrganizationSubscription> {
  const existing = await db.query.organizationSubscriptions.findFirst({
    where: eq(organizationSubscriptions.id, subscriptionId),
  });

  if (!existing) {
    throw new Error('Subscription not found');
  }

  const action: SubscriptionAuditAction = newSeats > existing.seats ? 'seats_added' : 'seats_removed';

  const [updated] = await db.update(organizationSubscriptions)
    .set({
      seats: newSeats,
      paidSeats: newSeats, // Also update paidSeats since this is a paid change
      updatedAt: new Date(),
    })
    .where(eq(organizationSubscriptions.id, subscriptionId))
    .returning();

  // Log the seat change
  await logSubscriptionAction(existing.organizationId, subscriptionId, action, {
    seats: existing.seats,
  }, {
    seats: newSeats,
  }, performedBy);

  return updated;
}

// Update subscription status
export async function updateSubscriptionStatus(
  subscriptionId: number,
  status: SubscriptionStatus,
  reason?: string
): Promise<OrganizationSubscription> {
  const existing = await db.query.organizationSubscriptions.findFirst({
    where: eq(organizationSubscriptions.id, subscriptionId),
  });

  if (!existing) {
    throw new Error('Subscription not found');
  }

  const updates: Partial<typeof organizationSubscriptions.$inferInsert> = {
    status,
    updatedAt: new Date(),
  };

  if (status === 'cancelled') {
    updates.cancelledAt = new Date();
  }

  const [updated] = await db.update(organizationSubscriptions)
    .set(updates)
    .where(eq(organizationSubscriptions.id, subscriptionId))
    .returning();

  return updated;
}

// Cancel subscription at period end
export async function cancelSubscriptionAtPeriodEnd(
  subscriptionId: number,
  performedBy?: number
): Promise<OrganizationSubscription> {
  const existing = await db.query.organizationSubscriptions.findFirst({
    where: eq(organizationSubscriptions.id, subscriptionId),
  });

  if (!existing) {
    throw new Error('Subscription not found');
  }

  const [updated] = await db.update(organizationSubscriptions)
    .set({
      cancelAtPeriodEnd: true,
      updatedAt: new Date(),
    })
    .where(eq(organizationSubscriptions.id, subscriptionId))
    .returning();

  await logSubscriptionAction(existing.organizationId, subscriptionId, 'cancelled', null, {
    cancelAtPeriodEnd: true,
  }, performedBy);

  return updated;
}

// Reactivate subscription (undo cancel at period end)
export async function reactivateSubscription(
  subscriptionId: number,
  performedBy?: number
): Promise<OrganizationSubscription> {
  const existing = await db.query.organizationSubscriptions.findFirst({
    where: eq(organizationSubscriptions.id, subscriptionId),
  });

  if (!existing) {
    throw new Error('Subscription not found');
  }

  if (!existing.cancelAtPeriodEnd) {
    throw new Error('Subscription is not set to cancel');
  }

  const [updated] = await db.update(organizationSubscriptions)
    .set({
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      updatedAt: new Date(),
    })
    .where(eq(organizationSubscriptions.id, subscriptionId))
    .returning();

  await logSubscriptionAction(existing.organizationId, subscriptionId, 'reactivated', null, null, performedBy);

  return updated;
}

// Update payment failure tracking
export async function recordPaymentFailure(subscriptionId: number): Promise<OrganizationSubscription> {
  const existing = await db.query.organizationSubscriptions.findFirst({
    where: eq(organizationSubscriptions.id, subscriptionId),
  });

  if (!existing) {
    throw new Error('Subscription not found');
  }

  const failureCount = (existing.paymentFailureCount || 0) + 1;
  const gracePeriodEndDate = new Date();
  gracePeriodEndDate.setDate(gracePeriodEndDate.getDate() + 3); // 3-day grace period

  const [updated] = await db.update(organizationSubscriptions)
    .set({
      paymentFailureCount: failureCount,
      gracePeriodEndDate,
      status: 'past_due',
      updatedAt: new Date(),
    })
    .where(eq(organizationSubscriptions.id, subscriptionId))
    .returning();

  return updated;
}

// Clear payment failure (on successful payment)
export async function clearPaymentFailure(subscriptionId: number): Promise<OrganizationSubscription> {
  const [updated] = await db.update(organizationSubscriptions)
    .set({
      paymentFailureCount: 0,
      gracePeriodEndDate: null,
      status: 'active',
      updatedAt: new Date(),
    })
    .where(eq(organizationSubscriptions.id, subscriptionId))
    .returning();

  return updated;
}

// Renew subscription (update period dates)
export async function renewSubscription(subscriptionId: number): Promise<OrganizationSubscription> {
  const existing = await db.query.organizationSubscriptions.findFirst({
    where: eq(organizationSubscriptions.id, subscriptionId),
  });

  if (!existing) {
    throw new Error('Subscription not found');
  }

  const newPeriodStart = existing.currentPeriodEnd;
  const newPeriodEnd = new Date(newPeriodStart);

  if (existing.billingCycle === 'annual') {
    newPeriodEnd.setFullYear(newPeriodEnd.getFullYear() + 1);
  } else {
    newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
  }

  const [updated] = await db.update(organizationSubscriptions)
    .set({
      currentPeriodStart: newPeriodStart,
      currentPeriodEnd: newPeriodEnd,
      updatedAt: new Date(),
    })
    .where(eq(organizationSubscriptions.id, subscriptionId))
    .returning();

  return updated;
}

// Downgrade to free plan
export async function downgradeToFree(
  orgId: number,
  performedBy?: number
): Promise<OrganizationSubscription> {
  const existing = await getOrganizationSubscription(orgId);
  const freePlan = await getPlanByName(PLAN_FREE);

  if (!freePlan) {
    throw new Error('Free plan not found');
  }

  if (existing) {
    // Log the downgrade
    await logSubscriptionAction(orgId, existing.id, 'downgraded', {
      planId: existing.planId,
      seats: existing.seats,
    }, {
      planId: freePlan.id,
      seats: 1,
    }, performedBy);

    // Update existing subscription
    const [updated] = await db.update(organizationSubscriptions)
      .set({
        planId: freePlan.id,
        seats: 1,
        status: 'active',
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        cashfreeSubscriptionId: null,
        cashfreeCustomerId: null,
        gracePeriodEndDate: null,
        paymentFailureCount: 0,
        updatedAt: new Date(),
      })
      .where(eq(organizationSubscriptions.id, existing.id))
      .returning();

    return updated;
  }

  // Create new free subscription
  return createFreeSubscription(orgId);
}

// Admin override for subscription
export async function adminOverrideSubscription(
  subscriptionId: number,
  updates: Partial<{
    planId: number;
    seats: number;
    status: SubscriptionStatus;
    currentPeriodEnd: Date;
    featureOverrides: Record<string, any>;
    bonusCredits: number;
    customCreditLimit: number | null;
  }>,
  adminUserId: number,
  reason: string
): Promise<OrganizationSubscription> {
  const existing = await db.query.organizationSubscriptions.findFirst({
    where: eq(organizationSubscriptions.id, subscriptionId),
  });

  if (!existing) {
    throw new Error('Subscription not found');
  }

  const [updated] = await db.update(organizationSubscriptions)
    .set({
      ...updates,
      adminOverride: true,
      adminOverrideReason: reason,
      adminOverrideBy: adminUserId,
      updatedAt: new Date(),
    })
    .where(eq(organizationSubscriptions.id, subscriptionId))
    .returning();

  await logSubscriptionAction(existing.organizationId, subscriptionId, 'admin_override', {
    planId: existing.planId,
    seats: existing.seats,
    status: existing.status,
  }, updates, adminUserId, reason);

  return updated;
}

// Log subscription action
export async function logSubscriptionAction(
  orgId: number,
  subscriptionId: number | null,
  action: SubscriptionAuditAction,
  previousValue: Record<string, any> | null,
  newValue: Record<string, any> | null,
  performedBy?: number,
  reason?: string
): Promise<SubscriptionAuditLog> {
  const [log] = await db.insert(subscriptionAuditLog).values({
    organizationId: orgId,
    subscriptionId,
    action,
    previousValue,
    newValue,
    performedBy,
    reason,
  }).returning();

  return log;
}

// Get subscription audit log
export async function getSubscriptionAuditLog(
  orgId: number,
  limit: number = 50
): Promise<SubscriptionAuditLog[]> {
  return db.query.subscriptionAuditLog.findMany({
    where: eq(subscriptionAuditLog.organizationId, orgId),
    orderBy: desc(subscriptionAuditLog.performedAt),
    limit,
  });
}

// Get subscriptions due for renewal
export async function getSubscriptionsDueForRenewal(): Promise<OrganizationSubscription[]> {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return db.query.organizationSubscriptions.findMany({
    where: and(
      eq(organizationSubscriptions.status, 'active'),
      lte(organizationSubscriptions.currentPeriodEnd, tomorrow),
      eq(organizationSubscriptions.cancelAtPeriodEnd, false)
    ),
  });
}

// Get subscriptions past grace period (for auto-downgrade)
export async function getSubscriptionsPastGracePeriod(): Promise<OrganizationSubscription[]> {
  const now = new Date();

  return db.query.organizationSubscriptions.findMany({
    where: and(
      eq(organizationSubscriptions.status, 'past_due'),
      lte(organizationSubscriptions.gracePeriodEndDate, now)
    ),
  });
}

// Calculate prorated amount for seat addition
export function calculateProratedAmount(
  pricePerSeat: number,
  additionalSeats: number,
  currentPeriodEnd: Date,
  billingCycle: BillingCycle
): number {
  const now = new Date();
  const totalDays = billingCycle === 'annual' ? 365 : 30;
  const remainingDays = Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const ratio = remainingDays / totalDays;

  return Math.round(pricePerSeat * additionalSeats * ratio);
}

// Check if plan has feature
export function planHasFeature(plan: SubscriptionPlan, featureName: string): boolean {
  const features = plan.features as Record<string, boolean>;
  return features?.[featureName] === true;
}

// Get subscription invoices
export async function getSubscriptionInvoices(
  orgId: number,
  limit: number = 20
): Promise<PaymentTransaction[]> {
  return db.query.paymentTransactions.findMany({
    where: and(
      eq(paymentTransactions.organizationId, orgId),
      eq(paymentTransactions.status, 'completed')
    ),
    orderBy: desc(paymentTransactions.createdAt),
    limit,
  });
}

// Seed default plans (to be run once)
export async function seedDefaultPlans(): Promise<void> {
  const existingPlans = await db.query.subscriptionPlans.findMany();
  if (existingPlans.length > 0) {
    console.log('Plans already exist, skipping seed');
    return;
  }

  await db.insert(subscriptionPlans).values([
    {
      name: PLAN_FREE,
      displayName: 'Free',
      description: 'Basic ATS for individuals',
      pricePerSeatMonthly: 0,
      pricePerSeatAnnual: 0,
      aiCreditsPerSeatMonthly: FREE_AI_CREDITS_PER_MONTH,
      maxCreditRolloverMonths: FREE_AI_CREDITS_ROLLOVER_MONTHS,
      features: {
        basicAts: true,
        jobPosting: true,
        applicationManagement: true,
        aiMatching: false,
        aiContent: true,
        advancedAnalytics: false,
        customPipeline: false,
        teamCollaboration: false,
        clientPortal: false,
        apiAccess: false,
      },
      sortOrder: 0,
    },
    {
      name: PLAN_PRO,
      displayName: 'Pro',
      description: 'Full-featured ATS for teams',
      pricePerSeatMonthly: 99900, // ₹999 in paise
      pricePerSeatAnnual: 999000, // ₹9990 in paise (2 months free)
      aiCreditsPerSeatMonthly: 600,
      maxCreditRolloverMonths: 3,
      features: {
        basicAts: true,
        jobPosting: true,
        applicationManagement: true,
        aiMatching: true,
        aiContent: true,
        advancedAnalytics: true,
        customPipeline: true,
        teamCollaboration: true,
        clientPortal: true,
        apiAccess: false,
      },
      sortOrder: 1,
    },
    {
      name: PLAN_BUSINESS,
      displayName: 'Business',
      description: 'Enterprise features with dedicated support',
      pricePerSeatMonthly: 0, // Contact sales
      pricePerSeatAnnual: 0,
      aiCreditsPerSeatMonthly: 0, // Custom
      maxCreditRolloverMonths: 0,
      features: {
        basicAts: true,
        jobPosting: true,
        applicationManagement: true,
        aiMatching: true,
        aiContent: true,
        advancedAnalytics: true,
        customPipeline: true,
        teamCollaboration: true,
        clientPortal: true,
        apiAccess: true,
        sso: true,
        customBranding: true,
        dedicatedSupport: true,
        sla: true,
      },
      sortOrder: 2,
    },
  ]);

  console.log('Default subscription plans seeded');
}
