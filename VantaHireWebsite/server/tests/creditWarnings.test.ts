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
    const { getCrossedCreditUsageThresholds, getIncludedCreditsForSeats } = await import('../lib/creditService');

    expect(getCrossedCreditUsageThresholds(0, 0, 10)).toEqual([]);
    expect(getIncludedCreditsForSeats(600, 0)).toBe(600);
  });

  it('returns the thresholds crossed by new usage', async () => {
    const { getCrossedCreditUsageThresholds } = await import('../lib/creditService');

    expect(getCrossedCreditUsageThresholds(100, 40, 49)).toEqual([]);
    expect(getCrossedCreditUsageThresholds(100, 40, 50)).toEqual([50]);
    expect(getCrossedCreditUsageThresholds(100, 49, 76)).toEqual([50, 75]);
    expect(getCrossedCreditUsageThresholds(100, 74, 100)).toEqual([75, 100]);
  });

  it('does not repeat a threshold once already crossed', async () => {
    const { getCrossedCreditUsageThresholds } = await import('../lib/creditService');

    expect(getCrossedCreditUsageThresholds(100, 75, 95)).toEqual([]);
    expect(getCrossedCreditUsageThresholds(100, 100, 100)).toEqual([]);
  });

  it('multiplies included credits by seat count for pooled org balances', async () => {
    const { getIncludedCreditsForSeats } = await import('../lib/creditService');

    expect(getIncludedCreditsForSeats(600, 1)).toBe(600);
    expect(getIncludedCreditsForSeats(600, 3)).toBe(1800);
  });

  it('sends warnings to billing contact and owner without duplicates', async () => {
    const { getUniqueCreditWarningRecipients } = await import('../lib/creditService');

    expect(getUniqueCreditWarningRecipients('billing@acme.com', 'owner@acme.com')).toEqual([
      'billing@acme.com',
      'owner@acme.com',
    ]);
    expect(getUniqueCreditWarningRecipients('owner@acme.com', 'owner@acme.com')).toEqual([
      'owner@acme.com',
    ]);
  });
});
