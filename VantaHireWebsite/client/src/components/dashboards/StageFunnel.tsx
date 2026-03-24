import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIsTouchDevice } from "@/hooks/use-touch-device";
import { DASHBOARD_EYEBROW, DASHBOARD_PANEL, DASHBOARD_PANEL_SOFT, DASHBOARD_TITLE } from "@/lib/dashboard-theme";
import { recruiterDashboardCopy } from "@/lib/internal-copy";
import { cn } from "@/lib/utils";

type StageSegment = {
  name: string;
  count: number;
  percentage?: number;
  stageId?: number;
};

type InterviewStageDetails = {
  activeInterviewLoops: number;
  avgTimeInStageDays: number | null;
  interviewsScheduledToday: number | null;
  screeningToInterview: {
    currentRate: number | null;
    delta: number | null;
    direction: "up" | "down" | "flat" | "neutral";
    screeningCount?: number | null;
    interviewCount?: number | null;
  };
  periodLabel: string | null;
  comparisonLabel: string | null;
};

type DashboardApplication = {
  currentStage?: number | null;
  status: string;
  appliedAt: string | Date;
  stageChangedAt?: string | Date | null;
  interviewDate?: string | Date | null;
  updatedAt?: string | Date | null;
};

type DashboardPipelineStage = {
  id: number;
  name: string;
  order: number;
};

interface StageFunnelProps {
  title: string;
  description?: string;
  data: StageSegment[];
  isLoading?: boolean;
  onStageClick?: (stage: StageSegment) => void;
  rangePreset?: string;
  selectedJobId?: number | "all";
  applications?: DashboardApplication[];
  pipelineStages?: DashboardPipelineStage[];
}

const STAGE_COLORS = ["#C4B5FD", "#A78BFA", "#8B5CF6", "#7C3AED", "#4D41DF"];
const CONTENT_FADE_MS = 250;

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number): string {
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}%`;
}

function formatNullablePercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "\u2014";
  return formatPercent(value);
}

function formatStageDays(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "\u2014";
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)} Days`;
}

function formatScheduledToday(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "\u2014";
  return `${value} Today`;
}

