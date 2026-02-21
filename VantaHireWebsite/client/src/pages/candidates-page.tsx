import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Redirect, useLocation } from "wouter";
import {
  Users,
  Search,
  Mail,
  Briefcase,
  Calendar,
  Star,
  Tag,
  Sparkles,
  FileText,
  ArrowRightLeft,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Layout from "@/components/Layout";
import { SubNav, type SubNavItem } from "@/components/SubNav";
import { MoveCandidateToJobDialog } from "@/components/recruiter/MoveCandidateToJobDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Candidate {
  email: string;
  name: string;
  jobsAppliedCount: number;
  lastApplicationDate: string;
  highestRating: number | null;
  allTags: string[];
}

interface SemanticResult {
  applicationId: number;
  name: string;
  email: string | null;
  phone: string | null;
  currentJobId: number | null;
  currentJobTitle: string | null;
  currentStageId: number | null;
  currentStageName: string | null;
  matchScore: number;
  matchedChunks: number;
  highlights: string[];
  resume: {
    resumeFilename: string | null;
    signedUrl: string | null;
    expiresAt: string | null;
  };
  source?: string | null;
  isExternal?: boolean;
  canMoveToJob?: boolean;
  canOpenResume?: boolean;
}

interface SemanticSearchResponse {
  query: string;
  count: number;
  results: SemanticResult[];
  candidates: SemanticResult[];
}

const TAB_ITEMS: SubNavItem[] = [
  { id: "all", label: "All Candidates", icon: <Users className="h-4 w-4" /> },
  { id: "semantic", label: "Semantic Search", icon: <Sparkles className="h-4 w-4" /> },
];

