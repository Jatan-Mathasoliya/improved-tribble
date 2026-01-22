import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Layout from "@/components/Layout";
import type { Job, Application, PipelineStage } from "@shared/schema";
import { TimeSeriesChart } from "@/components/dashboards/TimeSeriesChart";
import { StageFunnel } from "@/components/dashboards/StageFunnel";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Mail, Send, Loader2 } from "lucide-react";
import { RecruiterKpiRibbon } from "@/components/recruiter/RecruiterKpiRibbon";
import { PipelineActionChecklist } from "@/components/recruiter/PipelineActionChecklist";
import { AiPipelineSummary } from "@/components/recruiter/AiPipelineSummary";
import { ProfileCompletionBanner } from "@/components/ProfileCompletionBanner";
import type { PipelineData } from "@/lib/pipeline-types";
// Extended types for API responses with relations
type ApplicationWithJob = Application & {
  job?: { title: string };
};

type JobWithCounts = Job & {
  company?: string;
  applicationCount?: number;
};

type HiringMetrics = {
  timeToFill: {
    overall: number | null;
    byJob: Array<{
      jobId: number;
      jobTitle: string;
      averageDays: number;
      hiredCount: number;
      oldestHireDate: string | null;
      newestHireDate: string | null;
    }>;
  };
  timeInStage: Array<{
    stageId: number;
    stageName: string;
    stageOrder: number;
    averageDays: number;
    transitionCount: number;
    minDays: number;
    maxDays: number;
  }>;
  totalApplications: number;
  totalHires: number;
  conversionRate: number;
};

type JobHealth = {
  jobId: number;
  jobTitle: string;
  isActive: boolean;
  status: "green" | "amber" | "red";
  reason: string;
  totalApplications: number;
  daysSincePosted: number;
  daysSinceLastApplication: number | null;
  conversionRate: number;
};

type AnalyticsNudges = {
  jobsNeedingAttention: JobHealth[];
  staleCandidates: Array<{
    jobId: number;
    jobTitle: string;
    count: number;
    oldestStaleDays: number;
  }>;
};

type DashboardAiInsights = {
  summary: string;
  dropoffExplanation: string;
  jobs: Array<{ jobId: number; nextAction: string }>;
  generatedAt: string;
};

