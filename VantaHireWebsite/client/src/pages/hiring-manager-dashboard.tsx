import { useAuth } from "@/hooks/use-auth";
import { Redirect, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Briefcase,
  Calendar,
  ClipboardCheck,
  MessageSquare,
  Sparkles,
  Users,
} from "lucide-react";
import Layout from "@/components/Layout";
import { ProfileCompletionBanner } from "@/components/ProfileCompletionBanner";
import { hiringManagerDashboardCopy } from "@/lib/internal-copy";

interface Job {
  id: number;
  title: string;
  location: string;
  type: string;
  createdAt: Date;
  isActive: boolean;
}

interface Application {
  id: number;
  name: string;
  email: string;
  appliedAt: Date | string;
  currentStage: number | null;
  jobId: number;
  hmFeedbackCount?: number;
  hmReviewRequestedAt?: Date | string | null;
  hmReviewNote?: string | null;
}

interface ApplicationWithJob extends Application {
  jobTitle: string;
}

export default function HiringManagerDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  if (!user || user.role !== "hiring_manager") {
    return <Redirect to="/auth" />;
  }

  const { data: allJobs = [], isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ["/api/hiring-manager/jobs"],
    queryFn: async () => {
      const response = await fetch("/api/hiring-manager/jobs");
      if (!response.ok) throw new Error("Failed to fetch jobs");
      return response.json();
    },
  });

  const myJobs = allJobs.filter((job: any) => job.hiringManagerId === user.id);

  const { data: allApplicationsData } = useQuery({
    queryKey: ["/api/hiring-manager/applications", myJobs.map((job) => job.id)],
    queryFn: async () => {
      if (myJobs.length === 0) return [];

      const applicationsPromises = myJobs.map(async (job) => {
        const response = await fetch(`/api/hiring-manager/jobs/${job.id}/applications`);
        if (!response.ok) throw new Error(`Failed to fetch applications for job ${job.id}`);
        const apps = await response.json();
        return apps.map((app: Application) => ({
          ...app,
          jobTitle: job.title,
        }));
      });

      const results = await Promise.all(applicationsPromises);
      return results.flat();
    },
    enabled: myJobs.length > 0,
  });

  const allApplications: ApplicationWithJob[] = allApplicationsData || [];
  const requestedReviewApplications = allApplications.filter((app) => !!app.hmReviewRequestedAt);
  const applicationsNeedingFeedback = requestedReviewApplications.filter(
    (app) => (app.hmFeedbackCount ?? 0) === 0
  );

  const handleViewJob = (jobId: number) => {
    setLocation(`/hiring-manager/jobs/${jobId}/review`);
  };

  return (
    <Layout>
      <div className="container mx-auto max-w-7xl px-4 py-8" data-tour="hm-dashboard">
        <Card className="mb-8 overflow-hidden border-border bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white shadow-xl">
          <CardContent className="flex flex-col gap-6 p-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-white/80">
                <Sparkles className="h-3.5 w-3.5" />
                Hiring Manager Workspace
              </div>
              <h1 className="text-3xl font-bold tracking-tight">
                {hiringManagerDashboardCopy.header.title}
              </h1>
              <p className="mt-2 text-sm text-white/75 md:text-base">
                {hiringManagerDashboardCopy.header.subtitlePrefix} {user.firstName || user.username}!{" "}
                {hiringManagerDashboardCopy.header.subtitleSuffix}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80 backdrop-blur">
              <p className="font-medium text-white">Recruiters send you a focused review queue.</p>
              <p className="mt-1">
                Open resumes, review recruiter notes, and leave structured decisions without taking over pipeline ownership.
              </p>
            </div>
          </CardContent>
        </Card>

        <ProfileCompletionBanner />

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {hiringManagerDashboardCopy.stats.myJobs}
              </CardTitle>
              <Briefcase className="h-4 w-4 text-info" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{myJobs.length}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {hiringManagerDashboardCopy.stats.myJobsHint}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {hiringManagerDashboardCopy.stats.totalCandidates}
              </CardTitle>
              <Users className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{allApplications.length}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {hiringManagerDashboardCopy.stats.totalCandidatesHint}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {hiringManagerDashboardCopy.stats.requestedReviews}
              </CardTitle>
              <ClipboardCheck className="h-4 w-4 text-info" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{requestedReviewApplications.length}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {hiringManagerDashboardCopy.stats.requestedReviewsHint}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-sm" data-tour="pending-feedback">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {hiringManagerDashboardCopy.stats.awaitingFeedback}
              </CardTitle>
              <MessageSquare className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {applicationsNeedingFeedback.length}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {hiringManagerDashboardCopy.stats.awaitingFeedbackHint}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mb-8" data-tour="my-jobs">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-foreground">
            <Briefcase className="h-5 w-5 text-info" />
            {hiringManagerDashboardCopy.sections.myJobs}
          </h2>

          {jobsLoading ? (
            <p className="text-muted-foreground">{hiringManagerDashboardCopy.sections.loadingJobs}</p>
          ) : myJobs.length === 0 ? (
            <Card className="border-border bg-card">
              <CardContent className="py-12 text-center">
                <Briefcase className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
                <p className="text-muted-foreground">{hiringManagerDashboardCopy.sections.emptyJobs}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {hiringManagerDashboardCopy.sections.emptyJobsHint}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {myJobs.map((job) => {
                const jobApplications = allApplications.filter((app) => app.jobId === job.id);
                const requestedReviewCount = jobApplications.filter((app) => !!app.hmReviewRequestedAt).length;
                const needingFeedback = jobApplications.filter(
                  (app) => !!app.hmReviewRequestedAt && (app.hmFeedbackCount ?? 0) === 0
                ).length;
                const hasReviewQueue = requestedReviewCount > 0;

                return (
                  <Card key={job.id} className="border-border bg-card shadow-sm transition-shadow hover:shadow-md">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-base text-foreground">{job.title}</CardTitle>
                          <CardDescription className="mt-1 text-sm">
                            {job.location} • {job.type}
                          </CardDescription>
                        </div>
                        {job.isActive && (
                          <Badge className="bg-success/20 text-success-foreground hover:bg-success/20">
                            Active
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border border-border bg-muted/20 p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Candidates</p>
                          <p className="mt-1 text-lg font-semibold text-foreground">{jobApplications.length}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-muted/20 p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Requested</p>
                          <p className="mt-1 text-lg font-semibold text-foreground">{requestedReviewCount}</p>
                        </div>
                      </div>

                      {needingFeedback > 0 ? (
                        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                          <span className="text-amber-900">Awaiting your feedback</span>
                          <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning-foreground">
                            {needingFeedback}
                          </Badge>
                        </div>
                      ) : hasReviewQueue ? (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                          All requested candidates already have your feedback.
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                          Recruiter has not requested review for this role yet.
                        </div>
                      )}

                      <Button
                        onClick={() => handleViewJob(job.id)}
                        className="mt-2 w-full"
                        variant={hasReviewQueue ? "default" : "outline"}
                        disabled={!hasReviewQueue}
                      >
                        {hasReviewQueue ? "Review Requested Candidates" : "No Review Requested"}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-foreground">
            <MessageSquare className="h-5 w-5 text-warning" />
            Candidates Awaiting Your Feedback
          </h2>

          {applicationsNeedingFeedback.length === 0 ? (
            <Card className="border-border bg-card">
              <CardContent className="py-12 text-center">
                <MessageSquare className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
                <p className="text-muted-foreground">No recruiter-requested reviews are waiting on you.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Once recruiters flag candidates for your review, they will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {applicationsNeedingFeedback.map((app) => (
                <Card key={app.id} className="border-border bg-card shadow-sm transition-shadow hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="mb-2 flex items-center gap-3">
                          <h3 className="font-medium text-foreground">{app.name}</h3>
                          <Badge variant="outline" className="text-xs">
                            {app.jobTitle}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                          <span>{app.email}</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(app.appliedAt).toLocaleDateString()}
                          </span>
                        </div>
                        {app.hmReviewNote ? (
                          <p className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
                            <span className="font-medium">Recruiter note:</span> {app.hmReviewNote}
                          </p>
                        ) : null}
                      </div>
                      <Button onClick={() => handleViewJob(app.jobId)} size="sm">
                        Review
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
