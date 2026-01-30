// @vitest-environment node
import '../setup.integration';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes';
import { db } from '../../server/db';
import {
  organizations,
  organizationSubscriptions,
  subscriptionPlans,
  subscriptionAuditLog,
  users,
} from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import {
  createRecruiterUser,
  ensurePlan,
  createOrganizationWithOwner,
} from '../utils/db-helpers';
import { createPaidSubscription } from '../../server/lib/subscriptionService';

let app: express.Express;
let server: any;

beforeAll(async () => {
  // NOTE: INSTANCE_TYPE and DISABLE_SUPER_ADMIN are set in setup.integration.ts
  // BEFORE any imports to ensure featureGating.ts reads the correct values at module load.
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
  console.warn('[TEST] Skipping Admin Features Integration tests: DATABASE_URL not set');
}

maybeDescribe('Admin Features API - Authenticated', () => {
  const created = {
    userIds: [] as number[],
    orgIds: [] as number[],
    planIds: [] as number[],
    subscriptionIds: [] as number[],
  };

  afterEach(async () => {
    if (!HAS_DB) return;

    // Clean up in reverse order of dependencies
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
  });

  describe('GET /api/admin/features', () => {
    it('requires authentication', async () => {
      const response = await request(app)
        .get('/api/admin/features');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('requires super_admin role', async () => {
      // Create regular recruiter user
      const recruiter = await createRecruiterUser({
        username: `recruiter_${Date.now()}@example.com`,
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

      const response = await agent.get('/api/admin/features');

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error', 'Super admin access required');
    });

    it('returns features list with expected schema when authenticated as super_admin', async () => {
      // Create super_admin user
      const superAdmin = await createRecruiterUser({
        username: `superadmin_${Date.now()}@example.com`,
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

      const response = await agent.get('/api/admin/features');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('features');
      expect(Array.isArray(response.body.features)).toBe(true);

      // Validate feature structure
      const features = response.body.features;
      expect(features.length).toBeGreaterThan(0);

      const firstFeature = features[0];
      expect(firstFeature).toHaveProperty('key');
      expect(firstFeature).toHaveProperty('name');
      expect(firstFeature).toHaveProperty('description');
      expect(firstFeature).toHaveProperty('category');
      expect(['core', 'ai', 'advanced', 'enterprise']).toContain(firstFeature.category);
      expect(firstFeature).toHaveProperty('defaultByPlan');
      expect(typeof firstFeature.defaultByPlan).toBe('object');

      // Verify expected features exist
      const featureKeys = features.map((f: any) => f.key);
      expect(featureKeys).toContain('basicAts');
      expect(featureKeys).toContain('aiMatching');
      expect(featureKeys).toContain('advancedAnalytics');
    });
  });

  describe('GET /api/admin/organizations/:id/features', () => {
    it('requires authentication', async () => {
      const response = await request(app)
        .get('/api/admin/organizations/1/features');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('returns 404 for non-existent organization', async () => {
      const superAdmin = await createRecruiterUser({
        username: `superadmin_orgfeat_${Date.now()}@example.com`,
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

      const response = await agent.get('/api/admin/organizations/999999/features');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Organization not found');
    });

    it('returns organization features with correct schema', async () => {
      // Create super_admin
      const superAdmin = await createRecruiterUser({
        username: `superadmin_orgfeat2_${Date.now()}@example.com`,
        password: 'password123',
        role: 'super_admin',
      });
      created.userIds.push(superAdmin.id);

      // Create a recruiter for org ownership
      const owner = await createRecruiterUser({
        username: `owner_orgfeat_${Date.now()}@example.com`,
        password: 'password123',
        role: 'recruiter',
      });
      created.userIds.push(owner.id);

      // Create plan and organization
      const { plan, created: planCreated } = await ensurePlan(`test_plan_feat_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const org = await createOrganizationWithOwner({
        name: `Test Org Features ${Date.now()}`,
        ownerId: owner.id,
        billingContactEmail: `billing_feat_${Date.now()}@example.com`,
      });
      created.orgIds.push(org.id);

      // Create subscription for the org
      const subscription = await createPaidSubscription(org.id, plan.id, 1, 'monthly');
      created.subscriptionIds.push(subscription.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: superAdmin.username,
        password: 'password123',
        expectedRole: ['super_admin'],
      });

      const response = await agent.get(`/api/admin/organizations/${org.id}/features`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('organizationId', org.id);
      expect(response.body).toHaveProperty('organizationName');
      expect(response.body).toHaveProperty('planName');
      expect(response.body).toHaveProperty('planDisplayName');
      expect(response.body).toHaveProperty('features');
      expect(response.body).toHaveProperty('overrides');
      expect(response.body).toHaveProperty('limits');

      // Validate features structure { [key]: { enabled: boolean, source: 'plan' | 'override' } }
      const features = response.body.features;
      expect(typeof features).toBe('object');

      // Check a known feature
      if (features.basicAts) {
        expect(features.basicAts).toHaveProperty('enabled');
        expect(typeof features.basicAts.enabled).toBe('boolean');
        expect(features.basicAts).toHaveProperty('source');
        expect(['plan', 'override']).toContain(features.basicAts.source);
      }

      // Validate limits structure
      const limits = response.body.limits;
      expect(limits).toHaveProperty('maxSeats');
      expect(limits).toHaveProperty('maxJobsActive');
      expect(limits).toHaveProperty('maxApplicationsPerJob');
      expect(limits).toHaveProperty('maxAiCreditsPerMonth');
    });
  });

  describe('POST /api/admin/organizations/:id/features', () => {
    it('requires authentication', async () => {
      const response = await request(app)
        .post('/api/admin/organizations/1/features')
        .send({ overrides: { aiMatching: true }, reason: 'test' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('requires CSRF token', async () => {
      const superAdmin = await createRecruiterUser({
        username: `superadmin_csrf_${Date.now()}@example.com`,
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
        .post('/api/admin/organizations/1/features')
        .send({ overrides: { aiMatching: true }, reason: 'test' });

      expect(response.status).toBe(403);
    });

    it('rejects invalid feature keys', async () => {
      // Create super_admin
      const superAdmin = await createRecruiterUser({
        username: `superadmin_invalid_${Date.now()}@example.com`,
        password: 'password123',
        role: 'super_admin',
      });
      created.userIds.push(superAdmin.id);

      // Create a recruiter for org ownership
      const owner = await createRecruiterUser({
        username: `owner_invalid_${Date.now()}@example.com`,
        password: 'password123',
        role: 'recruiter',
      });
      created.userIds.push(owner.id);

      // Create plan and organization
      const { plan, created: planCreated } = await ensurePlan(`test_plan_invalid_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const org = await createOrganizationWithOwner({
        name: `Test Org Invalid ${Date.now()}`,
        ownerId: owner.id,
      });
      created.orgIds.push(org.id);

      // Create subscription
      const subscription = await createPaidSubscription(org.id, plan.id, 1, 'monthly');
      created.subscriptionIds.push(subscription.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: superAdmin.username,
        password: 'password123',
        expectedRole: ['super_admin'],
      });

      // Get CSRF token
      const csrfResponse = await agent.get('/api/csrf-token');
      const csrfToken = csrfResponse.body?.token;

      // Attempt to set invalid feature key
      const response = await agent
        .post(`/api/admin/organizations/${org.id}/features`)
        .set('x-csrf-token', csrfToken)
        .send({
          overrides: { invalidFeatureKey: true },
          reason: 'Testing invalid key',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid input');
      expect(response.body).toHaveProperty('details');
    });

    it('requires reason field', async () => {
      const superAdmin = await createRecruiterUser({
        username: `superadmin_reason_${Date.now()}@example.com`,
        password: 'password123',
        role: 'super_admin',
      });
      created.userIds.push(superAdmin.id);

      const owner = await createRecruiterUser({
        username: `owner_reason_${Date.now()}@example.com`,
        password: 'password123',
        role: 'recruiter',
      });
      created.userIds.push(owner.id);

      const { plan, created: planCreated } = await ensurePlan(`test_plan_reason_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const org = await createOrganizationWithOwner({
        name: `Test Org Reason ${Date.now()}`,
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

      // Attempt without reason
      const response = await agent
        .post(`/api/admin/organizations/${org.id}/features`)
        .set('x-csrf-token', csrfToken)
        .send({
          overrides: { aiMatching: true },
          // missing reason
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid input');
    });

    it('successfully updates feature overrides with valid data and creates audit log entry', async () => {
      const superAdmin = await createRecruiterUser({
        username: `superadmin_update_${Date.now()}@example.com`,
        password: 'password123',
        role: 'super_admin',
      });
      created.userIds.push(superAdmin.id);

      const owner = await createRecruiterUser({
        username: `owner_update_${Date.now()}@example.com`,
        password: 'password123',
        role: 'recruiter',
      });
      created.userIds.push(owner.id);

      const { plan, created: planCreated } = await ensurePlan(`test_plan_update_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const org = await createOrganizationWithOwner({
        name: `Test Org Update ${Date.now()}`,
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

      // Update with valid feature
      const response = await agent
        .post(`/api/admin/organizations/${org.id}/features`)
        .set('x-csrf-token', csrfToken)
        .send({
          overrides: { aiMatching: true },
          reason: 'Enable AI matching for testing',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);

      // Verify the override was applied
      const verifyResponse = await agent.get(`/api/admin/organizations/${org.id}/features`);
      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.body.overrides).toHaveProperty('aiMatching', true);
      expect(verifyResponse.body.features.aiMatching?.source).toBe('override');

      // Verify audit log entry was created for the feature override
      const auditLogResponse = await agent
        .get('/api/admin/features/audit-log')
        .query({ orgId: org.id });

      expect(auditLogResponse.status).toBe(200);
      expect(Array.isArray(auditLogResponse.body)).toBe(true);

      // Find the admin_override entry for this org (feature overrides use action='admin_override')
      const overrideEntry = auditLogResponse.body.find(
        (entry: any) =>
          entry.organizationId === org.id &&
          entry.action === 'admin_override'
      );
      expect(overrideEntry).toBeDefined();
      expect(overrideEntry.reason).toBe('Feature override: Enable AI matching for testing');
      expect(overrideEntry.performedBy).toBe(superAdmin.id);
      // Verify the newValue contains the feature override
      expect(overrideEntry.newValue).toHaveProperty('featureOverrides');
      expect(overrideEntry.newValue.featureOverrides).toHaveProperty('aiMatching', true);
    });

    it('clears override when value is null', async () => {
      const superAdmin = await createRecruiterUser({
        username: `superadmin_clear_${Date.now()}@example.com`,
        password: 'password123',
        role: 'super_admin',
      });
      created.userIds.push(superAdmin.id);

      const owner = await createRecruiterUser({
        username: `owner_clear_${Date.now()}@example.com`,
        password: 'password123',
        role: 'recruiter',
      });
      created.userIds.push(owner.id);

      const { plan, created: planCreated } = await ensurePlan(`test_plan_clear_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const org = await createOrganizationWithOwner({
        name: `Test Org Clear ${Date.now()}`,
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

      // First, set an override
      await agent
        .post(`/api/admin/organizations/${org.id}/features`)
        .set('x-csrf-token', csrfToken)
        .send({
          overrides: { advancedAnalytics: true },
          reason: 'Enable advanced analytics',
        });

      // Verify it was set
      let verifyResponse = await agent.get(`/api/admin/organizations/${org.id}/features`);
      expect(verifyResponse.body.overrides).toHaveProperty('advancedAnalytics', true);

      // Clear the override by setting to null
      const clearResponse = await agent
        .post(`/api/admin/organizations/${org.id}/features`)
        .set('x-csrf-token', csrfToken)
        .send({
          overrides: { advancedAnalytics: null },
          reason: 'Clear advanced analytics override',
        });

      expect(clearResponse.status).toBe(200);

      // Verify override was cleared
      verifyResponse = await agent.get(`/api/admin/organizations/${org.id}/features`);
      expect(verifyResponse.body.overrides).not.toHaveProperty('advancedAnalytics');
      expect(verifyResponse.body.features.advancedAnalytics?.source).toBe('plan');
    });

    it('returns error for org without subscription', async () => {
      const superAdmin = await createRecruiterUser({
        username: `superadmin_nosub_${Date.now()}@example.com`,
        password: 'password123',
        role: 'super_admin',
      });
      created.userIds.push(superAdmin.id);

      const owner = await createRecruiterUser({
        username: `owner_nosub_${Date.now()}@example.com`,
        password: 'password123',
        role: 'recruiter',
      });
      created.userIds.push(owner.id);

      // Create org without subscription
      const org = await createOrganizationWithOwner({
        name: `Test Org NoSub ${Date.now()}`,
        ownerId: owner.id,
      });
      created.orgIds.push(org.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: superAdmin.username,
        password: 'password123',
        expectedRole: ['super_admin'],
      });

      const csrfResponse = await agent.get('/api/csrf-token');
      const csrfToken = csrfResponse.body?.token;

      const response = await agent
        .post(`/api/admin/organizations/${org.id}/features`)
        .set('x-csrf-token', csrfToken)
        .send({
          overrides: { aiMatching: true },
          reason: 'Test no subscription',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('no subscription');
    });
  });

  describe('GET /api/admin/features/audit-log', () => {
    it('requires authentication', async () => {
      const response = await request(app)
        .get('/api/admin/features/audit-log');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('returns audit log as super_admin', async () => {
      const superAdmin = await createRecruiterUser({
        username: `superadmin_audit_${Date.now()}@example.com`,
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

      const response = await agent.get('/api/admin/features/audit-log');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('supports orgId query parameter', async () => {
      const superAdmin = await createRecruiterUser({
        username: `superadmin_auditorg_${Date.now()}@example.com`,
        password: 'password123',
        role: 'super_admin',
      });
      created.userIds.push(superAdmin.id);

      const owner = await createRecruiterUser({
        username: `owner_auditorg_${Date.now()}@example.com`,
        password: 'password123',
        role: 'recruiter',
      });
      created.userIds.push(owner.id);

      const { plan, created: planCreated } = await ensurePlan(`test_plan_auditorg_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const org = await createOrganizationWithOwner({
        name: `Test Org Audit ${Date.now()}`,
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

      const response = await agent
        .get('/api/admin/features/audit-log')
        .query({ orgId: org.id });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});

describe('Feature Gating Module', () => {
  it('exports FEATURES constant with expected keys', async () => {
    const { FEATURES } = await import('../../server/lib/featureGating');

    expect(FEATURES).toBeDefined();
    expect(FEATURES.BASIC_ATS).toBe('basicAts');
    expect(FEATURES.AI_MATCHING).toBe('aiMatching');
    expect(FEATURES.AI_CONTENT).toBe('aiContent');
    expect(FEATURES.ADVANCED_ANALYTICS).toBe('advancedAnalytics');
    expect(FEATURES.CUSTOM_PIPELINE).toBe('customPipeline');
    expect(FEATURES.TEAM_COLLABORATION).toBe('teamCollaboration');
    expect(FEATURES.CLIENT_PORTAL).toBe('clientPortal');
    expect(FEATURES.API_ACCESS).toBe('apiAccess');
    expect(FEATURES.SSO).toBe('sso');
    expect(FEATURES.CUSTOM_BRANDING).toBe('customBranding');
  });

  it('exports FEATURE_METADATA with all features', async () => {
    const { FEATURES, FEATURE_METADATA } = await import('../../server/lib/featureGating');

    expect(FEATURE_METADATA).toBeDefined();

    // Every feature should have metadata
    for (const featureKey of Object.values(FEATURES)) {
      expect(FEATURE_METADATA[featureKey]).toBeDefined();
      expect(FEATURE_METADATA[featureKey]).toHaveProperty('name');
      expect(FEATURE_METADATA[featureKey]).toHaveProperty('description');
      expect(FEATURE_METADATA[featureKey]).toHaveProperty('category');
      expect(['core', 'ai', 'advanced', 'enterprise']).toContain(FEATURE_METADATA[featureKey].category);
    }
  });

  it('isValidFeatureKey validates feature keys correctly', async () => {
    const { isValidFeatureKey } = await import('../../server/lib/featureGating');

    // Valid keys
    expect(isValidFeatureKey('basicAts')).toBe(true);
    expect(isValidFeatureKey('aiMatching')).toBe(true);
    expect(isValidFeatureKey('advancedAnalytics')).toBe(true);

    // Invalid keys
    expect(isValidFeatureKey('invalidFeature')).toBe(false);
    expect(isValidFeatureKey('')).toBe(false);
    expect(isValidFeatureKey('BASIC_ATS')).toBe(false); // case sensitive
  });

  it('getFeatureDefaultsByPlan returns expected structure', async () => {
    if (!HAS_DB) {
      console.warn('[TEST] Skipping getFeatureDefaultsByPlan test: DATABASE_URL not set');
      return;
    }

    const { getFeatureDefaultsByPlan, FEATURES } = await import('../../server/lib/featureGating');

    const defaults = await getFeatureDefaultsByPlan();

    expect(defaults).toBeDefined();
    expect(typeof defaults).toBe('object');

    // Should have at least a 'free' plan (either from DB or implicit)
    expect(defaults['free']).toBeDefined();

    // Each plan entry should have all features defined as booleans
    for (const [planName, planFeatures] of Object.entries(defaults)) {
      expect(typeof planFeatures).toBe('object');
      for (const featureKey of Object.values(FEATURES)) {
        expect(typeof planFeatures[featureKey]).toBe('boolean');
      }
    }
  });
});

describe('Admin Auth Module', () => {
  it('exports requireSuperAdmin middleware', async () => {
    const { requireSuperAdmin } = await import('../../server/lib/adminAuth');

    expect(requireSuperAdmin).toBeDefined();
    expect(typeof requireSuperAdmin).toBe('function');

    // Should return a middleware function
    const middleware = requireSuperAdmin();
    expect(typeof middleware).toBe('function');
  });

  it('requireSuperAdmin returns 401 when not authenticated', async () => {
    const { requireSuperAdmin } = await import('../../server/lib/adminAuth');

    const middleware = requireSuperAdmin();

    let statusCode: number | undefined;
    let responseBody: any;

    const mockReq = { user: undefined } as any;
    const mockRes = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            responseBody = body;
            return mockRes;
          }
        };
      }
    } as any;
    const mockNext = vi.fn();

    middleware(mockReq, mockRes, mockNext);

    expect(statusCode).toBe(401);
    expect(responseBody).toHaveProperty('error', 'Authentication required');
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('requireSuperAdmin returns 403 for non-super_admin users', async () => {
    const { requireSuperAdmin } = await import('../../server/lib/adminAuth');

    const middleware = requireSuperAdmin();

    let statusCode: number | undefined;
    let responseBody: any;

    const mockReq = { user: { id: 1, role: 'recruiter' } } as any;
    const mockRes = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            responseBody = body;
            return mockRes;
          }
        };
      }
    } as any;
    const mockNext = vi.fn();

    middleware(mockReq, mockRes, mockNext);

    expect(statusCode).toBe(403);
    expect(responseBody).toHaveProperty('error', 'Super admin access required');
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('requireSuperAdmin calls next() for super_admin users', async () => {
    const { requireSuperAdmin } = await import('../../server/lib/adminAuth');

    const middleware = requireSuperAdmin();

    const mockReq = { user: { id: 1, role: 'super_admin' } } as any;
    const mockRes = {
      status: (code: number) => ({
        json: (body: any) => mockRes
      })
    } as any;
    const mockNext = vi.fn();

    middleware(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
  });
});