export default function CandidatesPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("all");

  // ── All Candidates state ────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [minRatingFilter, setMinRatingFilter] = useState<number | undefined>(undefined);

  // ── Semantic Search state ───────────────────────────────────────
  const [semanticQuery, setSemanticQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [moveCandidate, setMoveCandidate] = useState<SemanticResult | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);

  if (!user || !['recruiter', 'super_admin'].includes(user.role)) {
    return <Redirect to="/auth" />;
  }

  // ── All Candidates query ────────────────────────────────────────
  const { data: candidates = [], isLoading } = useQuery<Candidate[]>({
    queryKey: ["/api/candidates", searchQuery, minRatingFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      if (minRatingFilter) params.append('minRating', minRatingFilter.toString());

      const response = await fetch(`/api/candidates?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch candidates");
      return response.json();
    },
  });

  // ── Semantic Search query ───────────────────────────────────────
  const semanticSearchQuery = useQuery<SemanticSearchResponse, Error>({
    queryKey: ["/api/candidates/semantic-search", user.id, user.role, submittedQuery],
    enabled: submittedQuery.trim().length > 0,
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/candidates/semantic-search", {
        query: submittedQuery,
        top_k: 20,
        use_reranker: true,
      });
      return res.json();
    },
  });

  const handleSemanticSearch = () => {
    const q = semanticQuery.trim();
    if (!q) return;
    if (q === submittedQuery) {
      void semanticSearchQuery.refetch();
      return;
    }
    setSubmittedQuery(q);
  };

  const handleOpenResume = (result: SemanticResult) => {
    if (result.isExternal && result.resume.signedUrl) {
      window.open(result.resume.signedUrl, "_blank", "noopener");
      return;
    }
    // Match kanban/job-tracking behavior: always use permission-gated resume endpoint.
    window.open(`/api/applications/${result.applicationId}/resume?download=1`, "_blank", "noopener");
  };

  const handleMoveClick = (result: SemanticResult) => {
    setMoveCandidate(result);
    setMoveDialogOpen(true);
  };

  const handleMoveSuccess = () => {
    const q = submittedQuery.trim();
    if (!q) return;
    void semanticSearchQuery.refetch();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleCandidateClick = (email: string) => {
    setLocation(`/applications?email=${encodeURIComponent(email)}`);
  };

  const semanticResults = semanticSearchQuery.data?.results ?? [];

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Users className="h-7 w-7 text-primary" />
            <h1 className="text-2xl md:text-3xl font-semibold text-foreground">
              Candidates
            </h1>
          </div>
          <p className="text-muted-foreground text-sm md:text-base max-w-2xl">
            View all candidates who have applied to your jobs, aggregated by email
          </p>
        </div>

        {/* Tab Navigation */}
        <SubNav items={TAB_ITEMS} activeId={activeTab} onChange={setActiveTab} className="mb-6" />

        {/* ── All Candidates Tab ──────────────────────────────────── */}
        {activeTab === "all" && (
          <>
            {/* Search & Filters */}
            <Card className="mb-6 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name or email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium text-foreground">Min Rating:</Label>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <Button
                          key={rating}
                          variant={minRatingFilter === rating ? "default" : "outline"}
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setMinRatingFilter(minRatingFilter === rating ? undefined : rating)}
                        >
                          {rating}
                          <Star className="h-3 w-3 ml-1" />
                        </Button>
                      ))}
                    </div>
                    {minRatingFilter && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMinRatingFilter(undefined)}
                      >
                        Clear
                      </Button>
                    )}
                  </div>

                  <div className="ml-auto text-sm text-muted-foreground">
                    {candidates.length} candidate{candidates.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Candidates Table */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>All Candidates</CardTitle>
                <CardDescription>
                  Click on a candidate to view all their applications
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                    <p className="text-muted-foreground mt-4">Loading candidates...</p>
                  </div>
                ) : candidates.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                    <p className="text-muted-foreground">No candidates found</p>
                    {(searchQuery || minRatingFilter) && (
                      <p className="text-muted-foreground text-sm mt-2">
                        Try adjusting your filters
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-semibold">Name</TableHead>
                          <TableHead className="font-semibold">Email</TableHead>
                          <TableHead className="font-semibold text-center">Jobs Applied</TableHead>
                          <TableHead className="font-semibold">Last Application</TableHead>
                          <TableHead className="font-semibold text-center">Highest Rating</TableHead>
                          <TableHead className="font-semibold">Tags</TableHead>
                          <TableHead className="font-semibold text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {candidates.map((candidate) => (
                          <TableRow
                            key={candidate.email}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => handleCandidateClick(candidate.email)}
                          >
                            <TableCell className="font-medium">{candidate.name}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm">{candidate.email}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="font-mono">
                                <Briefcase className="h-3 w-3 mr-1" />
                                {candidate.jobsAppliedCount}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar className="h-4 w-4" />
                                {formatDate(candidate.lastApplicationDate)}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              {candidate.highestRating !== null ? (
                                <Badge variant="outline" className="font-mono">
                                  <Star className="h-3 w-3 mr-1 fill-amber-400 text-warning" />
                                  {candidate.highestRating}/5
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {candidate.allTags && candidate.allTags.length > 0 ? (
                                  candidate.allTags.slice(0, 3).map((tag, idx) => (
                                    <Badge key={idx} variant="outline" className="text-xs">
                                      <Tag className="h-2 w-2 mr-1" />
                                      {tag}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-muted-foreground text-sm">—</span>
                                )}
                                {candidate.allTags && candidate.allTags.length > 3 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{candidate.allTags.length - 3}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCandidateClick(candidate.email);
                                }}
                              >
                                View Applications
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* ── Semantic Search Tab ─────────────────────────────────── */}
        {activeTab === "semantic" && (
          <>
            {/* Search Bar */}
            <Card className="mb-6 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="relative">
                      <Sparkles className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Describe the candidate you're looking for, e.g. 'React developer with 3+ years experience'..."
                        value={semanticQuery}
                        onChange={(e) => setSemanticQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSemanticSearch();
                        }}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleSemanticSearch}
                    disabled={!semanticQuery.trim() || semanticSearchQuery.isFetching}
                  >
                    {semanticSearchQuery.isFetching ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4 mr-2" />
                    )}
                    Search
                  </Button>
                </div>
                {submittedQuery && semanticSearchQuery.isSuccess && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {semanticResults.length} result{semanticResults.length !== 1 ? "s" : ""} for "{submittedQuery}"
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Semantic Results */}
            {semanticSearchQuery.isFetching && (
              <div className="text-center py-12">
                <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
                <p className="text-muted-foreground mt-4">Searching candidates...</p>
              </div>
            )}

            {semanticSearchQuery.isError && (
              <Card className="shadow-sm">
                <CardContent className="p-6 text-center">
                  <AlertCircle className="h-12 w-12 text-destructive/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    {semanticSearchQuery.error?.message || "Search failed. Please try again."}
                  </p>
                </CardContent>
              </Card>
            )}

            {semanticSearchQuery.isSuccess && semanticResults.length === 0 && (
              <Card className="shadow-sm">
                <CardContent className="p-6 text-center">
                  <Search className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                  <p className="text-muted-foreground">No matching candidates found</p>
                  <p className="text-muted-foreground text-sm mt-2">
                    Try a different search query
                  </p>
                </CardContent>
              </Card>
            )}

            {semanticSearchQuery.isSuccess && semanticResults.length > 0 && (
              <div className="space-y-3">
                {semanticResults.map((result) => (
                  <Card key={result.applicationId} className="shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        {/* Candidate Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="font-semibold text-foreground truncate">
                              {result.name}
                            </h3>
                            <Badge
                              variant={result.matchScore >= 80 ? "default" : result.matchScore >= 50 ? "secondary" : "outline"}
                              className="font-mono text-xs shrink-0"
                            >
                              {result.matchScore}% match
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mb-2">
                            <span className="flex items-center gap-1">
                              <Mail className="h-3.5 w-3.5" />
                              {result.email ?? "Email unavailable"}
                            </span>
                            {result.source && (
                              <Badge variant="secondary" className="text-xs">
                                {result.source}
                              </Badge>
                            )}
                            {result.currentJobTitle && (
                              <span className="flex items-center gap-1">
                                <Briefcase className="h-3.5 w-3.5" />
                                {result.currentJobTitle}
                              </span>
                            )}
                            {result.currentStageName && (
                              <Badge variant="outline" className="text-xs">
                                {result.currentStageName}
                              </Badge>
                            )}
                          </div>

                          {/* Highlights */}
                          {result.highlights.length > 0 && (
                            <div className="space-y-1 mt-2">
                              {result.highlights.map((highlight, idx) => (
                                <p
                                  key={idx}
                                  className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 line-clamp-2"
                                >
                                  {highlight}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-2 shrink-0">
                          {(result.canOpenResume ?? Boolean(result.resume.resumeFilename || result.resume.signedUrl)) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenResume(result)}
                            >
                              <FileText className="h-4 w-4 mr-1" />
                              Resume
                            </Button>
                          )}
                          {result.canMoveToJob !== false && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleMoveClick(result)}
                            >
                              <ArrowRightLeft className="h-4 w-4 mr-1" />
                              Add to Job
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Empty state before any search */}
            {!semanticSearchQuery.isFetching &&
              !semanticSearchQuery.isSuccess &&
              !semanticSearchQuery.isError && (
              <Card className="shadow-sm">
                <CardContent className="p-12 text-center">
                  <Sparkles className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    Semantic Candidate Search
                  </h3>
                  <p className="text-muted-foreground text-sm max-w-md mx-auto">
                    Search your candidate pool using natural language. Describe the skills,
                    experience, or qualifications you're looking for.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Move Dialog */}
        <MoveCandidateToJobDialog
          open={moveDialogOpen}
          onOpenChange={setMoveDialogOpen}
          candidate={moveCandidate}
          searchQuery={submittedQuery}
          onMoveSuccess={handleMoveSuccess}
        />
      </div>
    </Layout>
  );
}
