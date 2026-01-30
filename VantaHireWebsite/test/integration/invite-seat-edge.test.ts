// @vitest-environment node
import '../setup.integration';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes';
import { db } from '../../server/db';
import {
  organizations,
  organizationInvites,
  organizationMembers,
  organizationSubscriptions,
  users,
} from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import {
  addOrganizationMember,
  createOrganizationWithOwner,
  createRecruiterUser,
  ensurePlan,
} from '../utils/db-helpers';
import { createOrganizationInvite } from '../../server/lib/organizationService';

const HAS_DB = !!process.env.DATABASE_URL;
const maybeDescribe = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[TEST] Skipping invite/seat edge tests: DATABASE_URL not set');
}

maybeDescribe('Invite and seat enforcement edge cases', () => {
  let app: express.Express;
  let server: any;

  const created = {
    userIds: [] as number[],
    orgIds: [] as number[],
    inviteIds: [] as number[],
    memberIds: [] as number[],
    subscriptionIds: [] as number[],
  };

  beforeAll(async () => {
    app = express();
    server = await registerRoutes(app);
  });

  afterAll(() => {
    server?.close();
  });

  afterEach(async () => {
    if (!HAS_DB) return;

    if (created.inviteIds.length > 0) {
      await db.delete(organizationInvites)
        .where(inArray(organizationInvites.id, created.inviteIds));
    }

    if (created.memberIds.length > 0) {
      await db.delete(organizationMembers)
        .where(inArray(organizationMembers.id, created.memberIds));
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

    created.userIds = [];
    created.orgIds = [];
    created.inviteIds = [];
    created.memberIds = [];
    created.subscriptionIds = [];
  });

  it('blocks invite acceptance when user already in an organization', async () => {
    // Create a user who will receive an invite
    const user = await createRecruiterUser({
      username: `member_${Date.now()}@example.com`,
      password: 'password',
    });
    created.userIds.push(user.id);

    // Create the owner and org that will send the invite
    const otherOwner = await createRecruiterUser({
      username: `owner_${Date.now()}@example.com`,
      password: 'password',
    });
    created.userIds.push(otherOwner.id);

    const otherOrg = await createOrganizationWithOwner({
      name: `Other Org ${Date.now()}`,
      ownerId: otherOwner.id,
    });
    created.orgIds.push(otherOrg.id);

    // Create invite while user is NOT in any org yet
    const invite = await createOrganizationInvite(otherOrg.id, user.username, 'member', otherOwner.id);
    created.inviteIds.push(invite.id);

    // Now create an org for the user (user joins an org AFTER invite was created)
    const userOrg = await createOrganizationWithOwner({
      name: `User Org ${Date.now()}`,
      ownerId: user.id,
    });
    created.orgIds.push(userOrg.id);

    // Try to accept the invite - should fail because user is now in an org
    const agent = request.agent(app);
    await agent.post('/api/login').send({
      username: user.username,
      password: 'password',
      expectedRole: ['recruiter'],
    });
    const csrf = await agent.get('/api/csrf-token');

    const response = await agent
      .post(`/api/invites/${invite.token}/accept`)
      .set('x-csrf-token', csrf.body?.token)
      .send();

    expect(response.status).toBe(400);
    expect(response.body?.error).toMatch(/already a member/i);
  });

  it('rejects expired invite tokens', async () => {
    const owner = await createRecruiterUser({
      username: `inv_owner_${Date.now()}@example.com`,
      password: 'password',
    });
    const invitee = await createRecruiterUser({
      username: `inv_invitee_${Date.now()}@example.com`,
      password: 'password',
    });
    created.userIds.push(owner.id, invitee.id);

    const org = await createOrganizationWithOwner({
      name: `Invite Org ${Date.now()}`,
      ownerId: owner.id,
    });
    created.orgIds.push(org.id);

    const invite = await createOrganizationInvite(org.id, invitee.username, 'member', owner.id);
    created.inviteIds.push(invite.id);

    // Force expiry
    await db.update(organizationInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(organizationInvites.id, invite.id));

    const agent = request.agent(app);
    await agent.post('/api/login').send({
      username: invitee.username,
      password: 'password',
      expectedRole: ['recruiter'],
    });
    const csrf = await agent.get('/api/csrf-token');

    const response = await agent
      .post(`/api/invites/${invite.token}/accept`)
      .set('x-csrf-token', csrf.body?.token)
      .send();

    expect(response.status).toBe(404);
    expect(response.body?.error).toMatch(/expired/i);
  });

  it('returns 410 for expired invite details', async () => {
    const owner = await createRecruiterUser({
      username: `exp_owner_${Date.now()}@example.com`,
      password: 'password',
    });
    const invitee = await createRecruiterUser({
      username: `exp_invitee_${Date.now()}@example.com`,
      password: 'password',
    });
    created.userIds.push(owner.id, invitee.id);

    const org = await createOrganizationWithOwner({
      name: `Expired Invite Org ${Date.now()}`,
      ownerId: owner.id,
    });
    created.orgIds.push(org.id);

    const invite = await createOrganizationInvite(org.id, invitee.username, 'member', owner.id);
    created.inviteIds.push(invite.id);

    await db.update(organizationInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(organizationInvites.id, invite.id));

    const response = await request(app).get(`/api/invites/${invite.token}`);

    expect(response.status).toBe(410);
    expect(response.body?.error).toMatch(/expired/i);
  });

  it('rejects accept when invite expires after preview', async () => {
    const owner = await createRecruiterUser({
      username: `preview_owner_${Date.now()}@example.com`,
      password: 'password',
    });
    const invitee = await createRecruiterUser({
      username: `preview_invitee_${Date.now()}@example.com`,
      password: 'password',
    });
    created.userIds.push(owner.id, invitee.id);

    const org = await createOrganizationWithOwner({
      name: `Preview Org ${Date.now()}`,
      ownerId: owner.id,
    });
    created.orgIds.push(org.id);

    const invite = await createOrganizationInvite(org.id, invitee.username, 'member', owner.id);
    created.inviteIds.push(invite.id);

    const previewResponse = await request(app).get(`/api/invites/${invite.token}`);
    expect(previewResponse.status).toBe(200);

    await db.update(organizationInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(organizationInvites.id, invite.id));

    const agent = request.agent(app);
    await agent.post('/api/login').send({
      username: invitee.username,
      password: 'password',
      expectedRole: ['recruiter'],
    });
    const csrf = await agent.get('/api/csrf-token');

    const response = await agent
      .post(`/api/invites/${invite.token}/accept`)
      .set('x-csrf-token', csrf.body?.token)
      .send();

    expect(response.status).toBe(404);
    expect(response.body?.error).toMatch(/expired/i);
  });

  it('rejects invalid invite tokens', async () => {
    const user = await createRecruiterUser({
      username: `badtoken_${Date.now()}@example.com`,
      password: 'password',
    });
    created.userIds.push(user.id);

    const agent = request.agent(app);
    await agent.post('/api/login').send({
      username: user.username,
      password: 'password',
      expectedRole: ['recruiter'],
    });
    const csrf = await agent.get('/api/csrf-token');

    const response = await agent
      .post('/api/invites/not-a-real-token/accept')
      .set('x-csrf-token', csrf.body?.token)
      .send();

    expect(response.status).toBe(404);
    expect(response.body?.error).toMatch(/invalid|expired/i);
  });

  it('rejects invite reuse after it has been accepted', async () => {
    const owner = await createRecruiterUser({
      username: `reuse_owner_${Date.now()}@example.com`,
      password: 'password',
    });
    const firstInvitee = await createRecruiterUser({
      username: `reuse_first_${Date.now()}@example.com`,
      password: 'password',
    });
    const secondInvitee = await createRecruiterUser({
      username: `reuse_second_${Date.now()}@example.com`,
      password: 'password',
    });
    created.userIds.push(owner.id, firstInvitee.id, secondInvitee.id);

    const org = await createOrganizationWithOwner({
      name: `Reuse Org ${Date.now()}`,
      ownerId: owner.id,
    });
    created.orgIds.push(org.id);

    const invite = await createOrganizationInvite(org.id, firstInvitee.username, 'member', owner.id);
    created.inviteIds.push(invite.id);

    const firstAgent = request.agent(app);
    await firstAgent.post('/api/login').send({
      username: firstInvitee.username,
      password: 'password',
      expectedRole: ['recruiter'],
    });
    const firstCsrf = await firstAgent.get('/api/csrf-token');

    const firstAccept = await firstAgent
      .post(`/api/invites/${invite.token}/accept`)
      .set('x-csrf-token', firstCsrf.body?.token)
      .send();

    expect(firstAccept.status).toBe(200);

    const secondAgent = request.agent(app);
    await secondAgent.post('/api/login').send({
      username: secondInvitee.username,
      password: 'password',
      expectedRole: ['recruiter'],
    });
    const secondCsrf = await secondAgent.get('/api/csrf-token');

    const secondAccept = await secondAgent
      .post(`/api/invites/${invite.token}/accept`)
      .set('x-csrf-token', secondCsrf.body?.token)
      .send();

    expect(secondAccept.status).toBe(404);
    expect(secondAccept.body?.error).toMatch(/invalid|expired/i);
  });

  it('invalidates older invites when a new invite is created for the same email', async () => {
    const owner = await createRecruiterUser({
      username: `replace_owner_${Date.now()}@example.com`,
      password: 'password',
    });
    const invitee = await createRecruiterUser({
      username: `replace_invitee_${Date.now()}@example.com`,
      password: 'password',
    });
    created.userIds.push(owner.id, invitee.id);

    const org = await createOrganizationWithOwner({
      name: `Replace Org ${Date.now()}`,
      ownerId: owner.id,
    });
    created.orgIds.push(org.id);

    const firstInvite = await createOrganizationInvite(org.id, invitee.username, 'member', owner.id);
    created.inviteIds.push(firstInvite.id);

    const secondInvite = await createOrganizationInvite(org.id, invitee.username, 'member', owner.id);
    created.inviteIds.push(secondInvite.id);

    const agent = request.agent(app);
    await agent.post('/api/login').send({
      username: invitee.username,
      password: 'password',
      expectedRole: ['recruiter'],
    });
    const csrf = await agent.get('/api/csrf-token');

    const oldAccept = await agent
      .post(`/api/invites/${firstInvite.token}/accept`)
      .set('x-csrf-token', csrf.body?.token)
      .send();
    expect(oldAccept.status).toBe(404);

    const newAccept = await agent
      .post(`/api/invites/${secondInvite.token}/accept`)
      .set('x-csrf-token', csrf.body?.token)
      .send();
    expect(newAccept.status).toBe(200);
  });

  it('returns NO_ORGANIZATION when recruiter has no org', async () => {
    const user = await createRecruiterUser({
      username: `noorg_${Date.now()}@example.com`,
      password: 'password',
    });
    created.userIds.push(user.id);

    const agent = request.agent(app);
    await agent.post('/api/login').send({
      username: user.username,
      password: 'password',
      expectedRole: ['recruiter'],
    });

    const response = await agent.get('/api/my-jobs');
    expect(response.status).toBe(403);
    expect(response.body?.code).toBe('NO_ORGANIZATION');
  });

  it('returns NO_SEAT when recruiter is unseated', async () => {
    const owner = await createRecruiterUser({
      username: `seat_owner_${Date.now()}@example.com`,
      password: 'password',
    });
    const member = await createRecruiterUser({
      username: `seat_member_${Date.now()}@example.com`,
      password: 'password',
    });
    created.userIds.push(owner.id, member.id);

    const org = await createOrganizationWithOwner({
      name: `Seat Org ${Date.now()}`,
      ownerId: owner.id,
    });
    created.orgIds.push(org.id);

    const unseated = await addOrganizationMember({
      organizationId: org.id,
      userId: member.id,
      role: 'member',
      seatAssigned: false,
    });
    created.memberIds.push(unseated.id);

    const agent = request.agent(app);
    await agent.post('/api/login').send({
      username: member.username,
      password: 'password',
      expectedRole: ['recruiter'],
    });

    const response = await agent.get('/api/my-jobs');
    expect(response.status).toBe(403);
    expect(response.body?.code).toBe('NO_SEAT');
  });

  it('does not lazy-init credits for unseated members', async () => {
    const owner = await createRecruiterUser({
      username: `lazy_owner_${Date.now()}@example.com`,
      password: 'password',
    });
    const member = await createRecruiterUser({
      username: `lazy_member_${Date.now()}@example.com`,
      password: 'password',
    });
    created.userIds.push(owner.id, member.id);

    const org = await createOrganizationWithOwner({
      name: `Lazy Init Org ${Date.now()}`,
      ownerId: owner.id,
    });
    created.orgIds.push(org.id);

    const unseated = await addOrganizationMember({
      organizationId: org.id,
      userId: member.id,
      role: 'member',
      seatAssigned: false,
    });
    created.memberIds.push(unseated.id);

    const agent = request.agent(app);
    await agent.post('/api/login').send({
      username: member.username,
      password: 'password',
      expectedRole: ['recruiter'],
    });

    const statusResponse = await agent.get('/api/onboarding-status');
    expect(statusResponse.status).toBe(200);

    const memberAfter = await db.query.organizationMembers.findFirst({
      where: eq(organizationMembers.id, unseated.id),
    });

    expect(memberAfter?.seatAssigned).toBe(false);
    expect(memberAfter?.creditsAllocated).toBe(0);
    expect(memberAfter?.creditsPeriodStart).toBeNull();
  });

  it('lazy-inits credits for seated members missing credit period', async () => {
    const owner = await createRecruiterUser({
      username: `lazy_owner_${Date.now()}@example.com`,
      password: 'password',
    });
    const member = await createRecruiterUser({
      username: `lazy_member_${Date.now()}@example.com`,
      password: 'password',
    });
    created.userIds.push(owner.id, member.id);

    const org = await createOrganizationWithOwner({
      name: `Lazy Init Seated Org ${Date.now()}`,
      ownerId: owner.id,
    });
    created.orgIds.push(org.id);

    const seated = await addOrganizationMember({
      organizationId: org.id,
      userId: member.id,
      role: 'member',
      seatAssigned: true,
    });
    created.memberIds.push(seated.id);

    const agent = request.agent(app);
    await agent.post('/api/login').send({
      username: member.username,
      password: 'password',
      expectedRole: ['recruiter'],
    });

    const statusResponse = await agent.get('/api/onboarding-status');
    expect(statusResponse.status).toBe(200);

    const memberAfter = await db.query.organizationMembers.findFirst({
      where: eq(organizationMembers.id, seated.id),
    });

    expect(memberAfter?.creditsPeriodStart).not.toBeNull();
    expect(memberAfter?.creditsPeriodEnd).not.toBeNull();
  });

  it('returns inviter full name in invite details', async () => {
    const owner = await createRecruiterUser({
      username: `inviter_${Date.now()}@example.com`,
      password: 'password',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    created.userIds.push(owner.id);

    const org = await createOrganizationWithOwner({
      name: `Inviter Org ${Date.now()}`,
      ownerId: owner.id,
    });
    created.orgIds.push(org.id);

    const invite = await createOrganizationInvite(
      org.id,
      `invitee_${Date.now()}@example.com`,
      'member',
      owner.id
    );
    created.inviteIds.push(invite.id);

    const response = await request(app).get(`/api/invites/${invite.token}`);

    expect(response.status).toBe(200);
    expect(response.body?.inviterName).toBe('Ada Lovelace');
  });

  it('rejects invite acceptance when email does not match invite', async () => {
    const owner = await createRecruiterUser({
      username: `owner_${Date.now()}@example.com`,
      password: 'password',
    });
    const invitee = await createRecruiterUser({
      username: `invitee_${Date.now()}@example.com`,
      password: 'password',
    });
    const otherUser = await createRecruiterUser({
      username: `other_${Date.now()}@example.com`,
      password: 'password',
    });
    created.userIds.push(owner.id, invitee.id, otherUser.id);

    const org = await createOrganizationWithOwner({
      name: `Mismatch Org ${Date.now()}`,
      ownerId: owner.id,
    });
    created.orgIds.push(org.id);

    const invite = await createOrganizationInvite(org.id, invitee.username, 'member', owner.id);
    created.inviteIds.push(invite.id);

    const agent = request.agent(app);
    await agent.post('/api/login').send({
      username: otherUser.username,
      password: 'password',
      expectedRole: ['recruiter'],
    });
    const csrf = await agent.get('/api/csrf-token');

    const response = await agent
      .post(`/api/invites/${invite.token}/accept`)
      .set('x-csrf-token', csrf.body?.token)
      .send();

    expect(response.status).toBe(403);
    expect(response.body?.error).toMatch(/different email/i);

    const inviteAfter = await db.query.organizationInvites.findFirst({
      where: eq(organizationInvites.id, invite.id),
    });
    expect(inviteAfter?.acceptedAt).toBeNull();

    const membership = await db.query.organizationMembers.findFirst({
      where: eq(organizationMembers.userId, otherUser.id),
    });
    expect(membership).toBeUndefined();
  });

  it('rejects invite acceptance when no seats are available', async () => {
    const owner = await createRecruiterUser({
      username: `seat_owner_${Date.now()}@example.com`,
      password: 'password',
    });
    const invitee = await createRecruiterUser({
      username: `seat_invitee_${Date.now()}@example.com`,
      password: 'password',
    });
    created.userIds.push(owner.id, invitee.id);

    const org = await createOrganizationWithOwner({
      name: `No Seat Org ${Date.now()}`,
      ownerId: owner.id,
    });
    created.orgIds.push(org.id);

    // Create a subscription with only 1 seat (which owner uses)
    const { plan } = await ensurePlan('free');
    const now = new Date();
    const [subscription] = await db.insert(organizationSubscriptions).values({
      organizationId: org.id,
      planId: plan.id,
      seats: 1, // Only 1 seat, owner uses it
      billingCycle: 'monthly',
      status: 'active',
      startDate: now,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();
    created.subscriptionIds.push(subscription.id);

    const invite = await createOrganizationInvite(org.id, invitee.username, 'member', owner.id);
    created.inviteIds.push(invite.id);

    const agent = request.agent(app);
    await agent.post('/api/login').send({
      username: invitee.username,
      password: 'password',
      expectedRole: ['recruiter'],
    });
    const csrf = await agent.get('/api/csrf-token');

    const response = await agent
      .post(`/api/invites/${invite.token}/accept`)
      .set('x-csrf-token', csrf.body?.token)
      .send();

    expect(response.status).toBe(409);
    expect(response.body?.error).toMatch(/no seats available/i);

    const inviteAfter = await db.query.organizationInvites.findFirst({
      where: eq(organizationInvites.id, invite.id),
    });
    expect(inviteAfter?.acceptedAt).toBeNull();
  });
});
