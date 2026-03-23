import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Briefcase,
  FileText,
  Clock,
  TrendingUp,
  UserCheck,
  Target,
  BarChart3
} from "lucide-react";
import { orgAnalyticsPageCopy } from "@/lib/internal-copy";

interface AnalyticsOverview {
  totalApplications: number;
  totalHires: number;
  conversionRate: number;
  avgTimeToFill: number | null;
  totalJobs: number;
  activeJobs: number;
  totalMembers: number;
  seatsUsed: number;
  seatsTotal: number;
  creditsUsed: number;
  creditsAllocated: number;
  planDisplayName: string;
}

interface StageBreakdown {
  stageName: string;
  avgDays: number;
  transitions: number;
}

interface SourcePerformance {
  source: string;
  applications: number;
  shortlisted: number;
  hired: number;
  conversionRate: number;
}

interface RecruiterPerformance {
  recruiterId: number;
  recruiterName: string;
  jobsPosted: number;
  applicationsScreened: number;
  avgFirstActionDays: number;
}

interface HiringManagerPerformance {
  managerId: number;
  managerName: string;
  jobsAssigned: number;
  feedbackGiven: number;
  avgFeedbackDays: number;
  pendingReviews: number;
}

interface TimeToFillJob {
  jobId: number;
  jobTitle: string;
  daysToFill: number | null;
  totalApplications: number;
  status: string;
}

