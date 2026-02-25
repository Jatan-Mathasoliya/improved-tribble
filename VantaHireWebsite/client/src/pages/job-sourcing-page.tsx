import { useMemo, useState, useEffect } from "react";
import { trackEvent } from "@/lib/analytics";
import { useParams } from "wouter";
import Layout from "@/components/Layout";
import { JobSubNav } from "@/components/JobSubNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Loader2, AlertCircle, Sparkles, ChevronDown, ChevronRight } from "lucide-react";
import {
  useSourcingStatus,
  useSourcedCandidates,
  useFindCandidates,
  useUpdateCandidateState,
  type SourcedCandidateForUI,
} from "@/hooks/use-sourcing";
import { CandidateCard } from "@/components/sourcing/CandidateCard";
import { CandidateDrawer } from "@/components/sourcing/CandidateDrawer";
import {
  SourcingFilters,
  defaultFilters,
  type SourcingFilterState,
} from "@/components/sourcing/SourcingFilters";
import { SourcingListSkeleton } from "@/components/skeletons";
import { splitByTier } from "@/lib/sourcing-tiering";

type SortKey = "fitScore" | "source" | "freshness";

const SOURCE_PRIORITY: Record<string, number> = {
  pool_enriched: 0,
  pool: 1,
  discovered: 2,
};

function sortCandidates(candidates: SourcedCandidateForUI[], sortBy: SortKey): SourcedCandidateForUI[] {
  const sorted = [...candidates];
  switch (sortBy) {
    case "fitScore":
      return sorted.sort((a, b) => (b.fitScore ?? -1) - (a.fitScore ?? -1) || a.id - b.id);
    case "source":
      return sorted.sort(
        (a, b) =>
          (SOURCE_PRIORITY[a.sourceType] ?? 9) - (SOURCE_PRIORITY[b.sourceType] ?? 9) ||
          (b.fitScore ?? -1) - (a.fitScore ?? -1) ||
          a.id - b.id,
      );
    case "freshness":
      return sorted.sort(
        (a, b) =>
          (a.freshness.enrichedDaysAgo ?? 999) - (b.freshness.enrichedDaysAgo ?? 999) ||
          a.id - b.id,
      );
    default:
      return sorted;
  }
}

function filterCandidates(candidates: SourcedCandidateForUI[], filters: SourcingFilterState): SourcedCandidateForUI[] {
  return candidates.filter((c) => {
    if (filters.identityStatus !== "all" && c.identitySummary?.displayStatus !== filters.identityStatus) {
      return false;
    }

    if (filters.enrichedOnly && c.freshness.enrichedDaysAgo == null) {
      return false;
    }

    if (filters.location) {
      const loc = (c.locationHint || c.snapshot?.location || "").toLowerCase();
      if (!loc.includes(filters.location.toLowerCase())) return false;
    }

    if (filters.seniority !== "all") {
      const band = (c.snapshot?.seniorityBand || "").toLowerCase();
      if (!band.includes(filters.seniority.toLowerCase())) return false;
    }

    if (filters.candidateState !== "all" && c.state !== filters.candidateState) {
      return false;
    }

    return true;
  });
}

function getExpansionReasonText(reason?: string | null, requestedLocation?: string | null): string | null {
  if (!reason) return null;
  switch (reason) {
    case "strict_low_quality":
      return requestedLocation
        ? `Matches in ${requestedLocation} were low confidence, so we expanded the search.`
        : "Top strict matches were low confidence, so we expanded the search.";
    case "insufficient_strict_location_matches":
      return requestedLocation
        ? `Not enough strong matches were found in ${requestedLocation}, so we expanded the search.`
        : "Not enough strong strict matches were found, so we expanded the search.";
    case "expanded_location_results":
      return requestedLocation
        ? `To increase results, we looked beyond ${requestedLocation}.`
        : "To increase results, we broadened the search criteria.";
    default:
      return "We expanded the search to return more relevant candidates.";
  }
}

