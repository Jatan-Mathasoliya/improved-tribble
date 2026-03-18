import { db } from "../db";
import {
  organizationCreditBalances,
  organizationCreditTransactions,
  organizationMembers,
  organizationSubscriptions,
  userAiUsage,
  type OrganizationMember,
  type UserAiUsage,
} from "@shared/schema";
import { and, desc, eq, lte, sql, gte } from "drizzle-orm";
import { getOrganizationSubscription, logSubscriptionAction } from "./subscriptionService";
import {
  FREE_CREDITS_CAP,
  FREE_CREDITS_PER_MONTH,
  FREE_DAILY_RATE_LIMIT,
  getPlanCreditSettings,
  getPlanRateLimitInfo,
  PRO_DAILY_RATE_LIMIT,
} from "./planConfig";

export interface CreditBalance {
  allocated: number;
  used: number;
  remaining: number;
  rollover: number;
  purchasedCredits: number;
  periodStart: Date | null;
  periodEnd: Date | null;
}

export interface OrgCreditSummary {
  totalAllocated: number;
  totalUsed: number;
  totalRemaining: number;
  includedAllocation: number;
  purchasedCredits: number;
  seatedMembers: number;
}

export interface OrgCreditDetails {
  planAllocation: number;
  bonusCredits: number;
  customLimit: number | null;
  effectiveLimit: number;
  purchasedCredits: number;
  usedThisPeriod: number;
  remaining: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  seatedMembers: number;
  memberBreakdown: {
    userId: number;
    name: string;
    email: string;
    used: number;
    seatAssigned: boolean;
  }[];
}

export { FREE_DAILY_RATE_LIMIT as FREE_AI_DAILY_RATE_LIMIT };
export { PRO_DAILY_RATE_LIMIT as PRO_AI_DAILY_RATE_LIMIT };
export { getPlanRateLimitInfo } from "./planConfig";

function getCreditPeriodWindow(now: Date = new Date()): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { periodStart, periodEnd };
}

function getBalanceRecurringRemaining(balance: typeof organizationCreditBalances.$inferSelect): number {
  return Math.max(0, balance.recurringAllocated - balance.recurringUsed);
}

function getBalanceTotalUsed(balance: typeof organizationCreditBalances.$inferSelect): number {
  return balance.recurringUsed + balance.purchasedUsed;
}

function getBalanceTotalAllocated(balance: typeof organizationCreditBalances.$inferSelect): number {
  return balance.recurringAllocated + balance.purchasedCredits + balance.purchasedUsed;
}

function getBalanceTotalRemaining(balance: typeof organizationCreditBalances.$inferSelect): number {
  return getBalanceRecurringRemaining(balance) + balance.purchasedCredits;
}

function buildCreditBalance(balance: typeof organizationCreditBalances.$inferSelect): CreditBalance {
  return {
    allocated: getBalanceTotalAllocated(balance),
    used: getBalanceTotalUsed(balance),
    remaining: getBalanceTotalRemaining(balance),
    rollover: balance.rolloverCredits,
    purchasedCredits: balance.purchasedCredits,
    periodStart: balance.periodStart,
    periodEnd: balance.periodEnd,
  };
}

async function getEffectiveRecurringLimit(
  orgId: number,
  subscription?: Awaited<ReturnType<typeof getOrganizationSubscription>> | null
): Promise<number> {
  const resolvedSubscription = subscription ?? await getOrganizationSubscription(orgId);
  if (!resolvedSubscription) {
    return FREE_CREDITS_PER_MONTH;
  }

  const { creditsPerSeat } = getPlanCreditSettings(resolvedSubscription.plan);
  const bonusCredits = resolvedSubscription.bonusCredits || 0;

  return resolvedSubscription.customCreditLimit ?? (creditsPerSeat + bonusCredits);
}

async function recordCreditTransaction(
  organizationId: number,
  type: string,
  amount: number,
  userId?: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  await db.insert(organizationCreditTransactions).values({
    organizationId,
    userId,
    type,
    amount,
    metadata,
  });
}

