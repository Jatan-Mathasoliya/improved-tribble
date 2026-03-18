// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('commercial catalog', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.PRO_PRICE_PER_SEAT_MONTHLY = '249900';
    process.env.PRO_PRICE_PER_SEAT_ANNUAL = '2499000';
    process.env.PRO_AI_CREDITS_PER_MONTH = '750';
    process.env.EXTRA_CREDIT_PACK_SIZE = '300';
    process.env.EXTRA_CREDIT_PACK_PRICE = '99900';
  });

  it('returns env-driven plans, packs, and seat policies from one catalog', async () => {
    const {
      getCommercialCatalog,
      PLAN_FREE,
      PLAN_PRO,
      PLAN_BUSINESS,
    } = await import('../lib/planConfig');

    const catalog = getCommercialCatalog([
      {
        id: 1,
        name: PLAN_FREE,
        displayName: 'Free',
        description: 'old',
        pricePerSeatMonthly: 1,
        pricePerSeatAnnual: 2,
        aiCreditsPerSeatMonthly: 5,
        maxCreditRolloverMonths: 1,
        features: {},
        isActive: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        name: PLAN_PRO,
        displayName: 'Pro',
        description: 'old',
        pricePerSeatMonthly: 1,
        pricePerSeatAnnual: 2,
        aiCreditsPerSeatMonthly: 5,
        maxCreditRolloverMonths: 1,
        features: {},
        isActive: true,
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 3,
        name: PLAN_BUSINESS,
        displayName: 'Business',
        description: 'old',
        pricePerSeatMonthly: 1,
        pricePerSeatAnnual: 2,
        aiCreditsPerSeatMonthly: 5,
        maxCreditRolloverMonths: 1,
        features: {},
        isActive: true,
        sortOrder: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as any);

    const proPlan = catalog.plans.find((plan) => plan.name === PLAN_PRO);

    expect(proPlan?.displayName).toBe('Growth');
    expect(proPlan?.pricePerSeatMonthly).toBe(249900);
    expect(proPlan?.pricePerSeatAnnual).toBe(2499000);
    expect(proPlan?.rateLimits?.monthlyCredits).toBe(750);
    expect(catalog.creditPack).toEqual({
      creditsPerPack: 300,
      pricePerPack: 99900,
      maxQuantity: 10,
    });
    expect(catalog.planCards.pro.highlights).toContain('Credits are pooled across your organization');
    expect(catalog.seatPolicies.seatAddCredits.mode).toBe('prorated_immediate');
    expect(catalog.seatPolicies.seatReduceCredits.mode).toBe('next_term_only');
  });
});
