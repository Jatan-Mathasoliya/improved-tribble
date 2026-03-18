import { useQuery } from "@tanstack/react-query";

// Types
export interface CreditBalance {
  allocated: number;
  used: number;
  remaining: number;
  rollover: number;
  purchasedCredits?: number;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface CreditUsageEntry {
  id: number;
  action: string;
  creditsUsed: number;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface OrgCreditDetails {
  planAllocation: number;
  bonusCredits: number;
  customLimit: number | null;
  effectiveLimit: number;
  purchasedCredits: number;
  rolloverCredits: number;
  proratedCreditsAddedThisPeriod: number;
  usedThisPeriod: number;
  remaining: number;
  periodStart: string | null;
  periodEnd: string | null;
  seatedMembers: number;
}

export interface OrgCreditLedgerEntry {
  id: number;
  type: string;
  amount: number;
  createdAt: string;
  actor: {
    userId: number | null;
    name: string | null;
    email: string | null;
  };
  metadata: Record<string, any> | null;
}

export interface CreditUsageResponse {
  userHistory: CreditUsageEntry[];
  orgSummary: {
    totalAllocated: number;
    totalUsed: number;
    totalRemaining: number;
    includedAllocation: number;
    purchasedCredits: number;
    seatedMembers: number;
  } | null;
  orgDetails: OrgCreditDetails | null;
  orgLedger: OrgCreditLedgerEntry[];
}

// API functions
async function fetchCreditBalance() {
  const res = await fetch('/api/ai/credits', {
    credentials: 'include',
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error('Failed to fetch credit balance');
  }
  return res.json();
}

async function fetchCreditUsage() {
  const res = await fetch('/api/ai/credits/usage', {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error('Failed to fetch credit usage');
  }
  return res.json();
}

// Hooks
export function useAiCredits() {
  return useQuery<CreditBalance | null>({
    queryKey: ['ai', 'credits'],
    queryFn: fetchCreditBalance,
    staleTime: 1000 * 30, // 30 seconds
  });
}

export function useAiCreditUsage() {
  return useQuery<CreditUsageResponse>({
    queryKey: ['ai', 'credits', 'usage'],
    queryFn: fetchCreditUsage,
    staleTime: 1000 * 60, // 1 minute
  });
}

/**
 * Check if user has enough credits for an action
 */
export function useHasCredits(requiredCredits: number = 1): boolean {
  const { data, isLoading } = useAiCredits();

  if (isLoading || !data) return true; // Assume has credits while loading

  return data.remaining >= requiredCredits;
}

/**
 * Get credit usage percentage
 */
export function useCreditUsagePercent(): number {
  const { data } = useAiCredits();

  if (!data || data.allocated === 0) return 0;

  return Math.min(100, Math.round((data.used / data.allocated) * 100));
}
