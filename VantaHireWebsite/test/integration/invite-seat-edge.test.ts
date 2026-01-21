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
  users,
} from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import {
  addOrganizationMember,
  createOrganizationWithOwner,
  createRecruiterUser,
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

    expect(response.status).toBe(500);
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

    expect(response.status).toBe(500);
    expect(response.body?.error).toMatch(/invalid|expired/i);
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
});