async function getOrgCreditBalance(orgId: number) {
  return db.query.organizationCreditBalances.findFirst({
    where: eq(organizationCreditBalances.organizationId, orgId),
  });
}

async function migrateLegacyMemberCreditsToOrgBalance(orgId: number) {
  const seatedMembers = await db.query.organizationMembers.findMany({
    where: and(
      eq(organizationMembers.organizationId, orgId),
      eq(organizationMembers.seatAssigned, true),
    ),
    orderBy: desc(organizationMembers.joinedAt),
  });

  const recurringAllocated = seatedMembers.reduce((sum: number, member: OrganizationMember) => sum + member.creditsAllocated, 0);
  const recurringUsed = seatedMembers.reduce((sum: number, member: OrganizationMember) => sum + member.creditsUsed, 0);
  const rolloverCredits = seatedMembers.reduce((sum: number, member: OrganizationMember) => sum + member.creditsRollover, 0);
  const referenceMember = seatedMembers.find((member: OrganizationMember) => member.creditsPeriodStart || member.creditsPeriodEnd);
  const { periodStart, periodEnd } = referenceMember?.creditsPeriodStart && referenceMember.creditsPeriodEnd
    ? {
        periodStart: referenceMember.creditsPeriodStart,
        periodEnd: referenceMember.creditsPeriodEnd,
      }
    : getCreditPeriodWindow();

  const [balance] = await db.insert(organizationCreditBalances).values({
    organizationId: orgId,
    recurringAllocated,
    recurringUsed,
    rolloverCredits,
    purchasedCredits: 0,
    purchasedUsed: 0,
    periodStart,
    periodEnd,
  }).returning();

  await recordCreditTransaction(orgId, "migration", recurringAllocated, undefined, {
    recurringUsed,
    rolloverCredits,
    seatedMembers: seatedMembers.length,
  });

  return balance;
}

async function ensureOrgCreditBalanceInitialized(orgId: number) {
  const existing = await getOrgCreditBalance(orgId);
  if (existing) {
    return existing;
  }

  const seatedMembers = await db.query.organizationMembers.findMany({
    where: and(
      eq(organizationMembers.organizationId, orgId),
      eq(organizationMembers.seatAssigned, true),
    ),
  });

  const hasLegacyCredits = seatedMembers.some((member: OrganizationMember) =>
    member.creditsAllocated > 0 ||
    member.creditsUsed > 0 ||
    member.creditsRollover > 0 ||
    member.creditsPeriodStart !== null ||
    member.creditsPeriodEnd !== null
  );

  if (hasLegacyCredits) {
    return migrateLegacyMemberCreditsToOrgBalance(orgId);
  }

  const recurringAllocated = await getEffectiveRecurringLimit(orgId);
  const { periodStart, periodEnd } = getCreditPeriodWindow();
  const [balance] = await db.insert(organizationCreditBalances).values({
    organizationId: orgId,
    recurringAllocated,
    recurringUsed: 0,
    rolloverCredits: 0,
    purchasedCredits: 0,
    purchasedUsed: 0,
    periodStart,
    periodEnd,
  }).returning();

  await recordCreditTransaction(orgId, "cycle_reset", recurringAllocated, undefined, {
    reason: "initialization",
    rolloverCredits: 0,
  });

  return balance;
}

async function getCreditContextForUser(userId: number) {
  const member = await db.query.organizationMembers.findFirst({
    where: eq(organizationMembers.userId, userId),
  });

  if (!member || !member.seatAssigned) {
    return null;
  }

  const balance = await ensureOrgCreditBalanceInitialized(member.organizationId);
  return { member, balance };
}

// Get member's credit balance (org-shared balance for the seated member)
export async function getMemberCreditBalance(userId: number): Promise<CreditBalance | null> {
  const context = await getCreditContextForUser(userId);
  if (!context) {
    return null;
  }

  return buildCreditBalance(context.balance);
}

