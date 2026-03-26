import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { MapPin, Clock, Calendar, Users, FileText, Upload, Briefcase, Star, Share2, Bookmark, Sparkles, AlertTriangle, RotateCcw, History, IndianRupee, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Job, insertApplicationSchema } from "@shared/schema";
import { User } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getCsrfToken } from "@/lib/csrf";
import { z } from "zod";
import { differenceInDays, format } from "date-fns";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEFAULT_SITE_URL, generateJobPostingJsonLd, generateJobMetaDescription, getJobCanonicalUrl } from "@/lib/seoHelpers";
import { useAIFeatures } from "@/hooks/use-ai-features";

// Types for audit log
interface AuditLogEntry {
  id: number;
  action: string;
  changes: Record<string, unknown> | null;
  performedBy: { firstName: string; lastName: string; username: string } | null;
  createdAt: string;
}

export default function JobDetailsPage() {
  const [match, params] = useRoute("/jobs/:id");
  const { toast } = useToast();
  const { user } = useAuth();
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    coverLetter: "",
    whatsappConsent: true,
  });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Support both numeric ID and slug in URL
  const jobIdOrSlug = params?.id || null;

  useEffect(() => { setIsVisible(true); }, []);

  // Extended type for job with client data for JSON-LD
  interface JobWithExtras extends Job {
    postedByName?: string;
    postedById?: number | string;
    isRecruiterProfilePublic?: boolean;
    clientName?: string | null;
    clientDomain?: string | null;
  }

  const { data: job, isLoading, error } = useQuery<JobWithExtras, Error & { status?: number; code?: string; jobInfo?: { title: string; slug: string } }>({
    queryKey: ["/api/jobs", jobIdOrSlug],
    queryFn: async () => {
      const response = await fetch(`/api/jobs/${jobIdOrSlug}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const err = new Error(data.error || "Failed to fetch job") as Error & { status?: number; code?: string; jobInfo?: { title: string; slug: string } };
        err.status = response.status;
        err.code = data.code;
        if (data.job) {
          err.jobInfo = { title: data.job.title, slug: data.job.slug };
        }
        throw err;
      }
      return response.json();
    },
    enabled: !!jobIdOrSlug,
    retry: (failureCount, error) => {
      // Don't retry on 410 Gone (expired/inactive jobs)
      if ((error as any)?.status === 410) return false;
      return failureCount < 3;
    },
  });

  const { resumeAdvisor, fitScoring } = useAIFeatures();
  const aiEnabled = resumeAdvisor || fitScoring;

  // Check if current user is recruiter/admin (for showing admin features)
  const isRecruiterOrAdmin = user?.role === 'recruiter' || user?.role === 'super_admin';

  // Fetch audit log for job (recruiters/admins only)
  const { data: auditLog = [] } = useQuery<AuditLogEntry[]>({
    queryKey: ["/api/jobs", job?.id, "audit-log"],
    queryFn: async () => {
      const response = await fetch(`/api/jobs/${job?.id}/audit-log`, { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!job?.id && isRecruiterOrAdmin,
  });

  // Job reactivation mutation (for expired jobs)
  const reactivateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/jobs/${job?.id}/status`, { isActive: true, reason: "Reactivated from job details page" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobIdOrSlug] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", job?.id, "audit-log"] });
      toast({ title: "Job reactivated", description: "The job posting is now active again." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reactivate job", description: error.message, variant: "destructive" });
    },
  });

  // Helper functions for expiry status
  const isExpired = job?.expiresAt ? new Date(job.expiresAt) < new Date() : false;
  const daysUntilExpiry = job?.expiresAt ? differenceInDays(new Date(job.expiresAt), new Date()) : null;
  const showExpiryWarning = daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 7;

  const applicationMutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Add CSRF token to FormData
      const csrfToken = await getCsrfToken();

      const response = await fetch(`/api/jobs/${job?.id}/apply`, {
        method: "POST",
        headers: {
          'x-csrf-token': csrfToken,
        },
        body: data,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to submit application");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Application submitted successfully",
        description: "We'll review your application and get back to you soon.",
      });
      setShowApplicationForm(false);
      setFormData({ name: "", email: "", phone: "", coverLetter: "", whatsappConsent: true });
      setResumeFile(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit application",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!resumeFile) {
      toast({
        title: "Resume required",
        description: "Please upload your resume to continue.",
        variant: "destructive",
      });
      return;
    }

    try {
      const validatedData = insertApplicationSchema.parse({
        ...formData,
        jobId: job?.id!,
      });

      const formDataToSend = new FormData();
      Object.entries(validatedData).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formDataToSend.append(key, value.toString());
        }
      });
      
      if (resumeFile) {
        formDataToSend.append('resume', resumeFile);
      }

      applicationMutation.mutate(formDataToSend);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation error",
          description: error.errors[0]?.message || "Validation failed",
          variant: "destructive",
        });
      }
    }
  };

  const formatDate = (dateString: string | Date | null | undefined) => {
    if (!dateString) return 'Not set';
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    if (isNaN(date.getTime())) return 'Invalid date';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (!match || !jobIdOrSlug) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center text-foreground">
            <h1 className="text-2xl font-bold mb-2">Job Not Found</h1>
            <p>The job you're looking for doesn't exist.</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="text-foreground mt-4">Loading job details...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !job) {
    // Handle expired/inactive jobs with specific messaging
    const typedError = error as (Error & { status?: number; code?: string; jobInfo?: { title: string; slug: string } }) | null;
    const isExpiredOrInactive = typedError?.status === 410;

    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center text-foreground max-w-md mx-auto">
            {isExpiredOrInactive ? (
              <>
                <AlertTriangle className="h-16 w-16 text-warning mx-auto mb-4" />
                <h1 className="text-2xl font-bold mb-2">
                  {typedError?.code === 'EXPIRED' ? 'Job Has Expired' : 'Job No Longer Available'}
                </h1>
                {typedError?.jobInfo?.title && (
                  <p className="text-muted-foreground mb-2">"{typedError.jobInfo.title}"</p>
                )}
                <p className="text-muted-foreground mb-6">
                  {typedError?.code === 'EXPIRED'
                    ? 'This job posting has expired and is no longer accepting applications.'
                    : 'This job is no longer active. It may have been filled or removed.'}
                </p>
                <Link href="/jobs">
                  <Button className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600">
                    Browse Active Jobs
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold mb-2">Error</h1>
                <p>Failed to load job details. Please try again.</p>
              </>
            )}
          </div>
        </div>
      </Layout>
    );
  }

  // Generate SEO metadata and JSON-LD
  const metaDescription = generateJobMetaDescription(job);
  const canonicalUrl = getJobCanonicalUrl(job);
  const jobPostingJsonLd = generateJobPostingJsonLd(job);
  const hasServerJobPostingJsonLd = typeof document !== "undefined" &&
    !!document.querySelector('script[type="application/ld+json"][data-schema="jobposting"]');
  const shouldRenderJobPostingJsonLd = typeof document === "undefined" || !hasServerJobPostingJsonLd;

  return (
    <Layout>
      <Helmet>
        {/* Page Title and Meta */}
        <title>{job.title} | VantaHire</title>
        <meta name="description" content={metaDescription} />
        <link rel="canonical" href={canonicalUrl} />

        {/* Open Graph */}
        <meta property="og:title" content={`${job.title} - VantaHire`} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${DEFAULT_SITE_URL}/og-image.jpg`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />

        {/* Twitter Card */}
        <meta name="twitter:title" content={`${job.title} - VantaHire`} />
        <meta name="twitter:description" content={metaDescription} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={`${DEFAULT_SITE_URL}/twitter-image.jpg`} />

        {/* JobPosting JSON-LD for Google Jobs */}
        {shouldRenderJobPostingJsonLd && jobPostingJsonLd && (
          <script type="application/ld+json">
            {JSON.stringify(jobPostingJsonLd)}
          </script>
        )}

        {/* BreadcrumbList JSON-LD */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              {
                "@type": "ListItem",
                "position": 1,
                "name": "Home",
                "item": DEFAULT_SITE_URL
              },
              {
                "@type": "ListItem",
                "position": 2,
                "name": "Jobs",
                "item": `${DEFAULT_SITE_URL}/jobs`
              },
              {
                "@type": "ListItem",
                "position": 3,
                "name": job.title,
                "item": canonicalUrl
              }
            ]
          })}
        </script>
      </Helmet>

      <div className="public-theme min-h-screen bg-background text-foreground">
        {/* Premium background effects */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxIiBjeT0iMSIgcj0iMSIgZmlsbD0id2hpdGUiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==')] opacity-10"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px] animate-pulse-slow"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-info/10 rounded-full blur-[100px] animate-pulse-slow" style={{ animationDelay: '1.2s' }}></div>
        
        <div className={`container mx-auto px-4 py-8 relative z-10 transition-opacity duration-1000 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
          <div className="max-w-4xl mx-auto">
            {/* Premium Header */}
            <div className="mb-12 pt-16">
              <div className="w-20 h-1.5 bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8] rounded-full mb-6 animate-slide-right"></div>
              <div className="flex items-center gap-3 mb-4">
                <Briefcase className="h-8 w-8 text-[#7B38FB]" />
                <h1 className="text-4xl md:text-5xl font-bold">
                  <span className="animate-gradient-text">{job.title}</span>
                </h1>
              </div>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed animate-slide-up" style={{ animationDelay: '0.3s' }}>
                {job.title} opportunity at {job.location} — Apply now
              </p>
            </div>

            {/* Job Header */}
            <Card className="mb-8 bg-muted/50 backdrop-blur-sm border-border premium-card animate-slide-up" style={{ animationDelay: '0.5s' }}>
              <CardHeader>
                <div className="mb-4">
                  <CardTitle className="text-3xl font-bold text-foreground mb-2">
                    {job.title}
                  </CardTitle>
                  <CardDescription className="text-muted-foreground/50 text-lg flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      {job.location}
                    </span>
                    <span className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Posted {formatDate(job.createdAt)}
                    </span>
                    {job.postedByName && (
                      <span className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        by{" "}
                        {job.postedById && job.isRecruiterProfilePublic ? (
                          <Link
                            href={`/recruiters/${job.postedById}`}
                            className="text-primary hover:underline"
                          >
                            {job.postedByName}
                          </Link>
                        ) : (
                          job.postedByName
                        )}
                      </span>
                    )}
                    <Badge
                      variant="secondary"
                      className="bg-primary/20 text-primary border-primary/30 px-3 py-1 capitalize"
                    >
                      {job.type.replace('-', ' ')}
                    </Badge>
                  </CardDescription>
                </div>

                {job.deadline && (
                  <div className="flex items-center gap-2 text-orange-300">
                    <Calendar className="h-5 w-5" />
                    <span>Application Deadline: {formatDate(job.deadline)}</span>
                  </div>
                )}

                {/* Expired State Badge */}
                {isExpired && (
                  <div className="flex items-center gap-3 mt-4">
                    <Badge className="bg-destructive/20 text-destructive border-destructive/30">
                      Expired
                    </Badge>
                    {isRecruiterOrAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => reactivateMutation.mutate()}
                        disabled={reactivateMutation.isPending}
                        className="border-green-500/50 text-green-300 hover:bg-success/20"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        {reactivateMutation.isPending ? "Reactivating..." : "Reactivate Job"}
                      </Button>
                    )}
                  </div>
                )}
              </CardHeader>
            </Card>

            {/* Expiry Warning Banner */}
            {showExpiryWarning && !isExpired && (
              <div className="mb-4 p-4 rounded-lg bg-warning/20 border border-amber-500/30 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0" />
                <div>
                  <p className="text-amber-200 font-medium">
                    This job posting expires {daysUntilExpiry === 0 ? 'today' : daysUntilExpiry === 1 ? 'tomorrow' : `in ${daysUntilExpiry} days`}
                  </p>
                  <p className="text-amber-300/70 text-sm">
                    {job.expiresAt && `Expiry date: ${format(new Date(job.expiresAt), "MMMM d, yyyy 'at' h:mm a")}`}
                  </p>
                </div>
              </div>
            )}

            <div className="grid lg:grid-cols-3 gap-8">
              {/* Job Description */}
              <div className="lg:col-span-2 space-y-6">
                <Card className="bg-muted/50 backdrop-blur-sm border-border premium-card">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <FileText className="h-5 w-5 text-[#7B38FB]" />
                      Job Description
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-invert max-w-none">
                      <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                        {job.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {job.skills && job.skills.length > 0 && (
                  <Card className="bg-muted/50 backdrop-blur-sm border-border premium-card">
                    <CardHeader>
                      <CardTitle className="text-foreground flex items-center gap-2">
                        <Star className="h-5 w-5 text-[#7B38FB]" />
                        Required Skills
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {job.skills.map((skill, index) => (
                          <Badge
                            key={index}
                            variant="outline"
                            className="border-destructive/30 text-destructive bg-destructive/10"
                          >
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Good to Have Skills */}
                {job.goodToHaveSkills && job.goodToHaveSkills.length > 0 && (
                  <Card className="bg-muted/50 backdrop-blur-sm border-border premium-card">
                    <CardHeader>
                      <CardTitle className="text-foreground flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-[#7B38FB]" />
                        Good to Have Skills
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {job.goodToHaveSkills.map((skill, index) => (
                          <Badge
                            key={index}
                            variant="outline"
                            className="border-green-500/30 text-green-600 bg-green-500/10"
                          >
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Salary */}
                {(job.salaryMin || job.salaryMax) && (
                  <Card className="bg-muted/50 backdrop-blur-sm border-border premium-card">
                    <CardHeader>
                      <CardTitle className="text-foreground flex items-center gap-2">
                        <IndianRupee className="h-5 w-5 text-[#7B38FB]" />
                        Compensation
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-foreground">
                        {job.salaryMin && job.salaryMax
                          ? `₹${job.salaryMin.toLocaleString('en-IN')} - ₹${job.salaryMax.toLocaleString('en-IN')}`
                          : job.salaryMin
                          ? `₹${job.salaryMin.toLocaleString('en-IN')}+`
                          : `Up to ₹${job.salaryMax?.toLocaleString('en-IN')}`}
                        <span className="text-sm font-normal text-muted-foreground ml-2">
                          {job.salaryPeriod === 'per_month' ? '/month' : '/year'}
                        </span>
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Education & Experience */}
                {(job.educationRequirement || job.experienceYears) && (
                  <Card className="bg-muted/50 backdrop-blur-sm border-border premium-card">
                    <CardHeader>
                      <CardTitle className="text-foreground flex items-center gap-2">
                        <GraduationCap className="h-5 w-5 text-[#7B38FB]" />
                        Requirements
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {job.educationRequirement && (
                        <div>
                          <p className="text-sm text-muted-foreground">Education</p>
                          <p className="text-foreground font-medium">{job.educationRequirement}</p>
                        </div>
                      )}
                      {job.experienceYears && (
                        <div>
                          <p className="text-sm text-muted-foreground">Experience</p>
                          <p className="text-foreground font-medium">{job.experienceYears}+ years</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Application Form */}
              <div className="space-y-6">
                {!showApplicationForm ? (
                    <Card className="bg-muted/50 backdrop-blur-sm border-border premium-card sticky top-8">
                      <CardHeader>
                        <CardTitle className="text-foreground">Job Details</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {/* Job Metadata */}
                        <div className="space-y-4">
                          <div className="flex items-start gap-3">
                            <MapPin className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm text-muted-foreground">Location</p>
                              <p className="text-foreground font-medium">{job.location}</p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3">
                            <Briefcase className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm text-muted-foreground">Job Type</p>
                              <p className="text-foreground font-medium capitalize">{job.type.replace('-', ' ')}</p>
                            </div>
                          </div>

                          {job.deadline && (
                            <div className="flex items-start gap-3">
                              <Calendar className="h-5 w-5 text-orange-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm text-muted-foreground">Deadline</p>
                                <p className="text-orange-300 font-medium">{formatDate(job.deadline)}</p>
                              </div>
                            </div>
                          )}

                          <div className="flex items-start gap-3">
                            <Clock className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm text-muted-foreground">Posted</p>
                              <p className="text-foreground font-medium">{formatDate(job.createdAt)}</p>
                            </div>
                          </div>
                        </div>

                        {/* AI Score Badge - Conditionally shown */}
                        {aiEnabled && (
                          <div className="p-4 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-lg border border-primary/30">
                            <div className="flex items-center gap-2 mb-2">
                              <Sparkles className="h-4 w-4 text-primary" />
                              <span className="text-sm font-semibold text-primary">AI Match Score</span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">
                              Upload your resume to see your match score
                            </p>
                            <Badge variant="outline" className="border-primary/50 text-primary bg-primary/10">
                              AI-Powered Matching Available
                            </Badge>
                          </div>
                        )}

                        {/* Primary CTA */}
                        <div className="space-y-3">
                          <Button
                            onClick={() => setShowApplicationForm(true)}
                            className="w-full bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8] hover:shadow-lg hover:shadow-purple-500/20 transition-all duration-300 hover:scale-105"
                            size="lg"
                            data-testid="apply-button"
                          >
                            Apply Now
                          </Button>

                          {/* Secondary Actions */}
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              variant="outline"
                              className="border-border text-foreground hover:bg-muted/50"
                              onClick={() => {
                                navigator.share?.({
                                  title: job.title,
                                  url: window.location.href
                                }).catch(() => {
                                  navigator.clipboard.writeText(window.location.href);
                                  toast({ title: "Link copied to clipboard" });
                                });
                              }}
                            >
                              <Share2 className="h-4 w-4 mr-2" />
                              Share
                            </Button>
                            <Button
                              variant="outline"
                              className="border-border text-foreground hover:bg-muted/50"
                              onClick={() => toast({ title: "Job saved", description: "We'll remind you about this opportunity" })}
                            >
                              <Bookmark className="h-4 w-4 mr-2" />
                              Save
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card className="bg-muted/50 backdrop-blur-sm border-border premium-card sticky top-8">
                      <CardHeader>
                        <CardTitle className="text-foreground">Submit Application</CardTitle>
                        <CardDescription className="text-muted-foreground">
                          Fill out the form below to apply for this position
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                          <div>
                            <Label htmlFor="name" className="text-foreground">Full Name *</Label>
                            <Input
                              id="name"
                              value={formData.name}
                              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                              required
                              className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground focus:border-[#7B38FB] focus:ring-2 focus:ring-[#7B38FB]/20 transition-all duration-300"
                            />
                          </div>

                          <div>
                            <Label htmlFor="email" className="text-foreground">Email *</Label>
                            <Input
                              id="email"
                              type="email"
                              value={formData.email}
                              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                              required
                              className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground focus:border-[#7B38FB] focus:ring-2 focus:ring-[#7B38FB]/20 transition-all duration-300"
                            />
                          </div>

                          <div>
                            <Label htmlFor="phone" className="text-foreground">Phone *</Label>
                            <Input
                              id="phone"
                              type="tel"
                              value={formData.phone}
                              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                              required
                              className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground focus:border-[#7B38FB] focus:ring-2 focus:ring-[#7B38FB]/20 transition-all duration-300"
                            />
                          </div>

                          <div>
                            <Label htmlFor="resume" className="text-foreground">Resume (PDF) *</Label>
                            <div className="relative">
                            <Input
                              id="resume"
                              type="file"
                              accept=".pdf,.doc,.docx"
                              onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                              required
                              className="bg-muted/30 border-border text-foreground file:bg-primary/100 file:text-foreground file:border-0 file:rounded file:px-4 file:py-2"
                            />
                              <Upload className="absolute right-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                            </div>
                            {resumeFile && (
                              <p className="text-sm text-success mt-1">
                                Selected: {resumeFile.name}
                              </p>
                            )}
                          </div>

                          <div>
                            <Label htmlFor="coverLetter" className="text-foreground">Cover Letter</Label>
                            <Textarea
                              id="coverLetter"
                              value={formData.coverLetter}
                              onChange={(e) => setFormData({ ...formData, coverLetter: e.target.value })}
                              placeholder="Tell us why you're perfect for this role..."
                              rows={4}
                              className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground focus:border-[#7B38FB] focus:ring-2 focus:ring-[#7B38FB]/20 transition-all duration-300"
                            />
                          </div>

                          <div className="flex items-start space-x-2 pt-2">
                            <Checkbox
                              id="whatsappConsent"
                              checked={formData.whatsappConsent}
                              onCheckedChange={(checked) =>
                                setFormData({ ...formData, whatsappConsent: checked === true })
                              }
                              className="mt-0.5"
                            />
                            <Label
                              htmlFor="whatsappConsent"
                              className="text-sm text-muted-foreground leading-tight cursor-pointer"
                            >
                              I agree to receive job updates via WhatsApp
                            </Label>
                          </div>

                          <div className="flex gap-2">
                            <Button
                              type="submit"
                              disabled={applicationMutation.isPending}
                              className="flex-1 bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8] hover:shadow-lg hover:shadow-purple-500/20 transition-all duration-300"
                            >
                              {applicationMutation.isPending ? "Submitting..." : "Submit Application"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setShowApplicationForm(false)}
                              className="bg-muted/50 border-border text-foreground hover:bg-muted/60"
                            >
                              Cancel
                            </Button>
                          </div>
                        </form>
                      </CardContent>
                    </Card>
                )}
              </div>
            </div>

            {/* Activity Log (Recruiters/Admins only) */}
            {isRecruiterOrAdmin && auditLog.length > 0 && (
              <Card className="mt-8 bg-muted/50 backdrop-blur-sm border-border premium-card">
                <CardHeader>
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <History className="h-5 w-5 text-[#7B38FB]" />
                    Activity Log
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Recent changes and actions on this job posting
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-muted/60" />

                    <div className="space-y-4">
                      {auditLog.slice(0, 10).map((entry, index) => (
                        <div key={entry.id} className="relative pl-10">
                          {/* Timeline dot */}
                          <div className="absolute left-2.5 w-3 h-3 rounded-full bg-[#7B38FB] border-2 border-border" />

                          <div className="bg-muted/30 rounded-lg p-3 border border-border">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-foreground capitalize">
                                {entry.action.replace(/_/g, ' ')}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {entry.createdAt && !isNaN(new Date(entry.createdAt).getTime())
                                  ? format(new Date(entry.createdAt), "MMM d, yyyy 'at' h:mm a")
                                  : 'Unknown date'}
                              </span>
                            </div>
                            {entry.performedBy && (
                              <p className="text-xs text-muted-foreground">
                                by {entry.performedBy.firstName} {entry.performedBy.lastName}
                              </p>
                            )}
                            {entry.changes && Object.keys(entry.changes).length > 0 && (
                              <div className="mt-2 text-xs text-muted-foreground">
                                {Object.entries(entry.changes).map(([key, value]) => (
                                  <span key={key} className="inline-block mr-2">
                                    {key}: {String(value)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
