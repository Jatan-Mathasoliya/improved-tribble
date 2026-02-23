import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRef, useEffect } from "react";

// =====================================================
// Types (mirror server SourcedCandidateForUI)
// =====================================================

export interface SourcedCandidateForUI {
  id: number;
  jobId: number;
  signalCandidateId: string;
  fitScore: number | null;
  fitBreakdown: Record<string, unknown> | null;
  sourceType: string;
  displayBucket: "talent_pool" | "newly_discovered";
  state: "new" | "shortlisted" | "hidden" | "converted";
  nameHint: string | null;
  headlineHint: string | null;
  locationHint: string | null;
  companyHint: string | null;
  linkedinUrl: string | null;
  enrichmentStatus: string | null;
  identitySummary: {
    bestBridgeTier: number | null;
    maxIdentityConfidence: number | null;
    hasConfirmedIdentity: boolean;
    needsReview: boolean;
    platforms: string[];
    displayStatus: "verified" | "review" | "weak";
    lastIdentityCheckAt: string | null;
  } | null;
  snapshot: {
    skillsNormalized: unknown;
    roleType: string | null;
    seniorityBand: string | null;
    location: string | null;
    computedAt: string | null;
  } | null;
  freshness: {
    lastEnrichedAt: string | null;
    lastIdentityCheckAt: string | null;
    enrichedDaysAgo: number | null;
    identityCheckDaysAgo: number | null;
  };
  candidateSummary: unknown;
  lastSyncedAt: string | null;
  createdAt: string | null;
}

export interface SourcingStatus {
  hasRun: boolean;
  requestId?: string;
  status?: string;
  candidateCount?: number;
  submittedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

interface SourcedCandidatesResponse {
  candidates: SourcedCandidateForUI[];
  counts: {
    total: number;
    talentPool: number;
    newlyDiscovered: number;
  };
}

// =====================================================
// Terminal status check
// =====================================================

const TERMINAL_STATUSES = new Set(["completed", "failed", "expired"]);
function isTerminal(status: string | undefined): boolean {
  return !!status && TERMINAL_STATUSES.has(status);
}

// =====================================================
// useSourcingStatus
// =====================================================

export function useSourcingStatus(jobId: number | undefined) {
  const queryClient = useQueryClient();
  const prevStatusRef = useRef<string | undefined>(undefined);

  const query = useQuery<SourcingStatus>({
    queryKey: ["/api/jobs", jobId, "sourcing-status"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/jobs/${jobId}/sourcing-status`);
      return res.json();
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data?.hasRun) return false;
      return isTerminal(data.status) ? false : 7000;
    },
  });

  // When status transitions from non-terminal to terminal, force a final
  // refetch of sourced-candidates to pick up any late webhook upserts.
  useEffect(() => {
    const currentStatus = query.data?.status;
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = currentStatus;

    if (
      currentStatus &&
      prevStatus &&
      !isTerminal(prevStatus) &&
      isTerminal(currentStatus)
    ) {
      queryClient.invalidateQueries({
        queryKey: ["/api/jobs", jobId, "sourced-candidates"],
      });
    }
  }, [query.data?.status, jobId, queryClient]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isPolling: !!query.data?.hasRun && !isTerminal(query.data?.status),
  };
}

// =====================================================
// useSourcedCandidates
// =====================================================

export function useSourcedCandidates(jobId: number | undefined) {
  return useQuery<SourcedCandidatesResponse>({
    queryKey: ["/api/jobs", jobId, "sourced-candidates"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/jobs/${jobId}/sourced-candidates`);
      return res.json();
    },
    enabled: !!jobId,
  });
}

// =====================================================
// useFindCandidates
// =====================================================

export function useFindCandidates(jobId: number | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/jobs/${jobId}/find-candidates`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/jobs", jobId, "sourcing-status"],
      });
      toast({
        title: "Sourcing started",
        description: "Searching for candidates matching this role...",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to start sourcing",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    trigger: mutation.mutate,
    isPending: mutation.isPending,
  };
}

// =====================================================
// useUpdateCandidateState
// =====================================================

export function useUpdateCandidateState(jobId: number | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async ({
      candidateId,
      state,
    }: {
      candidateId: number;
      state: "new" | "shortlisted" | "hidden";
    }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/jobs/${jobId}/sourced-candidates/${candidateId}`,
        { state },
      );
      return res.json();
    },
    onMutate: async ({ candidateId, state }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ["/api/jobs", jobId, "sourced-candidates"],
      });

      // Snapshot previous value
      const previous = queryClient.getQueryData<SourcedCandidatesResponse>([
        "/api/jobs",
        jobId,
        "sourced-candidates",
      ]);

      // Optimistically update candidate state
      if (previous) {
        queryClient.setQueryData<SourcedCandidatesResponse>(
          ["/api/jobs", jobId, "sourced-candidates"],
          {
            ...previous,
            candidates: previous.candidates.map((c) =>
              c.id === candidateId ? { ...c, state } : c,
            ),
          },
        );
      }

      return { previous };
    },
    onError: (error: Error, _vars, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(
          ["/api/jobs", jobId, "sourced-candidates"],
          context.previous,
        );
      }
      toast({
        title: "Failed to update candidate",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/jobs", jobId, "sourced-candidates"],
      });
    },
  });

  return {
    update: mutation.mutate,
    isPending: mutation.isPending,
  };
}
