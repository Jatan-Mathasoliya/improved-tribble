import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { Helmet } from "react-helmet-async";
import { Search, MapPin, Clock, Filter, Briefcase, ArrowUpDown, X, User, IndianRupee } from "lucide-react";
import { DEFAULT_SITE_URL } from "@/lib/seoHelpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Job } from "@shared/schema";
import Layout from "@/components/Layout";
import { FilterPanel, MobileFilterSheet } from "@/components/FilterPanel";

interface JobWithRecruiter extends Job {
  postedByName?: string;
  postedById?: number | string; // Can be publicId (string) or numeric ID
  isRecruiterProfilePublic?: boolean;
}

interface JobsResponse {
  jobs: JobWithRecruiter[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function JobsPage() {
  const searchParams = new URLSearchParams(useSearch());
  const [, setUrlLocation] = useLocation();
  const queryClient = useQueryClient();

  // Initialize state from URL params
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1", 10));
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [location, setLocationFilter] = useState(searchParams.get("location") || "");
  const [type, setType] = useState(searchParams.get("type") || "all");
  const [minSalary, setMinSalary] = useState(searchParams.get("minSalary") || "");
  const [maxSalary, setMaxSalary] = useState(searchParams.get("maxSalary") || "");
  const [salaryPeriod, setSalaryPeriod] = useState(searchParams.get("salaryPeriod") || "per_year");

  const [sortBy, setSortBy] = useState<string>(searchParams.get("sortBy") || "recent");
  const [isVisible, setIsVisible] = useState(false);

  // Fade-in animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 200);
    return () => clearTimeout(timer);
  }, []);

  // Fetch AI feature flag (standardized endpoint)
  const { data: aiFeatures } = useQuery<{ resumeAdvisor: boolean; fitScoring: boolean }>({
    queryKey: ["/api/ai/features"],
    queryFn: async () => {
      const response = await fetch("/api/ai/features");
      if (!response.ok) return { resumeAdvisor: false, fitScoring: false };
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
  // Derive enabled flag for backward compatibility
  const aiEnabled = aiFeatures?.resumeAdvisor || aiFeatures?.fitScoring;

  // Fetch jobs from API
  const { data, isLoading, error } = useQuery<JobsResponse>({
    queryKey: ["/api/jobs", { page, search, location, type, minSalary, maxSalary, salaryPeriod }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      if (search) params.set("search", search);
      if (location) params.set("location", location);
      if (type && type !== "all") params.set("type", type);
      if (minSalary) params.set("minSalary", minSalary);
      if (maxSalary) params.set("maxSalary", maxSalary);
      if (salaryPeriod) params.set("salaryPeriod", salaryPeriod);

      const response = await fetch(`/api/jobs?${params}`);
      if (!response.ok) throw new Error("Failed to fetch jobs");
      return response.json();
    },
  });

  // Client-side sorting (server doesn't support sortBy yet)
  const sortedJobs = useMemo(() => {
    if (!data?.jobs) return [];

    const jobs = [...data.jobs];

    switch (sortBy) {
      case "recent":
        return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      case "deadline":
        return jobs.sort((a, b) => {
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        });
      case "relevant":
      default:
        return jobs;
    }
  }, [data?.jobs, sortBy]);

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (location) params.set("location", location);
    if (type && type !== "all") params.set("type", type);
    if (minSalary) params.set("minSalary", minSalary);
    if (maxSalary) params.set("maxSalary", maxSalary);
    if (salaryPeriod) params.set("salaryPeriod", salaryPeriod);
    if (sortBy && sortBy !== "recent") params.set("sortBy", sortBy);
    if (page > 1) params.set("page", page.toString());

    const queryString = params.toString();
    setUrlLocation(`/jobs${queryString ? `?${queryString}` : ''}`, { replace: true });
  }, [search, location, type, minSalary, maxSalary, salaryPeriod, sortBy, page, setUrlLocation]);

  // Scroll to top on pagination change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  const handleApplyFilters = () => {
    setPage(1); // Reset to first page when applying filters
  };

