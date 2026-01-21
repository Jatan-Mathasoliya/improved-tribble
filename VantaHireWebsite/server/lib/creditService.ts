import { db } from "../db";
import {
  organizationMembers,
  organizationSubscriptions,
  subscriptionPlans,
  userAiUsage,
  type OrganizationMember,
  type UserAiUsage,
  type SubscriptionPlan,
} from "@shared/schema";
import { eq, and, sql, lte, desc } from "drizzle-orm";
import { getOrganizationSubscription } from "./subscriptionService";
import { getSeatedMembersCount } from "./membershipService";

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

// Pro plan credits
const PRO_CREDITS_PER_SEAT_PER_MONTH = 600;
const PRO_CREDITS_CAP_MULTIPLIER = 3; // 3 months worth

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
