import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, isApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";
import { useRef, useEffect } from "react";

export type MatchTier = "best_matches" | "broader_pool";
export type LocationMatchType = "city_exact" | "city_alias" | "country_only" | "unknown_location" | "none";

export interface SourcedCandidateForUI {
  id: number;
  jobId: number;
  signalCandidateId: string;
  signalRank: number | null;
  fitScore: number | null;
  fitScoreRaw: number | null;
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
  confidenceScore: number | null;
  searchSnippet: string | null;
  searchProvider: string | null;
  searchSignals: {
    serpDate: string | null;
    serpDateDaysAgo: number | null;
    linkedinHost: string | null;
    linkedinLocale: string | null;
  };

  matchTier?: MatchTier | null;
  locationMatchType?: LocationMatchType | null;
  dataConfidence?: "high" | "medium" | "low" | null;
  roleScore?: number | null;
  experienceScore?: number | null;

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

  engagementReady?: boolean;
  locationLabel?: string | null;
  locationConfidenceNumeric?: number | null;

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
  enrichment?: {
    totalCandidates: number;
    enrichedCount: number;
    pendingCount: number;
    failedCount: number;
    percent: number;
    inProgress: boolean;
    lastSyncedAt?: string | null;
    refreshStatus?: string | null;
    queueJobId?: string | null;
    lastRerankedAt?: string | null;
  };
}

export interface SourcedCandidatesResponse {
  candidates: SourcedCandidateForUI[];
  counts: {
    total: number;
    talentPool: number;
    newlyDiscovered: number;
  };
  groupCounts?: {
    bestMatches: number;
    broaderPool: number;
    strictMatchedCount?: number;
    expandedCount?: number;
    expansionReason?: string | null;
    requestedLocation?: string | null;
    strictDemotedCount?: number;
    strictRescuedCount?: number;
    strictRescueApplied?: boolean;
    strictRescueMinFitScoreUsed?: number | null;
    countryGuardFilteredCount?: number;
    minDiscoveryPerRunApplied?: number;
    minDiscoveredInOutputApplied?: number;
    discoveredPromotedCount?: number;
    discoveredPromotedInTopCount?: number;
    discoveredOrphanCount?: number;
    discoveredOrphanQueued?: number;
    locationMatchCounts?: Record<string, number> | null;
    demotedStrictWithCityMatch?: number;
    strictBeforeDemotion?: number;
    selectedSnapshotTrack?: string | null;
  };
  expansionReason?: string | null;
  requestedLocation?: string | null;
  discoverySummary?: {
    mode: string;
    strictQueriesExecuted: number;
    fallbackQueriesExecuted: number;
    queriesExecuted: number;
    strictYield: number;
    fallbackYield: number;
    stoppedReason?: string | null;
    providerUsage?: Record<string, number> | null;
    groqUsed?: boolean;
  } | null;
  qualityDebug?: {
    totalCandidates: number;
    locationMatchedCount: number;
    locationMatchedPct: number;
    validLocationHintCount: number;
    validLocationHintPct: number;
    nonZeroSkillScoreCount: number;
    nonZeroSkillScorePct: number;
  } | null;
  kpis?: {
    engagementReadyCount: number;
    firstQualifiedCandidateRank: number | null;
  };
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "expired"]);
function isTerminal(status: string | undefined): boolean {
  return !!status && TERMINAL_STATUSES.has(status);
}

function hasEnrichmentInProgress(status: SourcingStatus | undefined): boolean {
  return status?.enrichment?.inProgress === true;
}

export function useSourcingStatus(jobId: number | undefined) {
  const queryClient = useQueryClient();
  const prevStatusRef = useRef<string | undefined>(undefined);
  const prevEnrichmentRef = useRef<boolean>(false);

  const query = useQuery<SourcingStatus>({
    queryKey: ["/api/jobs", jobId, "sourcing-status"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/jobs/${jobId}/sourcing-status`);
      return res.json();
    },
    enabled: !!jobId,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data?.hasRun) return false;
      if (!isTerminal(data.status)) return 7000;
      return hasEnrichmentInProgress(data) ? 7000 : false;
    },
  });

  useEffect(() => {
    const currentStatus = query.data?.status;
    const prevStatus = prevStatusRef.current;
    const currentEnrichment = hasEnrichmentInProgress(query.data);
    const prevEnrichment = prevEnrichmentRef.current;

    prevStatusRef.current = currentStatus;
    prevEnrichmentRef.current = currentEnrichment;

    const runJustCompleted = currentStatus && prevStatus && !isTerminal(prevStatus) && isTerminal(currentStatus);
    const enrichmentChanged = currentEnrichment !== prevEnrichment;

    if (runJustCompleted || currentEnrichment || enrichmentChanged) {
      queryClient.invalidateQueries({
        queryKey: ["/api/jobs", jobId, "sourced-candidates"],
      });
    }
  }, [
    query.data?.status,
    query.data?.enrichment?.inProgress,
    query.data?.enrichment?.enrichedCount,
    query.data?.enrichment?.pendingCount,
    jobId,
    queryClient,
  ]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isPolling: !!query.data?.hasRun && (!isTerminal(query.data?.status) || hasEnrichmentInProgress(query.data)),
  };
}

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
      const isMissingTenant = isApiError(error) && error.code === "NO_SIGNAL_TENANT";
      toast({
        title: isMissingTenant ? "Candidate sourcing isn't enabled yet" : "Failed to start sourcing",
        description: isMissingTenant
          ? "Candidate sourcing has not been configured for this organization yet. Please contact your workspace admin."
          : error.message,
        variant: "destructive",
      });
    },
  });

  return {
    trigger: mutation.mutate,
    isPending: mutation.isPending,
  };
}

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
      candidateSnapshot?: Partial<SourcedCandidateForUI>;
    }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/jobs/${jobId}/sourced-candidates/${candidateId}`,
        { state },
      );
      return res.json();
    },
    onMutate: async ({ candidateId, state }) => {
      await queryClient.cancelQueries({
        queryKey: ["/api/jobs", jobId, "sourced-candidates"],
      });

      const previous = queryClient.getQueryData<SourcedCandidatesResponse>([
        "/api/jobs",
        jobId,
        "sourced-candidates",
      ]);

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
    onSuccess: (_data, { candidateId, state, candidateSnapshot }) => {
      const cached = queryClient.getQueryData<SourcedCandidatesResponse>(
        ["/api/jobs", jobId, "sourced-candidates"],
      )?.candidates.find((c) => c.id === candidateId);
      const c = candidateSnapshot ?? cached;
      const eventName = state === "shortlisted" ? "shortlist_clicked" : state === "hidden" ? "hide_clicked" : "candidate_state_changed";
      trackEvent(eventName, {
        job_id: jobId ?? 0,
        candidate_id: candidateId,
        signal_rank: c?.signalRank ?? 0,
        fit_score: c?.fitScore ?? 0,
        source_type: c?.sourceType ?? "",
        match_tier: c?.matchTier ?? "",
        engagement_ready: c?.engagementReady ?? false,
        location_match_type: c?.locationMatchType ?? "",
      });
    },
    onError: (error: Error, _vars, context) => {
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