// Get organization's total credit summary
export async function getOrgCreditSummary(orgId: number): Promise<OrgCreditSummary | null> {
  const subscription = await getOrganizationSubscription(orgId);
  if (!subscription) {
    return null;
  }

  const balance = await ensureOrgCreditBalanceInitialized(orgId);
  const seatedMembers = await db.$count(
    organizationMembers,
    and(
      eq(organizationMembers.organizationId, orgId),
      eq(organizationMembers.seatAssigned, true),
    ),
  );

  return {
    totalAllocated: getBalanceTotalAllocated(balance),
    totalUsed: getBalanceTotalUsed(balance),
    totalRemaining: getBalanceTotalRemaining(balance),
    includedAllocation: await getEffectiveRecurringLimit(orgId, subscription),
    purchasedCredits: balance.purchasedCredits,
    seatedMembers,
  };
}

// Use credits for a seated recruiter by deducting from the org balance
export async function useCredits(userId: number, amount: number): Promise<{
  success: boolean;
  remaining: number;
  message?: string;
}> {
  const context = await getCreditContextForUser(userId);

  if (!context) {
    return {
      success: false,
      remaining: 0,
      message: "No active subscription or seat not assigned",
    };
  }

  const { member } = context;

  return db.transaction(async (tx: any) => {
    const current = await tx.query.organizationCreditBalances.findFirst({
      where: eq(organizationCreditBalances.organizationId, member.organizationId),
    });

    if (!current) {
      return {
        success: false,
        remaining: 0,
        message: "Credit balance not initialized",
      };
    }

    const recurringRemaining = getBalanceRecurringRemaining(current);
    const totalRemaining = recurringRemaining + current.purchasedCredits;

    if (totalRemaining < amount) {
      return {
        success: false,
        remaining: totalRemaining,
        message: "Insufficient credits",
      };
    }

    const recurringToUse = Math.min(recurringRemaining, amount);
    const purchasedToUse = amount - recurringToUse;

    await tx.update(organizationCreditBalances)
      .set({
        recurringUsed: current.recurringUsed + recurringToUse,
        purchasedCredits: current.purchasedCredits - purchasedToUse,
        purchasedUsed: current.purchasedUsed + purchasedToUse,
        updatedAt: new Date(),
      })
      .where(eq(organizationCreditBalances.organizationId, member.organizationId));

    await tx.insert(organizationCreditTransactions).values({
      organizationId: member.organizationId,
      userId,
      type: "usage",
      amount,
      metadata: {
        recurringToUse,
        purchasedToUse,
      },
    });

    return {
      success: true,
      remaining: totalRemaining - amount,
    };
  });
}

// Check if user has enough credits
export async function hasEnoughCredits(userId: number, requiredAmount: number): Promise<boolean> {
  const balance = await getMemberCreditBalance(userId);
  if (!balance) return false;
  return balance.remaining >= requiredAmount;
}

// Compatibility wrapper: member-level allocation is gone, so this just ensures the org balance exists
export async function allocateCreditsToMember(
  memberId: number,
  _amount: number,
  _rollover: number = 0,
  _cap: number
): Promise<void> {
  const member = await db.query.organizationMembers.findFirst({
    where: eq(organizationMembers.id, memberId),
  });

  if (member) {
    await ensureOrgCreditBalanceInitialized(member.organizationId);
  }
}

// Reset org credits for the next monthly cycle
export async function resetOrgCredits(orgId: number): Promise<number> {
  const subscription = await getOrganizationSubscription(orgId);
  if (!subscription) {
    return 0;
  }

  const balance = await ensureOrgCreditBalanceInitialized(orgId);
  const effectiveLimit = await getEffectiveRecurringLimit(orgId, subscription);
  const { maxRolloverMonths } = getPlanCreditSettings(subscription.plan);
  const recurringRemaining = getBalanceRecurringRemaining(balance);
  const maxRollover = Math.max(0, effectiveLimit * maxRolloverMonths - effectiveLimit);
  const rolloverCredits = Math.min(recurringRemaining, maxRollover);
  const { periodStart, periodEnd } = getCreditPeriodWindow();

  await db.update(organizationCreditBalances)
    .set({
      recurringAllocated: effectiveLimit + rolloverCredits,
      recurringUsed: 0,
      rolloverCredits,
      purchasedUsed: 0,
      periodStart,
      periodEnd,
      updatedAt: new Date(),
    })
    .where(eq(organizationCreditBalances.organizationId, orgId));

  await recordCreditTransaction(orgId, "cycle_reset", effectiveLimit, undefined, {
    rolloverCredits,
  });

  return 1;
}

