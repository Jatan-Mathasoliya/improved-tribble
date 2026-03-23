import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Layout from "@/components/Layout";
import type { Job, Application, PipelineStage } from "@shared/schema";
import { StageFunnel } from "@/components/dashboards/StageFunnel";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Mail, Send, Loader2, ChevronDown } from "lucide-react";
import { RecruiterKpiRibbon } from "@/components/recruiter/RecruiterKpiRibbon";
import { AIActionsPanel } from "@/components/recruiter/AIActionsPanel";
import { TodaysInterviewsPanel } from "@/components/recruiter/TodaysInterviewsPanel";
import { ProfileCompletionBanner } from "@/components/ProfileCompletionBanner";
import { useSubscription } from "@/hooks/use-subscription";
// Extended types for API responses with relations
type ApplicationWithJob = Application & {
  job?: { title: string };
};

type JobWithCounts = Job & {
  company?: string;
  applicationCount?: number;
  clientName?: string | null;
};

type RecruiterJobHealth = {
  jobId: number;
  jobTitle: string;
  status: "green" | "amber" | "red";
  reason: string;
};

const RANGE_PRESETS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function isClosedStageStatus(status: string, stageName = ""): boolean {
  return (
    status === "rejected" ||
    status === "hired" ||
    stageName.includes("rejected") ||
    stageName.includes("hired")
  );
}

function firstRecruiterActionAt(app: ApplicationWithJob): Date | null {
  const appliedAtMs = new Date(app.appliedAt).getTime();
  const candidates = [app.lastViewedAt, app.downloadedAt, app.stageChangedAt]
    .filter((value): value is NonNullable<typeof value> => value != null)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()) && value.getTime() >= appliedAtMs)
    .sort((a, b) => a.getTime() - b.getTime());

  return candidates[0] ?? null;
}

