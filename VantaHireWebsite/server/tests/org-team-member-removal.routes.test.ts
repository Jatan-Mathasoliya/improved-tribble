// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';

const getUserOrganizationMock = vi.fn();
const canManageMembersMock = vi.fn();
const getMemberByIdMock = vi.fn();
const getUserJobsInOrgMock = vi.fn();
const removeMemberMock = vi.fn();

vi.mock('../auth', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/organizationService', () => ({
  createOrganization: vi.fn(),
  getOrganization: vi.fn(),
  updateOrganization: vi.fn(),
  deleteOrganization: vi.fn(),
  getUserOrganization: getUserOrganizationMock,
  isUserInOrganization: vi.fn(),
  createOrganizationInvite: vi.fn(),
  getOrganizationInviteByToken: vi.fn(),
  getPendingInvitesForOrganization: vi.fn(),
  acceptOrganizationInvite: vi.fn(),
  cancelOrganizationInvite: vi.fn(),
  createJoinRequest: vi.fn(),
  getPendingJoinRequests: vi.fn(),
  respondToJoinRequest: vi.fn(),
  createDomainClaimRequest: vi.fn(),
  findOrganizationByUserEmailDomain: vi.fn(),
  isPublicEmailDomain: vi.fn(),
  getEmailDomain: vi.fn(),
}));

vi.mock('../lib/membershipService', () => ({
  getOrganizationMembers: vi.fn(),
  getOrganizationMember: vi.fn(),
  getMemberById: getMemberByIdMock,
  updateMemberRole: vi.fn(),
  removeMember: removeMemberMock,
  leaveOrganization: vi.fn(),
  canManageMembers: canManageMembersMock,
  canManageBilling: vi.fn(),
  reassignJobs: vi.fn(),
  getUserJobsInOrg: getUserJobsInOrgMock,
}));

vi.mock('../lib/subscriptionService', () => ({
  createFreeSubscription: vi.fn(),
}));

vi.mock('../lib/seatService', () => ({
  hasAvailableSeats: vi.fn(),
}));

vi.mock('../lib/creditService', () => ({
  initializeMemberCredits: vi.fn(),
}));

vi.mock('../simpleEmailService', () => ({
  getEmailService: vi.fn(),
}));

async function buildApp() {
  const { registerOrganizationRoutes } = await import('../organization.routes');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 77, role: 'recruiter', emailVerified: true };
    next();
  });

  const csrf = (_req: any, _res: any, next: any) => next();
  registerOrganizationRoutes(app, csrf as any);
  return app;
}

async function invokeDeleteRoute(
  app: express.Express,
  path: string,
  params: Record<string, string>,
): Promise<{ status: number; body: any }> {
  const router = (app as any)._router;
  const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods?.delete);
  if (!layer) {
    throw new Error(`Route not found: DELETE ${path}`);
  }

  const handlers = layer.route.stack.map((entry: any) => entry.handle);
  const req: any = {
    method: 'DELETE',
    params,
    body: {},
    query: {},
    user: { id: 77, role: 'recruiter', emailVerified: true },
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

describe('organization member removal guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserOrganizationMock.mockResolvedValue({
      organization: { id: 11 },
      membership: { role: 'owner' },
    });
    canManageMembersMock.mockReturnValue(true);
  });

  it('returns 400 when the member still owns jobs in the organization', async () => {
    getMemberByIdMock.mockResolvedValue({
      id: 123,
      userId: 456,
      organizationId: 11,
      role: 'member',
    });
    getUserJobsInOrgMock.mockResolvedValue([{ id: 9001, title: 'Backend Engineer' }]);

    const app = await buildApp();

    const result = await invokeDeleteRoute(app, '/api/organizations/members/:id', { id: '123' });

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Reassign this member's jobs before removing access" });
    expect(removeMemberMock).not.toHaveBeenCalled();
  });

  it('removes the member when they no longer own any jobs', async () => {
    getMemberByIdMock.mockResolvedValue({
      id: 123,
      userId: 456,
      organizationId: 11,
      role: 'member',
    });
    getUserJobsInOrgMock.mockResolvedValue([]);
    removeMemberMock.mockResolvedValue(undefined);

    const app = await buildApp();

    const result = await invokeDeleteRoute(app, '/api/organizations/members/:id', { id: '123' });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ success: true });
    expect(removeMemberMock).toHaveBeenCalledWith(123);
  });
});