// Initialize credits for a member by ensuring the shared org balance exists
export async function initializeMemberCredits(_memberId: number, orgId: number): Promise<void> {
  await ensureOrgCreditBalanceInitialized(orgId);
}

// Member-level credit forfeiture is no longer used with org-shared balances
export async function forfeitMemberCredits(_memberId: number): Promise<void> {
  return;
}

// Get members in orgs with credits expiring soon (for notifications)
export async function getMembersWithExpiringCredits(daysUntilExpiry: number = 3): Promise<OrganizationMember[]> {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + daysUntilExpiry);

  const balances = await db.query.organizationCreditBalances.findMany({
    where: and(
      lte(organizationCreditBalances.periodEnd, expiryDate),
      sql`${organizationCreditBalances.recurringAllocated} - ${organizationCreditBalances.recurringUsed} + ${organizationCreditBalances.purchasedCredits} > 0`,
    ),
  });

  if (balances.length === 0) {
    return [];
  }

  const orgIds = balances.map((balance: typeof balances[number]) => balance.organizationId);
  return db.query.organizationMembers.findMany({
    where: and(
      sql`${organizationMembers.organizationId} IN (${sql.join(orgIds, sql`, `)})`,
      eq(organizationMembers.seatAssigned, true),
    ),
  });
}

// Get credit usage history (from user_ai_usage table)
export async function getCreditUsageHistory(
  userId: number,
  historyLimit: number = 50
): Promise<{
  id: number;
  kind: string;
  creditsUsed: number;
  computedAt: Date;
  tokensIn: number;
  tokensOut: number;
  metadata: unknown;
}[]> {
  const usage = await db.query.userAiUsage.findMany({
    where: eq(userAiUsage.userId, userId),
    orderBy: desc(userAiUsage.computedAt),
    limit: historyLimit,
  });

  return usage.map((record: UserAiUsage) => ({
    id: record.id,
    kind: record.kind,
    creditsUsed: getCreditCostForOperation(record.kind),
    computedAt: record.computedAt,
    tokensIn: record.tokensIn,
    tokensOut: record.tokensOut,
    metadata: record.metadata,
  }));
}

// Validate credit requirements for AI operation
export function getCreditCostForOperation(operationType: string): number {
  const costs: Record<string, number> = {
    fit: 1,
    batch_fit: 1,
    content: 2,
    summary: 1,
    feedback: 1,
  };

  return costs[operationType] ?? 1;
}

// Increase the org's current-cycle recurring credits after plan upgrade
export async function bulkAllocateCreditsForUpgrade(
  orgId: number,
  newCreditsPerCycle: number,
  newCap: number
): Promise<number> {
  const balance = await ensureOrgCreditBalanceInitialized(orgId);
  const currentRecurringRemaining = getBalanceRecurringRemaining(balance);
  const newRecurringTotal = Math.min(currentRecurringRemaining + newCreditsPerCycle, newCap);

  await db.update(organizationCreditBalances)
    .set({
      recurringAllocated: newRecurringTotal,
      recurringUsed: 0,
      rolloverCredits: Math.max(0, newRecurringTotal - newCreditsPerCycle),
      updatedAt: new Date(),
    })
    .where(eq(organizationCreditBalances.organizationId, orgId));

  await recordCreditTransaction(orgId, "cycle_reset", newCreditsPerCycle, undefined, {
    reason: "plan_upgrade",
    previousRecurringRemaining: currentRecurringRemaining,
  });

  return 1;
}