export default function RecruiterDashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [rangePreset, setRangePreset] = useState<keyof typeof RANGE_PRESETS>("30d");
  const [selectedJobId, setSelectedJobId] = useState<number | "all">("all");

  // Fetch subscription to show plan badge
  const { data: subscriptionData } = useSubscription();
  const planName = subscriptionData?.plan?.displayName || "Free";

  // Hiring Manager Invitation state
  const [showInviteHMDialog, setShowInviteHMDialog] = useState(false);
  const [inviteHMEmail, setInviteHMEmail] = useState("");
  const [inviteHMName, setInviteHMName] = useState("");

  // Invite hiring manager mutation
  const inviteHiringManagerMutation = useMutation({
    mutationFn: async (data: { email: string; name?: string }) => {
      const res = await apiRequest("POST", "/api/hiring-manager-invitations", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Invitation Sent",
        description: `Invitation sent to ${inviteHMEmail}`,
      });
      setShowInviteHMDialog(false);
      setInviteHMEmail("");
      setInviteHMName("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Send Invitation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Fetch recruiter's jobs
  const { data: jobs = [], isLoading: jobsLoading } = useQuery<JobWithCounts[]>({
    queryKey: ["/api/my-jobs"],
  });

  // Fetch all applications for recruiter's jobs
  const { data: applications = [], isLoading: applicationsLoading } = useQuery<ApplicationWithJob[]>({
    queryKey: ["/api/my-applications-received"],
  });

  // Fetch pipeline stages
  const { data: pipelineStages = [], isLoading: stagesLoading } = useQuery<PipelineStage[]>({
    queryKey: ["/api/pipeline/stages"],
  });

  const days = RANGE_PRESETS[rangePreset] ?? 30;
  const dateEnd = useMemo(() => new Date(), [rangePreset]);
  const dateStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }, [days]);

  const filteredJobs = useMemo(() => {
    if (selectedJobId === "all") return jobs;
    return jobs.filter((job) => job.id === selectedJobId);
  }, [jobs, selectedJobId]);

  const currentApplications = useMemo(() => {
    return applications.filter((app) =>
      selectedJobId === "all" ? true : app.jobId === selectedJobId,
    );
  }, [applications, selectedJobId]);

  const filteredApplications = useMemo(() => {
    return currentApplications.filter((app) => {
      const appliedAt = new Date(app.appliedAt);
      return appliedAt >= dateStart && appliedAt <= dateEnd;
    });
  }, [currentApplications, dateStart, dateEnd]);

  const stageNameById = useMemo(
    () =>
      new Map(
        pipelineStages.map((stage) => [stage.id, stage.name.toLowerCase()]),
      ),
    [pipelineStages],
  );

  const stageById = useMemo(
    () => new Map(pipelineStages.map((stage) => [stage.id, stage])),
    [pipelineStages],
  );

  const activeFilteredJobs = useMemo(
    () => filteredJobs.filter((job) => job.isActive),
    [filteredJobs],
  );

  const currentActivePipelineApplications = useMemo(
    () =>
      currentApplications.filter((app) => {
        const stageName = stageNameById.get(app.currentStage ?? -1) ?? "";
        return !isClosedStageStatus(app.status, stageName);
      }),
    [currentApplications, stageNameById],
  );

  const stats = useMemo(() => {
    const totalJobs = filteredJobs.length;
    const activeJobs = activeFilteredJobs.length;
    const totalApplications = currentApplications.length;
    const totalHires = filteredApplications.filter((app) => {
      const stageName = stageNameById.get(app.currentStage ?? -1) ?? "";
      return app.status === "hired" || stageName.includes("hired");
    }).length;
    const newToday = currentApplications.filter((app) => {
      const applied = new Date(app.appliedAt);
      const today = new Date();
      return applied.toDateString() === today.toDateString();
    }).length;

    const firstActionDurations: number[] = [];
    filteredApplications.forEach((app) => {
      const firstActionAt = firstRecruiterActionAt(app);
      if (firstActionAt) {
        const delta =
          (firstActionAt.getTime() - new Date(app.appliedAt).getTime()) /
          (1000 * 60 * 60 * 24);
        if (delta >= 0) firstActionDurations.push(delta);
      }
    });
    const avgFirstReview = firstActionDurations.length
      ? Math.round((firstActionDurations.reduce((a, b) => a + b, 0) / firstActionDurations.length) * 10) / 10
      : null;

    const sortedStages = [...pipelineStages].sort((a, b) => (a.order - b.order) || (a.id - b.id));
    const screeningStage = sortedStages.find((stage) => stage.name.toLowerCase().includes("screen"));
    const interviewStage = sortedStages.find((stage) => stage.name.toLowerCase().includes("interview"));
    const screeningOrder = screeningStage?.order ?? null;
    const interviewOrder = interviewStage?.order ?? null;

    const screeningCount = filteredApplications.filter((app) => {
      if (app.currentStage == null || screeningOrder == null) return false;
      const stage = stageById.get(app.currentStage);
      if (!stage) return false;
      return (stage.order ?? -1) >= screeningOrder;
    }).length;
    const interviewCount = filteredApplications.filter((app) => {
      if (app.currentStage == null || interviewOrder == null) return false;
      const stage = stageById.get(app.currentStage);
      if (!stage) return false;
      return (stage.order ?? -1) >= interviewOrder;
    }).length;
    const interviewConv =
      screeningCount > 0 ? Math.round((interviewCount / screeningCount) * 1000) / 10 : 0;

    return {
      totalJobs,
      activeJobs,
      totalApplications,
      totalHires,
      newToday,
      avgFirstReview,
      interviewConv,
    };
  }, [filteredJobs, activeFilteredJobs, currentApplications, filteredApplications, pipelineStages, stageById, stageNameById]);

  const timeSeriesData = useMemo(() => {
    const buckets: Record<string, number> = {};
    const cursor = new Date(dateStart);
    while (cursor <= dateEnd) {
      const key = cursor.toISOString().slice(0, 10);
      buckets[key] = 0;
      cursor.setDate(cursor.getDate() + 1);
    }
    filteredApplications.forEach((app) => {
      const dateKey = new Date(app.appliedAt).toISOString().slice(0, 10);
      if (buckets[dateKey] !== undefined) buckets[dateKey] += 1;
    });
    return Object.entries(buckets)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredApplications, dateStart, dateEnd]);

  const funnelData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredApplications.forEach((app) => {
      const key = app.currentStage ? String(app.currentStage) : "unassigned";
      counts[key] = (counts[key] || 0) + 1;
    });
    const sortedStages = [...pipelineStages].sort((a, b) => (a.order - b.order) || (a.id - b.id));
    const mapped = sortedStages.map((stage) => ({
      name: stage.name,
      count: counts[String(stage.id)] || 0,
      color: stage.color || "#64748b",
      order: stage.order,
      stageId: stage.id,
    }));
    const unassigned = counts["unassigned"]
      ? [{ name: "Unassigned", count: counts["unassigned"], color: "#94a3b8", order: -1 }]
      : [];
    return [...unassigned, ...mapped];
  }, [filteredApplications, pipelineStages]);

  const dropoffInsights = useMemo(() => {
    const sortedStages = [...pipelineStages].sort((a, b) => (a.order - b.order) || (a.id - b.id));
    const counts = sortedStages.map((stage) => ({
      name: stage.name,
      count: filteredApplications.filter((app) => app.currentStage === stage.id).length,
    }));
    const conversions = counts.map((stage, idx) => {
      if (idx === 0) return { ...stage, rate: 100 };
      const prev = counts[idx - 1]?.count || 0;
      const rate = prev > 0 ? Math.round((stage.count / prev) * 100) : 0;
      return { ...stage, rate };
    });
    const lowest = conversions
      .filter((c) => c.name && c.rate !== 100)
      .sort((a, b) => a.rate - b.rate)[0];
    return { conversions, weakest: lowest };
  }, [filteredApplications, pipelineStages]);

  // Derive trends from time-series (compare last 7 days vs previous 7)
  const appsTrend = useMemo(() => {
    if (timeSeriesData.length < 8) return { trend: "flat" as const, value: "" };
    const today = timeSeriesData[timeSeriesData.length - 1]?.value ?? 0;
    const prior = timeSeriesData[timeSeriesData.length - 8]?.value ?? 0;
    if (prior === 0) return { trend: "flat" as const, value: "" };
    const pct = Math.round(((today - prior) / prior) * 100);
    return {
      trend: pct > 5 ? "up" as const : pct < -5 ? "down" as const : "flat" as const,
      value: pct > 0 ? `+${pct}%` : `${pct}%`,
    };
  }, [timeSeriesData]);

  const stageBottlenecks = useMemo(() => {
    const stuckThresholdDays = 3;
    const now = new Date().getTime();
    const bottlenecks: Array<{ stage: string; message: string; actionLabel: string }> = [];
    pipelineStages.forEach((stage) => {
      const appsInStage = currentActivePipelineApplications.filter((a) => a.currentStage === stage.id);
      const stuck = appsInStage.filter((a) => {
        const referenceTime = a.stageChangedAt ?? a.appliedAt;
        const days = (now - new Date(referenceTime).getTime()) / (1000 * 60 * 60 * 24);
        return days >= stuckThresholdDays;
      });
      if (stuck.length > 0) {
        bottlenecks.push({
          stage: stage.name,
          message: `${stuck.length} candidate(s) in this stage for > ${stuckThresholdDays} days`,
          actionLabel: "View candidates",
        });
      }
    });
    return bottlenecks;
  }, [pipelineStages, currentActivePipelineApplications]);

  const jobsNeedingAttention = useMemo<RecruiterJobHealth[]>(() => {
    const attention = activeFilteredJobs.map((job) => {
      const jobApplications = currentActivePipelineApplications.filter((app) => app.jobId === job.id);
      const rangeApplications = filteredApplications.filter((app) => app.jobId === job.id);
      const activeCount = jobApplications.length;
      const staleCount = jobApplications.filter((app) => {
        const referenceTime = app.stageChangedAt ?? app.appliedAt;
        const waitDays =
          (Date.now() - new Date(referenceTime).getTime()) / (1000 * 60 * 60 * 24);
        return waitDays >= 5;
      }).length;

      let status: RecruiterJobHealth["status"] = "green";
      const reasons: string[] = [];

      if (activeCount === 0) {
        status = "red";
        reasons.push("No active candidates left");
      } else if (activeCount < 3) {
        status = "amber";
        reasons.push(`Only ${activeCount} active candidate${activeCount === 1 ? "" : "s"} left`);
      }

      if (staleCount >= 3) {
        status = "red";
        reasons.push(`${staleCount} candidates stalled in stage`);
      } else if (staleCount > 0 && status === "green") {
        status = "amber";
        reasons.push(`${staleCount} candidate${staleCount === 1 ? "" : "s"} need movement`);
      }

      if (rangeApplications.length === 0 && status !== "red") {
        status = "amber";
        reasons.push(`No new applicants in last ${days}d`);
      }

      return {
        jobId: job.id,
        jobTitle: job.title,
        status,
        reason: reasons[0] ?? "Healthy pipeline",
      };
    });

    return attention.sort((a, b) => {
      const weight = { red: 2, amber: 1, green: 0 } as const;
      return (weight[b.status] ?? 0) - (weight[a.status] ?? 0);
    });
  }, [activeFilteredJobs, currentActivePipelineApplications, filteredApplications, days]);

  const pipelineHealthScore = useMemo(() => {
    if (!activeFilteredJobs.length) return { score: 0, tag: "No data", isEmpty: true };
    const weight = { green: 95, amber: 68, red: 38 };
    const avg =
      jobsNeedingAttention.reduce((sum, job) => sum + (weight[job.status] ?? 70), 0) /
      jobsNeedingAttention.length;
    const tag = avg >= 80 ? "Healthy" : avg >= 60 ? "Stable" : "At risk";
    return { score: Math.round(avg), tag, isEmpty: false };
  }, [activeFilteredJobs.length, jobsNeedingAttention]);

  const kpiItems = useMemo(
    () => [
      {
        label: "Pipeline Health",
        value: pipelineHealthScore.isEmpty ? "—" : `${pipelineHealthScore.score}%`,
        hint: pipelineHealthScore.isEmpty ? "Post a job to get started" : pipelineHealthScore.tag,
        trend: pipelineHealthScore.isEmpty ? "flat" as const : pipelineHealthScore.score >= 70 ? "up" as const : pipelineHealthScore.score >= 50 ? "flat" as const : "down" as const,
        tooltip: "Score based on stage movement, time in stage, drop-offs, and candidates that are stuck in the pipeline.",
        variant: "pipeline" as const,
      },
      {
        label: "Active Roles",
        value: stats.activeJobs,
        secondary: "Open positions",
        tooltip: "Active job requisitions in scope for the current dashboard filter.",
        variant: "roles" as const,
      },
      {
        label: "Today's Apps",
        value: stats.newToday ?? 0,
        trend: appsTrend.trend,
        trendValue: appsTrend.value || undefined,
        tooltip: "Applications received today for the selected jobs, compared with the existing weekly baseline already used by this dashboard.",
        variant: "apps" as const,
      },
      {
        label: "First Review",
        value: stats.avgFirstReview != null ? `${stats.avgFirstReview}d` : "—",
        trend: stats.avgFirstReview != null && stats.avgFirstReview <= 2 ? "up" as const : stats.avgFirstReview != null && stats.avgFirstReview > 4 ? "down" as const : "flat" as const,
        secondary: "Avg response time",
        tooltip: "Average time from application submitted to the first recruiter action.",
        variant: "review" as const,
      },
      {
        label: "To Interview",
        value: `${stats.interviewConv}%`,
        trend: stats.interviewConv >= 30 ? "up" as const : stats.interviewConv >= 15 ? "flat" as const : "down" as const,
        tooltip: "Conversion rate from screening to interview for applications in the current range.",
        variant: "interview" as const,
        secondary: "Screen → Interview",
      },
    ],
    [stats, pipelineHealthScore, appsTrend]
  );

  const dropoffSteps = useMemo(() => {
    return dropoffInsights.conversions.map((c) => ({
      name: c.name,
      count: c.count,
      rate: c.rate,
    }));
  }, [dropoffInsights]);

  const timeInStageSnapshot = useMemo(
    () =>
      pipelineStages
        .map((stage) => {
          const appsInStage = currentActivePipelineApplications.filter((app) => app.currentStage === stage.id);
          if (appsInStage.length === 0) return null;
          const averageDays =
            appsInStage.reduce((sum, app) => {
              const referenceTime = app.stageChangedAt ?? app.appliedAt;
              return sum + ((Date.now() - new Date(referenceTime).getTime()) / (1000 * 60 * 60 * 24));
            }, 0) / appsInStage.length;

          return {
            stageName: stage.name,
            averageDays: Math.round(averageDays * 10) / 10,
          };
        })
        .filter((value): value is { stageName: string; averageDays: number } => value !== null),
    [pipelineStages, currentActivePipelineApplications],
  );

  const handleStageClick = (stage: { stageId?: number; name: string }) => {
    const params = new URLSearchParams();
    if (stage.stageId) {
      params.set("stage", String(stage.stageId));
    } else if (stage.name.toLowerCase() === "unassigned") {
      params.set("stage", "unassigned");
    }
    // TODO: Pass date range filters when the applications page supports them.
    const basePath = selectedJobId === "all" ? "/applications" : `/jobs/${selectedJobId}/applications`;
    const query = params.toString();
    setLocation(query ? `${basePath}?${query}` : basePath);
  };

  if (jobsLoading || applicationsLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16">
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto mt-7 px-4 pb-8 pt-0">
        <div className="space-y-8">
          {/* Header + filters + KPIs */}
          <div className="mt-0 space-y-3 pt-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl md:text-3xl font-semibold text-foreground">Recruiter Dashboard</h1>
                  <Badge variant="outline" className="text-xs font-medium">
                    {planName} Plan
                  </Badge>
                </div>
                <p className="text-muted-foreground text-sm md:text-base">
                  Overview of jobs, applications, and hiring performance
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowInviteHMDialog(true)}
                data-tour="invite-hiring-manager-btn"
              >
                <Mail className="h-4 w-4 mr-2" />
                Invite Hiring Manager
              </Button>
            </div>

            {/* Profile Completion Banner */}
            <ProfileCompletionBanner />

            <Card className="border-0 bg-transparent shadow-none" data-tour="dashboard-metrics">
              <CardContent className="px-0 pt-4">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
                  <div className="text-sm text-muted-foreground">
                    KPIs filtered by{" "}
                    <span className="font-semibold text-foreground">
                      Last {RANGE_PRESETS[rangePreset]} days
                    </span>{" "}
                    ·{" "}
                    <span className="font-semibold text-foreground">
                      {selectedJobId === "all" ? "All jobs" : `Job #${selectedJobId}`}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Select value={rangePreset} onValueChange={(val) => setRangePreset(val as keyof typeof RANGE_PRESETS)}>
                      <SelectTrigger className="h-11 w-[164px] rounded-2xl border-[#E5E7EB] bg-[#FAFAFB] px-5 text-[0.95rem] font-semibold text-[#111827] shadow-[0_3px_10px_rgba(15,23,42,0.04)] [&>svg]:hidden">
                        <SelectValue placeholder="Date range" />
                        <ChevronDown className="h-4 w-4 text-[#4B5563]" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7d">Last 7 days</SelectItem>
                        <SelectItem value="30d">Last 30 days</SelectItem>
                        <SelectItem value="90d">Last 90 days</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={selectedJobId === "all" ? "all" : String(selectedJobId)}
                      onValueChange={(val) => setSelectedJobId(val === "all" ? "all" : Number(val))}
                    >
                      <SelectTrigger className="h-11 w-[154px] rounded-2xl border-[#E5E7EB] bg-[#FAFAFB] px-5 text-[0.95rem] font-semibold text-[#111827] shadow-[0_3px_10px_rgba(15,23,42,0.04)] [&>svg]:hidden">
                        <SelectValue placeholder="All jobs" />
                        <ChevronDown className="h-4 w-4 text-[#4B5563]" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All jobs</SelectItem>
                        {jobs.map((job) => (
                          <SelectItem key={job.id} value={String(job.id)}>
                            {job.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <RecruiterKpiRibbon
                  items={kpiItems}
                  heroLabel="Pipeline Health"
                  heroTooltip="Score based on stage movement, time in stage, drop-offs and stuck candidates."
                />
              </CardContent>
            </Card>
          </div>

          {/* Interviews + AI Actions */}
          <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
            <div>
              <TodaysInterviewsPanel jobId={selectedJobId} />
            </div>
            <div data-tour="pipeline-checklist">
              <AIActionsPanel range={rangePreset} jobId={selectedJobId} />
            </div>
          </div>

          <div className="grid gri  d-cols-1 gap-6">
            <div data-tour="stage-funnel">
              <StageFunnel
                title="Pipeline Stage Distribution"
                data={funnelData}
                isLoading={applicationsLoading || stagesLoading}
                onStageClick={handleStageClick}
                rangePreset={rangePreset}
                selectedJobId={selectedJobId}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Invite Hiring Manager Dialog */}
      <Dialog open={showInviteHMDialog} onOpenChange={setShowInviteHMDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Hiring Manager</DialogTitle>
            <DialogDescription>
              Send an email invitation to collaborate on candidate reviews.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="hm-email" className="text-sm font-medium">
                Email <span className="text-destructive">*</span>
              </label>
              <Input
                id="hm-email"
                type="email"
                placeholder="hiring.manager@company.com"
                value={inviteHMEmail}
                onChange={(e) => setInviteHMEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="hm-name" className="text-sm font-medium">
                Name <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="hm-name"
                placeholder="John Smith"
                value={inviteHMName}
                onChange={(e) => setInviteHMName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowInviteHMDialog(false);
                setInviteHMEmail("");
                setInviteHMName("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!inviteHMEmail) {
                  toast({
                    title: "Email Required",
                    description: "Please enter an email address.",
                    variant: "destructive",
                  });
                  return;
                }
                const data: { email: string; name?: string } = { email: inviteHMEmail };
                if (inviteHMName.trim()) {
                  data.name = inviteHMName.trim();
                }
                inviteHiringManagerMutation.mutate(data);
              }}
              disabled={inviteHiringManagerMutation.isPending}
            >
              {inviteHiringManagerMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send Invitation
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