export default function JobSourcingPage() {
  const params = useParams<{ id: string }>();
  const jobId = params.id ? parseInt(params.id, 10) : undefined;

  const [selectedCandidate, setSelectedCandidate] = useState<SourcedCandidateForUI | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filters, setFilters] = useState<SourcingFilterState>(defaultFilters);
  const [sortBy, setSortBy] = useState<SortKey>("fitScore");
  const [bestMatchesOnly, setBestMatchesOnly] = useState(true);
  const [showBroader, setShowBroader] = useState(false);

  const { data: status, isLoading: statusLoading, isPolling } = useSourcingStatus(jobId);
  const { data: candidatesData, isLoading: candidatesLoading } = useSourcedCandidates(jobId);
  const { trigger: findCandidates, isPending: findPending } = useFindCandidates(jobId);
  const { update: updateState, isPending: updatePending } = useUpdateCandidateState(jobId);

  const allCandidates = candidatesData?.candidates ?? [];
  const counts = candidatesData?.counts ?? { total: 0, talentPool: 0, newlyDiscovered: 0 };

  const filteredSorted = useMemo(
    () => sortCandidates(filterCandidates(allCandidates, filters), sortBy),
    [allCandidates, filters, sortBy],
  );

  const grouped = useMemo(() => splitByTier(filteredSorted), [filteredSorted]);

  const bestMatches = grouped.bestMatches;
  const broaderPool = grouped.broaderPool;

  // Detect all-broader edge case: explicit tier data exists, but zero best matches
  const allBroader = grouped.tierModel === "explicit" && bestMatches.length === 0 && broaderPool.length > 0;

  // Auto-disable bestMatchesOnly when all candidates are broader pool
  useEffect(() => {
    if (allBroader && bestMatchesOnly) {
      setBestMatchesOnly(false);
      trackEvent("sourcing_all_broader_auto_expand", {
        location: "job_sourcing",
        job_id: jobId ?? 0,
        broader_count: broaderPool.length,
        tier_model: grouped.tierModel,
        all_broader_mode: true,
      });
    }
  }, [allBroader]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleCandidates = bestMatchesOnly && !allBroader ? bestMatches : [...bestMatches, ...broaderPool];
  const handleBestMatchesOnlyChange = (checked: boolean) => {
    setBestMatchesOnly(checked);
    trackEvent("sourcing_best_matches_only_toggled", {
      location: "job_sourcing",
      job_id: jobId ?? 0,
      enabled: checked,
      has_broader_pool: broaderPool.length > 0,
      tier_model: grouped.tierModel,
      total_candidates: counts.total,
      all_broader_mode: allBroader,
    });
  };

  const requestedLocation = candidatesData?.requestedLocation || filters.location || null;
  const expansionReason = candidatesData?.expansionReason;
  const expansionReasonText = getExpansionReasonText(expansionReason, requestedLocation);

  const liveSelected = selectedCandidate
    ? allCandidates.find((c) => c.id === selectedCandidate.id) ?? selectedCandidate
    : null;

  const hasRun = status?.hasRun ?? false;
  const runStatus = status?.status;
  const enrichment = status?.enrichment;
  const enrichmentInProgress = enrichment?.inProgress === true;
  const isSourcingActive = hasRun && !["completed", "failed", "expired"].includes(runStatus ?? "");
  const isRunning = isSourcingActive || enrichmentInProgress;
  const isFailed = runStatus === "failed";
  const isExpired = runStatus === "expired";
  const isCompleted = runStatus === "completed";

  const handleCardClick = (c: SourcedCandidateForUI) => {
    setSelectedCandidate(c);
    setDrawerOpen(true);
  };

  const handleShortlistToggle = (c: SourcedCandidateForUI) => {
    updateState({
      candidateId: c.id,
      state: c.state === "shortlisted" ? "new" : "shortlisted",
    });
  };

  const renderList = (candidates: SourcedCandidateForUI[]) => {
    if (candidatesLoading) {
      return <SourcingListSkeleton />;
    }

    if (candidates.length === 0) {
      return <p className="text-sm text-muted-foreground text-center py-8">No candidates match your current filters.</p>;
    }

    return (
      <div className="space-y-3">
        {candidates.map((c) => (
          <CandidateCard
            key={c.id}
            candidate={c}
            onClick={() => handleCardClick(c)}
            onShortlist={() => handleShortlistToggle(c)}
            isUpdating={updatePending}
          />
        ))}
      </div>
    );
  };

  return (
    <Layout>
      <JobSubNav jobId={jobId ?? 0} />

      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold">Sourcing</h1>
            {isPolling && (
              <div className="flex items-center gap-2 mt-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  {isSourcingActive
                    ? "Searching for candidates..."
                    : "Enrichment in progress..."}
                  {isSourcingActive && status?.candidateCount != null && status.candidateCount > 0 && (
                    <> ({status.candidateCount} found so far)</>
                  )}
                  {!isSourcingActive && enrichmentInProgress && (
                    <> ({enrichment?.enrichedCount ?? 0}/{enrichment?.totalCandidates ?? 0} enriched)</>
                  )}
                </span>
              </div>
            )}
          </div>
          <Button onClick={() => findCandidates()} disabled={findPending || isRunning} size="sm">
            {findPending || isRunning ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Search className="h-4 w-4 mr-1.5" />
            )}
            {isRunning ? "Searching..." : "Find Candidates"}
          </Button>
        </div>

        {isRunning && (
          <Progress
            value={isSourcingActive ? undefined : enrichment?.percent}
            className="h-1.5 mb-4"
          />
        )}

        {!isFailed && !isExpired && enrichmentInProgress && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 mb-4">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              We are still enriching candidate profiles in the background.
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              {enrichment?.enrichedCount ?? 0} of {enrichment?.totalCandidates ?? 0} profiles enriched so far. This list updates automatically.
            </p>
          </div>
        )}

        {isFailed && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 mb-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Sourcing failed</p>
              {status?.errorMessage && <p className="text-xs text-muted-foreground mt-0.5">{status.errorMessage}</p>}
            </div>
            <Button variant="outline" size="sm" onClick={() => findCandidates()} disabled={findPending}>
              Retry
            </Button>
          </div>
        )}

        {isExpired && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 mb-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Sourcing run expired</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                The search timed out. This can happen if results take longer than expected.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => findCandidates()} disabled={findPending}>
              Retry
            </Button>
          </div>
        )}

        {!hasRun && !statusLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-primary/10 p-4 mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Find top candidates for this role</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              We will prioritize the strongest matches first and clearly separate broader results when location or fit constraints are expanded.
            </p>
            <Button onClick={() => findCandidates()} disabled={findPending}>
              {findPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Search className="h-4 w-4 mr-1.5" />}
              Find Candidates
            </Button>
          </div>
        )}

        {isCompleted && counts.total === 0 && !candidatesLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground mb-4">No matching candidates found for this role.</p>
            <Button variant="outline" size="sm" onClick={() => findCandidates()} disabled={findPending}>
              Retry
            </Button>
          </div>
        )}

        {(counts.total > 0 || candidatesLoading) && (
          <>
            <div className={`grid grid-cols-1 ${grouped.tierModel !== "fallback" && !allBroader ? "sm:grid-cols-3" : "sm:grid-cols-1"} gap-3 mb-4`}>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">
                    {allBroader ? "Broader Pool Results" : "Total"}
                  </p>
                  <p className="text-base font-semibold">{counts.total}</p>
                </CardContent>
              </Card>
              {grouped.tierModel !== "fallback" && !allBroader && (
                <>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Best Matches</p>
                      <p className="text-base font-semibold">{bestMatches.length}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Broader Pool</p>
                      <p className="text-base font-semibold">{broaderPool.length}</p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {allBroader && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 mb-4">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  {requestedLocation
                    ? `We couldn't find enough strong matches in ${requestedLocation}. Showing broader matches.`
                    : "We couldn't find enough strong direct matches. Showing broader matches."}
                </p>
                {expansionReasonText && (
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    Why this happened: {expansionReasonText}
                  </p>
                )}
              </div>
            )}

            {!allBroader && !bestMatchesOnly && broaderPool.length > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 mb-4">
                <p className="text-sm text-warning-foreground font-medium">
                  {requestedLocation
                    ? `Found ${bestMatches.length} strong matches in ${requestedLocation}. Also showing ${broaderPool.length} broader matches.`
                    : `Showing ${broaderPool.length} broader matches in addition to best matches.`}
                </p>
                {(expansionReasonText || grouped.tierModel !== "fallback") && (
                  <p className="text-xs text-warning-foreground/80 mt-1">
                    Why this happened: {expansionReasonText || "We expanded the search to include additional relevant profiles."}
                  </p>
                )}
              </div>
            )}

            <div className="mb-4">
              <SourcingFilters
                filters={filters}
                onChange={setFilters}
                sortBy={sortBy}
                onSortChange={(s) => setSortBy(s as SortKey)}
                resultCount={visibleCandidates.length}
                totalCount={counts.total}
                bestMatchesOnly={bestMatchesOnly}
                onBestMatchesOnlyChange={handleBestMatchesOnlyChange}
                hasTierData={grouped.tierModel !== "fallback"}
                allBroader={allBroader}
              />
            </div>

            <div className="space-y-6">
              {allBroader ? (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-medium text-muted-foreground">
                      {requestedLocation ? `Broader Matches for ${requestedLocation}` : "Broader Pool Results"}
                    </h2>
                    <Badge variant="secondary">{broaderPool.length}</Badge>
                  </div>
                  {renderList(broaderPool)}
                </section>
              ) : (
                <>
                  <section>
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-sm font-medium text-muted-foreground">
                        {grouped.tierModel === "fallback"
                          ? "Candidates"
                          : requestedLocation ? `Best Matches in ${requestedLocation}` : "Best Matches"}
                      </h2>
                      <Badge variant="secondary">{bestMatches.length}</Badge>
                    </div>
                    {renderList(bestMatches)}
                  </section>

                  {!bestMatchesOnly && broaderPool.length > 0 && (
                    <section>
                      <button
                        type="button"
                        className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground"
                        onClick={() => setShowBroader((v) => !v)}
                      >
                        {showBroader ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        Broader Pool ({broaderPool.length})
                      </button>
                      {showBroader && renderList(broaderPool)}
                    </section>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <CandidateDrawer
        candidate={liveSelected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onUpdateState={(candidateId, state) => updateState({ candidateId, state })}
        isUpdating={updatePending}
      />
    </Layout>
  );
}