  const handleResetFilters = () => {
    setSearch("");
    setLocationFilter("");
    setType("all");
    setMinSalary("");
    setMaxSalary("");
    setSalaryPeriod("per_year");
    setSortBy("recent");
    setPage(1);
  };

  const handleJobCardHover = (jobId: number) => {
    queryClient.prefetchQuery({
      queryKey: ["/api/jobs", jobId.toString()],
      queryFn: async () => {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (!response.ok) throw new Error("Failed to fetch job");
        return response.json();
      },
    });
  };

  // Count active filters (excluding page and default sort)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search) count++;
    if (location) count++;
    if (type && type !== "all") count++;
    if (minSalary) count++;
    if (maxSalary) count++;
    return count;
  }, [search, location, type, minSalary, maxSalary]);

  // Generate dynamic meta tags based on filters and results
  const metaData = useMemo(() => {
    const baseUrl = DEFAULT_SITE_URL;
    const count = data?.pagination.total || 0;

    // Build title with filters
    let title = "Find Jobs";
    if (location) title += ` in ${location}`;
    if (type && type !== "all") {
      const typeLabel = type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
      title += ` - ${typeLabel}`;
    }
    title += " | VantaHire";

    // Build description
    let description = `Browse ${count} open roles across IT, Telecom, Automotive, Fintech, Healthcare.`;
    if (location) description += ` Find opportunities in ${location}.`;
    if (search) description += ` Search: ${search}.`;
    description += " Recruiter-first ATS built for recruiting velocity.";

    // Build canonical URL with query params (include all active filters)
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (location) params.set("location", location);
    if (type && type !== "all") params.set("type", type);
    if (minSalary) params.set("minSalary", minSalary);
    if (maxSalary) params.set("maxSalary", maxSalary);
    if (salaryPeriod) params.set("salaryPeriod", salaryPeriod);
    if (sortBy && sortBy !== "recent") params.set("sortBy", sortBy);
    if (page > 1) params.set("page", page.toString());

    const canonicalUrl = `${baseUrl}/jobs`;

    return { title, description, canonicalUrl, baseUrl };
  }, [location, type, search, minSalary, maxSalary, salaryPeriod, sortBy, page, data?.pagination.total]);

  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatSalary = (min?: number | null, max?: number | null, period?: string | null) => {
    if (!min && !max) return null;
    const currency = "₹";
    const p = period === "per_year" ? "/yr" : period === "per_month" ? "/mo" : "";

    if (min && max) return `${currency}${min.toLocaleString()} - ${currency}${max.toLocaleString()}${p}`;
    if (min) return `From ${currency}${min.toLocaleString()}${p}`;
    if (max) return `Up to ${currency}${max.toLocaleString()}${p}`;
    return null;
  };

  return (
    <Layout>
      <Helmet>
        <title>{metaData.title}</title>
        <meta name="description" content={metaData.description} />
        <link rel="canonical" href={metaData.canonicalUrl} />

        {/* Open Graph */}
        <meta property="og:title" content={metaData.title} />
        <meta property="og:description" content={metaData.description} />
        <meta property="og:url" content={metaData.canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${metaData.baseUrl}/og-image.jpg`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={metaData.title} />
        <meta name="twitter:description" content={metaData.description} />
        <meta name="twitter:image" content={`${metaData.baseUrl}/twitter-image.jpg`} />
      </Helmet>

      <div className="public-theme min-h-screen bg-background text-foreground">
        {/* Premium background effects */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxIiBjeT0iMSIgcj0iMSIgZmlsbD0id2hpdGUiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==')] opacity-10"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px] animate-pulse-slow"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-info/10 rounded-full blur-[100px] animate-pulse-slow" style={{ animationDelay: '1.2s' }}></div>

        <div className={`container mx-auto px-4 py-8 relative z-10 transition-opacity duration-1000 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
          {/* Premium Header */}
          <div className="text-center mb-12 pt-16">
            <div className="w-20 h-1.5 bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8] rounded-full mx-auto mb-6 animate-slide-right"></div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              <span className="animate-gradient-text">Find Your Next</span>
              <br />
              <span className="text-foreground">Dream Opportunity</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed animate-slide-up" style={{ animationDelay: '0.3s' }}>
              Discover exciting career opportunities with leading companies powered by AI-driven matching
            </p>
          </div>

          {/* Two-column layout: Filters + Results */}
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
            {/* Left Sidebar - Desktop Only */}
            <aside className="hidden lg:block">
              <FilterPanel
                search={search}
                setSearch={setSearch}
                location={location}
                setLocation={setLocationFilter}
                type={type}
                setType={setType}
                minSalary={minSalary}
                setMinSalary={setMinSalary}
                maxSalary={maxSalary}
                setMaxSalary={setMaxSalary}
                salaryPeriod={salaryPeriod}
                setSalaryPeriod={setSalaryPeriod}
                onApplyFilters={handleApplyFilters}
                onResetFilters={handleResetFilters}
              />
            </aside>

            {/* Main Content */}
            <main>
              {/* Mobile Filter + Sort Bar */}
              <div className="flex items-center justify-between mb-6 gap-4">
                <div className="lg:hidden flex items-center gap-2">
                  <MobileFilterSheet
                    search={search}
                    setSearch={setSearch}
                    location={location}
                    setLocation={setLocationFilter}
                    type={type}
                    setType={setType}
                    minSalary={minSalary}
                    setMinSalary={setMinSalary}
                    maxSalary={maxSalary}
                    setMaxSalary={setMaxSalary}
                    salaryPeriod={salaryPeriod}
                    setSalaryPeriod={setSalaryPeriod}
                    onApplyFilters={handleApplyFilters}
                    onResetFilters={handleResetFilters}
                  />
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30">
                      {activeFilterCount}
                    </Badge>
                  )}
                </div>

                {/* Sort Dropdown + Reset */}
                <div className="flex items-center gap-2 ml-auto">
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-[180px] bg-muted/30 border-border text-foreground">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">Most Recent</SelectItem>
                      <SelectItem value="deadline">Deadline: Soonest</SelectItem>
                      {aiEnabled && (
                        <SelectItem value="relevant">Most Relevant (AI)</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {activeFilterCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleResetFilters}
                      className="text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Reset
                    </Button>
                  )}
                </div>
              </div>

              {/* Active Filter Chips */}
              {activeFilterCount > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {search && (
                    <Badge variant="secondary" className="bg-muted/50 text-foreground gap-1">
                      Search: {search}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-destructive"
                        onClick={() => setSearch("")}
                      />
                    </Badge>
                  )}
                  {location && (
                    <Badge variant="secondary" className="bg-muted/50 text-foreground gap-1">
                      Location: {location}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-destructive"
                        onClick={() => setLocationFilter("")}
                      />
                    </Badge>
                  )}
                  {type && type !== "all" && (
                    <Badge variant="secondary" className="bg-muted/50 text-foreground gap-1">
                      Type: {type.replace('-', ' ')}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-destructive"
                        onClick={() => setType("all")}
                      />
                    </Badge>
                  )}
                  {minSalary && (
                    <Badge variant="secondary" className="bg-muted/50 text-foreground gap-1">
                      Min Salary: {minSalary}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-destructive"
                        onClick={() => setMinSalary("")}
                      />
                    </Badge>
                  )}
                  {maxSalary && (
                    <Badge variant="secondary" className="bg-muted/50 text-foreground gap-1">
                      Max Salary: {maxSalary}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-destructive"
                        onClick={() => setMaxSalary("")}
                      />
                    </Badge>
                  )}
                </div>
              )}

              {/* Results */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="text-foreground mt-4">Loading jobs...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-destructive">Error loading jobs. Please try again.</p>
          </div>
        ) : data?.jobs.length === 0 ? (
          <div className="text-center py-12">
            <Briefcase className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-foreground text-xl mb-2">No jobs found</p>
            <p className="text-muted-foreground">Try adjusting your search criteria</p>
          </div>
        ) : (
          <>
            {/* Job Count */}
            <div className="mb-6">
              <p className="text-foreground">
                Showing {sortedJobs.length} of {data?.pagination.total} jobs
                {sortBy !== "recent" && <span className="text-muted-foreground ml-2">(sorted by {sortBy === "deadline" ? "deadline" : "AI relevance"})</span>}
              </p>
            </div>

            {/* Job Cards */}
            <div className="grid gap-6 mb-8">
              {sortedJobs.map((job) => {
                const salaryDisplay = formatSalary(job.salaryMin, job.salaryMax, job.salaryPeriod);

                return (
                  <Card
                    key={job.id}
                    data-testid="job-card"
                    className="bg-muted/50 backdrop-blur-sm border-border hover:bg-muted/40 transition-all duration-300"
                    onMouseEnter={() => handleJobCardHover(job.id)}
                  >
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-foreground text-xl mb-2">
                            <Link href={`/jobs/${job.slug || job.id}`} className="hover:text-primary transition-colors">
                              {job.title}
                            </Link>
                          </CardTitle>
                          <CardDescription className="text-muted-foreground/50 flex flex-wrap items-center gap-4">
                            <span className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              {job.location}
                            </span>
                            {salaryDisplay && (
                              <span className="flex items-center gap-1">
                                {/*<IndianRupee className="h-4 w-4" />*/}
                                {salaryDisplay}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              Posted {formatDate(job.createdAt)}
                            </span>
                            {job.postedByName && (
                              <span className="flex items-center gap-1">
                                <User className="h-4 w-4" />
                                by{" "}
                                {job.postedById && job.isRecruiterProfilePublic ? (
                                  <Link
                                    href={`/recruiters/${job.postedById}`}
                                    className="text-primary hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {job.postedByName}
                                  </Link>
                                ) : (
                                  job.postedByName
                                )}
                              </span>
                            )}
                          </CardDescription>
                        </div>
                        <Badge
                          variant="secondary"
                          className="bg-primary/20 text-primary border-primary/30"
                        >
                          {job.type.replace('-', ' ')}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground/50 mb-4 line-clamp-3">
                        {job.description.substring(0, 200)}...
                      </p>

                      <div className="flex justify-between items-center">
                        {job.deadline && (
                          <p className="text-sm text-muted-foreground">
                            Deadline: {formatDate(job.deadline)}
                          </p>
                        )}
                        <div className="flex gap-2 ml-auto">
                          <Link href={`/jobs/${job.slug || job.id}`}>
                            <Button className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600">
                              View Details
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Pagination */}
            {data && data.pagination.totalPages > 1 && (
              <div className="flex justify-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="bg-muted/50 border-border text-foreground hover:bg-muted/60"
                >
                  Previous
                </Button>

                <div className="flex items-center gap-2">
                  {Array.from({ length: Math.min(5, data.pagination.totalPages) }, (_, i) => {
                    const pageNum = i + 1;
                    return (
                      <Button
                        key={pageNum}
                        variant={page === pageNum ? "default" : "outline"}
                        onClick={() => setPage(pageNum)}
                        className={page === pageNum
                          ? "bg-gradient-to-r from-purple-500 to-blue-500"
                          : "bg-muted/50 border-border text-foreground hover:bg-muted/60"
                        }
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  onClick={() => setPage(page + 1)}
                  disabled={page === data.pagination.totalPages}
                  className="bg-muted/50 border-border text-foreground hover:bg-muted/60"
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
            </main>
          </div>
        </div>
      </div>
    </Layout>
  );
}
