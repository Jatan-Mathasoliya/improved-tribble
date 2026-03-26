import { useEffect, useMemo, useState } from "react";
import { Redirect, useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Briefcase, Calendar, CheckCircle2, Clock, MessageSquare, UserRound } from "lucide-react";
import Layout from "@/components/Layout";
import { FeedbackPanel } from "@/components/FeedbackPanel";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { hiringManagerReviewPageCopy } from "@/lib/internal-copy";

interface HiringManagerJob {
  id: number;
  title: string;
  location: string;
  type: string;
  hiringManagerId: number;
  isActive: boolean;
}

interface HiringManagerApplication {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  status: string;
  appliedAt: Date | string;
  currentStage: number | null;
  jobId: number;
  stageName?: string | null;
  hmFeedbackCount?: number;
}

export default function HiringManagerReviewPage() {
  const [match, params] = useRoute("/hiring-manager/jobs/:id/review");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [selectedApplicationId, setSelectedApplicationId] = useState<number | null>(null);

  const jobId = params?.id ? parseInt(params.id, 10) : null;

  if (!user || user.role !== "hiring_manager") {
    return <Redirect to="/auth" />;
  }

  if (!match || !jobId || Number.isNaN(jobId)) {
    return <Redirect to="/hiring-manager" />;
  }

  const { data: jobs = [], isLoading: jobsLoading } = useQuery<HiringManagerJob[]>({
    queryKey: ["/api/hiring-manager/jobs"],
    queryFn: async () => {
      const response = await fetch("/api/hiring-manager/jobs", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch hiring manager jobs");
      return response.json();
    },
  });

  const job = useMemo(
    () => jobs.find((candidateJob) => candidateJob.id === jobId) ?? null,
    [jobs, jobId]
  );

  const {
    data: applications = [],
    isLoading: applicationsLoading,
    isError: applicationsError,
  } = useQuery<HiringManagerApplication[]>({
    queryKey: ["/api/hiring-manager/jobs", jobId, "applications"],
    queryFn: async () => {
      const response = await fetch(`/api/hiring-manager/jobs/${jobId}/applications`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch job applications");
      return response.json();
    },
    enabled: !!job,
  });

  useEffect(() => {
    if (applications.length === 0) {
      setSelectedApplicationId(null);
      return;
    }

    const stillSelected = applications.some((application) => application.id === selectedApplicationId);
    if (stillSelected) return;

    const nextSelection = applications.find((application) => (application.hmFeedbackCount ?? 0) === 0) ?? applications[0];
    setSelectedApplicationId(nextSelection?.id ?? null);
  }, [applications, selectedApplicationId]);

  const selectedApplication =
    applications.find((application) => application.id === selectedApplicationId) ?? null;
  const awaitingFeedbackCount = applications.filter((application) => (application.hmFeedbackCount ?? 0) === 0).length;

  const isLoading = jobsLoading || (Boolean(job) && applicationsLoading);

  return (
    <Layout>
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8 flex flex-col gap-4">
          <Button
            variant="ghost"
            className="w-fit px-0 text-muted-foreground hover:text-foreground"
            onClick={() => setLocation("/hiring-manager")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {hiringManagerReviewPageCopy.header.back}
          </Button>

          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-foreground">{hiringManagerReviewPageCopy.header.title}</h1>
            <p className="text-muted-foreground">{hiringManagerReviewPageCopy.header.subtitle}</p>
          </div>

          {job && (
            <Card className="border-border bg-card">
              <CardContent className="flex flex-col gap-3 p-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-info" />
                    <p className="font-semibold text-foreground">{job.title}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {job.location} • {job.type}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 md:w-auto">
                  <Card className="border-border bg-muted/30 shadow-none">
                    <CardContent className="p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {hiringManagerReviewPageCopy.stats.totalCandidates}
                      </p>
                      <p className="mt-1 text-2xl font-bold text-foreground">{applications.length}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border bg-muted/30 shadow-none">
                    <CardContent className="p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {hiringManagerReviewPageCopy.stats.awaitingFeedback}
                      </p>
                      <p className="mt-1 text-2xl font-bold text-foreground">{awaitingFeedbackCount}</p>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {!jobsLoading && !job ? (
          <Card className="border-border bg-card">
            <CardContent className="py-12 text-center">
              <Briefcase className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
              <p className="text-foreground">{hiringManagerReviewPageCopy.sections.inaccessibleJob}</p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <Card className="border-border bg-card">
            <CardContent className="py-12 text-center text-muted-foreground">
              {hiringManagerReviewPageCopy.sections.loading}
            </CardContent>
          </Card>
        ) : applicationsError ? (
          <Card className="border-border bg-card">
            <CardContent className="py-12 text-center">
              <MessageSquare className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
              <p className="text-foreground">Unable to load candidates for this job.</p>
              <p className="mt-1 text-sm text-muted-foreground">Please try again from your dashboard.</p>
            </CardContent>
          </Card>
        ) : applications.length === 0 ? (
          <Card className="border-border bg-card">
            <CardContent className="py-12 text-center">
              <UserRound className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
              <p className="text-foreground">{hiringManagerReviewPageCopy.sections.empty}</p>
              <p className="mt-1 text-sm text-muted-foreground">{hiringManagerReviewPageCopy.sections.emptyHint}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle>{hiringManagerReviewPageCopy.sections.candidates}</CardTitle>
                <CardDescription>Select a candidate to review and leave feedback.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {applications.map((application) => {
                  const hasFeedback = (application.hmFeedbackCount ?? 0) > 0;
                  const isSelected = application.id === selectedApplicationId;

                  return (
                    <button
                      key={application.id}
                      type="button"
                      onClick={() => setSelectedApplicationId(application.id)}
                      className={`w-full rounded-lg border p-4 text-left transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border bg-background hover:border-primary/40 hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{application.name}</p>
                          <p className="truncate text-sm text-muted-foreground">{application.email}</p>
                        </div>
                        <Badge variant={hasFeedback ? "secondary" : "outline"}>
                          {hasFeedback
                            ? hiringManagerReviewPageCopy.sections.alreadyReviewed
                            : hiringManagerReviewPageCopy.sections.awaitingFeedback}
                        </Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {application.stageName ? (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {application.stageName}
                          </span>
                        ) : null}
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(application.appliedAt).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {application.status}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            <div className="space-y-4">
              {selectedApplication ? (
                <>
                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle>{selectedApplication.name}</CardTitle>
                      <CardDescription>{selectedApplication.email}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      {selectedApplication.phone ? (
                        <Badge variant="outline">{selectedApplication.phone}</Badge>
                      ) : null}
                      {selectedApplication.stageName ? (
                        <Badge variant="outline">{selectedApplication.stageName}</Badge>
                      ) : null}
                      <Badge variant="outline">Applied {new Date(selectedApplication.appliedAt).toLocaleDateString()}</Badge>
                    </CardContent>
                  </Card>
                  <FeedbackPanel applicationId={selectedApplication.id} jobId={jobId} />
                </>
              ) : (
                <Card className="border-border bg-card">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    {hiringManagerReviewPageCopy.sections.chooseCandidate}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
