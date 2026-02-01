import { db } from "../db";
import {
  organizationMembers,
  organizationSubscriptions,
  subscriptionPlans,
  subscriptionAuditLog,
  userAiUsage,
  type OrganizationMember,
  type UserAiUsage,
  type SubscriptionPlan,
} from "@shared/schema";
import { eq, and, sql, lte, desc } from "drizzle-orm";
import { getOrganizationSubscription, logSubscriptionAction } from "./subscriptionService";

export interface CreditBalance {
  allocated: number;
  used: number;
  remaining: number;
  rollover: number;
  periodStart: Date | null;
  periodEnd: Date | null;
}

export interface OrgCreditSummary {
  totalAllocated: number;
  totalUsed: number;
  totalRemaining: number;
  perSeatAllocation: number;
  seatedMembers: number;
}

function getEnvInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

// Free plan credits (configurable via env)
const FREE_CREDITS_PER_MONTH = getEnvInt('FREE_AI_CREDITS_PER_MONTH', 5);
const FREE_CREDITS_ROLLOVER_MONTHS = getEnvInt('FREE_AI_CREDITS_ROLLOVER_MONTHS', 3);
const FREE_CREDITS_CAP = getEnvInt(
  'FREE_AI_CREDITS_CAP',
  FREE_CREDITS_PER_MONTH * FREE_CREDITS_ROLLOVER_MONTHS
);

// Pro plan credits (configurable via env)
const PRO_CREDITS_PER_SEAT_PER_MONTH = getEnvInt('PRO_AI_CREDITS_PER_MONTH', 600);
const PRO_CREDITS_ROLLOVER_MONTHS = getEnvInt('PRO_AI_CREDITS_ROLLOVER_MONTHS', 3);
const PRO_CREDITS_CAP = getEnvInt(
  'PRO_AI_CREDITS_CAP',
  PRO_CREDITS_PER_SEAT_PER_MONTH * PRO_CREDITS_ROLLOVER_MONTHS
);

// Daily rate limits per plan (configurable via env)
export const FREE_AI_DAILY_RATE_LIMIT = getEnvInt('FREE_AI_DAILY_RATE_LIMIT', 20);
export const PRO_AI_DAILY_RATE_LIMIT = getEnvInt('PRO_AI_DAILY_RATE_LIMIT', 100);

function getPlanCreditSettings(plan: SubscriptionPlan): {
  creditsPerSeat: number;
  maxRolloverMonths: number;
  cap: number;
} {
  if (plan.name === 'free') {
    return {
      creditsPerSeat: FREE_CREDITS_PER_MONTH,
      maxRolloverMonths: FREE_CREDITS_ROLLOVER_MONTHS,
      cap: FREE_CREDITS_CAP,
    };
  }

  // Pro plan uses env-configurable values
  if (plan.name === 'pro') {
    return {
      creditsPerSeat: PRO_CREDITS_PER_SEAT_PER_MONTH,
      maxRolloverMonths: PRO_CREDITS_ROLLOVER_MONTHS,
      cap: PRO_CREDITS_CAP,
    };
  }

  // Business/custom plans use DB values
  const maxRolloverMonths = plan.maxCreditRolloverMonths || 3;
  const creditsPerSeat = plan.aiCreditsPerSeatMonthly;
  return {
    creditsPerSeat,
    maxRolloverMonths,
    cap: creditsPerSeat * maxRolloverMonths,
  };
}

// Get member's credit balance
export async function getMemberCreditBalance(userId: number): Promise<CreditBalance | null> {
  const member = await db.query.organizationMembers.findFirst({
    where: eq(organizationMembers.userId, userId),
  });

  if (!member || !member.seatAssigned) {
    return null;
  }

  return {
    allocated: member.creditsAllocated,
    used: member.creditsUsed,
    remaining: Math.max(0, member.creditsAllocated - member.creditsUsed),
    rollover: member.creditsRollover,
    periodStart: member.creditsPeriodStart,
    periodEnd: member.creditsPeriodEnd,
  };
}

