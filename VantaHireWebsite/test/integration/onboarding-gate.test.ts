// @vitest-environment node
/**
 * Onboarding Gate Integration Tests
 *
 * Tests the server-side onboarding status endpoint and verifies
 * the gate logic that prevents recruiters from bypassing onboarding.
 */

import '../setup.integration';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes';
import { db } from '../../server/db';
import {
  organizations,
  organizationMembers,
  organizationSubscriptions,
  users,
  userProfiles,
} from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import {
  createRecruiterUser,
  createOrganizationWithOwner,
  addOrganizationMember,
  ensurePlan,
} from '../utils/db-helpers';

const HAS_DB = !!process.env.DATABASE_URL;
const maybeDescribe = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[TEST] Skipping onboarding gate tests: DATABASE_URL not set');
}

maybeDescribe('Onboarding Gate', () => {
  let app: express.Express;
  let server: any;

  const created = {
    userIds: [] as number[],
    orgIds: [] as number[],
    memberIds: [] as number[],
    subscriptionIds: [] as number[],
    profileIds: [] as number[],
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

    // Clean up in reverse dependency order
    if (created.profileIds.length > 0) {
      await db.delete(userProfiles)
        .where(inArray(userProfiles.id, created.profileIds));
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
    created.memberIds = [];
    created.subscriptionIds = [];
    created.profileIds = [];
  });

  describe('GET /api/onboarding-status', () => {
    it('returns needsOnboarding=true for new recruiter without org', async () => {
      const user = await createRecruiterUser({
        username: `noorg_${Date.now()}@example.com`,
        password: 'password',
        role: 'recruiter',
        emailVerified: true,
      });
      created.userIds.push(user.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: user.username,
        password: 'password',
        expectedRole: ['recruiter'],
      });

      const res = await agent.get('/api/onboarding-status');

      expect(res.status).toBe(200);
      expect(res.body.needsOnboarding).toBe(true);
      expect(res.body.currentStep).toBe('org');
      expect(res.body.hasOrganization).toBe(false);
    });

    it('returns needsOnboarding=true for recruiter with org but incomplete profile', async () => {
      const user = await createRecruiterUser({
        username: `withorg_${Date.now()}@example.com`,
        password: 'password',
        role: 'recruiter',
        emailVerified: true,
      });
      created.userIds.push(user.id);

      // Create org for the user
      const org = await createOrganizationWithOwner({
        name: `Test Org ${Date.now()}`,
        ownerId: user.id,
      });
      created.orgIds.push(org.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: user.username,
        password: 'password',
        expectedRole: ['recruiter'],
      });

      const res = await agent.get('/api/onboarding-status');

      expect(res.status).toBe(200);
      expect(res.body.needsOnboarding).toBe(true);
      expect(res.body.hasOrganization).toBe(true);
      // Step should be 'profile' since org exists but profile incomplete
      expect(res.body.currentStep).toBe('profile');
    });

    it('returns needsOnboarding=true with currentStep=plan for recruiter with org and complete profile', async () => {
      const user = await createRecruiterUser({
        username: `planstep_${Date.now()}@example.com`,
        password: 'password',
        role: 'recruiter',
        emailVerified: true,
        firstName: 'Test',
        lastName: 'User',
      });
      created.userIds.push(user.id);

      const org = await createOrganizationWithOwner({
        name: `Plan Step Org ${Date.now()}`,
        ownerId: user.id,
      });
      created.orgIds.push(org.id);

      const [profile] = await db.insert(userProfiles).values({
        userId: user.id,
        company: 'Test Company',
        phone: '555-1234',
      }).returning();
      created.profileIds.push(profile.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: user.username,
        password: 'password',
        expectedRole: ['recruiter'],
      });

      const res = await agent.get('/api/onboarding-status');

      expect(res.status).toBe(200);
      expect(res.body.needsOnboarding).toBe(true);
      expect(res.body.currentStep).toBe('plan');
      expect(res.body.hasOrganization).toBe(true);
    });

    it('does not treat onboardingCompletedAt alone as complete when the recruiter has no organization', async () => {
      const user = await createRecruiterUser({
        username: `completed_${Date.now()}@example.com`,
        password: 'password',
        role: 'recruiter',
        emailVerified: true,
      });
      created.userIds.push(user.id);

      // Mark onboarding as complete
      await db.update(users)
        .set({ onboardingCompletedAt: new Date() })
        .where(eq(users.id, user.id));

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: user.username,
        password: 'password',
        expectedRole: ['recruiter'],
      });

      const res = await agent.get('/api/onboarding-status');

      expect(res.status).toBe(200);
      expect(res.body.needsOnboarding).toBe(true);
      expect(res.body.currentStep).toBe('org');
    });

    it('returns needsOnboarding=false for non-recruiter roles', async () => {
      const user = await createRecruiterUser({
        username: `candidate_${Date.now()}@example.com`,
        password: 'password',
        role: 'candidate',
        emailVerified: true,
      });
      created.userIds.push(user.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: user.username,
        password: 'password',
        expectedRole: ['candidate'],
      });

      const res = await agent.get('/api/onboarding-status');

      expect(res.status).toBe(200);
      expect(res.body.needsOnboarding).toBe(false);
      expect(res.body.currentStep).toBe('complete');
    });

    it('returns 401 for unauthenticated requests', async () => {
      const res = await request(app).get('/api/onboarding-status');
      expect(res.status).toBe(401);
    });
  });

  describe('Onboarding auto-completion for established users', () => {
    it('auto-completes onboarding for user who joined org > 24 hours ago with complete profile', async () => {
      const user = await createRecruiterUser({
        username: `established_${Date.now()}@example.com`,
        password: 'password',
        role: 'recruiter',
        emailVerified: true,
        firstName: 'Test',
        lastName: 'User',
      });
      created.userIds.push(user.id);

      // Create org
      const org = await createOrganizationWithOwner({
        name: `Established Org ${Date.now()}`,
        ownerId: user.id,
      });
      created.orgIds.push(org.id);

      // Backdate the membership to > 24 hours ago
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
      await db.update(organizationMembers)
        .set({ joinedAt: twoDaysAgo })
        .where(eq(organizationMembers.userId, user.id));

      // Create complete profile
      const [profile] = await db.insert(userProfiles).values({
        userId: user.id,
        company: 'Test Company',
        phone: '555-1234',
      }).returning();
      created.profileIds.push(profile.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: user.username,
        password: 'password',
        expectedRole: ['recruiter'],
      });

      const res = await agent.get('/api/onboarding-status');

      expect(res.status).toBe(200);
      // Established users with complete profiles are auto-completed
      expect(res.body.needsOnboarding).toBe(false);
      expect(res.body.currentStep).toBe('complete');
    });

    it('does not auto-complete for established user with incomplete profile', async () => {
      const user = await createRecruiterUser({
        username: `established_incomplete_${Date.now()}@example.com`,
        password: 'password',
        role: 'recruiter',
        emailVerified: true,
      });
      created.userIds.push(user.id);

      const org = await createOrganizationWithOwner({
        name: `Established Incomplete Org ${Date.now()}`,
        ownerId: user.id,
      });
      created.orgIds.push(org.id);

      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
      await db.update(organizationMembers)
        .set({ joinedAt: twoDaysAgo })
        .where(eq(organizationMembers.userId, user.id));

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: user.username,
        password: 'password',
        expectedRole: ['recruiter'],
      });

      const res = await agent.get('/api/onboarding-status');

      expect(res.status).toBe(200);
      expect(res.body.needsOnboarding).toBe(true);
      expect(res.body.currentStep).toBe('profile');
    });

    it('does not auto-complete for established user missing only phone', async () => {
      const user = await createRecruiterUser({
        username: `established_nophone_${Date.now()}@example.com`,
        password: 'password',
        role: 'recruiter',
        emailVerified: true,
        firstName: 'Test',
        lastName: 'User',
      });
      created.userIds.push(user.id);

      const org = await createOrganizationWithOwner({
        name: `Established No Phone Org ${Date.now()}`,
        ownerId: user.id,
      });
      created.orgIds.push(org.id);

      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
      await db.update(organizationMembers)
        .set({ joinedAt: twoDaysAgo })
        .where(eq(organizationMembers.userId, user.id));

      const [profile] = await db.insert(userProfiles).values({
        userId: user.id,
        company: 'Test Company',
        phone: null,
      }).returning();
      created.profileIds.push(profile.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: user.username,
        password: 'password',
        expectedRole: ['recruiter'],
      });

      const res = await agent.get('/api/onboarding-status');

      expect(res.status).toBe(200);
      expect(res.body.needsOnboarding).toBe(true);
      expect(res.body.currentStep).toBe('profile');
    });
  });

  describe('POST /api/onboarding/complete', () => {
    it('marks onboarding as complete for recruiter', async () => {
      const user = await createRecruiterUser({
        username: `tocomplete_${Date.now()}@example.com`,
        password: 'password',
        role: 'recruiter',
        emailVerified: true,
        firstName: 'Test',
        lastName: 'User',
      });
      created.userIds.push(user.id);

      // Create org
      const org = await createOrganizationWithOwner({
        name: `Complete Org ${Date.now()}`,
        ownerId: user.id,
      });
      created.orgIds.push(org.id);

      // Create profile
      const [profile] = await db.insert(userProfiles).values({
        userId: user.id,
        company: 'Test Company',
        phone: '555-1234',
      }).returning();
      created.profileIds.push(profile.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: user.username,
        password: 'password',
        expectedRole: ['recruiter'],
      });

      // Get CSRF token
      const csrfRes = await agent.get('/api/csrf-token');
      const csrfToken = csrfRes.body?.token;

      // Complete onboarding
      const completeRes = await agent
        .post('/api/onboarding/complete')
        .set('x-csrf-token', csrfToken);
      expect(completeRes.status).toBe(200);

      // Verify status is now complete
      const statusRes = await agent.get('/api/onboarding-status');
      expect(statusRes.body.needsOnboarding).toBe(false);
      expect(statusRes.body.currentStep).toBe('complete');
    });

    it('returns 403 for unauthenticated requests (CSRF protection)', async () => {
      const res = await request(app).post('/api/onboarding/complete');
      // POST without CSRF token returns 403
      expect(res.status).toBe(403);
    });

    it('returns 403 for non-recruiter roles', async () => {
      const user = await createRecruiterUser({
        username: `candidate_complete_${Date.now()}@example.com`,
        password: 'password',
        role: 'candidate',
        emailVerified: true,
      });
      created.userIds.push(user.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: user.username,
        password: 'password',
        expectedRole: ['candidate'],
      });

      const csrfRes = await agent.get('/api/csrf-token');
      const csrfToken = csrfRes.body?.token;

      const res = await agent
        .post('/api/onboarding/complete')
        .set('x-csrf-token', csrfToken);
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/onboarding/skip-profile', () => {
    it('allows recruiter to skip profile step', async () => {
      const user = await createRecruiterUser({
        username: `skipprofile_${Date.now()}@example.com`,
        password: 'password',
        role: 'recruiter',
        emailVerified: true,
      });
      created.userIds.push(user.id);

      // Create org (so user is on profile step)
      const org = await createOrganizationWithOwner({
        name: `Skip Profile Org ${Date.now()}`,
        ownerId: user.id,
      });
      created.orgIds.push(org.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: user.username,
        password: 'password',
        expectedRole: ['recruiter'],
      });

      // Verify currently on profile step
      let statusRes = await agent.get('/api/onboarding-status');
      expect(statusRes.body.currentStep).toBe('profile');

      // Get CSRF token
      const csrfRes = await agent.get('/api/csrf-token');
      const csrfToken = csrfRes.body?.token;

      // Skip profile
      const skipRes = await agent
        .post('/api/onboarding/skip-profile')
        .set('x-csrf-token', csrfToken);
      expect(skipRes.status).toBe(200);

      // Verify moved to plan step
      statusRes = await agent.get('/api/onboarding-status');
      expect(statusRes.body.currentStep).toBe('plan');
    });

    it('returns 403 for non-recruiter roles', async () => {
      const user = await createRecruiterUser({
        username: `candidate_skip_${Date.now()}@example.com`,
        password: 'password',
        role: 'candidate',
        emailVerified: true,
      });
      created.userIds.push(user.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: user.username,
        password: 'password',
        expectedRole: ['candidate'],
      });

      const csrfRes = await agent.get('/api/csrf-token');
      const csrfToken = csrfRes.body?.token;

      const res = await agent
        .post('/api/onboarding/skip-profile')
        .set('x-csrf-token', csrfToken);
      expect(res.status).toBe(403);
    });
  });

  describe('Invited member auto-completion', () => {
    it('auto-completes for invited member when org has active paid plan', async () => {
      // Create org owner with completed onboarding
      const owner = await createRecruiterUser({
        username: `inviteowner_${Date.now()}@example.com`,
        password: 'password',
        role: 'recruiter',
        emailVerified: true,
      });
      created.userIds.push(owner.id);

      await db.update(users)
        .set({ onboardingCompletedAt: new Date() })
        .where(eq(users.id, owner.id));

      const org = await createOrganizationWithOwner({
        name: `Invite Owner Org ${Date.now()}`,
        ownerId: owner.id,
      });
      created.orgIds.push(org.id);

      // Create and assign active plan to org
      const { plan } = await ensurePlan('pro');
      const now = new Date();
      const [subscription] = await db.insert(organizationSubscriptions).values({
        organizationId: org.id,
        planId: plan.id,
        status: 'active',
        billingCycle: 'monthly',
        startDate: now,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }).returning();
      created.subscriptionIds.push(subscription.id);

      // Create invited member
      const invitedUser = await createRecruiterUser({
        username: `invitedmember_${Date.now()}@example.com`,
        password: 'password',
        role: 'recruiter',
        emailVerified: true,
        firstName: 'Invited',
        lastName: 'Member',
      });
      created.userIds.push(invitedUser.id);

      // Add as member (not owner) with seat
      const member = await addOrganizationMember({
        organizationId: org.id,
        userId: invitedUser.id,
        role: 'member',
        seatAssigned: true,
      });
      created.memberIds.push(member.id);

      // Create complete profile for invited user
      const [profile] = await db.insert(userProfiles).values({
        userId: invitedUser.id,
        company: 'Test Company',
        phone: '555-1234',
      }).returning();
      created.profileIds.push(profile.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: invitedUser.username,
        password: 'password',
        expectedRole: ['recruiter'],
      });

      const res = await agent.get('/api/onboarding-status');

      expect(res.status).toBe(200);
      // Invited member with complete profile in org with active plan should be auto-completed
      expect(res.body.needsOnboarding).toBe(false);
      expect(res.body.currentStep).toBe('complete');
    });

    it('does not auto-complete invited member with active paid plan when phone is missing', async () => {
      const owner = await createRecruiterUser({
        username: `inviteowner_nophone_${Date.now()}@example.com`,
        password: 'password',
        role: 'recruiter',
        emailVerified: true,
      });
      created.userIds.push(owner.id);

      await db.update(users)
        .set({ onboardingCompletedAt: new Date() })
        .where(eq(users.id, owner.id));

      const org = await createOrganizationWithOwner({
        name: `Invite Owner No Phone Org ${Date.now()}`,
        ownerId: owner.id,
      });
      created.orgIds.push(org.id);

      const { plan } = await ensurePlan('pro');
      const now = new Date();
      const [subscription] = await db.insert(organizationSubscriptions).values({
        organizationId: org.id,
        planId: plan.id,
        status: 'active',
        billingCycle: 'monthly',
        startDate: now,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }).returning();
      created.subscriptionIds.push(subscription.id);

      const invitedUser = await createRecruiterUser({
        username: `invitedmember_nophone_${Date.now()}@example.com`,
        password: 'password',
        role: 'recruiter',
        emailVerified: true,
        firstName: 'Invited',
        lastName: 'Member',
      });
      created.userIds.push(invitedUser.id);

      const member = await addOrganizationMember({
        organizationId: org.id,
        userId: invitedUser.id,
        role: 'member',
        seatAssigned: true,
      });
      created.memberIds.push(member.id);

      const [profile] = await db.insert(userProfiles).values({
        userId: invitedUser.id,
        company: 'Test Company',
        phone: null,
      }).returning();
      created.profileIds.push(profile.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: invitedUser.username,
        password: 'password',
        expectedRole: ['recruiter'],
      });

      const res = await agent.get('/api/onboarding-status');

      expect(res.status).toBe(200);
      expect(res.body.needsOnboarding).toBe(true);
      expect(res.body.currentStep).toBe('profile');
    });
  });
});