const RANGE_PRESETS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export default function RecruiterDashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [rangePreset, setRangePreset] = useState<keyof typeof RANGE_PRESETS>("30d");
  const [selectedJobId, setSelectedJobId] = useState<number | "all">("all");

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

  const { data: hiringMetrics } = useQuery<HiringMetrics>({
    queryKey: ["/api/analytics/hiring-metrics", rangePreset, selectedJobId],
    queryFn: async () => {
      const params = new URLSearchParams();
      const days = RANGE_PRESETS[rangePreset] ?? 30;
      const end = new Date();
      const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
      params.set("startDate", start.toISOString());
      params.set("endDate", end.toISOString());
      if (selectedJobId !== "all") params.set("jobId", String(selectedJobId));
      const res = await fetch(`/api/analytics/hiring-metrics?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch hiring metrics");
      return res.json();
    },
  });

  const { data: jobHealth = [] } = useQuery<JobHealth[]>({
    queryKey: ["/api/analytics/job-health"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/job-health", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch job health");
      return res.json();
    },
  });

  const { data: nudges } = useQuery<AnalyticsNudges>({
    queryKey: ["/api/analytics/nudges"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/nudges", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch analytics nudges");
      return res.json();
    },
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

  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      const appliedAt = new Date(app.appliedAt);
      const withinRange = appliedAt >= dateStart && appliedAt <= dateEnd;
      const matchesJob = selectedJobId === "all" ? true : app.jobId === selectedJobId;
      return withinRange && matchesJob;
    });
  }, [applications, dateStart, dateEnd, selectedJobId]);

  type DropoffResponse = {
    stages: Array<{ stageId: number; name: string; order: number; count: number }>;
    unassigned: number;
    conversions: Array<{ name: string; count: number; rate: number }>;
  };

type HmFeedbackResponse = {
  averageDays: number | null;
  waitingCount: number;
  sampleSize: number;
};

  const commonParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("startDate", dateStart.toISOString());
    params.set("endDate", dateEnd.toISOString());
    if (selectedJobId !== "all") params.set("jobId", String(selectedJobId));
    return params.toString();
  }, [dateStart, dateEnd, selectedJobId]);

  const { data: dropoffData } = useQuery<DropoffResponse>({
    queryKey: ["/api/analytics/dropoff", commonParams],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/dropoff?${commonParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch dropoff analytics");
      return res.json();
    },
  });

  // Derive default review/next stages for HM feedback analytics
  const reviewStageIds = useMemo(
    () =>
      pipelineStages
        .filter((s) => s.name.toLowerCase().includes("review"))
        .map((s) => s.id),
    [pipelineStages]
  );
  const nextStageIds = useMemo(
    () =>
      pipelineStages
        .filter((s) => {
          const name = s.name.toLowerCase();
          return name.includes("interview") || name.includes("offer");
        })
        .map((s) => s.id),
    [pipelineStages]
  );
  const { data: hmFeedback } = useQuery<HmFeedbackResponse>({
    queryKey: ["/api/analytics/hm-feedback", commonParams, reviewStageIds, nextStageIds],
    queryFn: async () => {
      const params = new URLSearchParams(commonParams);
      if (reviewStageIds.length) {
        reviewStageIds.forEach((id) => params.append("reviewStageIds", String(id)));
      }
      if (nextStageIds.length) {
        nextStageIds.forEach((id) => params.append("nextStageIds", String(id)));
      }
      const res = await fetch(`/api/analytics/hm-feedback?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch HM feedback timing");
      return res.json();
    },
  });

  const stats = useMemo(() => {
    const totalJobs = filteredJobs.length;
    const activeJobs = filteredJobs.filter((job) => job.isActive).length;
    const totalApplications = filteredApplications.length;
    const totalHires =
      hiringMetrics?.totalHires ??
      filteredApplications.filter(
        (app) =>
          app.status === "hired" ||
          pipelineStages.find((s) => s.id === app.currentStage)?.name?.toLowerCase().includes("hire")
      ).length;
    const conversionRate =
      totalApplications > 0 ? Math.round((totalHires / totalApplications) * 1000) / 10 : 0;
    const avgTimeToFill = hiringMetrics?.timeToFill.overall ?? null;
    const hmFeedbackStage = hiringMetrics?.timeInStage.find((stage) =>
      stage.stageName.toLowerCase().includes("review")
    );
    const hmFeedbackTime = hmFeedback?.averageDays ?? hmFeedbackStage?.averageDays ?? null;
    const newToday = filteredApplications.filter((app) => {
      const applied = new Date(app.appliedAt);
      const today = new Date();
      return applied.toDateString() === today.toDateString();
    }).length;

    const firstActionDurations: number[] = [];
    filteredApplications.forEach((app) => {
      if (app.stageChangedAt) {
        const delta = (new Date(app.stageChangedAt).getTime() - new Date(app.appliedAt).getTime()) / (1000 * 60 * 60 * 24);
        if (delta >= 0) firstActionDurations.push(delta);
      }
    });
    const avgFirstReview = firstActionDurations.length
      ? Math.round((firstActionDurations.reduce((a, b) => a + b, 0) / firstActionDurations.length) * 10) / 10
      : null;

    let interviewConv = 0;
    if (dropoffData?.conversions?.length) {
      const interviewStep = dropoffData.conversions.find((c) => c.name.toLowerCase().includes("interview"));
      if (interviewStep) interviewConv = interviewStep.rate;
    } else {
      const screeningIds = pipelineStages.filter((s) => s.name.toLowerCase().includes("screen")).map((s) => s.id);
      const interviewIds = pipelineStages.filter((s) => s.name.toLowerCase().includes("interview")).map((s) => s.id);
      const screeningCount = filteredApplications.filter((a) => a.currentStage && screeningIds.includes(a.currentStage)).length;
      const interviewCount = filteredApplications.filter((a) => a.currentStage && interviewIds.includes(a.currentStage)).length;
      interviewConv = screeningCount > 0 ? Math.round((interviewCount / screeningCount) * 1000) / 10 : 0;
    }

    return {
      totalJobs,
      activeJobs,
      totalApplications,
      totalHires,
      conversionRate,
      avgTimeToFill,
      hmFeedbackTime,
      newToday,
      avgFirstReview,
      interviewConv,
    };
  }, [filteredJobs, filteredApplications, hiringMetrics, pipelineStages, hmFeedback, dropoffData]);

  const pipelineHealthScore = useMemo(() => {
    // No jobs = no data to show, indicate empty state
    if (!jobHealth.length) return { score: 0, tag: "No data", isEmpty: true };
    const weight = { green: 95, amber: 68, red: 40 };
    const avg =
      jobHealth.reduce((sum, j) => sum + (weight[j.status] ?? 70), 0) / jobHealth.length;
    const tag = avg >= 80 ? "Healthy" : avg >= 60 ? "Stable" : "At risk";
    return { score: Math.round(avg), tag, isEmpty: false };
  }, [jobHealth]);

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
    if (dropoffData) {
      const stageColorMap = new Map(pipelineStages.map((s) => [s.id, s.color]));
      const sorted = [...dropoffData.stages].sort((a, b) => a.order - b.order);
      const unassigned = dropoffData.unassigned
        ? [{ name: "Unassigned", count: dropoffData.unassigned, color: "#94a3b8", order: -1 }]
        : [];
      return [
        ...unassigned,
        ...sorted.map((s) => ({
          name: s.name,
          count: s.count,
          color: stageColorMap.get(s.stageId) || "#64748b",
          order: s.order,
          stageId: s.stageId,
        })),
      ];
    }
    // Fallback to client-side derivation
    const counts: Record<string, number> = {};
    filteredApplications.forEach((app) => {
      const key = app.currentStage ? String(app.currentStage) : "unassigned";
      counts[key] = (counts[key] || 0) + 1;
    });
    const sortedStages = [...pipelineStages].sort((a, b) => a.order - b.order);
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
  }, [dropoffData, filteredApplications, pipelineStages]);

  const dropoffInsights = useMemo(() => {
    if (dropoffData?.conversions) {
      const weakest = [...dropoffData.conversions]
        .filter((c) => c.rate !== 100)
        .sort((a, b) => a.rate - b.rate)[0];
      return { conversions: dropoffData.conversions, weakest };
    }
    const sortedStages = [...pipelineStages].sort((a, b) => a.order - b.order);
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
  }, [dropoffData, filteredApplications, pipelineStages]);

  const jobsNeedingAttention = useMemo(() => {
    if (nudges?.jobsNeedingAttention?.length) {
      return [...nudges.jobsNeedingAttention].sort((a, b) => {
        const weight = { red: 2, amber: 1, green: 0 } as const;
        return (weight[b.status] ?? 0) - (weight[a.status] ?? 0);
      });
    }
    return [...jobHealth].sort((a, b) => (a.status === "red" ? -1 : b.status === "red" ? 1 : 0));
  }, [nudges, jobHealth]);

  const jdSuggestions = useMemo(() => {
    const suggestions: Array<{
      jobId: number;
      title: string;
      score: string;
      tips: string[];
    }> = [];
    filteredJobs.forEach((job) => {
      const tips: string[] = [];
      const descriptionLength = job.description?.length || 0;
      if (!job.location) tips.push("Add a location or remote policy to increase clarity.");
      if (descriptionLength < 400) tips.push("Expand responsibilities and success criteria (JD is very short).");
      if ((job.skills || []).length < 3) tips.push("List 3–5 must-have skills to improve screening.");
      if (descriptionLength > 2000) tips.push("Break long paragraphs into bullets for readability.");
      if (tips.length > 0) {
        const score = tips.length >= 3 ? "Needs improvement" : "Moderate";
        suggestions.push({ jobId: job.id, title: job.title, score, tips });
      }
    });
    return suggestions;
  }, [filteredJobs]);

  const aiSummaryText = useMemo(() => {
    const amber = jobHealth.filter((j) => j.status === "amber").length;
    const red = jobHealth.filter((j) => j.status === "red").length;
    const weakestDrop = dropoffInsights.weakest;
    if (red > 0) {
      return `Pipeline risk: ${red} job(s) are red and need movement. ${
        weakestDrop ? `${weakestDrop.name} conversion is ${weakestDrop.rate}%` : ""
      }`;
    }
    if (amber > 0) {
      return `Stable but watchlist: ${amber} job(s) flagged. ${
        weakestDrop ? `${weakestDrop.name} conversion is ${weakestDrop.rate}%` : ""
      }`;
    }
    return weakestDrop
      ? `Pipeline is healthy. Watch ${weakestDrop.name} conversion (${weakestDrop.rate}%).`
      : "Pipeline is healthy. No major bottlenecks detected.";
  }, [jobHealth, dropoffInsights]);

  // Derive trends from time-series (compare last 7 days vs previous 7)
  const appsTrend = useMemo(() => {
    if (timeSeriesData.length < 14) return { trend: "flat" as const, value: "" };
    const recent = timeSeriesData.slice(-7).reduce((s, d) => s + d.value, 0);
    const prior = timeSeriesData.slice(-14, -7).reduce((s, d) => s + d.value, 0);
    if (prior === 0) return { trend: "flat" as const, value: "" };
    const pct = Math.round(((recent - prior) / prior) * 100);
    return {
      trend: pct > 5 ? "up" as const : pct < -5 ? "down" as const : "flat" as const,
      value: pct > 0 ? `+${pct}%` : `${pct}%`,
    };
  }, [timeSeriesData]);

  const kpiItems = useMemo(
    () => [
      {
        label: "Pipeline Health",
        value: pipelineHealthScore.isEmpty ? "—" : `${pipelineHealthScore.score}%`,
        hint: pipelineHealthScore.isEmpty ? "Post a job to get started" : pipelineHealthScore.tag,
        trend: pipelineHealthScore.isEmpty ? "flat" as const : pipelineHealthScore.score >= 70 ? "up" as const : pipelineHealthScore.score >= 50 ? "flat" as const : "down" as const,
      },
      {
        label: "Active Roles",
        value: stats.activeJobs,
        secondary: "Open positions",
      },
      {
        label: "Today's Apps",
        value: stats.newToday ?? 0,
        trend: appsTrend.trend,
        trendValue: appsTrend.value || undefined,
        secondary: "vs last week",
      },
      {
        label: "First Review",
        value: stats.avgFirstReview != null ? `${stats.avgFirstReview}d` : "—",
        trend: stats.avgFirstReview != null && stats.avgFirstReview <= 2 ? "up" as const : stats.avgFirstReview != null && stats.avgFirstReview > 4 ? "down" as const : "flat" as const,
        secondary: "Avg response time",
      },
      {
        label: "To Interview",
        value: `${stats.interviewConv}%`,
        trend: stats.interviewConv >= 30 ? "up" as const : stats.interviewConv >= 15 ? "flat" as const : "down" as const,
        secondary: "Screen → Interview",
      },
    ],
    [stats, pipelineHealthScore, appsTrend]
  );

  const stageBottlenecks = useMemo(() => {
    const stuckThresholdDays = 3;
    const now = new Date().getTime();
    const bottlenecks: Array<{ stage: string; message: string; actionLabel: string }> = [];
    pipelineStages.forEach((stage) => {
      const appsInStage = filteredApplications.filter((a) => a.currentStage === stage.id);
      const stuck = appsInStage.filter((a) => {
        if (!a.stageChangedAt) return false;
        const days = (now - new Date(a.stageChangedAt).getTime()) / (1000 * 60 * 60 * 24);
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
  }, [pipelineStages, filteredApplications]);

  const dropoffSteps = useMemo(() => {
    if (dropoffData?.conversions?.length) {
      return dropoffData.conversions.map((c) => ({
        name: c.name,
        count: dropoffData.stages.find((s) => s.name === c.name)?.count ?? c.count,
        rate: c.rate,
      }));
    }
    return dropoffInsights.conversions.map((c) => ({
      name: c.name,
      count: c.count,
      rate: c.rate,
    }));
  }, [dropoffData, dropoffInsights]);

  const dropoffSummary = useMemo(() => {
    const weakest = dropoffInsights.weakest || dropoffData?.conversions?.find((c) => c.rate === Math.min(...(dropoffData?.conversions.map((x) => x.rate) || [0])));
    if (weakest) {
      return `Conversion into ${weakest.name} is ${weakest.rate}%. Consider nudging candidates or refining screening.`;
    }
    return "Pipeline is steady. No major drop-offs detected.";
  }, [dropoffInsights, dropoffData]);

  // Transform data for PipelineActionChecklist
  const actionChecklistData: PipelineData = useMemo(() => {
    const now = new Date().getTime();
    const stuckThresholdDays = 3;

    // Calculate stuck candidates by stage with max days
    const stuckByStage: PipelineData["stuckByStage"] = {};
    pipelineStages.forEach((stage) => {
      const appsInStage = filteredApplications.filter((a) => a.currentStage === stage.id);
      let maxDays = 0;
      let count = 0;
      appsInStage.forEach((a) => {
        if (a.stageChangedAt) {
          const days = (now - new Date(a.stageChangedAt).getTime()) / (1000 * 60 * 60 * 24);
          if (days >= stuckThresholdDays) {
            count++;
            maxDays = Math.max(maxDays, Math.floor(days));
          }
        }
      });
      if (count > 0) {
        stuckByStage[stage.id] = { count, maxDays, stageName: stage.name };
      }
    });

    // Unreviewed applications (applied stage, no action yet)
    const appliedStage = pipelineStages.find((s) => s.name.toLowerCase() === "applied");
    const unreviewedApps = appliedStage
      ? filteredApplications.filter((a) => a.currentStage === appliedStage.id)
      : [];
    let oldestUnreviewedHours = 0;
    unreviewedApps.forEach((a) => {
      const hours = (now - new Date(a.appliedAt).getTime()) / (1000 * 60 * 60);
      oldestUnreviewedHours = Math.max(oldestUnreviewedHours, hours);
    });

    // Pending offers - candidates in "Offer Extended" stage
    const offerStage = pipelineStages.find(
      (s) => s.name.toLowerCase().includes("offer") && !s.name.toLowerCase().includes("reject")
    );
    const pendingOffers: PipelineData["pendingOffers"] = [];
    if (offerStage) {
      filteredApplications
        .filter((a) => a.currentStage === offerStage.id)
        .forEach((a) => {
          if (a.stageChangedAt) {
            const daysSinceSent = Math.floor(
              (now - new Date(a.stageChangedAt).getTime()) / (1000 * 60 * 60 * 24)
            );
            pendingOffers.push({
              applicationId: a.id,
              candidateName: a.name || `Candidate #${a.id}`,
              daysSinceSent,
            });
          }
        });
    }

    // Shortlisted but no interview scheduled
    const screeningStage = pipelineStages.find((s) => s.name.toLowerCase().includes("screen"));
    const shortlistedNoInterview = screeningStage
      ? filteredApplications.filter(
          (a) => a.currentStage === screeningStage.id && a.status === "shortlisted"
        ).length
      : 0;

    // Jobs with low pipeline (< 3 active candidates)
    const jobsWithLowPipeline: PipelineData["jobsWithLowPipeline"] = [];
    filteredJobs.forEach((job) => {
      if (!job.isActive) return;
      const activeApps = filteredApplications.filter(
        (a) => a.jobId === job.id && a.status !== "rejected" && a.status !== "hired"
      );
      if (activeApps.length < 3) {
        jobsWithLowPipeline.push({
          jobId: job.id,
          title: job.title,
          activeCount: activeApps.length,
        });
      }
    });

    // JD quality issues (reuse jdSuggestions)
    const jdIssues: PipelineData["jdIssues"] = jdSuggestions.map((j) => ({
      jobId: j.jobId,
      title: j.title,
      issue: j.tips[0] || "Needs improvement",
    }));

    // Stale jobs (no activity > 30 days)
    const staleJobs: PipelineData["staleJobs"] = [];
    filteredJobs.forEach((job) => {
      if (!job.isActive) return;
      const jobApps = filteredApplications.filter((a) => a.jobId === job.id);
      let lastActivity = new Date(job.createdAt || now).getTime();
      jobApps.forEach((a) => {
        const appDate = new Date(a.appliedAt).getTime();
        const stageDate = a.stageChangedAt ? new Date(a.stageChangedAt).getTime() : 0;
        lastActivity = Math.max(lastActivity, appDate, stageDate);
      });
      const daysSinceActivity = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));
      if (daysSinceActivity >= 30) {
        staleJobs.push({ jobId: job.id, title: job.title, daysSinceActivity });
      }
    });

    return {
      stuckByStage,
      unreviewedCount: unreviewedApps.length,
      oldestUnreviewedHours,
      pendingOffers,
      shortlistedNoInterview,
      jobsWithLowPipeline,
      jdIssues,
      staleJobs,
      candidatesNeedingUpdate: 0, // Would require email tracking to implement
    };
  }, [filteredApplications, filteredJobs, pipelineStages, jdSuggestions]);

  // Batched AI insights - one call per day, cached server-side
  const aiPayload = useMemo(() => {
    if (!pipelineHealthScore || !jobsNeedingAttention.length) return null;
    return {
      pipelineHealthScore,
      timeRangeLabel: `Last ${RANGE_PRESETS[rangePreset]} days`,
      applicationsOverTime: timeSeriesData.slice(-14),
      stageDistribution: funnelData.map((f) => ({ name: f.name, count: f.count })),
      dropoff: dropoffSteps,
      timeInStage: hiringMetrics?.timeInStage?.map((t) => ({ stageName: t.stageName, averageDays: t.averageDays })) || [],
      jobsNeedingAttention: jobsNeedingAttention.map((job) => ({
        jobId: job.jobId,
        title: job.jobTitle,
        severity: job.status === "red" ? "high" as const : job.status === "amber" ? "medium" as const : "low" as const,
        reason: job.reason || "Needs movement",
      })),
    };
  }, [pipelineHealthScore, rangePreset, timeSeriesData, funnelData, dropoffSteps, hiringMetrics, jobsNeedingAttention]);

  const { data: aiInsights, isLoading: aiLoading } = useQuery<DashboardAiInsights>({
    queryKey: ["/api/ai/dashboard-insights", aiPayload],
    queryFn: async () => {
      if (!aiPayload) throw new Error("No payload");
      const res = await fetch("/api/ai/dashboard-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(aiPayload),
      });
      if (!res.ok) throw new Error("AI insights failed");
      return res.json();
    },
    enabled: !!aiPayload,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours client-side
    retry: false,
  });

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
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          {/* Header + filters + KPIs */}
          <div className="space-y-3 pt-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold text-foreground">Recruiter Dashboard</h1>
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

            <Card className="shadow-sm border-border" data-tour="dashboard-metrics">
              <CardContent className="pt-4">
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
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Date range" />
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
                      <SelectTrigger className="w-52">
                        <SelectValue placeholder="All jobs" />
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

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2">
              <TimeSeriesChart
                title="Applications over time"
                description={`Applications over time — last ${RANGE_PRESETS[rangePreset]} days (filters applied)`}
                data={timeSeriesData}
                isLoading={applicationsLoading}
              />
              <p className="text-xs text-muted-foreground">Hover to see exact values by day.</p>
            </div>
            <div data-tour="stage-funnel">
              <StageFunnel
                title="Stage distribution"
                description={`Applications by pipeline stage — last ${RANGE_PRESETS[rangePreset]} days (filters applied)`}
                data={funnelData}
                isLoading={applicationsLoading || stagesLoading}
                onStageClick={handleStageClick}
              />
            </div>
          </div>

          {/* AI Summary + Insights */}
          <div data-tour="recent-activity">
            <AiPipelineSummary
              pipelineHealthScore={pipelineHealthScore}
              preGeneratedSummary={aiInsights?.summary}
              aiLoading={aiLoading}
              generatedAt={aiInsights?.generatedAt}
            />
          </div>
          <div data-tour="pipeline-checklist">
            <PipelineActionChecklist
              pipelineData={actionChecklistData}
              pipelineHealthScore={pipelineHealthScore}
            />
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
