import { useState, useMemo } from "react";
import { useParams } from "wouter";
import Layout from "@/components/Layout";
import { JobSubNav } from "@/components/JobSubNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Loader2, AlertCircle, Sparkles, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

type TabValue = "all" | "talent_pool" | "newly_discovered";
type SortKey = "fitScore" | "source" | "freshness";

const SOURCE_PRIORITY: Record<string, number> = {
  pool_enriched: 0,
  pool: 1,
  discovered: 2,
};

function sortCandidates(
  candidates: SourcedCandidateForUI[],
  sortBy: SortKey,
): SourcedCandidateForUI[] {
  const sorted = [...candidates];
  switch (sortBy) {
    case "fitScore":
      return sorted.sort(
        (a, b) => (b.fitScore ?? -1) - (a.fitScore ?? -1) || a.id - b.id,
      );
    case "source":
      return sorted.sort(
        (a, b) =>
          (SOURCE_PRIORITY[a.sourceType] ?? 9) -
            (SOURCE_PRIORITY[b.sourceType] ?? 9) ||
          (b.fitScore ?? -1) - (a.fitScore ?? -1) ||
          a.id - b.id,
      );
    case "freshness":
      return sorted.sort(
        (a, b) =>
          (a.freshness.enrichedDaysAgo ?? 999) -
            (b.freshness.enrichedDaysAgo ?? 999) || a.id - b.id,
      );
    default:
      return sorted;
  }
}

function filterCandidates(
  candidates: SourcedCandidateForUI[],
  tab: TabValue,
  filters: SourcingFilterState,
): SourcedCandidateForUI[] {
  return candidates.filter((c) => {
    // Tab filter
    if (tab === "talent_pool" && c.displayBucket !== "talent_pool") return false;
    if (tab === "newly_discovered" && c.displayBucket !== "newly_discovered")
      return false;

    // Identity status filter
    if (
      filters.identityStatus.length > 0 &&
      !filters.identityStatus.includes(
        c.identitySummary?.displayStatus || "",
      )
    )
      return false;

    // Enriched only
    if (filters.enrichedOnly && c.freshness.enrichedDaysAgo == null)
      return false;

    // Location
    if (filters.location) {
      const loc = (
        c.locationHint ||
        c.snapshot?.location ||
        ""
      ).toLowerCase();
      if (!loc.includes(filters.location.toLowerCase())) return false;
    }

    // Seniority
    if (filters.seniority !== "all") {
      const band = (c.snapshot?.seniorityBand || "").toLowerCase();
      if (!band.includes(filters.seniority.toLowerCase())) return false;
    }

    // Candidate state
    if (
      filters.candidateState.length > 0 &&
      !filters.candidateState.includes(c.state)
    )
      return false;

    return true;
  });
}

