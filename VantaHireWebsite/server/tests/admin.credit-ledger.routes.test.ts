// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';

const getOrgCreditDetailsMock = vi.fn();
const getOrgCreditLedgerMock = vi.fn();
const getOrgCreditWarningStateMock = vi.fn();
const orgFindFirstMock = vi.fn();

vi.mock('../auth', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/adminAuth', () => ({
  requireSuperAdmin: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../db', () => ({
  db: {
    query: {
      organizations: {
        findFirst: orgFindFirstMock,
      },
    },
  },
}));

vi.mock('../lib/organizationService', () => ({
  getPendingDomainClaimRequests: vi.fn(),
  respondToDomainClaim: vi.fn(),
  getOrganization: vi.fn(),
}));

vi.mock('../lib/subscriptionService', () => ({
  getOrganizationSubscription: vi.fn(),
  getPlanById: vi.fn(),
  adminOverrideSubscription: vi.fn(),
  createPaidSubscription: vi.fn(),
  getSubscriptionAuditLog: vi.fn(),
}));

vi.mock('../lib/invoiceService', () => ({
  calculateMRR: vi.fn(),
}));

vi.mock('../lib/featureGating', () => ({
  FEATURES: {},
  FEATURE_METADATA: {},
  getFeatureDefaultsByPlan: vi.fn(),
  getOrganizationFeatures: vi.fn(),
  getSubscriptionLimits: vi.fn(),
  isValidFeatureKey: vi.fn(() => true),
}));

vi.mock('../lib/creditService', () => ({
  getOrgCreditDetails: getOrgCreditDetailsMock,
  getOrgCreditLedger: getOrgCreditLedgerMock,
  getOrgCreditWarningState: getOrgCreditWarningStateMock,
  grantBonusCredits: vi.fn(),
  setCustomCreditLimit: vi.fn(),
  clearBonusCredits: vi.fn(),
  recalculateOrgCredits: vi.fn(),
}));

vi.mock('../simpleEmailService', () => ({
  getEmailService: vi.fn(),
}));

async function buildApp() {
  const { registerAdminSubscriptionRoutes } = await import('../admin-subscription.routes');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 1, role: 'super_admin' };
    next();
  });
  registerAdminSubscriptionRoutes(app, (_req: any, _res: any, next: any) => next());
  return app;
}

async function invokeRoute(
  app: express.Express,
  method: 'get',
  path: string,
  params: Record<string, string>,
): Promise<{ status: number; body: any }> {
  const router = (app as any)._router;
  const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods?.[method]);
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }

  const handlers = layer.route.stack.map((entry: any) => entry.handle);
  const req: any = {
    method: method.toUpperCase(),
    params,
    body: {},
    user: { id: 1, role: 'super_admin' },
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

describe('admin credit ledger routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orgFindFirstMock.mockResolvedValue({
      id: 7,
      name: 'Acme Recruiting',
    });
    getOrgCreditDetailsMock.mockResolvedValue({
      planAllocation: 1800,
      bonusCredits: 100,
      customLimit: null,
      effectiveLimit: 1900,
      purchasedCredits: 600,
      rolloverCredits: 150,
      proratedCreditsAddedThisPeriod: 300,
      usedThisPeriod: 700,
      remaining: 1950,
      periodStart: new Date('2026-03-01T00:00:00.000Z'),
      periodEnd: new Date('2026-04-01T00:00:00.000Z'),
      seatedMembers: 3,
      memberBreakdown: [],
    });
    getOrgCreditLedgerMock.mockResolvedValue([
      {
        id: 91,
        type: 'credit_pack_purchase',
        amount: 600,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
        actor: {
          userId: 1,
          name: 'Admin',
          email: 'admin@vantahire.com',
        },
        metadata: {
          reason: 'credit_pack:2',
        },
      },
    ]);
    getOrgCreditWarningStateMock.mockResolvedValue({
      recipients: ['billing@acme.com', 'owner@acme.com'],
      recentAlerts: [
        {
          alertType: 'credit_usage_75',
          recipientEmail: 'billing@acme.com',
          sentAt: new Date('2026-03-18T09:00:00.000Z'),
        },
      ],
    });
  });

  it('returns admin credit details with ledger and warning state', async () => {
    const app = await buildApp();

    const result = await invokeRoute(app, 'get', '/api/admin/organizations/:id/credits', { id: '7' });

    expect(result.status).toBe(200);
    expect(result.body.organizationId).toBe(7);
    expect(result.body.ledger).toEqual([
      expect.objectContaining({
        type: 'credit_pack_purchase',
        amount: 600,
      }),
    ]);
    expect(result.body.warningState).toEqual({
      recipients: ['billing@acme.com', 'owner@acme.com'],
      recentAlerts: [
        expect.objectContaining({
          alertType: 'credit_usage_75',
        }),
      ],
    });
  });
});