// Get organization's total credit summary
export async function getOrgCreditSummary(orgId: number): Promise<OrgCreditSummary | null> {
  const subscription = await getOrganizationSubscription(orgId);
  if (!subscription) {
    return null;
  }

  const members = await db.query.organizationMembers.findMany({
    where: and(
      eq(organizationMembers.organizationId, orgId),
      eq(organizationMembers.seatAssigned, true)
    ),
  });

  const totalAllocated = members.reduce((sum: number, m: typeof members[number]) => sum + m.creditsAllocated, 0);
  const totalUsed = members.reduce((sum: number, m: typeof members[number]) => sum + m.creditsUsed, 0);
  const { creditsPerSeat } = getPlanCreditSettings(subscription.plan);

  return {
    totalAllocated,
    totalUsed,
    totalRemaining: Math.max(0, totalAllocated - totalUsed),
    perSeatAllocation: creditsPerSeat,
    seatedMembers: members.length,
  };
}

// Use credits for a member
export async function useCredits(userId: number, amount: number): Promise<{
  success: boolean;
  remaining: number;
  message?: string;
}> {
  const member = await db.query.organizationMembers.findFirst({
    where: eq(organizationMembers.userId, userId),
  });

  if (!member || !member.seatAssigned) {
    return {
      success: false,
      remaining: 0,
      message: 'No active subscription or seat not assigned',
    };
  }

  const remaining = member.creditsAllocated - member.creditsUsed;
  if (remaining < amount) {
    return {
      success: false,
      remaining,
      message: 'Insufficient credits',
    };
  }

  await db.update(organizationMembers)
    .set({
      creditsUsed: member.creditsUsed + amount,
    })
    .where(eq(organizationMembers.id, member.id));

  return {
    success: true,
    remaining: remaining - amount,
  };
}

// Check if user has enough credits
export async function hasEnoughCredits(userId: number, requiredAmount: number): Promise<boolean> {
  const balance = await getMemberCreditBalance(userId);
  if (!balance) return false;
  return balance.remaining >= requiredAmount;
}

// Allocate credits to a member (called when seat is assigned or period resets)
export async function allocateCreditsToMember(
  memberId: number,
  amount: number,
  rollover: number = 0,
  cap: number
): Promise<void> {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  // Calculate total with rollover, capped
  const total = Math.min(amount + rollover, cap);

  await db.update(organizationMembers)
    .set({
      creditsAllocated: total,
      creditsUsed: 0,
      creditsRollover: rollover,
      creditsPeriodStart: now,
      creditsPeriodEnd: periodEnd,
    })
    .where(eq(organizationMembers.id, memberId));
}

// Reset credits for all members in an organization (called at period renewal)
export async function resetOrgCredits(orgId: number): Promise<number> {
  const subscription = await getOrganizationSubscription(orgId);
  if (!subscription) {
    return 0;
  }

  const plan = subscription.plan;
  const { creditsPerSeat, cap } = getPlanCreditSettings(plan);

  // Get all seated members
  const members = await db.query.organizationMembers.findMany({
    where: and(
      eq(organizationMembers.organizationId, orgId),
      eq(organizationMembers.seatAssigned, true)
    ),
  });

  let resetCount = 0;

  for (const member of members) {
    // Calculate rollover (unused credits, capped at max rollover)
    const unused = Math.max(0, member.creditsAllocated - member.creditsUsed);
    const rollover = Math.min(unused, cap - creditsPerSeat);

    await allocateCreditsToMember(member.id, creditsPerSeat, rollover, cap);
    resetCount++;
  }

  return resetCount;
}

// Initialize credits for new member
export async function initializeMemberCredits(memberId: number, orgId: number): Promise<void> {
  const subscription = await getOrganizationSubscription(orgId);
  if (!subscription) {
    // Free plan defaults
    await allocateCreditsToMember(memberId, FREE_CREDITS_PER_MONTH, 0, FREE_CREDITS_CAP);
    return;
  }

  const plan = subscription.plan;
  const { creditsPerSeat, cap } = getPlanCreditSettings(plan);

  // New members start with full allocation, no rollover
  await allocateCreditsToMember(memberId, creditsPerSeat, 0, cap);
}