export default function JobSourcingPage() {
  const params = useParams<{ id: string }>();
  const jobId = params.id ? parseInt(params.id, 10) : undefined;

  const [activeTab, setActiveTab] = useState<TabValue>("all");
  const [selectedCandidate, setSelectedCandidate] =
    useState<SourcedCandidateForUI | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filters, setFilters] = useState<SourcingFilterState>(defaultFilters);
  const [sortBy, setSortBy] = useState<SortKey>("fitScore");

  const { data: status, isLoading: statusLoading, isPolling } = useSourcingStatus(jobId);
  const { data: candidatesData, isLoading: candidatesLoading } = useSourcedCandidates(jobId);
  const { trigger: findCandidates, isPending: findPending } = useFindCandidates(jobId);
  const { update: updateState, isPending: updatePending } = useUpdateCandidateState(jobId);

  const allCandidates = candidatesData?.candidates ?? [];
  const counts = candidatesData?.counts ?? { total: 0, talentPool: 0, newlyDiscovered: 0 };

  const filteredCandidates = useMemo(
    () => sortCandidates(filterCandidates(allCandidates, activeTab, filters), sortBy),
    [allCandidates, activeTab, filters, sortBy],
  );

  // Keep selected candidate in sync with updated data
  const liveSelected = selectedCandidate
    ? allCandidates.find((c) => c.id === selectedCandidate.id) ?? selectedCandidate
    : null;

  const hasRun = status?.hasRun ?? false;
  const runStatus = status?.status;
  const isRunning = hasRun && !["completed", "failed", "expired"].includes(runStatus ?? "");
  const isFailed = runStatus === "failed";
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

  const handleDrawerUpdateState = (
    candidateId: number,
    state: "new" | "shortlisted" | "hidden",
  ) => {
    updateState({ candidateId, state });
  };

  return (
    <Layout>
      <JobSubNav jobId={jobId ?? 0} />

      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold">Sourcing</h1>
            {isPolling && (
              <div className="flex items-center gap-2 mt-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  Searching for candidates...
                  {status?.candidateCount != null && status.candidateCount > 0 && (
                    <> ({status.candidateCount} found so far)</>
                  )}
                </span>
              </div>
            )}
          </div>
          <Button
            onClick={() => findCandidates()}
            disabled={findPending || isRunning}
            size="sm"
          >
            {findPending || isRunning ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Search className="h-4 w-4 mr-1.5" />
            )}
            {isRunning ? "Searching..." : "Find Candidates"}
          </Button>
        </div>

        {/* Progress bar when running */}
        {isRunning && (
          <Progress value={undefined} className="h-1.5 mb-4" />
        )}

        {/* Error state */}
        {isFailed && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 mb-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Sourcing failed</p>
              {status?.errorMessage && (
                <p className="text-xs text-muted-foreground mt-0.5">{status.errorMessage}</p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => findCandidates()}
              disabled={findPending}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Empty state — no run yet */}
        {!hasRun && !statusLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="rounded-full bg-primary/10 p-4 mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-2">
              Find top candidates for this role
            </h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Search our talent pool and discover new candidates that match your
              job requirements.
            </p>
            <Button
              onClick={() => findCandidates()}
              disabled={findPending}
            >
              {findPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-1.5" />
              )}
              Find Candidates
            </Button>
          </div>
        )}

        {/* Completed, 0 candidates */}
        {isCompleted && counts.total === 0 && !candidatesLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              No matching candidates found for this role.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => findCandidates()}
              disabled={findPending}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Candidate list */}
        {(counts.total > 0 || candidatesLoading) && (
          <>
            {/* Stats ribbon */}
            <div className="flex gap-4 mb-4">
              <Badge variant="secondary" className="text-xs">
                Total: {counts.total}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Talent Pool: {counts.talentPool}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Discovered: {counts.newlyDiscovered}
              </Badge>
            </div>

            {/* Tabs */}
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as TabValue)}
              className="mb-4"
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="talent_pool">Talent Pool</TabsTrigger>
                <TabsTrigger value="newly_discovered">
                  Newly Discovered
                </TabsTrigger>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <TabsTrigger value="unlocked" disabled className="gap-1 opacity-50">
                        <Lock className="h-3 w-3" />
                        Unlocked
                      </TabsTrigger>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Coming soon</TooltipContent>
                </Tooltip>
              </TabsList>
            </Tabs>

            {/* Filter bar */}
            <div className="mb-4">
              <SourcingFilters
                filters={filters}
                onChange={setFilters}
                sortBy={sortBy}
                onSortChange={(s) => setSortBy(s as SortKey)}
                resultCount={filteredCandidates.length}
                totalCount={counts.total}
              />
            </div>

            {/* List */}
            {candidatesLoading ? (
              <SourcingListSkeleton />
            ) : (
              <div className="space-y-3">
                {filteredCandidates.map((c) => (
                  <CandidateCard
                    key={c.id}
                    candidate={c}
                    onClick={() => handleCardClick(c)}
                    onShortlist={() => handleShortlistToggle(c)}
                    isUpdating={updatePending}
                  />
                ))}
                {filteredCandidates.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No candidates match your current filters.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Candidate Drawer */}
      <CandidateDrawer
        candidate={liveSelected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onUpdateState={handleDrawerUpdateState}
        isUpdating={updatePending}
      />
    </Layout>
  );
}
