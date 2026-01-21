// @vitest-environment node
import '../setup.integration';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes';
import { db } from '../../server/db';
import {
  checkoutIntents,
  organizations,
  organizationMembers,
  organizationSubscriptions,
  paymentTransactions,
  subscriptionAuditLog,
  subscriptionPlans,
  users,
  webhookEvents,
} from '@shared/schema';
import { eq, inArray, gte, and } from 'drizzle-orm';
import {
  createOrganizationWithOwner,
  createRecruiterUser,
  ensurePlan,
} from '../utils/db-helpers';

// Mock external services
const emailMocks = vi.hoisted(() => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  sendContactNotification: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../server/simpleEmailService', () => ({
  getEmailService: vi.fn(async () => emailMocks),
}));

vi.mock('../../server/lib/invoicePdfService', () => ({
  generateAndStoreInvoicePdf: vi.fn().mockResolvedValue(null),
  getLocalInvoicePath: vi.fn().mockReturnValue(null),
}));

// Mock Cashfree client
const cashfreeMocks = vi.hoisted(() => ({
  createCheckoutOrder: vi.fn().mockResolvedValue({
    orderId: 'test_order_123',
    sessionId: 'test_session_123',
    paymentLink: 'https://payments.cashfree.com/test',
    amount: 99900,
    taxAmount: 17982,
    totalAmount: 117882,
  }),
  createSeatAddCheckout: vi.fn().mockResolvedValue({
    orderId: 'test_seat_order_123',
    sessionId: 'test_seat_session_123',
    paymentLink: 'https://payments.cashfree.com/seat-test',
    amount: 5000,
    taxAmount: 900,
    totalAmount: 5900,
  }),
  isCashfreeConfigured: vi.fn().mockReturnValue(true),
  getOrderStatus: vi.fn().mockResolvedValue({
    status: 'PAID',
    paymentId: 'pay_123',
    paymentMethod: 'card',
  }),
  verifyWebhookSignature: vi.fn().mockReturnValue(true),
  parseWebhookEvent: vi.fn((payload) => ({
    eventType: payload.type,
    eventId: payload.type + '_' + Date.now(),
    orderId: payload.data?.order?.order_id,
    paymentId: payload.data?.payment?.cf_payment_id,
    paymentAmount: payload.data?.payment?.payment_amount ? payload.data.payment.payment_amount * 100 : 0,
    paymentStatus: payload.data?.payment?.payment_status,
    paymentMethod: payload.data?.payment?.payment_method?.payment_method_type,
  })),
}));

vi.mock('../../server/lib/cashfreeClient', () => cashfreeMocks);

const HAS_DB = !!process.env.DATABASE_URL;
const maybeDescribe = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[TEST] Skipping checkout/claim integration tests: DATABASE_URL not set');
}