async function fetchWithAuth(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

export default function OrgAnalyticsPage() {
  const { data: overview, isLoading: loadingOverview } = useQuery<AnalyticsOverview>({
    queryKey: ["/api/organizations/analytics"],
    queryFn: () => fetchWithAuth("/api/organizations/analytics"),
  });

  const { data: stageBreakdown, isLoading: loadingStages } = useQuery<StageBreakdown[]>({
    queryKey: ["/api/organizations/analytics/stage-breakdown"],
    queryFn: () => fetchWithAuth("/api/organizations/analytics/stage-breakdown"),
  });

  const { data: sources, isLoading: loadingSources } = useQuery<SourcePerformance[]>({
    queryKey: ["/api/organizations/analytics/sources"],
    queryFn: () => fetchWithAuth("/api/organizations/analytics/sources"),
  });

  const { data: recruiters, isLoading: loadingRecruiters } = useQuery<RecruiterPerformance[]>({
    queryKey: ["/api/organizations/analytics/recruiters"],
    queryFn: () => fetchWithAuth("/api/organizations/analytics/recruiters"),
  });

  const { data: hiringManagers, isLoading: loadingHM } = useQuery<HiringManagerPerformance[]>({
    queryKey: ["/api/organizations/analytics/hiring-managers"],
    queryFn: () => fetchWithAuth("/api/organizations/analytics/hiring-managers"),
  });

  const { data: timeToFill, isLoading: loadingTTF } = useQuery<TimeToFillJob[]>({
    queryKey: ["/api/organizations/analytics/time-to-fill"],
    queryFn: () => fetchWithAuth("/api/organizations/analytics/time-to-fill"),
  });

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{orgAnalyticsPageCopy.header.title}</h1>
        <p className="text-muted-foreground">
          {orgAnalyticsPageCopy.header.subtitle}
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {loadingOverview ? (
          <>
            <Skeleton className="h-[120px]" />
            <Skeleton className="h-[120px]" />
            <Skeleton className="h-[120px]" />
            <Skeleton className="h-[120px]" />
          </>
        ) : overview ? (
          <>
            <StatCard
              title={orgAnalyticsPageCopy.stats.totalApplications}
              value={overview.totalApplications}
              icon={FileText}
            />
            <StatCard
              title={orgAnalyticsPageCopy.stats.totalHires}
              value={overview.totalHires}
              icon={UserCheck}
            />
            <StatCard
              title={orgAnalyticsPageCopy.stats.conversionRate}
              value={`${overview.conversionRate}%`}
              icon={TrendingUp}
            />
            <StatCard
              title={orgAnalyticsPageCopy.stats.avgTimeToFill}
              value={overview.avgTimeToFill ? `${overview.avgTimeToFill}d` : "—"}
              subtitle={orgAnalyticsPageCopy.stats.avgTimeToFillSubtitle}
              icon={Clock}
            />
          </>
        ) : null}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Time to Fill by Job */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {orgAnalyticsPageCopy.sections.timeToFill.title}
            </CardTitle>
            <CardDescription>
              {orgAnalyticsPageCopy.sections.timeToFill.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingTTF ? (
              <Skeleton className="h-[200px]" />
            ) : timeToFill && timeToFill.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead className="text-right">Applications</TableHead>
                    <TableHead className="text-right">Days to Fill</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timeToFill.slice(0, 5).map((job) => (
                    <TableRow key={job.jobId}>
                      <TableCell className="font-medium">{job.jobTitle}</TableCell>
                      <TableCell className="text-right">{job.totalApplications}</TableCell>
                      <TableCell className="text-right">
                        {job.daysToFill ? `${job.daysToFill}d` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-center py-8">{orgAnalyticsPageCopy.sections.timeToFill.empty}</p>
            )}
          </CardContent>
        </Card>

        {/* Time in Stage Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {orgAnalyticsPageCopy.sections.timeInStage.title}
            </CardTitle>
            <CardDescription>
              {orgAnalyticsPageCopy.sections.timeInStage.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingStages ? (
              <Skeleton className="h-[200px]" />
            ) : stageBreakdown && stageBreakdown.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Avg Days</TableHead>
                    <TableHead className="text-right">Transitions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stageBreakdown.map((stage) => (
                    <TableRow key={stage.stageName}>
                      <TableCell className="font-medium">{stage.stageName}</TableCell>
                      <TableCell className="text-right">{stage.avgDays}d</TableCell>
                      <TableCell className="text-right">{stage.transitions}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-center py-8">{orgAnalyticsPageCopy.sections.timeInStage.empty}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Source Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            {orgAnalyticsPageCopy.sections.sourcePerformance.title}
          </CardTitle>
          <CardDescription>
            {orgAnalyticsPageCopy.sections.sourcePerformance.description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingSources ? (
            <Skeleton className="h-[200px]" />
          ) : sources && sources.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Applications</TableHead>
                  <TableHead className="text-right">Shortlisted</TableHead>
                  <TableHead className="text-right">Hired</TableHead>
                  <TableHead className="text-right">Conversion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((source) => (
                  <TableRow key={source.source}>
                    <TableCell className="font-medium">
                      <Badge variant="outline">{source.source}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{source.applications}</TableCell>
                    <TableCell className="text-right">{source.shortlisted}</TableCell>
                    <TableCell className="text-right">{source.hired}</TableCell>
                    <TableCell className="text-right">{source.conversionRate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-8">{orgAnalyticsPageCopy.sections.sourcePerformance.empty}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recruiter Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Recruiter Performance
            </CardTitle>
            <CardDescription>
              Recruiter activity and response times
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingRecruiters ? (
              <Skeleton className="h-[200px]" />
            ) : recruiters && recruiters.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recruiter</TableHead>
                    <TableHead className="text-right">Jobs</TableHead>
                    <TableHead className="text-right">Screened</TableHead>
                    <TableHead className="text-right">Avg First Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recruiters.map((recruiter) => (
                    <TableRow key={recruiter.recruiterId}>
                      <TableCell className="font-medium">{recruiter.recruiterName}</TableCell>
                      <TableCell className="text-right">{recruiter.jobsPosted}</TableCell>
                      <TableCell className="text-right">{recruiter.applicationsScreened}</TableCell>
                      <TableCell className="text-right">{recruiter.avgFirstActionDays}d</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-center py-8">No recruiter data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Hiring Manager Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Hiring Manager Performance
            </CardTitle>
            <CardDescription>
              Feedback turnaround and pending reviews
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingHM ? (
              <Skeleton className="h-[200px]" />
            ) : hiringManagers && hiringManagers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Manager</TableHead>
                    <TableHead className="text-right">Jobs</TableHead>
                    <TableHead className="text-right">Feedback</TableHead>
                    <TableHead className="text-right">Avg Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hiringManagers.map((manager) => (
                    <TableRow key={manager.managerId}>
                      <TableCell className="font-medium">{manager.managerName}</TableCell>
                      <TableCell className="text-right">{manager.jobsAssigned}</TableCell>
                      <TableCell className="text-right">{manager.feedbackGiven}</TableCell>
                      <TableCell className="text-right">{manager.avgFeedbackDays}d</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-center py-8">No hiring manager data yet</p>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </Layout>
  );
}