function formatDeltaValue(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "\u2014";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}%`;
}

function normalizeStageKey(label: string): string {
  return label.trim().toLowerCase();
}

function normalizeInterviewDetails(payload: unknown, stageLabel?: string | null): InterviewStageDetails {
  const source = (payload ?? {}) as Record<string, unknown>;
  const normalizedStage = stageLabel ? normalizeStageKey(stageLabel) : null;
  const stageBucket =
    normalizedStage &&
    typeof source.stageDetails === "object" &&
    source.stageDetails !== null
      ? (source.stageDetails as Record<string, unknown>)[normalizedStage]
      : null;
  const stagesArrayBucket =
    normalizedStage && Array.isArray(source.stages)
      ? (source.stages as Array<Record<string, unknown>>).find((entry) => {
          const label = typeof entry.label === "string" ? entry.label : typeof entry.stage === "string" ? entry.stage : "";
          return normalizeStageKey(label) === normalizedStage;
        })
      : null;

  const resolved = (stageBucket || stagesArrayBucket || source) as Record<string, unknown>;
  const screening =
    typeof resolved.screeningToInterview === "object" && resolved.screeningToInterview !== null
      ? (resolved.screeningToInterview as Record<string, unknown>)
      : {};

  return {
    activeInterviewLoops: typeof resolved.activeInterviewLoops === "number" ? resolved.activeInterviewLoops : 0,
    avgTimeInStageDays: typeof resolved.avgTimeInStageDays === "number" ? resolved.avgTimeInStageDays : null,
    interviewsScheduledToday: typeof resolved.interviewsScheduledToday === "number" ? resolved.interviewsScheduledToday : null,
    screeningToInterview: {
      currentRate: typeof screening.currentRate === "number" ? screening.currentRate : null,
      delta: typeof screening.delta === "number" ? screening.delta : null,
      direction:
        screening.direction === "up" || screening.direction === "down" || screening.direction === "neutral" || screening.direction === "flat"
          ? screening.direction
          : "neutral",
      screeningCount: typeof screening.screeningCount === "number" ? screening.screeningCount : null,
      interviewCount: typeof screening.interviewCount === "number" ? screening.interviewCount : null,
    },
    periodLabel: typeof resolved.periodLabel === "string" ? resolved.periodLabel : null,
    comparisonLabel: typeof resolved.comparisonLabel === "string" ? resolved.comparisonLabel : null,
  };
}

function buildSummary(
  details: InterviewStageDetails | undefined,
  hoveredStage: StageSegment | null,
  stageCandidateCount: number | null,
): {
  prefix: string;
  deltaText: string;
  suffix: string;
  deltaClassName: string;
} {
  const delta = details?.screeningToInterview?.delta ?? null;
  const direction = details?.screeningToInterview?.direction ?? "neutral";
  const currentRate = details?.screeningToInterview?.currentRate ?? null;
  const periodLabel = details?.periodLabel ?? "\u2014";
  const comparisonLabel = details?.comparisonLabel ?? "\u2014";
  const subjectCount =
    hoveredStage != null ? formatCompactNumber(stageCandidateCount ?? hoveredStage.count) : formatCompactNumber(details?.activeInterviewLoops ?? 0);
  const prefix = hoveredStage
    ? `In ${periodLabel}, ${subjectCount} candidates are currently in ${hoveredStage.name}. Recruiter-wide screening to interview conversion is ${formatNullablePercent(currentRate)} and has `
    : `In ${periodLabel}, ${subjectCount} candidates are in active interview loops. Recruiter-wide screening to interview conversion is ${formatNullablePercent(currentRate)} and has `;

  if (direction === "up" && (delta ?? 0) > 0) {
    return {
      prefix: prefix.replace("has ", "has increased by "),
      deltaText: formatPercent(Math.abs(delta ?? 0)),
      suffix: ` ${comparisonLabel}.`,
      deltaClassName: "text-[#16A34A]",
    };
  }

  if (direction === "down" && Math.abs(delta ?? 0) > 0) {
    return {
      prefix: prefix.replace("has ", "has decreased by "),
      deltaText: formatPercent(Math.abs(delta ?? 0)),
      suffix: ` ${comparisonLabel}.`,
      deltaClassName: "text-[#DC2626]",
    };
  }

  return {
    prefix: prefix.replace("has ", "remained steady at "),
    deltaText: formatNullablePercent(currentRate),
    suffix: ` ${comparisonLabel}.`,
    deltaClassName: "text-[#6B7280]",
  };
}

export function StageFunnel({
  title,
  data,
  isLoading,
  onStageClick,
  rangePreset = "30d",
  selectedJobId = "all",
  applications = [],
  pipelineStages = [],
}: StageFunnelProps) {
  const isMobile = useIsMobile();
  const isTouchDevice = useIsTouchDevice();
  const [hoveredStageIndex, setHoveredStageIndex] = useState<number | null>(null);
  const [contentVisible, setContentVisible] = useState(true);
  const [connectorPath, setConnectorPath] = useState<string>("");
  const [showConnector, setShowConnector] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);
  const stageRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const hoveredStage = hoveredStageIndex != null ? data[hoveredStageIndex] ?? null : null;
  const maxCount = useMemo(() => Math.max(...data.map((stage) => stage.count), 1), [data]);
  const totalCount = useMemo(() => data.reduce((sum, stage) => sum + stage.count, 0), [data]);
  const stageMetaById = useMemo(
    () =>
      new Map(
        pipelineStages.map((stage) => [
          stage.id,
          { name: stage.name, nameLower: stage.name.toLowerCase(), order: stage.order },
        ]),
      ),
    [pipelineStages],
  );

  const stageDerivedMetrics = useMemo(() => {
    const normalizedHovered = hoveredStage ? normalizeStageKey(hoveredStage.name) : null;
    const stageApplications = normalizedHovered
      ? applications.filter((application) => {
          const stage = application.currentStage != null ? stageMetaById.get(application.currentStage) : null;
          return normalizeStageKey(stage?.name ?? "unassigned") === normalizedHovered;
        })
      : [];

    const avgTimeInStageDays =
      stageApplications.length > 0
        ? Math.round(
            (stageApplications.reduce((sum, application) => {
              const anchor = application.stageChangedAt ?? application.appliedAt;
              const date = new Date(anchor);
              if (Number.isNaN(date.getTime())) return sum;
              return sum + (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
            }, 0) /
              stageApplications.length) *
              10,
          ) / 10
        : null;

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const interviewsScheduledToday = stageApplications.filter((application) => {
      if (!application.interviewDate) return false;
      const interviewDate = new Date(application.interviewDate);
      return !Number.isNaN(interviewDate.getTime()) && interviewDate >= dayStart && interviewDate <= dayEnd;
    }).length;

    return {
      stageCandidateCount: hoveredStage ? stageApplications.length : null,
      avgTimeInStageDays,
      interviewsScheduledToday,
    };
  }, [applications, hoveredStage, stageMetaById]);

  const detailsQuery = useQuery<InterviewStageDetails>({
    queryKey: [
      "/api/recruiter-dashboard/interview-stage-details",
      rangePreset,
      selectedJobId,
      hoveredStage?.name ?? "overview",
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        range: rangePreset,
        jobId: selectedJobId === "all" ? "all" : String(selectedJobId),
      });
      const response = await fetch(`/api/recruiter-dashboard/interview-stage-details?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch interview stage details");
      }
      const payload = await response.json();
      return normalizeInterviewDetails(payload);
    },
    staleTime: 0,
    refetchOnMount: "always",
    placeholderData: (previousData) => previousData,
  });

  useEffect(() => {
    if (!data.length) return;
    if (isTouchDevice && hoveredStageIndex == null) {
      setHoveredStageIndex(0);
    }
  }, [data.length, hoveredStageIndex, isTouchDevice]);

  useEffect(() => {
    setContentVisible(false);
    const timer = window.setTimeout(() => setContentVisible(true), 70);
    return () => window.clearTimeout(timer);
  }, [hoveredStage?.name, detailsQuery.dataUpdatedAt]);

  useLayoutEffect(() => {
    const updateConnector = () => {
      const container = containerRef.current;
      const panel = detailPanelRef.current;
      const stageEl = hoveredStageIndex != null ? stageRefs.current[hoveredStageIndex] : null;

      if (!container || !panel || !stageEl || window.innerWidth < 1024 || isMobile) {
        setShowConnector(false);
        setConnectorPath("");
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const stageRect = stageEl.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();

      const startX = stageRect.right - containerRect.left + 12;
      const startY = stageRect.top - containerRect.top + stageRect.height / 2;
      const endX = panelRect.left - containerRect.left - 18;
      const endY = panelRect.top - containerRect.top + Math.min(200, panelRect.height / 2);
      const deltaX = Math.max(60, (endX - startX) * 0.45);

      setConnectorPath(
        `M ${startX} ${startY} C ${startX + deltaX} ${startY}, ${endX - deltaX} ${endY}, ${endX} ${endY}`,
      );
      setShowConnector(true);
    };

    updateConnector();
    window.addEventListener("resize", updateConnector);
    return () => window.removeEventListener("resize", updateConnector);
  }, [hoveredStageIndex, data.length, isMobile]);

  const details = detailsQuery.data;
  const effectiveAvgTimeInStageDays =
    hoveredStage != null && stageDerivedMetrics.avgTimeInStageDays != null
      ? stageDerivedMetrics.avgTimeInStageDays
      : details?.avgTimeInStageDays ?? null;
  const summary = buildSummary(details, hoveredStage, stageDerivedMetrics.stageCandidateCount);
  const rightStat = useMemo(() => {
    if (hoveredStage) {
      return {
        label: recruiterDashboardCopy.funnel.candidatesInStage,
        value: formatCompactNumber(stageDerivedMetrics.stageCandidateCount ?? hoveredStage.count),
      };
    }

    return {
      label: recruiterDashboardCopy.funnel.interviewsToday,
      value: formatScheduledToday(details?.interviewsScheduledToday),
    };
  }, [details, hoveredStage, stageDerivedMetrics.stageCandidateCount]);

  return (
    <Card className={cn(DASHBOARD_PANEL, "rounded-[28px] bg-white/95")}>
      <CardHeader className="pb-2">
        <p className={cn(DASHBOARD_EYEBROW, "mb-3")}>{recruiterDashboardCopy.funnel.eyebrow}</p>
        <CardTitle
          className={cn(DASHBOARD_TITLE, "text-[22px] leading-tight")}
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          {title}
        </CardTitle>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#6B7280]">
          {recruiterDashboardCopy.funnel.description}
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6 lg:px-6 lg:pb-6 xl:px-8 xl:pb-8">
        {isLoading ? (
          <div className="h-[420px] rounded-[24px] bg-[#F5F7FA] animate-pulse" />
        ) : data.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center rounded-[24px] bg-[#F5F7FA] text-sm text-muted-foreground">
            {recruiterDashboardCopy.funnel.noData}
          </div>
        ) : (
          <div ref={containerRef} className="relative">
            <div className="grid items-start gap-5 md:gap-6 xl:grid-cols-[minmax(0,55%)_minmax(0,45%)] xl:items-center xl:gap-8">
              <div className="min-w-0">
                <div className="space-y-1">
                  {data.map((stage, index) => {
                    const ratio = Math.max(stage.count / maxCount, 0);
                    const visualWidth = `${35 + Math.pow(ratio, 0.42) * 65}%`;
                    const percentage = stage.percentage ?? (totalCount > 0 ? (stage.count / totalCount) * 100 : 0);
                    const isHovered = hoveredStageIndex === index;

                    return (
                      <div key={`${stage.name}-${stage.stageId ?? index}`} className="flex items-center gap-6">
                        <div className="flex-1">
                          <div className="flex justify-center">
                            <button
                              ref={(node) => {
                                stageRefs.current[index] = node;
                              }}
                              type="button"
                              onClick={() => {
                                if (isMobile || isTouchDevice) {
                                  setHoveredStageIndex(index);
                                  return;
                                }
                                onStageClick?.(stage);
                              }}
                              onMouseEnter={isTouchDevice ? undefined : () => setHoveredStageIndex(index)}
                              onMouseLeave={isTouchDevice ? undefined : () => setHoveredStageIndex((current) => (current === index ? null : current))}
                              onFocus={() => setHoveredStageIndex(index)}
                              onBlur={() => setHoveredStageIndex((current) => (current === index ? null : current))}
                              className="group relative flex h-8 shrink-0 items-center justify-center bg-transparent text-center outline-none transition duration-300 ease-out focus-visible:ring-2 focus-visible:ring-[#4D41DF] focus-visible:ring-offset-2 md:h-[76px]"
                              style={{
                                width: visualWidth,
                                filter: isHovered ? "brightness(1.08)" : "none",
                                clipPath: "polygon(14px 0%, calc(100% - 14px) 0%, 100% 100%, 0% 100%)",
                                background: STAGE_COLORS[index] ?? STAGE_COLORS[STAGE_COLORS.length - 1],
                              }}
                              aria-label={`${stage.name}: ${stage.count} candidates`}
                            >
                              <span
                                className="px-3 text-center text-[12px] font-[600] tracking-[-0.01em] text-white md:px-5 md:text-[12px] xl:text-[14px]"
                                style={{ fontFamily: "Manrope, sans-serif" }}
                              >
                                {stage.name}
                              </span>
                            </button>
                          </div>
                        </div>

                        <div className="w-[72px] shrink-0 text-left md:w-[84px] xl:w-[96px]">
                          <div
                            className="text-[16px] font-[700] leading-none text-[#111827] md:text-[17px] xl:text-[18px]"
                            style={{ fontFamily: "Manrope, sans-serif" }}
                          >
                            {formatCompactNumber(stage.count)}
                          </div>
                          <div
                            className="mt-1 text-[11px] leading-none text-[#6B7280]"
                            style={{ fontFamily: "Inter, sans-serif" }}
                          >
                            {formatPercent(percentage)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {isMobile ? (
                  <p className="pt-3 text-[11px] font-medium text-[#7B8191]">
                    Tap a stage to see details
                  </p>
                ) : null}
              </div>

              <div
                ref={detailPanelRef}
                className={cn(DASHBOARD_PANEL_SOFT, "relative p-4 shadow-[0_10px_30px_rgba(77,65,223,0.08)] md:p-4 xl:p-6")}
              >
                <div
                  className={cn(
                    "transition-opacity ease-out",
                    contentVisible ? "opacity-100" : "opacity-0",
                  )}
                  style={{ transitionDuration: `${CONTENT_FADE_MS}ms` }}
                >
                  <div
                    className="inline-flex rounded-full px-4 py-2 text-[10px] font-[700] uppercase tracking-[0.08em] text-white shadow-[0_10px_24px_rgba(77,65,223,0.18)]"
                    style={{
                      fontFamily: "Inter, sans-serif",
                      background: "linear-gradient(90deg, #4D41DF 0%, #675DF9 100%)",
                    }}
                  >
                    {recruiterDashboardCopy.funnel.detailsBadge}
                  </div>

                  <h3
                    className="mt-9 text-[24px] font-[700] leading-tight text-[#191C1E]"
                    style={{ fontFamily: "Manrope, sans-serif" }}
                  >
                    {hoveredStage ? `${hoveredStage.name} ${recruiterDashboardCopy.funnel.snapshotSuffix}` : recruiterDashboardCopy.funnel.overviewTitle}
                  </h3>

                  <p
                    className="mt-6 max-w-[30rem] text-[14px] leading-[1.6] text-[#464555]"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    {summary.prefix}
                    <span className={summary.deltaClassName}>{summary.deltaText}</span>
                    {summary.suffix}
                  </p>

                  <div className="mt-8 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-[12px] bg-white p-4">
                      <div
                        className="text-[10px] font-[600] uppercase tracking-[0.08em] text-[#6B7280]"
                        style={{ fontFamily: "Inter, sans-serif" }}
                      >
                        {recruiterDashboardCopy.funnel.avgTimeInStage}
                      </div>
                      <div
                        className="mt-2 text-[22px] font-[700] leading-tight text-[#111827]"
                        style={{ fontFamily: "Manrope, sans-serif" }}
                      >
                        {formatStageDays(effectiveAvgTimeInStageDays)}
                      </div>
                    </div>

                    <div className="rounded-[12px] bg-white p-4">
                      <div
                        className="text-[10px] font-[600] uppercase tracking-[0.08em] text-[#6B7280]"
                        style={{ fontFamily: "Inter, sans-serif" }}
                      >
                        {rightStat.label}
                      </div>
                      <div
                        className="mt-2 text-[22px] font-[700] leading-tight text-[#111827]"
                        style={{ fontFamily: "Manrope, sans-serif" }}
                      >
                        {rightStat.value}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-[#768094] shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
                      {hoveredStage ? recruiterDashboardCopy.funnel.stageSnapshot : recruiterDashboardCopy.funnel.recruiterWideView}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-[#768094] shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
                      {details?.periodLabel ?? "Current period"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <svg
              className={cn(
                "pointer-events-none absolute inset-0 hidden overflow-visible lg:block",
                showConnector ? "opacity-100" : "opacity-0",
              )}
              width="100%"
              height="100%"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="stage-funnel-arrowhead"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path d="M 0 0 L 6 3 L 0 6 z" fill="rgba(77,65,223,0.35)" />
                </marker>
              </defs>
              {connectorPath ? (
                <path
                  d={connectorPath}
                  fill="none"
                  stroke="rgba(77,65,223,0.35)"
                  strokeWidth="1.5"
                  strokeDasharray="6 6"
                  strokeLinecap="round"
                  markerEnd="url(#stage-funnel-arrowhead)"
                  className="transition-opacity duration-300 ease-out"
                />
              ) : null}
            </svg>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