maybeDescribe('Checkout and Claim Flows', () => {
  let app: express.Express;
  let server: any;

  const created = {
    userIds: [] as number[],
    orgIds: [] as number[],
    planIds: [] as number[],
    subscriptionIds: [] as number[],
    transactionIds: [] as number[],
    intentIds: [] as number[],
  };
  let webhookCleanupAfter: Date | null = null;

  beforeAll(async () => {
    process.env.CASHFREE_WEBHOOK_SECRET = '';
    process.env.BASE_URL = 'http://localhost:5000';
    process.env.APP_URL = 'http://localhost:5001';

    app = express();
    server = await registerRoutes(app);
  });

  afterAll(() => {
    server?.close();
  });

  afterEach(async () => {
    emailMocks.sendEmail.mockClear();
    emailMocks.sendContactNotification.mockClear();
    cashfreeMocks.createCheckoutOrder.mockClear();

    if (!HAS_DB) return;

    // Clean up in reverse order of dependencies
    if (created.intentIds.length > 0) {
      await db.delete(checkoutIntents)
        .where(inArray(checkoutIntents.id, created.intentIds));
    }

    if (created.transactionIds.length > 0) {
      await db.delete(paymentTransactions)
        .where(inArray(paymentTransactions.id, created.transactionIds));
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
      await db.delete(organizationMembers)
        .where(inArray(organizationMembers.organizationId, created.orgIds));
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

    if (webhookCleanupAfter) {
      await db.delete(webhookEvents)
        .where(gte(webhookEvents.processedAt, webhookCleanupAfter));
    }

    created.userIds = [];
    created.orgIds = [];
    created.planIds = [];
    created.subscriptionIds = [];
    created.transactionIds = [];
    created.intentIds = [];
    webhookCleanupAfter = null;
  });

  describe('POST /api/subscription/checkout-public', () => {
    it('creates checkout intent for new user without requiring auth', async () => {
      const { plan, created: planCreated } = await ensurePlan(`pro_checkout_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const email = `newuser_${Date.now()}@example.com`;
      const orgName = `Test Org ${Date.now()}`;

      const response = await request(app)
        .post('/api/subscription/checkout-public')
        .send({
          email,
          orgName,
          planId: plan.id,
          seats: 2,
          billingCycle: 'monthly',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('orderId');
      expect(response.body).toHaveProperty('paymentLink');
      expect(response.body).toHaveProperty('claimToken');
      expect(response.body.claimToken).toHaveLength(64); // 32 bytes hex

      // Verify checkout intent was created
      const intent = await db.query.checkoutIntents.findFirst({
        where: eq(checkoutIntents.claimToken, response.body.claimToken),
      });
      expect(intent).toBeTruthy();
      expect(intent?.email).toBe(email);
      expect(intent?.orgName).toBe(orgName);
      expect(intent?.status).toBe('pending');
      expect(intent?.planId).toBe(plan.id);
      expect(intent?.seats).toBe(2);

      if (intent) created.intentIds.push(intent.id);
    });

    it('returns requiresLogin for existing user with organization', async () => {
      const { plan, created: planCreated } = await ensurePlan(`pro_existing_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      // Create existing user with org
      const existingUser = await createRecruiterUser({
        username: `existing_${Date.now()}@example.com`,
        password: 'password123',
      });
      created.userIds.push(existingUser.id);

      const org = await createOrganizationWithOwner({
        name: `Existing Org ${Date.now()}`,
        ownerId: existingUser.id,
      });
      created.orgIds.push(org.id);

      const response = await request(app)
        .post('/api/subscription/checkout-public')
        .send({
          email: existingUser.username,
          orgName: 'New Org Name',
          planId: plan.id,
          seats: 1,
          billingCycle: 'monthly',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('requiresLogin', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('log in');
    });

    it('links checkout intent to existing user without org', async () => {
      const { plan, created: planCreated } = await ensurePlan(`pro_link_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      // Create existing user without org
      const existingUser = await createRecruiterUser({
        username: `noorg_${Date.now()}@example.com`,
        password: 'password123',
      });
      created.userIds.push(existingUser.id);

      const response = await request(app)
        .post('/api/subscription/checkout-public')
        .send({
          email: existingUser.username,
          orgName: 'New Org For Existing User',
          planId: plan.id,
          seats: 1,
          billingCycle: 'monthly',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('claimToken');

      // Verify intent is linked to existing user
      const intent = await db.query.checkoutIntents.findFirst({
        where: eq(checkoutIntents.claimToken, response.body.claimToken),
      });
      expect(intent).toBeTruthy();
      expect(intent?.userId).toBe(existingUser.id);

      if (intent) created.intentIds.push(intent.id);
    });

    it('rejects invalid plan', async () => {
      const response = await request(app)
        .post('/api/subscription/checkout-public')
        .send({
          email: 'test@example.com',
          orgName: 'Test Org',
          planId: 999999,
          seats: 1,
          billingCycle: 'monthly',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid plan');
    });

    it('stores billing details in checkout intent', async () => {
      const { plan, created: planCreated } = await ensurePlan(`pro_billing_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const billingDetails = {
        gstin: '29ABCDE1234F1Z5',
        billingName: 'Acme Corp',
        billingAddress: '123 Main St',
        billingCity: 'Bangalore',
        billingState: 'Karnataka',
        billingPincode: '560001',
      };

      const response = await request(app)
        .post('/api/subscription/checkout-public')
        .send({
          email: `billing_${Date.now()}@example.com`,
          orgName: 'Billing Test Org',
          planId: plan.id,
          seats: 1,
          billingCycle: 'annual',
          ...billingDetails,
        });

      expect(response.status).toBe(200);

      const intent = await db.query.checkoutIntents.findFirst({
        where: eq(checkoutIntents.claimToken, response.body.claimToken),
      });
      expect(intent?.gstin).toBe(billingDetails.gstin);
      expect(intent?.billingName).toBe(billingDetails.billingName);
      expect(intent?.billingCity).toBe(billingDetails.billingCity);

      if (intent) created.intentIds.push(intent.id);
    });
  });

  describe('POST /api/subscription/checkout-create-org', () => {
    it('requires authentication', async () => {
      const response = await request(app)
        .post('/api/subscription/checkout-create-org')
        .send({
          orgName: 'Test Org',
          planId: 1,
          seats: 1,
          billingCycle: 'monthly',
        });

      expect(response.status).toBe(401);
    });

    it('requires CSRF token', async () => {
      const user = await createRecruiterUser({
        username: `csrf_test_${Date.now()}@example.com`,
        password: 'password123',
      });
      created.userIds.push(user.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: user.username,
        password: 'password123',
        expectedRole: ['recruiter'],
      });

      const response = await agent
        .post('/api/subscription/checkout-create-org')
        .send({
          orgName: 'Test Org',
          planId: 1,
          seats: 1,
          billingCycle: 'monthly',
        });

      expect(response.status).toBe(403);
    });

    it('creates org and checkout intent for authenticated user without org', async () => {
      const { plan, created: planCreated } = await ensurePlan(`pro_createorg_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const user = await createRecruiterUser({
        username: `createorg_${Date.now()}@example.com`,
        password: 'password123',
      });
      created.userIds.push(user.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: user.username,
        password: 'password123',
        expectedRole: ['recruiter'],
      });

      const csrfResponse = await agent.get('/api/csrf-token');
      const csrfToken = csrfResponse.body?.token;

      const response = await agent
        .post('/api/subscription/checkout-create-org')
        .set('x-csrf-token', csrfToken)
        .send({
          orgName: 'My New Org',
          planId: plan.id,
          seats: 3,
          billingCycle: 'monthly',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('orderId');
      expect(response.body).toHaveProperty('paymentLink');
      expect(response.body).toHaveProperty('organizationId');

      // Verify org was created
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, response.body.organizationId),
      });
      expect(org).toBeTruthy();
      expect(org?.name).toBe('My New Org');
      created.orgIds.push(org!.id);

      // Verify user is owner
      const membership = await db.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.organizationId, org!.id),
          eq(organizationMembers.userId, user.id)
        ),
      });
      expect(membership?.role).toBe('owner');

      // Verify checkout intent was created
      const intent = await db.query.checkoutIntents.findFirst({
        where: eq(checkoutIntents.organizationId, org!.id),
      });
      expect(intent).toBeTruthy();
      expect(intent?.status).toBe('pending');
      if (intent) created.intentIds.push(intent.id);

      // Verify transaction was created (since org exists)
      const transaction = await db.query.paymentTransactions.findFirst({
        where: eq(paymentTransactions.organizationId, org!.id),
      });
      expect(transaction).toBeTruthy();
      expect(transaction?.status).toBe('pending');
      if (transaction) created.transactionIds.push(transaction.id);
    });

    it('rejects user who already has an organization', async () => {
      const { plan, created: planCreated } = await ensurePlan(`pro_hasorg_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const user = await createRecruiterUser({
        username: `hasorg_${Date.now()}@example.com`,
        password: 'password123',
      });
      created.userIds.push(user.id);

      const org = await createOrganizationWithOwner({
        name: `Existing Org ${Date.now()}`,
        ownerId: user.id,
      });
      created.orgIds.push(org.id);

      const agent = request.agent(app);
      await agent.post('/api/login').send({
        username: user.username,
        password: 'password123',
        expectedRole: ['recruiter'],
      });

      const csrfResponse = await agent.get('/api/csrf-token');
      const csrfToken = csrfResponse.body?.token;

      const response = await agent
        .post('/api/subscription/checkout-create-org')
        .set('x-csrf-token', csrfToken)
        .send({
          orgName: 'Another Org',
          planId: plan.id,
          seats: 1,
          billingCycle: 'monthly',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already belong to an organization');
    });
  });

  describe('GET /api/claim/:token', () => {
    it('returns 404 for invalid token', async () => {
      const response = await request(app)
        .get('/api/claim/invalid_token_123');

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('returns error for unpaid checkout intent', async () => {
      const { plan, created: planCreated } = await ensurePlan(`pro_unpaid_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      // Create unpaid checkout intent directly
      const [intent] = await db.insert(checkoutIntents).values({
        email: `unpaid_${Date.now()}@example.com`,
        orgName: 'Unpaid Org',
        planId: plan.id,
        seats: 1,
        billingCycle: 'monthly',
        status: 'pending',
        claimToken: `unpaid_token_${Date.now()}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }).returning();
      created.intentIds.push(intent.id);

      const response = await request(app)
        .get(`/api/claim/${intent.claimToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('not yet confirmed');
    });

    it('returns claim details for paid checkout intent', async () => {
      const { plan, created: planCreated } = await ensurePlan(`pro_paid_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      // Create paid checkout intent
      const [intent] = await db.insert(checkoutIntents).values({
        email: `paid_${Date.now()}@example.com`,
        orgName: 'Paid Org',
        planId: plan.id,
        seats: 2,
        billingCycle: 'annual',
        status: 'paid',
        claimToken: `paid_token_${Date.now()}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        paidAt: new Date(),
      }).returning();
      created.intentIds.push(intent.id);

      const response = await request(app)
        .get(`/api/claim/${intent.claimToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('email', intent.email);
      expect(response.body).toHaveProperty('orgName', 'Paid Org');
      expect(response.body).toHaveProperty('seats', 2);
      expect(response.body).toHaveProperty('billingCycle', 'annual');
      expect(response.body).toHaveProperty('hasExistingAccount', false);
      expect(response.body).toHaveProperty('expiresAt');
    });

    it('indicates existing account when user exists', async () => {
      const { plan, created: planCreated } = await ensurePlan(`pro_existacc_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const existingUser = await createRecruiterUser({
        username: `existacc_${Date.now()}@example.com`,
        password: 'password123',
      });
      created.userIds.push(existingUser.id);

      // Create paid checkout intent with existing user's email
      const [intent] = await db.insert(checkoutIntents).values({
        email: existingUser.username,
        orgName: 'Existing Account Org',
        planId: plan.id,
        seats: 1,
        billingCycle: 'monthly',
        status: 'paid',
        claimToken: `existacc_token_${Date.now()}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        paidAt: new Date(),
      }).returning();
      created.intentIds.push(intent.id);

      const response = await request(app)
        .get(`/api/claim/${intent.claimToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('hasExistingAccount', true);
    });

    it('returns error for expired token', async () => {
      const { plan, created: planCreated } = await ensurePlan(`pro_expired_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      // Create expired checkout intent
      const [intent] = await db.insert(checkoutIntents).values({
        email: `expired_${Date.now()}@example.com`,
        orgName: 'Expired Org',
        planId: plan.id,
        seats: 1,
        billingCycle: 'monthly',
        status: 'paid',
        claimToken: `expired_token_${Date.now()}`,
        expiresAt: new Date(Date.now() - 1000), // Already expired
        paidAt: new Date(),
      }).returning();
      created.intentIds.push(intent.id);

      const response = await request(app)
        .get(`/api/claim/${intent.claimToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('expired');
    });

    it('returns error for already claimed token', async () => {
      const { plan, created: planCreated } = await ensurePlan(`pro_claimed_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      // Create already claimed checkout intent
      const [intent] = await db.insert(checkoutIntents).values({
        email: `claimed_${Date.now()}@example.com`,
        orgName: 'Claimed Org',
        planId: plan.id,
        seats: 1,
        billingCycle: 'monthly',
        status: 'claimed',
        claimToken: `claimed_token_${Date.now()}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        paidAt: new Date(),
        claimedAt: new Date(),
      }).returning();
      created.intentIds.push(intent.id);

      const response = await request(app)
        .get(`/api/claim/${intent.claimToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already been claimed');
    });
  });

  describe('POST /api/claim/:token/accept', () => {
    it('creates new user, org, and subscription for new email', async () => {
      const { plan, created: planCreated } = await ensurePlan(`pro_accept_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const email = `newclaim_${Date.now()}@example.com`;
      const claimToken = `accept_token_${Date.now()}`;

      // Create paid checkout intent
      const [intent] = await db.insert(checkoutIntents).values({
        email,
        orgName: 'New Claim Org',
        planId: plan.id,
        seats: 2,
        billingCycle: 'monthly',
        gstin: '29ABCDE1234F1Z5',
        billingCity: 'Mumbai',
        status: 'paid',
        claimToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        paidAt: new Date(),
      }).returning();
      created.intentIds.push(intent.id);

      const response = await request(app)
        .post(`/api/claim/${claimToken}/accept`)
        .send({ password: 'securePassword123' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('organizationId');
      expect(response.body).toHaveProperty('redirectUrl', '/recruiter-dashboard');

      // Verify user was created
      const user = await db.query.users.findFirst({
        where: eq(users.username, email),
      });
      expect(user).toBeTruthy();
      expect(user?.role).toBe('recruiter');
      expect(user?.emailVerified).toBe(true);
      created.userIds.push(user!.id);

      // Verify password hash format (hash.salt)
      expect(user?.password).toMatch(/^[a-f0-9]+\.[a-f0-9]+$/);

      // Verify org was created
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, response.body.organizationId),
      });
      expect(org).toBeTruthy();
      expect(org?.name).toBe('New Claim Org');
      expect(org?.gstin).toBe('29ABCDE1234F1Z5');
      expect(org?.billingCity).toBe('Mumbai');
      created.orgIds.push(org!.id);

      // Verify membership
      const membership = await db.query.organizationMembers.findFirst({
        where: eq(organizationMembers.organizationId, org!.id),
      });
      expect(membership?.role).toBe('owner');
      expect(membership?.seatAssigned).toBe(true);

      // Verify subscription
      const subscription = await db.query.organizationSubscriptions.findFirst({
        where: eq(organizationSubscriptions.organizationId, org!.id),
      });
      expect(subscription).toBeTruthy();
      expect(subscription?.seats).toBe(2);
      expect(subscription?.status).toBe('active');
      if (subscription) created.subscriptionIds.push(subscription.id);

      // Verify intent was updated
      const updatedIntent = await db.query.checkoutIntents.findFirst({
        where: eq(checkoutIntents.id, intent.id),
      });
      expect(updatedIntent?.status).toBe('claimed');
      expect(updatedIntent?.claimedBy).toBe(user!.id);
      expect(updatedIntent?.organizationId).toBe(org!.id);
    });

    it('uses existing user account without requiring password', async () => {
      const { plan, created: planCreated } = await ensurePlan(`pro_existuser_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      // Create existing user
      const existingUser = await createRecruiterUser({
        username: `existuser_${Date.now()}@example.com`,
        password: 'existingPassword',
      });
      created.userIds.push(existingUser.id);

      const claimToken = `existuser_token_${Date.now()}`;

      // Create paid checkout intent with existing user's email
      const [intent] = await db.insert(checkoutIntents).values({
        email: existingUser.username,
        orgName: 'Existing User Org',
        planId: plan.id,
        seats: 1,
        billingCycle: 'monthly',
        status: 'paid',
        claimToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        paidAt: new Date(),
      }).returning();
      created.intentIds.push(intent.id);

      // Accept without password (existing user)
      const response = await request(app)
        .post(`/api/claim/${claimToken}/accept`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('organizationId');

      // Verify org was created for existing user
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, response.body.organizationId),
      });
      expect(org).toBeTruthy();
      created.orgIds.push(org!.id);

      // Verify existing user is owner
      const membership = await db.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.organizationId, org!.id),
          eq(organizationMembers.userId, existingUser.id)
        ),
      });
      expect(membership?.role).toBe('owner');

      // Verify subscription
      const subscription = await db.query.organizationSubscriptions.findFirst({
        where: eq(organizationSubscriptions.organizationId, org!.id),
      });
      expect(subscription).toBeTruthy();
      if (subscription) created.subscriptionIds.push(subscription.id);
    });

    it('requires password for new user', async () => {
      const { plan, created: planCreated } = await ensurePlan(`pro_nopass_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const claimToken = `nopass_token_${Date.now()}`;

      const [intent] = await db.insert(checkoutIntents).values({
        email: `nopass_${Date.now()}@example.com`,
        orgName: 'No Password Org',
        planId: plan.id,
        seats: 1,
        billingCycle: 'monthly',
        status: 'paid',
        claimToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        paidAt: new Date(),
      }).returning();
      created.intentIds.push(intent.id);

      const response = await request(app)
        .post(`/api/claim/${claimToken}/accept`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Password is required');
    });

    it('requires password of at least 8 characters', async () => {
      const { plan, created: planCreated } = await ensurePlan(`pro_shortpass_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const claimToken = `shortpass_token_${Date.now()}`;

      const [intent] = await db.insert(checkoutIntents).values({
        email: `shortpass_${Date.now()}@example.com`,
        orgName: 'Short Password Org',
        planId: plan.id,
        seats: 1,
        billingCycle: 'monthly',
        status: 'paid',
        claimToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        paidAt: new Date(),
      }).returning();
      created.intentIds.push(intent.id);

      const response = await request(app)
        .post(`/api/claim/${claimToken}/accept`)
        .send({ password: 'short' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('at least 8 characters');
    });

    it('does not require CSRF token (accessed via email link)', async () => {
      const { plan, created: planCreated } = await ensurePlan(`pro_nocsrf_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const claimToken = `nocsrf_token_${Date.now()}`;

      const [intent] = await db.insert(checkoutIntents).values({
        email: `nocsrf_${Date.now()}@example.com`,
        orgName: 'No CSRF Org',
        planId: plan.id,
        seats: 1,
        billingCycle: 'monthly',
        status: 'paid',
        claimToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        paidAt: new Date(),
      }).returning();
      created.intentIds.push(intent.id);

      // No CSRF token, no session - should still work
      const response = await request(app)
        .post(`/api/claim/${claimToken}/accept`)
        .send({ password: 'securePassword123' });

      // Should succeed without CSRF
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);

      // Cleanup
      const user = await db.query.users.findFirst({
        where: eq(users.username, intent.email),
      });
      if (user) created.userIds.push(user.id);

      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, response.body.organizationId),
      });
      if (org) created.orgIds.push(org.id);

      const subscription = await db.query.organizationSubscriptions.findFirst({
        where: eq(organizationSubscriptions.organizationId, response.body.organizationId),
      });
      if (subscription) created.subscriptionIds.push(subscription.id);
    });
  });

  describe('POST /api/webhooks/cashfree (checkout intent handling)', () => {
    it('updates checkout intent to paid status on payment success', async () => {
      const { plan, created: planCreated } = await ensurePlan(`pro_webhook_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const orderId = `webhook_order_${Date.now()}`;
      const claimToken = `webhook_token_${Date.now()}`;

      // Create pending checkout intent
      const [intent] = await db.insert(checkoutIntents).values({
        email: `webhook_${Date.now()}@example.com`,
        orgName: 'Webhook Test Org',
        planId: plan.id,
        seats: 1,
        billingCycle: 'monthly',
        status: 'pending',
        cashfreeOrderId: orderId,
        claimToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }).returning();
      created.intentIds.push(intent.id);

      webhookCleanupAfter = new Date();

      const webhookResponse = await request(app)
        .post('/api/webhooks/cashfree')
        .send({
          type: 'PAYMENT_SUCCESS_WEBHOOK',
          data: {
            order: {
              order_id: orderId,
              order_amount: 999,
              order_currency: 'INR',
              order_status: 'PAID',
            },
            payment: {
              cf_payment_id: `pay_${Date.now()}`,
              payment_status: 'SUCCESS',
              payment_amount: 999,
              payment_method: { payment_method_type: 'upi' },
            },
          },
        });

      expect(webhookResponse.status).toBe(200);

      // Verify intent was updated to paid
      const updatedIntent = await db.query.checkoutIntents.findFirst({
        where: eq(checkoutIntents.id, intent.id),
      });
      expect(updatedIntent?.status).toBe('paid');
      expect(updatedIntent?.paidAt).toBeTruthy();

      // Verify claim email was sent (for public checkout without org)
      expect(emailMocks.sendEmail).toHaveBeenCalledTimes(1);
      const emailCall = emailMocks.sendEmail.mock.calls[0][0];
      expect(emailCall.to).toBe(intent.email);
      expect(emailCall.subject).toContain('Complete your VantaHire subscription');
      expect(emailCall.html).toContain(claimToken);
    });

    it('creates subscription immediately for checkout-create-org flow', async () => {
      const { plan, created: planCreated } = await ensurePlan(`pro_webhook_org_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      // Create org first (simulating checkout-create-org flow)
      const user = await createRecruiterUser({
        username: `webhook_org_${Date.now()}@example.com`,
        password: 'password123',
      });
      created.userIds.push(user.id);

      const org = await createOrganizationWithOwner({
        name: `Webhook Org ${Date.now()}`,
        ownerId: user.id,
      });
      created.orgIds.push(org.id);

      const orderId = `webhook_org_order_${Date.now()}`;

      // Create checkout intent linked to org
      const [intent] = await db.insert(checkoutIntents).values({
        email: user.username,
        orgName: org.name,
        userId: user.id,
        organizationId: org.id,
        planId: plan.id,
        seats: 2,
        billingCycle: 'monthly',
        status: 'pending',
        cashfreeOrderId: orderId,
        claimToken: `org_claim_${Date.now()}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }).returning();
      created.intentIds.push(intent.id);

      webhookCleanupAfter = new Date();

      const webhookResponse = await request(app)
        .post('/api/webhooks/cashfree')
        .send({
          type: 'PAYMENT_SUCCESS_WEBHOOK',
          data: {
            order: {
              order_id: orderId,
              order_amount: 1999,
              order_currency: 'INR',
              order_status: 'PAID',
            },
            payment: {
              cf_payment_id: `pay_org_${Date.now()}`,
              payment_status: 'SUCCESS',
              payment_amount: 1999,
              payment_method: { payment_method_type: 'card' },
            },
          },
        });

      expect(webhookResponse.status).toBe(200);

      // Verify intent was updated to paid
      const updatedIntent = await db.query.checkoutIntents.findFirst({
        where: eq(checkoutIntents.id, intent.id),
      });
      expect(updatedIntent?.status).toBe('paid');

      // Verify subscription was created immediately (org already exists)
      const subscription = await db.query.organizationSubscriptions.findFirst({
        where: eq(organizationSubscriptions.organizationId, org.id),
      });
      expect(subscription).toBeTruthy();
      expect(subscription?.seats).toBe(2);
      expect(subscription?.status).toBe('active');
      if (subscription) created.subscriptionIds.push(subscription.id);

      // No claim email should be sent (org already exists)
      expect(emailMocks.sendEmail).not.toHaveBeenCalled();
    });

    it('handles checkout intent idempotency (already paid intent skipped)', async () => {
      const { plan, created: planCreated } = await ensurePlan(`pro_idempotent_${Date.now()}`);
      if (planCreated) created.planIds.push(plan.id);

      const orderId = `idempotent_order_${Date.now()}`;

      const [intent] = await db.insert(checkoutIntents).values({
        email: `idempotent_${Date.now()}@example.com`,
        orgName: 'Idempotent Org',
        planId: plan.id,
        seats: 1,
        billingCycle: 'monthly',
        status: 'pending',
        cashfreeOrderId: orderId,
        claimToken: `idempotent_token_${Date.now()}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }).returning();
      created.intentIds.push(intent.id);

      webhookCleanupAfter = new Date();

      const webhookPayload = {
        type: 'PAYMENT_SUCCESS_WEBHOOK',
        data: {
          order: {
            order_id: orderId,
            order_amount: 999,
            order_currency: 'INR',
            order_status: 'PAID',
          },
          payment: {
            cf_payment_id: `pay_idempotent_${Date.now()}`,
            payment_status: 'SUCCESS',
            payment_amount: 999,
            payment_method: { payment_method_type: 'netbanking' },
          },
        },
      };

      // First webhook call
      const response1 = await request(app)
        .post('/api/webhooks/cashfree')
        .send(webhookPayload);
      expect(response1.status).toBe(200);

      // Verify intent is now paid
      const paidIntent = await db.query.checkoutIntents.findFirst({
        where: eq(checkoutIntents.id, intent.id),
      });
      expect(paidIntent?.status).toBe('paid');

      // Second webhook call (different event ID, but same order)
      // The checkout intent handler should skip processing since status is already 'paid'
      const response2 = await request(app)
        .post('/api/webhooks/cashfree')
        .send(webhookPayload);
      expect(response2.status).toBe(200);

      // Verify intent status unchanged (idempotent)
      const stillPaidIntent = await db.query.checkoutIntents.findFirst({
        where: eq(checkoutIntents.id, intent.id),
      });
      expect(stillPaidIntent?.status).toBe('paid');

      // Email should only be sent once (second call skips because intent already paid)
      expect(emailMocks.sendEmail).toHaveBeenCalledTimes(1);
    });
  });
});