// Get detailed credit information for an organization (admin use)
export async function getOrgCreditDetails(orgId: number): Promise<OrgCreditDetails | null> {
  const subscription = await getOrganizationSubscription(orgId);
  if (!subscription) {
    return null;
  }

  const balance = await ensureOrgCreditBalanceInitialized(orgId);
  const plan = subscription.plan;
  const { creditsPerSeat } = getPlanCreditSettings(plan);
  const seatedMembers = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.organizationId, orgId),
    with: {
      user: {
        columns: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  const periodStart = balance.periodStart || getCreditPeriodWindow().periodStart;
  const usageByUser = await db
    .select({
      userId: userAiUsage.userId,
      used: sql<number>`COUNT(*)`,
    })
    .from(userAiUsage)
    .where(and(
      eq(userAiUsage.organizationId, orgId),
      gte(userAiUsage.computedAt, periodStart),
    ))
    .groupBy(userAiUsage.userId);

  const usageMap = new Map(usageByUser.map((entry: typeof usageByUser[number]) => [entry.userId, Number(entry.used)]));

  return {
    planAllocation: creditsPerSeat,
    bonusCredits: subscription.bonusCredits || 0,
    customLimit: subscription.customCreditLimit,
    effectiveLimit: await getEffectiveRecurringLimit(orgId, subscription),
    purchasedCredits: balance.purchasedCredits,
    usedThisPeriod: getBalanceTotalUsed(balance),
    remaining: getBalanceTotalRemaining(balance),
    periodStart: balance.periodStart,
    periodEnd: balance.periodEnd,
    seatedMembers: seatedMembers.filter((member: typeof seatedMembers[number]) => member.seatAssigned).length,
    memberBreakdown: seatedMembers.map((member: typeof seatedMembers[number]) => ({
      userId: member.userId,
      name: member.user
        ? `${member.user.firstName || ""} ${member.user.lastName || ""}`.trim() || member.user.username
        : "Unknown",
      email: member.user?.username || "",
      used: usageMap.get(member.userId) ?? 0,
      seatAssigned: member.seatAssigned,
    })),
  };
}

// Recalculate org recurring allocation after admin overrides or plan changes
export async function recalculateOrgCredits(orgId: number): Promise<{
  effectiveLimit: number;
  perMember: number;
  membersUpdated: number;
}> {
  const subscription = await getOrganizationSubscription(orgId);
  if (!subscription) {
    throw new Error("Organization has no subscription");
  }

  const balance = await ensureOrgCreditBalanceInitialized(orgId);
  const seatedMembers = await db.$count(
    organizationMembers,
    and(
      eq(organizationMembers.organizationId, orgId),
      eq(organizationMembers.seatAssigned, true),
    ),
  );

  const effectiveLimit = await getEffectiveRecurringLimit(orgId, subscription);
  const { maxRolloverMonths } = getPlanCreditSettings(subscription.plan);
  const maxRollover = Math.max(0, effectiveLimit * maxRolloverMonths - effectiveLimit);
  const rolloverCredits = Math.min(balance.rolloverCredits, maxRollover);
  const recurringAllocated = Math.max(effectiveLimit + rolloverCredits, balance.recurringUsed);

  await db.update(organizationCreditBalances)
    .set({
      recurringAllocated,
      rolloverCredits,
      updatedAt: new Date(),
    })
    .where(eq(organizationCreditBalances.organizationId, orgId));

  return {
    effectiveLimit,
    perMember: seatedMembers > 0 ? Math.floor(effectiveLimit / seatedMembers) : effectiveLimit,
    membersUpdated: seatedMembers,
  };
}

// Grant bonus credits to an organization
export async function grantBonusCredits(
  orgId: number,
  amount: number,
  reason: string,
  grantedBy: number
): Promise<{ totalGranted: number; membersAffected: number; newBonusTotal: number }> {
  const subscription = await getOrganizationSubscription(orgId);
  if (!subscription) {
    throw new Error("Organization has no subscription");
  }

  const currentBonus = subscription.bonusCredits || 0;
  const newBonusTotal = currentBonus + amount;

  await db.update(organizationSubscriptions)
    .set({
      bonusCredits: newBonusTotal,
      bonusCreditsGrantedAt: new Date(),
      bonusCreditsReason: reason,
      bonusCreditsGrantedBy: grantedBy,
      updatedAt: new Date(),
    })
    .where(eq(organizationSubscriptions.id, subscription.id));

  const recalcResult = await recalculateOrgCredits(orgId);
  await recordCreditTransaction(orgId, "bonus_grant", amount, grantedBy, { reason });

  await logSubscriptionAction(
    orgId,
    subscription.id,
    "admin_override",
    { bonusCredits: currentBonus },
    { bonusCredits: newBonusTotal, bonusAmount: amount },
    grantedBy,
    `Bonus credits: ${reason}`,
  );

  return {
    totalGranted: amount,
    membersAffected: recalcResult.membersUpdated,
    newBonusTotal,
  };
}

// Set custom credit limit for an organization
export async function setCustomCreditLimit(
  orgId: number,
  customLimit: number | null,
  reason: string,
  setBy: number
): Promise<{ previousLimit: number | null; newLimit: number | null; membersAffected: number }> {
  const subscription = await getOrganizationSubscription(orgId);
  if (!subscription) {
    throw new Error("Organization has no subscription");
  }

  const previousLimit = subscription.customCreditLimit;

  await db.update(organizationSubscriptions)
    .set({
      customCreditLimit: customLimit,
      updatedAt: new Date(),
    })
    .where(eq(organizationSubscriptions.id, subscription.id));

  const recalcResult = await recalculateOrgCredits(orgId);
  await recordCreditTransaction(orgId, "custom_limit", customLimit ?? 0, setBy, { reason, previousLimit });

  await logSubscriptionAction(
    orgId,
    subscription.id,
    "admin_override",
    { customCreditLimit: previousLimit },
    { customCreditLimit: customLimit },
    setBy,
    `Custom credit limit: ${reason}`,
  );

  return {
    previousLimit,
    newLimit: customLimit,
    membersAffected: recalcResult.membersUpdated,
  };
}

// Clear bonus credits for an organization
export async function clearBonusCredits(
  orgId: number,
  reason: string,
  clearedBy: number
): Promise<{ previousAmount: number; membersAffected: number }> {
  const subscription = await getOrganizationSubscription(orgId);
  if (!subscription) {
    throw new Error("Organization has no subscription");
  }

  const previousAmount = subscription.bonusCredits || 0;

  await db.update(organizationSubscriptions)
    .set({
      bonusCredits: 0,
      bonusCreditsGrantedAt: null,
      bonusCreditsReason: null,
      bonusCreditsGrantedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(organizationSubscriptions.id, subscription.id));

  const recalcResult = await recalculateOrgCredits(orgId);
  await recordCreditTransaction(orgId, "bonus_clear", previousAmount, clearedBy, { reason });

  await logSubscriptionAction(
    orgId,
    subscription.id,
    "admin_override",
    { bonusCredits: previousAmount },
    { bonusCredits: 0 },
    clearedBy,
    `Cleared bonus credits: ${reason}`,
  );

  return { previousAmount, membersAffected: recalcResult.membersUpdated };
}

// Get daily rate limit for a user based on their organization's plan
export async function getUserDailyRateLimit(userId: number): Promise<number> {
  const member = await db.query.organizationMembers.findFirst({
    where: eq(organizationMembers.userId, userId),
  });

  if (!member) {
    return FREE_DAILY_RATE_LIMIT;
  }

  const subscription = await getOrganizationSubscription(member.organizationId);
  if (!subscription) {
    return FREE_DAILY_RATE_LIMIT;
  }

  const info = getPlanRateLimitInfo(subscription.plan);
  return info.dailyRateLimit;
}
