// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  db: {},
}));

vi.mock('../simpleEmailService', () => ({
  getEmailService: vi.fn(),
}));

vi.mock('../lib/subscriptionService', () => ({
  getOrganizationSubscription: vi.fn(),
  logSubscriptionAction: vi.fn(),
}));

describe('credit warning thresholds', () => {
  it('returns no thresholds when allocation is zero', async () => {
    const { getCrossedCreditUsageThresholds } = await import('../lib/creditService');

    expect(getCrossedCreditUsageThresholds(0, 0, 10)).toEqual([]);
  });

  it('returns the thresholds crossed by new usage', async () => {
    const { getCrossedCreditUsageThresholds } = await import('../lib/creditService');

    expect(getCrossedCreditUsageThresholds(100, 50, 74)).toEqual([]);
    expect(getCrossedCreditUsageThresholds(100, 50, 75)).toEqual([75]);
    expect(getCrossedCreditUsageThresholds(100, 74, 91)).toEqual([75, 90]);
    expect(getCrossedCreditUsageThresholds(100, 89, 100)).toEqual([90, 100]);
  });

  it('does not repeat a threshold once already crossed', async () => {
    const { getCrossedCreditUsageThresholds } = await import('../lib/creditService');

    expect(getCrossedCreditUsageThresholds(100, 90, 95)).toEqual([]);
    expect(getCrossedCreditUsageThresholds(100, 100, 100)).toEqual([]);
  });
});
