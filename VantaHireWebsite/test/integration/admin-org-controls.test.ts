// @vitest-environment node
import '../setup.integration';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes';
import { db } from '../../server/db';
import {
  organizations,
  organizationSubscriptions,
  subscriptionPlans,
  subscriptionAuditLog,
  organizationMembers,
  users,
} from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import {
  createRecruiterUser,
  ensurePlan,
  createOrganizationWithOwner,
  addOrganizationMember,
} from '../utils/db-helpers';
import { createPaidSubscription } from '../../server/lib/subscriptionService';

let app: express.Express;
let server: any;

beforeAll(async () => {
  app = express();
  server = await registerRoutes(app);
});

afterAll(() => {
  server?.close();
});

// Gate DB-dependent tests - skip when DATABASE_URL not set
const HAS_DB = !!process.env.DATABASE_URL;
const maybeDescribe = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[TEST] Skipping Admin Org Controls Integration tests: DATABASE_URL not set');
}

maybeDescribe('Admin Org Controls - Credit Management', () => {
  const created = {
    userIds: [] as number[],
    orgIds: [] as number[],
    planIds: [] as number[],
    subscriptionIds: [] as number[],
    memberIds: [] as number[],
  };

  afterEach(async () => {
    if (!HAS_DB) return;

    // Clean up in reverse order of dependencies
    if (created.memberIds.length > 0) {
      await db.delete(organizationMembers)
        .where(inArray(organizationMembers.id, created.memberIds));
    }

    if (created.orgIds.length > 0) {
      await db.delete(subscriptionAuditLog)
        .where(inArray(subscriptionAuditLog.organizationId, created.orgIds));
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

    created.userIds = [];
    created.orgIds = [];
    created.planIds = [];
    created.subscriptionIds = [];
    created.memberIds = [];
  });

  describe('GET /api/admin/organizations/:id/credits', () => {
    it('requires authentication', async () => {
      const response = await request(app)
        .get('/api/admin/organizations/1/credits');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('requires super_admin role', async () => {
      // Create regular recruiter user
      const recruiter = await createRecruiterUser({
        username: `recruiter_credits_${Date.now()}@example.com`,
        password: 'password123',
        role: 'recruiter',
      });
      created.userIds.push(recruiter.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: recruiter.username,
        password: 'password123',
        expectedRole: ['recruiter'],
      });

      const response = await agent.get('/api/admin/organizations/1/credits');

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error', 'Super admin access required');
    });

    it('returns 404 for non-existent organization', async () => {
      const superAdmin = await createRecruiterUser({
        username: `superadmin_credits_404_${Date.now()}@example.com`,
        password: 'password123',
        role: 'super_admin',
      });
      created.userIds.push(superAdmin.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: superAdmin.username,
        password: 'password123',
        expectedRole: ['super_admin'],
      });

      const response = await agent.get('/api/admin/organizations/999999/credits');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Organization not found');
    });

    it('returns credit details with correct schema', async () => {
      // Create super_admin
      const superAdmin = await createRecruiterUser({
        username: `superadmin_credits_${Date.now()}@example.com`,
        password: 'password123',
        role: 'super_admin',
      });
      created.userIds.push(superAdmin.id);

      // Create owner
      const owner = await createRecruiterUser({
        username: `owner_credits_${Date.now()}@example.com`,
        password: 'password123',
        role: 'recruiter',
      });
      created.userIds.push(owner.id);

      // Create plan and organization
      const { plan, created: planCreated } = await ensurePlan(`test_plan_credits_${Date.now()}`, {
        aiCreditsPerSeatMonthly: 600,
      });
      if (planCreated) created.planIds.push(plan.id);

      const org = await createOrganizationWithOwner({
        name: `Test Org Credits ${Date.now()}`,
        ownerId: owner.id,
        billingContactEmail: `billing_credits_${Date.now()}@example.com`,
      });
      created.orgIds.push(org.id);

      // Create subscription
      const subscription = await createPaidSubscription(org.id, plan.id, 2, 'monthly');
      created.subscriptionIds.push(subscription.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: superAdmin.username,
        password: 'password123',
        expectedRole: ['super_admin'],
      });

      const response = await agent.get(`/api/admin/organizations/${org.id}/credits`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('organizationId', org.id);
      expect(response.body).toHaveProperty('organizationName');
      expect(response.body).toHaveProperty('planAllocation');
      expect(response.body).toHaveProperty('bonusCredits');
      expect(response.body).toHaveProperty('customLimit');
      expect(response.body).toHaveProperty('effectiveLimit');
      expect(response.body).toHaveProperty('usedThisPeriod');
      expect(response.body).toHaveProperty('remaining');
      expect(response.body).toHaveProperty('seatedMembers');
      expect(response.body).toHaveProperty('memberBreakdown');
      expect(Array.isArray(response.body.memberBreakdown)).toBe(true);
    });
  });

  describe('POST /api/admin/organizations/:id/credits/bonus', () => {
    it('requires authentication', async () => {
      const response = await request(app)
        .post('/api/admin/organizations/1/credits/bonus')
        .send({ amount: 100, reason: 'test' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('requires CSRF token', async () => {
      const superAdmin = await createRecruiterUser({
        username: `superadmin_bonus_csrf_${Date.now()}@example.com`,
        password: 'password123',
        role: 'super_admin',
      });
      created.userIds.push(superAdmin.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: superAdmin.username,
        password: 'password123',
        expectedRole: ['super_admin'],
      });

      // POST without CSRF token should fail
      const response = await agent
        .post('/api/admin/organizations/1/credits/bonus')
        .send({ amount: 100, reason: 'test' });

      expect(response.status).toBe(403);
    });

    it('validates required fields', async () => {
      const superAdmin = await createRecruiterUser({
        username: `superadmin_bonus_validate_${Date.now()}@example.com`,
        password: 'password123',
        role: 'super_admin',
      });
      created.userIds.push(superAdmin.id);

      const owner = await createRecruiterUser({
        username: `owner_bonus_validate_${Date.now()}@example.com`,
        password: 'password123',
        role: 'recruiter',
      });
      created.userIds.push(owner.id);

      const { plan, created: planCreated } = await ensurePlan(`test_plan_bonus_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const org = await createOrganizationWithOwner({
        name: `Test Org Bonus ${Date.now()}`,
        ownerId: owner.id,
      });
      created.orgIds.push(org.id);

      const subscription = await createPaidSubscription(org.id, plan.id, 1, 'monthly');
      created.subscriptionIds.push(subscription.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: superAdmin.username,
        password: 'password123',
        expectedRole: ['super_admin'],
      });

      const csrfResponse = await agent.get('/api/csrf-token');
      const csrfToken = csrfResponse.body?.token;

      // Missing amount
      const response1 = await agent
        .post(`/api/admin/organizations/${org.id}/credits/bonus`)
        .set('x-csrf-token', csrfToken)
        .send({ reason: 'test' });

      expect(response1.status).toBe(400);

      // Missing reason
      const response2 = await agent
        .post(`/api/admin/organizations/${org.id}/credits/bonus`)
        .set('x-csrf-token', csrfToken)
        .send({ amount: 100 });

      expect(response2.status).toBe(400);
    });

    it('successfully grants bonus credits', async () => {
      const superAdmin = await createRecruiterUser({
        username: `superadmin_bonus_grant_${Date.now()}@example.com`,
        password: 'password123',
        role: 'super_admin',
      });
      created.userIds.push(superAdmin.id);

      const owner = await createRecruiterUser({
        username: `owner_bonus_grant_${Date.now()}@example.com`,
        password: 'password123',
        role: 'recruiter',
      });
      created.userIds.push(owner.id);

      const { plan, created: planCreated } = await ensurePlan(`test_plan_bonus_grant_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const org = await createOrganizationWithOwner({
        name: `Test Org Bonus Grant ${Date.now()}`,
        ownerId: owner.id,
      });
      created.orgIds.push(org.id);

      const subscription = await createPaidSubscription(org.id, plan.id, 1, 'monthly');
      created.subscriptionIds.push(subscription.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: superAdmin.username,
        password: 'password123',
        expectedRole: ['super_admin'],
      });

      const csrfResponse = await agent.get('/api/csrf-token');
      const csrfToken = csrfResponse.body?.token;

      const response = await agent
        .post(`/api/admin/organizations/${org.id}/credits/bonus`)
        .set('x-csrf-token', csrfToken)
        .send({
          amount: 500,
          reason: 'Reward for active usage',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('totalGranted', 500);
      expect(response.body).toHaveProperty('newBonusTotal');

      // Verify credits were added by checking the credits endpoint
      const creditsResponse = await agent.get(`/api/admin/organizations/${org.id}/credits`);
      expect(creditsResponse.status).toBe(200);
      expect(creditsResponse.body.bonusCredits).toBe(500);
    });

    it('creates audit log entry', async () => {
      const superAdmin = await createRecruiterUser({
        username: `superadmin_bonus_audit_${Date.now()}@example.com`,
        password: 'password123',
        role: 'super_admin',
      });
      created.userIds.push(superAdmin.id);

      const owner = await createRecruiterUser({
        username: `owner_bonus_audit_${Date.now()}@example.com`,
        password: 'password123',
        role: 'recruiter',
      });
      created.userIds.push(owner.id);

      const { plan, created: planCreated } = await ensurePlan(`test_plan_bonus_audit_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const org = await createOrganizationWithOwner({
        name: `Test Org Bonus Audit ${Date.now()}`,
        ownerId: owner.id,
      });
      created.orgIds.push(org.id);

      const subscription = await createPaidSubscription(org.id, plan.id, 1, 'monthly');
      created.subscriptionIds.push(subscription.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: superAdmin.username,
        password: 'password123',
        expectedRole: ['super_admin'],
      });

      const csrfResponse = await agent.get('/api/csrf-token');
      const csrfToken = csrfResponse.body?.token;

      await agent
        .post(`/api/admin/organizations/${org.id}/credits/bonus`)
        .set('x-csrf-token', csrfToken)
        .send({
          amount: 250,
          reason: 'Test audit log',
        });

      // Check audit log
      const auditResponse = await agent.get(`/api/admin/organizations/${org.id}/audit-log`);
      expect(auditResponse.status).toBe(200);
      expect(Array.isArray(auditResponse.body.logs)).toBe(true);

      const bonusEntry = auditResponse.body.logs.find(
        (entry: any) => entry.reason?.includes('Bonus credits')
      );
      expect(bonusEntry).toBeDefined();
    });
  });

  describe('POST /api/admin/organizations/:id/credits/custom-limit', () => {
    it('successfully sets custom credit limit', async () => {
      const superAdmin = await createRecruiterUser({
        username: `superadmin_custom_${Date.now()}@example.com`,
        password: 'password123',
        role: 'super_admin',
      });
      created.userIds.push(superAdmin.id);

      const owner = await createRecruiterUser({
        username: `owner_custom_${Date.now()}@example.com`,
        password: 'password123',
        role: 'recruiter',
      });
      created.userIds.push(owner.id);

      const { plan, created: planCreated } = await ensurePlan(`test_plan_custom_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const org = await createOrganizationWithOwner({
        name: `Test Org Custom ${Date.now()}`,
        ownerId: owner.id,
      });
      created.orgIds.push(org.id);

      const subscription = await createPaidSubscription(org.id, plan.id, 1, 'monthly');
      created.subscriptionIds.push(subscription.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: superAdmin.username,
        password: 'password123',
        expectedRole: ['super_admin'],
      });

      const csrfResponse = await agent.get('/api/csrf-token');
      const csrfToken = csrfResponse.body?.token;

      const response = await agent
        .post(`/api/admin/organizations/${org.id}/credits/custom-limit`)
        .set('x-csrf-token', csrfToken)
        .send({
          customLimit: 15000,
          reason: 'Enterprise agreement',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('newLimit', 15000);

      // Verify custom limit was set
      const creditsResponse = await agent.get(`/api/admin/organizations/${org.id}/credits`);
      expect(creditsResponse.status).toBe(200);
      expect(creditsResponse.body.customLimit).toBe(15000);
      expect(creditsResponse.body.effectiveLimit).toBe(15000);
    });

    it('clears custom limit when set to null', async () => {
      const superAdmin = await createRecruiterUser({
        username: `superadmin_clearlimit_${Date.now()}@example.com`,
        password: 'password123',
        role: 'super_admin',
      });
      created.userIds.push(superAdmin.id);

      const owner = await createRecruiterUser({
        username: `owner_clearlimit_${Date.now()}@example.com`,
        password: 'password123',
        role: 'recruiter',
      });
      created.userIds.push(owner.id);

      const { plan, created: planCreated } = await ensurePlan(`test_plan_clearlimit_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const org = await createOrganizationWithOwner({
        name: `Test Org Clear Limit ${Date.now()}`,
        ownerId: owner.id,
      });
      created.orgIds.push(org.id);

      const subscription = await createPaidSubscription(org.id, plan.id, 1, 'monthly');
      created.subscriptionIds.push(subscription.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: superAdmin.username,
        password: 'password123',
        expectedRole: ['super_admin'],
      });

      const csrfResponse = await agent.get('/api/csrf-token');
      const csrfToken = csrfResponse.body?.token;

      // First set a custom limit
      await agent
        .post(`/api/admin/organizations/${org.id}/credits/custom-limit`)
        .set('x-csrf-token', csrfToken)
        .send({
          customLimit: 10000,
          reason: 'Set limit',
        });

      // Then clear it
      const response = await agent
        .post(`/api/admin/organizations/${org.id}/credits/custom-limit`)
        .set('x-csrf-token', csrfToken)
        .send({
          customLimit: null,
          reason: 'Clear limit',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('newLimit', null);

      // Verify custom limit was cleared
      const creditsResponse = await agent.get(`/api/admin/organizations/${org.id}/credits`);
      expect(creditsResponse.body.customLimit).toBeNull();
    });
  });

  describe('DELETE /api/admin/organizations/:id/credits/bonus', () => {
    it('successfully clears bonus credits', async () => {
      const superAdmin = await createRecruiterUser({
        username: `superadmin_clearbonus_${Date.now()}@example.com`,
        password: 'password123',
        role: 'super_admin',
      });
      created.userIds.push(superAdmin.id);

      const owner = await createRecruiterUser({
        username: `owner_clearbonus_${Date.now()}@example.com`,
        password: 'password123',
        role: 'recruiter',
      });
      created.userIds.push(owner.id);

      const { plan, created: planCreated } = await ensurePlan(`test_plan_clearbonus_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const org = await createOrganizationWithOwner({
        name: `Test Org Clear Bonus ${Date.now()}`,
        ownerId: owner.id,
      });
      created.orgIds.push(org.id);

      const subscription = await createPaidSubscription(org.id, plan.id, 1, 'monthly');
      created.subscriptionIds.push(subscription.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: superAdmin.username,
        password: 'password123',
        expectedRole: ['super_admin'],
      });

      const csrfResponse = await agent.get('/api/csrf-token');
      const csrfToken = csrfResponse.body?.token;

      // First grant some bonus credits
      await agent
        .post(`/api/admin/organizations/${org.id}/credits/bonus`)
        .set('x-csrf-token', csrfToken)
        .send({
          amount: 300,
          reason: 'Test credits',
        });

      // Verify they were added
      let creditsResponse = await agent.get(`/api/admin/organizations/${org.id}/credits`);
      expect(creditsResponse.body.bonusCredits).toBe(300);

      // Clear bonus credits
      const response = await agent
        .delete(`/api/admin/organizations/${org.id}/credits/bonus`)
        .set('x-csrf-token', csrfToken)
        .send({ reason: 'Clear bonus' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('previousAmount', 300);

      // Verify they were cleared
      creditsResponse = await agent.get(`/api/admin/organizations/${org.id}/credits`);
      expect(creditsResponse.body.bonusCredits).toBe(0);
    });
  });

  describe('GET /api/admin/organizations/:id/audit-log', () => {
    it('returns unified audit log', async () => {
      const superAdmin = await createRecruiterUser({
        username: `superadmin_auditlog_${Date.now()}@example.com`,
        password: 'password123',
        role: 'super_admin',
      });
      created.userIds.push(superAdmin.id);

      const owner = await createRecruiterUser({
        username: `owner_auditlog_${Date.now()}@example.com`,
        password: 'password123',
        role: 'recruiter',
      });
      created.userIds.push(owner.id);

      const { plan, created: planCreated } = await ensurePlan(`test_plan_auditlog_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const org = await createOrganizationWithOwner({
        name: `Test Org Audit Log ${Date.now()}`,
        ownerId: owner.id,
      });
      created.orgIds.push(org.id);

      const subscription = await createPaidSubscription(org.id, plan.id, 1, 'monthly');
      created.subscriptionIds.push(subscription.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: superAdmin.username,
        password: 'password123',
        expectedRole: ['super_admin'],
      });

      const response = await agent.get(`/api/admin/organizations/${org.id}/audit-log`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('organizationId', org.id);
      expect(response.body).toHaveProperty('organizationName');
      expect(response.body).toHaveProperty('logs');
      expect(Array.isArray(response.body.logs)).toBe(true);

      // Should have at least a 'created' or 'upgraded' entry from subscription creation
      if (response.body.logs.length > 0) {
        const log = response.body.logs[0];
        expect(log).toHaveProperty('id');
        expect(log).toHaveProperty('action');
        expect(log).toHaveProperty('performedAt');
      }
    });
  });
});

describe('Credit Service Functions', () => {
  const HAS_DB = !!process.env.DATABASE_URL;
  const maybeDescribe = HAS_DB ? describe : describe.skip;

  if (!HAS_DB) {
    console.warn('[TEST] Skipping Credit Service unit tests: DATABASE_URL not set');
  }

  maybeDescribe('getOrgCreditDetails', () => {
    it('returns null for non-existent organization', async () => {
      const { getOrgCreditDetails } = await import('../../server/lib/creditService');
      const result = await getOrgCreditDetails(999999);
      expect(result).toBeNull();
    });
  });

  maybeDescribe('grantBonusCredits', () => {
    it('throws error for org without subscription', async () => {
      const { grantBonusCredits } = await import('../../server/lib/creditService');
      await expect(grantBonusCredits(999999, 100, 'test', 1))
        .rejects.toThrow('Organization has no subscription');
    });
  });

  maybeDescribe('recalculateOrgCredits', () => {
    it('throws error for org without subscription', async () => {
      const { recalculateOrgCredits } = await import('../../server/lib/creditService');
      await expect(recalculateOrgCredits(999999))
        .rejects.toThrow('Organization has no subscription');
    });
  });
});
