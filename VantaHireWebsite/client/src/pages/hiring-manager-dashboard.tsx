import { useAuth } from "@/hooks/use-auth";
import { Redirect, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Briefcase, Users, MessageSquare, Calendar, ArrowRight } from "lucide-react";
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
  appliedAt: Date;
  currentStage: number | null;
  jobId: number;
  hmFeedbackCount?: number;
}

interface ApplicationWithJob extends Application {
  jobTitle: string;
}

export default function HiringManagerDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  if (!user || user.role !== 'hiring_manager') {
    return <Redirect to="/auth" />;
  }

  // Fetch all jobs where this user is the hiring manager
  const { data: allJobs = [], isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ["/api/hiring-manager/jobs"],
    queryFn: async () => {
      const response = await fetch("/api/hiring-manager/jobs");
      if (!response.ok) throw new Error("Failed to fetch jobs");
      return response.json();
    },
  });

  // Filter jobs where user is hiring manager
  const myJobs = allJobs.filter((job: any) => job.hiringManagerId === user.id);

  // Fetch applications for each job
  const { data: allApplicationsData } = useQuery({
    queryKey: ["/api/hiring-manager/applications", myJobs.map(j => j.id)],
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

  // Applications needing feedback (where hiring manager hasn't given feedback yet)
  const applicationsNeedingFeedback = allApplications.filter(
    (app) => (app.hmFeedbackCount ?? 0) === 0
  );

  const handleViewJob = (jobId: number) => {
    setLocation(`/jobs/${jobId}/applications`);
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-7xl" data-tour="hm-dashboard">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {hiringManagerDashboardCopy.header.title}
          </h1>
          <p className="text-muted-foreground">
            {hiringManagerDashboardCopy.header.subtitlePrefix} {user.firstName || user.username}! {hiringManagerDashboardCopy.header.subtitleSuffix}
          </p>
        </div>

        {/* Profile Completion Banner */}
        <ProfileCompletionBanner />

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {hiringManagerDashboardCopy.stats.myJobs}
              </CardTitle>
              <Briefcase className="h-4 w-4 text-info" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{myJobs.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {hiringManagerDashboardCopy.stats.myJobsHint}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {hiringManagerDashboardCopy.stats.totalCandidates}
              </CardTitle>
              <Users className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{allApplications.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {hiringManagerDashboardCopy.stats.totalCandidatesHint}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm" data-tour="pending-feedback">
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
              <p className="text-xs text-muted-foreground mt-1">
                {hiringManagerDashboardCopy.stats.awaitingFeedbackHint}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* My Jobs Section */}
        <div className="mb-8" data-tour="my-jobs">
          <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-info" />
            {hiringManagerDashboardCopy.sections.myJobs}
          </h2>

          {jobsLoading ? (
            <p className="text-muted-foreground">{hiringManagerDashboardCopy.sections.loadingJobs}</p>
          ) : myJobs.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="py-12 text-center">
                <Briefcase className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-muted-foreground">{hiringManagerDashboardCopy.sections.emptyJobs}</p>
                <p className="text-muted-foreground text-sm mt-1">
                  {hiringManagerDashboardCopy.sections.emptyJobsHint}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myJobs.map((job) => {
                const jobApplications = allApplications.filter((app) => app.jobId === job.id);
                const needingFeedback = jobApplications.filter(
                  (app) => (app.hmFeedbackCount ?? 0) === 0
                ).length;

                return (
                  <Card key={job.id} className="bg-card border-border hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base text-foreground">{job.title}</CardTitle>
                          <CardDescription className="text-sm mt-1">
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
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Candidates:</span>
                        <span className="font-medium text-foreground">{jobApplications.length}</span>
                      </div>
                      {needingFeedback > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Need Feedback:</span>
                          <Badge variant="outline" className="bg-warning/10 text-warning-foreground border-warning/30">
                            {needingFeedback}
                          </Badge>
                        </div>
                      )}
                      <Button
                        onClick={() => handleViewJob(job.id)}
                        className="w-full mt-2"
                        variant="outline"
                      >
                        View Candidates
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Candidates Awaiting Feedback Section */}
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-warning" />
            Candidates Awaiting Your Feedback
          </h2>

          {applicationsNeedingFeedback.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="py-12 text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-muted-foreground">All caught up!</p>
                <p className="text-muted-foreground text-sm mt-1">
                  You've provided feedback for all candidates.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {applicationsNeedingFeedback.map((app) => (
                <Card key={app.id} className="bg-card border-border hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-medium text-foreground">{app.name}</h3>
                          <Badge variant="outline" className="text-xs">
                            {app.jobTitle}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{app.email}</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(app.appliedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleViewJob(app.jobId)}
                        size="sm"
                      >
                        Review
                        <ArrowRight className="h-4 w-4 ml-2" />
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