// Forfeit all credits for a member (called when seat is removed)
export async function forfeitMemberCredits(memberId: number): Promise<void> {
  await db.update(organizationMembers)
    .set({
      creditsAllocated: 0,
      creditsUsed: 0,
      creditsRollover: 0,
      creditsPeriodStart: null,
      creditsPeriodEnd: null,
    })
    .where(eq(organizationMembers.id, memberId));
}

// Get members with credits expiring soon (for notifications)
export async function getMembersWithExpiringCredits(daysUntilExpiry: number = 3): Promise<OrganizationMember[]> {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + daysUntilExpiry);

  return db.query.organizationMembers.findMany({
    where: and(
      eq(organizationMembers.seatAssigned, true),
      lte(organizationMembers.creditsPeriodEnd, expiryDate),
      sql`${organizationMembers.creditsAllocated} - ${organizationMembers.creditsUsed} > 0`
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
    'fit': 1,      // Single fit score
    'batch_fit': 1, // Per candidate in batch
    'content': 2,   // Content generation
    'summary': 1,   // Candidate summary
    'feedback': 1,  // AI feedback
  };

  return costs[operationType] ?? 1;
}

// Bulk allocate credits for plan upgrade
export async function bulkAllocateCreditsForUpgrade(
  orgId: number,
  newCreditsPerSeat: number,
  newCap: number
): Promise<number> {
  const members = await db.query.organizationMembers.findMany({
    where: and(
      eq(organizationMembers.organizationId, orgId),
      eq(organizationMembers.seatAssigned, true)
    ),
  });

  let updatedCount = 0;

  for (const member of members) {
    // Keep existing unused credits as base, add new allocation
    const currentUnused = Math.max(0, member.creditsAllocated - member.creditsUsed);
    const newTotal = Math.min(currentUnused + newCreditsPerSeat, newCap);

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await db.update(organizationMembers)
      .set({
        creditsAllocated: newTotal,
        creditsUsed: 0,
        creditsPeriodStart: now,
        creditsPeriodEnd: periodEnd,
      })
      .where(eq(organizationMembers.id, member.id));

    updatedCount++;
  }

  return updatedCount;
}

// ===== Admin Bonus Credits Functions =====

export interface OrgCreditDetails {
  planAllocation: number;      // Base from plan × seats
  bonusCredits: number;        // Admin-granted bonuses
  customLimit: number | null;  // Override if set
  effectiveLimit: number;      // Actual monthly limit
  usedThisPeriod: number;
  remaining: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  seatedMembers: number;
  memberBreakdown: {
    userId: number;
    name: string;
    email: string;
    allocated: number;
    used: number;
    remaining: number;
  }[];
}

// Get detailed credit information for an organization (admin use)
export async function getOrgCreditDetails(orgId: number): Promise<OrgCreditDetails | null> {
  const subscription = await getOrganizationSubscription(orgId);
  if (!subscription) {
    return null;
  }

  const plan = subscription.plan;
  const { creditsPerSeat } = getPlanCreditSettings(plan);

  // Get all seated members with their user info
  const members = await db.query.organizationMembers.findMany({
    where: and(
      eq(organizationMembers.organizationId, orgId),
      eq(organizationMembers.seatAssigned, true)
    ),
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

  const planAllocation = creditsPerSeat * subscription.seats;
  const bonusCredits = subscription.bonusCredits || 0;
  const customLimit = subscription.customCreditLimit;

  // Effective limit: custom override takes precedence, then plan allocation + bonus
  const effectiveLimit = customLimit !== null && customLimit !== undefined
    ? customLimit
    : planAllocation + bonusCredits;

  const totalUsed = members.reduce((sum: number, m: typeof members[number]) => sum + m.creditsUsed, 0);
  const totalAllocated = members.reduce((sum: number, m: typeof members[number]) => sum + m.creditsAllocated, 0);

  // Period dates from first member (all should be synced)
  const periodStart = members[0]?.creditsPeriodStart || null;
  const periodEnd = members[0]?.creditsPeriodEnd || null;

  const memberBreakdown = members.map((m: typeof members[number]) => ({
    userId: m.userId,
    name: m.user ? `${m.user.firstName || ''} ${m.user.lastName || ''}`.trim() || m.user.username : 'Unknown',
    email: m.user?.username || '',
    allocated: m.creditsAllocated,
    used: m.creditsUsed,
    remaining: Math.max(0, m.creditsAllocated - m.creditsUsed),
  }));

  return {
    planAllocation,
    bonusCredits,
    customLimit,
    effectiveLimit,
    usedThisPeriod: totalUsed,
    remaining: Math.max(0, totalAllocated - totalUsed),
    periodStart,
    periodEnd,
    seatedMembers: members.length,
    memberBreakdown,
  };
}

// Recalculate and redistribute credits for an organization based on effective limit
// Called when: bonus credits granted/cleared, custom limit set/cleared, seats/plan change
export async function recalculateOrgCredits(orgId: number): Promise<{
  effectiveLimit: number;
  perMember: number;
  membersUpdated: number;
}> {
  const subscription = await getOrganizationSubscription(orgId);
  if (!subscription) {
    throw new Error('Organization has no subscription');
  }

  const plan = subscription.plan;
  const { creditsPerSeat } = getPlanCreditSettings(plan);

  // Get all seated members
  const members = await db.query.organizationMembers.findMany({
    where: and(
      eq(organizationMembers.organizationId, orgId),
      eq(organizationMembers.seatAssigned, true)
    ),
  });

  if (members.length === 0) {
    return { effectiveLimit: 0, perMember: 0, membersUpdated: 0 };
  }

  // Calculate effective limit
  const planAllocation = creditsPerSeat * members.length;
  const bonusCredits = subscription.bonusCredits || 0;
  const customLimit = subscription.customCreditLimit;

  const effectiveLimit = customLimit !== null && customLimit !== undefined
    ? customLimit
    : planAllocation + bonusCredits;

  // Calculate per-member allocation with remainder distribution
  const perMember = Math.floor(effectiveLimit / members.length);
  const remainder = effectiveLimit % members.length;

  let membersUpdated = 0;

  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    // Distribute remainder to first N members (round-robin)
    const newAllocation = perMember + (i < remainder ? 1 : 0);

    // Clawback protection: can't reduce below what they've already used
    const finalAllocation = Math.max(newAllocation, member.creditsUsed);

    await db.update(organizationMembers)
      .set({
        creditsAllocated: finalAllocation,
      })
      .where(eq(organizationMembers.id, member.id));

    membersUpdated++;
  }

  return {
    effectiveLimit,
    perMember,
    membersUpdated,
  };
}

// Grant bonus credits to an organization
// Credits are always distributed to members via recalculateOrgCredits()
export async function grantBonusCredits(
  orgId: number,
  amount: number,
  reason: string,
  grantedBy: number
): Promise<{ totalGranted: number; membersAffected: number; newBonusTotal: number }> {
  const subscription = await getOrganizationSubscription(orgId);
  if (!subscription) {
    throw new Error('Organization has no subscription');
  }

  const currentBonus = subscription.bonusCredits || 0;
  const newBonusTotal = currentBonus + amount;

  // Update the subscription with the new bonus amount
  await db.update(organizationSubscriptions)
    .set({
      bonusCredits: newBonusTotal,
      bonusCreditsGrantedAt: new Date(),
      bonusCreditsReason: reason,
      bonusCreditsGrantedBy: grantedBy,
      updatedAt: new Date(),
    })
    .where(eq(organizationSubscriptions.id, subscription.id));

  // Recalculate and redistribute credits to all members
  const recalcResult = await recalculateOrgCredits(orgId);

  // Log the action
  await logSubscriptionAction(
    orgId,
    subscription.id,
    'admin_override',
    { bonusCredits: currentBonus },
    { bonusCredits: newBonusTotal, bonusAmount: amount },
    grantedBy,
    `Bonus credits: ${reason}`
  );

  return {
    totalGranted: amount,
    membersAffected: recalcResult.membersUpdated,
    newBonusTotal,
  };
}

// Set custom credit limit for an organization (typically Business plan)
// Recalculates member allocations after setting the limit
export async function setCustomCreditLimit(
  orgId: number,
  customLimit: number | null,
  reason: string,
  setBy: number
): Promise<{ previousLimit: number | null; newLimit: number | null; membersAffected: number }> {
  const subscription = await getOrganizationSubscription(orgId);
  if (!subscription) {
    throw new Error('Organization has no subscription');
  }

  const previousLimit = subscription.customCreditLimit;

  await db.update(organizationSubscriptions)
    .set({
      customCreditLimit: customLimit,
      updatedAt: new Date(),
    })
    .where(eq(organizationSubscriptions.id, subscription.id));

  // Recalculate and redistribute credits to all members
  const recalcResult = await recalculateOrgCredits(orgId);

  // Log the action
  await logSubscriptionAction(
    orgId,
    subscription.id,
    'admin_override',
    { customCreditLimit: previousLimit },
    { customCreditLimit: customLimit },
    setBy,
    `Custom credit limit: ${reason}`
  );

  return {
    previousLimit,
    newLimit: customLimit,
    membersAffected: recalcResult.membersUpdated,
  };
}

// Clear bonus credits for an organization
// Implements clawback by recalculating member allocations (respects credits already used)
export async function clearBonusCredits(
  orgId: number,
  reason: string,
  clearedBy: number
): Promise<{ previousAmount: number; membersAffected: number }> {
  const subscription = await getOrganizationSubscription(orgId);
  if (!subscription) {
    throw new Error('Organization has no subscription');
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

  // Recalculate and redistribute credits (implements clawback)
  // Members keep credits they've already used, but allocation is reduced
  const recalcResult = await recalculateOrgCredits(orgId);

  // Log the action
  await logSubscriptionAction(
    orgId,
    subscription.id,
    'admin_override',
    { bonusCredits: previousAmount },
    { bonusCredits: 0 },
    clearedBy,
    `Cleared bonus credits: ${reason}`
  );

  return { previousAmount, membersAffected: recalcResult.membersUpdated };
}

// ===== Daily Rate Limit Functions =====

export interface PlanRateLimitInfo {
  planName: string;
  dailyRateLimit: number;
  monthlyCredits: number;
  rolloverMonths: number;
  maxCredits: number;
}

// Get rate limit info for a plan by name
export function getPlanRateLimitInfo(planName: string): PlanRateLimitInfo {
  if (planName === 'free') {
    return {
      planName: 'free',
      dailyRateLimit: FREE_AI_DAILY_RATE_LIMIT,
      monthlyCredits: FREE_CREDITS_PER_MONTH,
      rolloverMonths: FREE_CREDITS_ROLLOVER_MONTHS,
      maxCredits: FREE_CREDITS_CAP,
    };
  }

  if (planName === 'pro') {
    return {
      planName: 'pro',
      dailyRateLimit: PRO_AI_DAILY_RATE_LIMIT,
      monthlyCredits: PRO_CREDITS_PER_SEAT_PER_MONTH,
      rolloverMonths: PRO_CREDITS_ROLLOVER_MONTHS,
      maxCredits: PRO_CREDITS_CAP,
    };
  }

  // Business/custom plans - use Pro defaults (can be overridden)
  return {
    planName,
    dailyRateLimit: PRO_AI_DAILY_RATE_LIMIT,
    monthlyCredits: 0, // Custom
    rolloverMonths: 3,
    maxCredits: 0, // Custom
  };
}

// Get daily rate limit for a user based on their organization's plan
export async function getUserDailyRateLimit(userId: number): Promise<number> {
  const member = await db.query.organizationMembers.findFirst({
    where: eq(organizationMembers.userId, userId),
  });

  if (!member) {
    return FREE_AI_DAILY_RATE_LIMIT;
  }

  const subscription = await getOrganizationSubscription(member.organizationId);
  if (!subscription) {
    return FREE_AI_DAILY_RATE_LIMIT;
  }

  const info = getPlanRateLimitInfo(subscription.plan.name);
  return info.dailyRateLimit;
}
