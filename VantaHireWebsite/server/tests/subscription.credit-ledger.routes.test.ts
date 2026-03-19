// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';

const getUserOrganizationMock = vi.fn();
const getCreditUsageHistoryMock = vi.fn();
const getOrgCreditSummaryMock = vi.fn();
const getOrgCreditDetailsMock = vi.fn();
const getOrgCreditLedgerMock = vi.fn();

vi.mock('../auth', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/organizationService', () => ({
  getUserOrganization: getUserOrganizationMock,
}));

vi.mock('../lib/membershipService', () => ({
  canManageBilling: vi.fn(() => true),
}));

vi.mock('../lib/subscriptionService', () => ({
  getActivePlans: vi.fn(),
  getPlanById: vi.fn(),
  getOrganizationSubscription: vi.fn(),
  createPaidSubscription: vi.fn(),
  updateSubscriptionSeats: vi.fn(),
  cancelSubscriptionAtPeriodEnd: vi.fn(),
  reactivateSubscription: vi.fn(),
  getSubscriptionInvoices: vi.fn(),
  calculateProratedAmount: vi.fn(),
  calculateProratedCredits: vi.fn(),
}));

vi.mock('../lib/seatService', () => ({
  getSeatUsage: vi.fn(),
  getMembersForSeatSelection: vi.fn(),
  reduceSeats: vi.fn(),
  assignSeat: vi.fn(),
  unassignSeat: vi.fn(),
}));

vi.mock('../lib/creditService', () => ({
  getMemberCreditBalance: vi.fn(),
  getOrgCreditSummary: getOrgCreditSummaryMock,
  getCreditUsageHistory: getCreditUsageHistoryMock,
  getUserDailyRateLimit: vi.fn(),
  getPlanRateLimitInfo: vi.fn(),
  getCurrentOrgCreditCycle: vi.fn(),
  addProratedSeatCredits: vi.fn(),
  getOrgCreditDetails: getOrgCreditDetailsMock,
  getOrgCreditLedger: getOrgCreditLedgerMock,
}));

vi.mock('../lib/cashfreeClient', () => ({
  createCheckoutOrder: vi.fn(),
  createCreditPackCheckout: vi.fn(),
  createSeatAddCheckout: vi.fn(),
  getBillingTaxConfig: vi.fn(() => ({ gstRate: 18, taxEnabled: true })),
  getOrderStatus: vi.fn(),
  isCashfreeConfigured: vi.fn(() => true),
}));

vi.mock('../lib/invoiceService', () => ({
  createPaymentTransaction: vi.fn(),
  updatePaymentTransaction: vi.fn(),
  getOrganizationInvoices: vi.fn(),
  getTransactionByCashfreeOrder: vi.fn(),
  generateInvoiceData: vi.fn(),
}));

vi.mock('../lib/invoicePdfService', () => ({
  generateAndStoreInvoicePdf: vi.fn(),
  getLocalInvoicePath: vi.fn(),
}));

vi.mock('../simpleEmailService', () => ({
  getEmailService: vi.fn(),
}));

vi.mock('../db', () => ({
  db: {},
}));

async function buildApp() {
  const { registerSubscriptionRoutes } = await import('../subscription.routes');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 42, role: 'recruiter' };
    next();
  });
  registerSubscriptionRoutes(app, (_req: any, _res: any, next: any) => next());
  return app;
}

async function invokeRoute(
  app: express.Express,
  method: 'get',
  path: string,
): Promise<{ status: number; body: any }> {
  const router = (app as any)._router;
  const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods?.[method]);
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }

  const handlers = layer.route.stack.map((entry: any) => entry.handle);
  const req: any = {
    method: method.toUpperCase(),
    params: {},
    body: {},
    user: { id: 42, role: 'recruiter' },
    headers: {},
    query: {},
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const res: any = {
      statusCode: 200,
      body: undefined,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: any) {
        this.body = payload;
        if (!settled) {
          settled = true;
          resolve({ status: this.statusCode, body: payload });
        }
        return this;
      },
      send(payload: any) {
        this.body = payload;
        if (!settled) {
          settled = true;
          resolve({ status: this.statusCode, body: payload });
        }
        return this;
      },
      end(payload?: any) {
        this.body = payload;
        if (!settled) {
          settled = true;
          resolve({ status: this.statusCode, body: payload });
        }
        return this;
      },
    };

    let index = 0;
    const next = (error?: unknown) => {
      if (error) {
        if (!settled) {
          settled = true;
          reject(error);
        }
        return;
      }

      const handler = handlers[index++];
      if (!handler) {
        if (!settled) {
          settled = true;
          resolve({ status: res.statusCode, body: res.body });
        }
        return;
      }

      try {
        const result = handler(req, res, next);
        if (result && typeof result.then === 'function') {
          result.catch(next);
        }
      } catch (error) {
        next(error);
      }
    };

    next();
  });
}

describe('subscription credit ledger routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserOrganizationMock.mockResolvedValue({
      organization: { id: 7 },
      membership: { role: 'owner' },
    });
    getCreditUsageHistoryMock.mockResolvedValue([
      {
        id: 1,
        kind: 'fit',
        creditsUsed: 1,
        computedAt: new Date('2026-03-18T10:00:00.000Z'),
        tokensIn: 10,
        tokensOut: 20,
        metadata: {},
      },
    ]);
    getOrgCreditSummaryMock.mockResolvedValue({
      totalAllocated: 2400,
      totalUsed: 600,
      totalRemaining: 1800,
      includedAllocation: 1800,
      purchasedCredits: 600,
      seatedMembers: 3,
    });
    getOrgCreditDetailsMock.mockResolvedValue({
      planAllocation: 1800,
      bonusCredits: 0,
      customLimit: null,
      effectiveLimit: 1800,
      purchasedCredits: 600,
      rolloverCredits: 150,
      proratedCreditsAddedThisPeriod: 300,
      usedThisPeriod: 600,
      remaining: 1800,
      periodStart: new Date('2026-03-01T00:00:00.000Z'),
      periodEnd: new Date('2026-04-01T00:00:00.000Z'),
      seatedMembers: 3,
      memberBreakdown: [],
    });
    getOrgCreditLedgerMock.mockResolvedValue([
      {
        id: 11,
        type: 'seat_add_proration',
        amount: 300,
        createdAt: new Date('2026-03-18T09:00:00.000Z'),
        actor: {
          userId: 42,
          name: 'Owner',
          email: 'owner@acme.com',
        },
        metadata: {
          additionalSeats: 1,
        },
      },
    ]);
  });

  it('returns org details and ledger for owner/admin credit usage view', async () => {
    const app = await buildApp();

    const result = await invokeRoute(app, 'get', '/api/ai/credits/usage');

    expect(result.status).toBe(200);
    expect(result.body.orgSummary).toMatchObject({
      totalAllocated: 2400,
      purchasedCredits: 600,
    });
    expect(result.body.orgDetails).toMatchObject({
      planAllocation: 1800,
      proratedCreditsAddedThisPeriod: 300,
      rolloverCredits: 150,
    });
    expect(result.body.orgLedger).toEqual([
      expect.objectContaining({
        type: 'seat_add_proration',
        amount: 300,
      }),
    ]);
  });
});
