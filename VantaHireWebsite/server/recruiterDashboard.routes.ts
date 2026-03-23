import type { Express, Request, Response, NextFunction } from "express";
import { inArray, sql } from "drizzle-orm";
import { clientFeedback } from "@shared/schema";
import { requireRole, requireSeat } from "./auth";
import { storage } from "./storage";
import { getUserOrganization } from "./lib/organizationService";
import { db } from "./db";

type DashboardActionSectionId =
  | "candidatesToReview"
  | "jobsLowOnPipeline"
  | "feedbackPending"
  | "finalStageCandidates";

type DashboardActionUrgency = "high" | "medium" | "low";

type DashboardActionItem = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  urgency: DashboardActionUrgency;
  ctaLabel: string;
  ctaHref: string;
  jobId?: number;
  applicationId?: number;
  badge?: string;
};

type DashboardActionSection = {
  id: DashboardActionSectionId;
  title: string;
  description: string;
  count: number;
  emptyMessage: string;
  viewAllHref: string;
  items: DashboardActionItem[];
};

const MAX_ITEMS_PER_SECTION = 4;
const LOW_PIPELINE_THRESHOLD = 3;
const LOW_PIPELINE_JOB_AGE_DAYS = 5;
const REVIEW_WAIT_DAYS = 2;
const FEEDBACK_WAIT_DAYS = 3;
const FINAL_STAGE_WAIT_DAYS = 2;
const RANGE_PRESETS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
} as const;

const sectionOrder: DashboardActionSectionId[] = [
  "candidatesToReview",
  "feedbackPending",
  "finalStageCandidates",
  "jobsLowOnPipeline",
];

type InterviewStageRangePreset = keyof typeof RANGE_PRESETS;
type TodayInterviewStatus = "scheduled" | "upcoming" | "completed";

function daysBetween(dateLike?: string | Date | null): number | null {
  if (!dateLike) return null;
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
}

function applicationHref(jobId: number, applicationId: number, stageId?: number | null): string {
  const params = new URLSearchParams();
  if (stageId != null) {
    params.set("stage", String(stageId));
  }
  params.set("applicationId", String(applicationId));
  const query = params.toString();
  return query ? `/jobs/${jobId}/applications?${query}` : `/jobs/${jobId}/applications`;
}

function isClosedApplication(status: string, stageNameLower = ""): boolean {
  return (
    status === "rejected" ||
    status === "hired" ||
    stageNameLower.includes("rejected") ||
    stageNameLower.includes("hired")
  );
}

function resolveRangePreset(value: unknown): InterviewStageRangePreset {
  if (typeof value === "string" && value in RANGE_PRESETS) {
    return value as InterviewStageRangePreset;
  }
  return "30d";
}

function clampDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWithinWindow(value: string | Date | null | undefined, start: Date, end: Date): boolean {
  const date = clampDate(value);
  if (!date) return false;
  return date >= start && date <= end;
}

function roundRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function formatInterviewTime(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseJobIdParam(value: unknown): number | null {
  if (typeof value !== "string" || value === "all") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveInterviewDate(value: unknown): Date {
  const parsed = typeof value === "string" ? clampDate(value) : null;
  return parsed ?? new Date();
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfWeekMonday(date: Date): Date {
  const result = startOfDay(date);
  const day = result.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + offset);
  return result;
}

function parseTimeToMinutes(value?: string | null): number | null {
  const normalized = formatInterviewTime(value);
  if (!normalized) return null;
  const parts = normalized.split(":");
  if (parts.length !== 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function resolveInterviewStatus(
  interviewDate: Date | null,
  interviewTime?: string | null,
  now = new Date(),
): TodayInterviewStatus {
  if (!interviewDate) return "scheduled";

  const interviewDay = startOfDay(interviewDate).getTime();
  const today = startOfDay(now).getTime();

  if (interviewDay > today) return "scheduled";
  if (interviewDay < today) return "completed";

  const scheduledMinutes = parseTimeToMinutes(interviewTime);
  if (scheduledMinutes == null) return "upcoming";

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return scheduledMinutes > currentMinutes ? "upcoming" : "completed";
}

async function getRecruiterDashboardContext(user: NonNullable<Request["user"]>) {
  const orgResult = await getUserOrganization(user.id);
  const organizationId =
    user.role === "super_admin" && !orgResult
      ? undefined
      : (orgResult?.organization.id ?? null);

  const [jobs, applications, stages] = await Promise.all([
    storage.getJobsByUser(user.id, organizationId),
    storage.getRecruiterApplications(user.id, organizationId),
    storage.getPipelineStages(organizationId, user.id),
  ]);

  return {
    orgResult,
    organizationId,
    jobs,
    applications,
    stages,
  };
}

export function registerRecruiterDashboardRoutes(app: Express): void {
  app.get(
    "/api/recruiter-dashboard/actions",
    requireRole(["recruiter", "super_admin"]),
    requireSeat({ allowNoOrg: true }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const user = req.user!;
        const rangePreset = resolveRangePreset(req.query.range);
        const rangeDays = RANGE_PRESETS[rangePreset];
        const rangeStart = addDays(new Date(), -rangeDays);
        const selectedJobId = parseJobIdParam(req.query.jobId);
        const { orgResult, jobs, applications, stages } = await getRecruiterDashboardContext(user);
        const jobsInScope = jobs.filter((job) => selectedJobId == null || job.id === selectedJobId);

        const jobMeta = new Map(
          jobsInScope.map((job) => [
            job.id,
            {
              title: job.title,
              isActive: job.isActive,
              hiringManagerAssigned: Boolean(job.hiringManager),
              clientAssigned: Boolean(job.clientName),
            },
          ]),
        );

        const stageMeta = new Map(
          stages.map((stage) => [
            stage.id,
            {
              id: stage.id,
              name: stage.name,
              nameLower: stage.name.toLowerCase(),
              order: stage.order,
            },
          ]),
        );

        const activeJobIds = new Set(
          jobsInScope.filter((job) => job.isActive).map((job) => job.id),
        );
        const recruiterScopedApplications = applications.filter((app) => activeJobIds.has(app.jobId));

        const clientFeedbackCounts: Record<number, number> = {};
        const clientFeedbackAppIds = recruiterScopedApplications
          .filter((app) => jobMeta.get(app.jobId)?.clientAssigned)
          .map((app) => app.id);

        if (clientFeedbackAppIds.length > 0) {
          const feedbackRows = await db
            .select({
              applicationId: clientFeedback.applicationId,
              count: sql<number>`count(*)::int`,
            })
            .from(clientFeedback)
            .where(inArray(clientFeedback.applicationId, clientFeedbackAppIds))
            .groupBy(clientFeedback.applicationId);

          for (const row of feedbackRows) {
            clientFeedbackCounts[row.applicationId] = row.count;
          }
        }

        const applicationListHref =
          selectedJobId == null ? "/applications" : `/jobs/${selectedJobId}/applications`;
        const sourcingListHref =
          selectedJobId == null ? "/my-jobs" : `/jobs/${selectedJobId}/sourcing`;

        const candidatesToReview = recruiterScopedApplications
          .filter((app) => {
            const currentStage = app.currentStage ? stageMeta.get(app.currentStage) : undefined;
            const isAppliedStage =
              currentStage?.nameLower === "applied" || app.currentStage == null;
            if (isClosedApplication(app.status, currentStage?.nameLower)) return false;
            if (!isWithinWindow(app.appliedAt, rangeStart, new Date())) return false;
            return app.status === "submitted" || (!app.lastViewedAt && isAppliedStage);
          })
          .sort((a, b) => {
            const waitDelta =
              (daysBetween(b.lastViewedAt ?? b.appliedAt) ?? 0) -
              (daysBetween(a.lastViewedAt ?? a.appliedAt) ?? 0);
            if (waitDelta !== 0) return waitDelta;
            const fitDelta = (b.aiFitScore ?? -1) - (a.aiFitScore ?? -1);
            if (fitDelta !== 0) return fitDelta;
            return new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime();
          });

        const jobsLowOnPipeline = jobsInScope
          .filter((job) => job.isActive)
          .map((job) => {
            const activeCount = recruiterScopedApplications.filter((app) => {
              if (app.jobId !== job.id) return false;
              const stageName = stageMeta.get(app.currentStage ?? -1)?.nameLower ?? "";
              return !isClosedApplication(app.status, stageName);
            }).length;
            const jobAgeDays = daysBetween(job.createdAt) ?? 0;
            return { job, activeCount, jobAgeDays };
          })
          .filter(({ activeCount, jobAgeDays }) =>
            activeCount < LOW_PIPELINE_THRESHOLD && (jobAgeDays >= LOW_PIPELINE_JOB_AGE_DAYS || activeCount === 0),
          )
          .sort((a, b) => {
            if (a.activeCount !== b.activeCount) return a.activeCount - b.activeCount;
            return b.jobAgeDays - a.jobAgeDays;
          });

        const feedbackPending = recruiterScopedApplications
          .filter((app) => {
            const meta = jobMeta.get(app.jobId);
            if (!meta) return false;
            if (!meta.hiringManagerAssigned && !meta.clientAssigned) return false;

            const stage = app.currentStage ? stageMeta.get(app.currentStage) : undefined;
            const stageName = stage?.nameLower ?? "";
            if (isClosedApplication(app.status, stageName)) return false;
            const isDecisionStage =
              app.status === "shortlisted" ||
              stageName.includes("interview") ||
              stageName.includes("offer") ||
              stageName.includes("review") ||
              stageName.includes("final");
            if (!isDecisionStage) return false;

            const hmPending = meta.hiringManagerAssigned && (app.feedbackCount ?? 0) === 0;
            const clientPending = meta.clientAssigned && (clientFeedbackCounts[app.id] ?? 0) === 0;
            const anchor = clampDate(app.stageChangedAt ?? app.appliedAt);
            if (!anchor || anchor < rangeStart) return false;
            const waitDays = daysBetween(anchor) ?? 0;
            return (hmPending || clientPending) && waitDays >= FEEDBACK_WAIT_DAYS;
          })
          .sort((a, b) => {
            const aDays = daysBetween(a.stageChangedAt ?? a.appliedAt) ?? 0;
            const bDays = daysBetween(b.stageChangedAt ?? b.appliedAt) ?? 0;
            return bDays - aDays;
          });

        const finalStageCandidates = recruiterScopedApplications
          .filter((app) => {
            const stage = app.currentStage ? stageMeta.get(app.currentStage) : undefined;
            const stageName = stage?.nameLower ?? "";
            if (isClosedApplication(app.status, stageName)) return false;
            const interviewDone =
              Boolean(app.interviewDate) &&
              app.interviewDate !== null &&
              new Date(app.interviewDate).getTime() <= Date.now() &&
              stageName.includes("interview");
            const anchor = clampDate(app.stageChangedAt ?? app.interviewDate ?? app.updatedAt ?? app.appliedAt);
            if (!anchor || anchor < rangeStart) return false;
            const waitDays = daysBetween(anchor) ?? 0;
            return (
              stageName.includes("offer") ||
              stageName.includes("final") ||
              interviewDone ||
              (stageName.includes("interview") && waitDays >= FINAL_STAGE_WAIT_DAYS)
            );
          })
          .sort((a, b) => {
            const aDays = daysBetween(a.stageChangedAt ?? a.interviewDate ?? a.updatedAt ?? a.appliedAt) ?? 0;
            const bDays = daysBetween(b.stageChangedAt ?? b.interviewDate ?? b.updatedAt ?? b.appliedAt) ?? 0;
            return bDays - aDays;
          });

        const sectionsById: Record<DashboardActionSectionId, DashboardActionSection> = {
          candidatesToReview: {
            id: "candidatesToReview",
            title: "Candidates to Review",
            description: "Fresh applicants and unreviewed candidates on active jobs.",
            count: candidatesToReview.length,
            emptyMessage: "No candidates waiting for first review.",
            viewAllHref: selectedJobId == null ? "/applications?status=submitted" : applicationListHref,
            items: candidatesToReview.slice(0, MAX_ITEMS_PER_SECTION).map((app) => {
              const ageDays = daysBetween(app.appliedAt) ?? 0;
              return {
                id: `review-${app.id}`,
                type: "candidate_review",
                title: `Review ${app.name}`,
                subtitle: `${app.job.title} · Waiting ${ageDays}d${app.aiFitLabel ? ` · ${app.aiFitLabel} fit` : ""}`,
                urgency: ageDays >= REVIEW_WAIT_DAYS ? "high" : "medium",
                ctaLabel: "Open Candidate",
                ctaHref: applicationHref(app.jobId, app.id, app.currentStage),
                jobId: app.jobId,
                applicationId: app.id,
                ...(app.aiFitLabel ? { badge: app.aiFitLabel } : {}),
              };
            }),
          },
          jobsLowOnPipeline: {
            id: "jobsLowOnPipeline",
            title: "Jobs Low on Pipeline",
            description: "Active roles that need more candidate depth.",
            count: jobsLowOnPipeline.length,
            emptyMessage: "No active jobs are short on pipeline right now.",
            viewAllHref: sourcingListHref,
            items: jobsLowOnPipeline.slice(0, MAX_ITEMS_PER_SECTION).map(({ job, activeCount, jobAgeDays }) => ({
              id: `pipeline-${job.id}`,
              type: "job_low_pipeline",
              title: job.title,
              subtitle: `${activeCount} active candidate${activeCount === 1 ? "" : "s"} · Live for ${jobAgeDays}d`,
              urgency: activeCount === 0 ? "high" : "medium",
              ctaLabel: "Open Sourcing",
              ctaHref: `/jobs/${job.id}/sourcing`,
              jobId: job.id,
              ...(activeCount <= 1 ? { badge: "At risk" } : { badge: "Needs depth" }),
            })),
          },
          feedbackPending: {
            id: "feedbackPending",
            title: "Feedback Pending",
            description: "Hiring manager or client decisions blocking progress.",
            count: feedbackPending.length,
            emptyMessage: "No hiring manager or client feedback is pending.",
            viewAllHref: applicationListHref,
            items: feedbackPending.slice(0, MAX_ITEMS_PER_SECTION).map((app) => {
              const meta = jobMeta.get(app.jobId);
              const hmPending = meta?.hiringManagerAssigned && (app.feedbackCount ?? 0) === 0;
              const clientPending = meta?.clientAssigned && (clientFeedbackCounts[app.id] ?? 0) === 0;
              const owners = [hmPending ? "HM" : null, clientPending ? "Client" : null].filter(Boolean).join(" + ");
              const waitDays = daysBetween(app.stageChangedAt ?? app.appliedAt) ?? 0;
              return {
                id: `feedback-${app.id}`,
                type: "feedback_pending",
                title: `Chase feedback for ${app.name}`,
                subtitle: `${app.job.title} · ${owners || "Decision"} waiting ${waitDays}d`,
                urgency: waitDays >= 5 ? "high" : "medium",
                ctaLabel: "Open Candidate",
                ctaHref: applicationHref(app.jobId, app.id, app.currentStage),
                jobId: app.jobId,
                applicationId: app.id,
                ...(owners ? { badge: owners } : {}),
              };
            }),
          },
          finalStageCandidates: {
            id: "finalStageCandidates",
            title: "Final Stage Candidates",
            description: "Candidates near close: final interviews done, offers out, or ready for decision.",
            count: finalStageCandidates.length,
            emptyMessage: "No candidates are in the final stretch right now.",
            viewAllHref: applicationListHref,
            items: finalStageCandidates.map((app) => {
              const stage = app.currentStage ? stageMeta.get(app.currentStage) : undefined;
              const stageLabel = stage?.name ?? "Final stage";
              const waitDays = daysBetween(app.stageChangedAt ?? app.interviewDate ?? app.updatedAt ?? app.appliedAt) ?? 0;
              const interviewCompleted = app.interviewDate
                ? new Date(app.interviewDate).getTime() <= Date.now()
                : false;
              return {
                id: `final-${app.id}`,
                type: "final_stage_candidate",
                title: `${app.name} · ${app.job.title}`,
                subtitle: interviewCompleted
                  ? `${stageLabel} · Interview completed · Waiting ${waitDays}d`
                  : `${stageLabel} · Waiting ${waitDays}d`,
                urgency: stage?.nameLower.includes("offer") || waitDays >= FINAL_STAGE_WAIT_DAYS ? "high" : "medium",
                ctaLabel: "Open Candidate",
                ctaHref: applicationHref(app.jobId, app.id, app.currentStage),
                jobId: app.jobId,
                applicationId: app.id,
                badge: stageLabel,
              };
            }),
          },
        };

        res.json({
          generatedAt: new Date().toISOString(),
          viewer: {
            role: user.role,
            organizationId: orgResult?.organization.id ?? null,
            organizationRole: orgResult?.membership.role ?? null,
            dashboardScope: "recruiter",
          },
          range: rangePreset,
          jobId: selectedJobId,
          sections: sectionOrder.map((id) => sectionsById[id]),
        });
        return;
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/recruiter-dashboard/interview-stage-details",
    requireRole(["recruiter", "super_admin"]),
    requireSeat({ allowNoOrg: true }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const user = req.user!;
        const rangePreset = resolveRangePreset(req.query.range);
        const rangeDays = RANGE_PRESETS[rangePreset];
        const parsedJobId =
          typeof req.query.jobId === "string" && req.query.jobId !== "all"
            ? Number(req.query.jobId)
            : null;
        const jobId = parsedJobId && Number.isFinite(parsedJobId) && parsedJobId > 0 ? parsedJobId : null;

        const { orgResult, jobs, applications, stages } = await getRecruiterDashboardContext(user);

        const jobsInScope = jobs.filter((job) => {
          if (jobId != null) return job.id === jobId;
          return job.isActive;
        });
        const jobIdsInScope = new Set(jobsInScope.map((job) => job.id));
        const scopedApplications = applications.filter((app) => jobIdsInScope.has(app.jobId));

        const stageMeta = new Map(
          stages.map((stage) => [
            stage.id,
            {
              name: stage.name,
              nameLower: stage.name.toLowerCase(),
              order: stage.order,
            },
          ]),
        );
        const sortedStages = [...stages].sort((a, b) => (a.order - b.order) || (a.id - b.id));
        const screeningStage = sortedStages.find((stage) => stage.name.toLowerCase().includes("screen"));
        const interviewStage = sortedStages.find((stage) => stage.name.toLowerCase().includes("interview"));
        const screeningOrder = screeningStage?.order ?? null;
        const interviewOrder = interviewStage?.order ?? null;

        const now = new Date();
        const currentEnd = now;
        const currentStart = new Date(now);
        currentStart.setDate(currentStart.getDate() - rangeDays);
        const previousEnd = new Date(currentStart.getTime() - 1);
        const previousStart = new Date(currentStart);
        previousStart.setDate(previousStart.getDate() - rangeDays);

        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(now);
        dayEnd.setHours(23, 59, 59, 999);

        const activeInterviewApplications = scopedApplications.filter((app) => {
          const stage = app.currentStage ? stageMeta.get(app.currentStage) : undefined;
          const stageName = stage?.nameLower ?? "";
          if (isClosedApplication(app.status, stageName)) return false;
          return stageName.includes("interview");
        });

        const avgTimeInStageDays =
          activeInterviewApplications.length > 0
            ? Math.round(
                (activeInterviewApplications.reduce((sum, app) => {
                  const anchor =
                    daysBetween(app.stageChangedAt ?? app.interviewDate ?? app.updatedAt ?? app.appliedAt) ?? 0;
                  return sum + anchor;
                }, 0) /
                  activeInterviewApplications.length) *
                  10,
              ) / 10
            : null;

        const interviewsScheduledToday = scopedApplications.filter((app) =>
          isWithinWindow(app.interviewDate, dayStart, dayEnd),
        ).length;

        const hasReachedStage = (
          app: (typeof scopedApplications)[number],
          thresholdOrder: number | null,
        ): boolean => {
          if (thresholdOrder == null || app.currentStage == null) return false;
          const stage = stageMeta.get(app.currentStage);
          if (!stage) return false;
          if (stage.nameLower.includes("rejected") || app.status === "rejected") return false;
          return (stage.order ?? -1) >= thresholdOrder;
        };

        const currentPeriodApplications = scopedApplications.filter((app) =>
          isWithinWindow(app.appliedAt, currentStart, currentEnd),
        );
        const previousPeriodApplications = scopedApplications.filter((app) =>
          isWithinWindow(app.appliedAt, previousStart, previousEnd),
        );

        const currentScreeningCount = currentPeriodApplications.filter((app) =>
          hasReachedStage(app, screeningOrder),
        ).length;
        const currentInterviewCount = currentPeriodApplications.filter((app) =>
          hasReachedStage(app, interviewOrder),
        ).length;
        const previousScreeningCount = previousPeriodApplications.filter((app) =>
          hasReachedStage(app, screeningOrder),
        ).length;
        const previousInterviewCount = previousPeriodApplications.filter((app) =>
          hasReachedStage(app, interviewOrder),
        ).length;

        const currentRate = roundRate(currentInterviewCount, currentScreeningCount);
        const previousRate = roundRate(previousInterviewCount, previousScreeningCount);
        const delta = Math.round((currentRate - previousRate) * 10) / 10;

        res.json({
          generatedAt: new Date().toISOString(),
          viewer: {
            role: user.role,
            organizationId: orgResult?.organization.id ?? null,
            organizationRole: orgResult?.membership.role ?? null,
            dashboardScope: "recruiter",
          },
          range: rangePreset,
          periodLabel: `Last ${rangeDays} days`,
          comparisonLabel: `vs previous ${rangeDays} days`,
          jobId,
          activeInterviewLoops: activeInterviewApplications.length,
          avgTimeInStageDays,
          interviewsScheduledToday,
          screeningToInterview: {
            currentRate,
            previousRate,
            delta,
            direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
            screeningCount: currentScreeningCount,
            interviewCount: currentInterviewCount,
          },
        });
        return;
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/recruiter-dashboard/todays-interviews",
    requireRole(["recruiter", "super_admin"]),
    requireSeat({ allowNoOrg: true }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const user = req.user!;
        const jobId = parseJobIdParam(req.query.jobId);
        const selectedInterviewDate = resolveInterviewDate(req.query.interviewDate);

        const { orgResult, jobs, applications, stages } = await getRecruiterDashboardContext(user);
        const jobIdsInScope = new Set(
          jobs
            .filter((job) => (jobId != null ? job.id === jobId : true))
            .map((job) => job.id),
        );
        const stageMeta = new Map(
          stages.map((stage) => [
            stage.id,
            {
              name: stage.name,
              nameLower: stage.name.toLowerCase(),
            },
          ]),
        );

        const now = new Date();
        const dayStart = startOfDay(selectedInterviewDate);
        const dayEnd = endOfDay(selectedInterviewDate);
        const weekStart = startOfWeekMonday(selectedInterviewDate);
        const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
        const weekCounts = new Map<string, number>(
          weekDays.map((date) => [startOfDay(date).toISOString().slice(0, 10), 0]),
        );

        const scopedApplications = applications
          .filter((app) => jobIdsInScope.has(app.jobId))
          .filter((app) => {
            const stage = app.currentStage ? stageMeta.get(app.currentStage) : undefined;
            const stageName = stage?.nameLower ?? "";
            return !isClosedApplication(app.status, stageName);
          });

        scopedApplications.forEach((app) => {
          const interviewDate = clampDate(app.interviewDate);
          if (!interviewDate) return;
          const key = startOfDay(interviewDate).toISOString().slice(0, 10);
          if (weekCounts.has(key)) {
            weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1);
          }
        });

        const items = scopedApplications
          .filter((app) => isWithinWindow(app.interviewDate, dayStart, dayEnd))
          .map((app) => {
            const stage = app.currentStage ? stageMeta.get(app.currentStage) : undefined;
            const stageLabel = stage?.name ?? "Interview";
            const timeLabel = formatInterviewTime(app.interviewTime);
            const interviewDate = clampDate(app.interviewDate);
            return {
              id: `interview-${app.id}`,
              applicationId: app.id,
              jobId: app.jobId,
              candidateName: app.name,
              jobTitle: app.job.title,
              interviewDate: interviewDate?.toISOString() ?? null,
              interviewTime: timeLabel,
              stageLabel,
              aiFitLabel: app.aiFitLabel ?? null,
              status: resolveInterviewStatus(interviewDate, timeLabel, now),
              ctaLabel: "Open Candidate",
              ctaHref: applicationHref(app.jobId, app.id, app.currentStage),
            };
          })
          .sort((a, b) => {
            const aTime = a.interviewTime ?? "99:99";
            const bTime = b.interviewTime ?? "99:99";
            if (aTime !== bTime) return aTime.localeCompare(bTime);
            return a.candidateName.localeCompare(b.candidateName);
          });

        res.json({
          generatedAt: new Date().toISOString(),
          viewer: {
            role: user.role,
            organizationId: orgResult?.organization.id ?? null,
            organizationRole: orgResult?.membership.role ?? null,
            dashboardScope: "recruiter",
          },
          jobId,
          interviewDate: dayStart.toISOString().slice(0, 10),
          dateLabel: dayStart.toDateString() === startOfDay(now).toDateString() ? "Today" : dayStart.toLocaleDateString(),
          count: items.length,
          week: weekDays.map((date) => {
            const isoDate = startOfDay(date).toISOString().slice(0, 10);
            return {
              date: isoDate,
              dayLabel: date.toLocaleDateString(undefined, { weekday: "short" }),
              count: weekCounts.get(isoDate) ?? 0,
              isSelected: isoDate === dayStart.toISOString().slice(0, 10),
            };
          }),
          items,
        });
        return;
      } catch (error) {
        next(error);
      }
    },
  );
}
