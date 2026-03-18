// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  db: {},
}));

vi.mock('../simpleEmailService', () => ({
  getEmailService: vi.fn(),
}));

vi.mock('../lib/subscriptionService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/subscriptionService')>();
  return {
    ...actual,
    getOrganizationSubscription: vi.fn(),
    logSubscriptionAction: vi.fn(),
  };
});

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
    const { calculateEffectiveRecurringLimit, getIncludedCreditsForSeats } = await import('../lib/creditService');

    expect(getIncludedCreditsForSeats(600, 1)).toBe(600);
    expect(getIncludedCreditsForSeats(600, 3)).toBe(1800);
    expect(calculateEffectiveRecurringLimit(600, 3, 0, null)).toBe(1800);
    expect(calculateEffectiveRecurringLimit(600, 3, 200, null)).toBe(2000);
    expect(calculateEffectiveRecurringLimit(600, 3, 200, 2500)).toBe(2500);
  });

  it('spends included credits before purchased credits', async () => {
    const { splitCreditUsage } = await import('../lib/creditService');

    expect(splitCreditUsage(1800, 300, 900)).toEqual({
      recurringToUse: 900,
      purchasedToUse: 0,
    });
    expect(splitCreditUsage(1800, 300, 1900)).toEqual({
      recurringToUse: 1800,
      purchasedToUse: 100,
    });
  });

  it('calculates reset allocation with rollover for multi-seat orgs', async () => {
    const { calculateCycleResetValues } = await import('../lib/creditService');

    expect(calculateCycleResetValues({
      effectiveLimit: 1800,
      maxRolloverMonths: 3,
      recurringAllocated: 2400,
      recurringUsed: 900,
    })).toEqual({
      recurringAllocated: 3300,
      rolloverCredits: 1500,
      purchasedUsed: 0,
    });
  });

  it('prorates seat-add credits against the current credit cycle', async () => {
    const { calculateProratedCredits } = await import('../lib/subscriptionService');

    const start = new Date('2026-03-01T00:00:00.000Z');
    const end = new Date('2026-04-01T00:00:00.000Z');
    const halfway = new Date('2026-03-16T12:00:00.000Z');

    expect(calculateProratedCredits(600, 1, start, end, halfway)).toBe(300);
    expect(calculateProratedCredits(600, 2, start, end, halfway)).toBe(600);
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
    expect(getUniqueCreditWarningRecipients(' Billing@Acme.com ', 'billing@acme.com')).toEqual([
      'billing@acme.com',
    ]);
  });
});
