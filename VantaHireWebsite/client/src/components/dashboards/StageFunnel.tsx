import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StageSegment = {
  name: string;
  count: number;
  percentage?: number;
  stageId?: number;
};

type InterviewStageDetails = {
  activeInterviewLoops: number | null;
  avgTimeInStageDays: number | null;
  interviewsScheduledToday: number | null;
  screeningToInterview: {
    currentRate: number | null;
    delta: number | null;
    direction: "up" | "down" | "flat" | "neutral";
  };
  periodLabel: string | null;
  comparisonLabel: string | null;
};

interface StageFunnelProps {
  title: string;
  description?: string;
  data: StageSegment[];
  isLoading?: boolean;
  onStageClick?: (stage: StageSegment) => void;
  rangePreset?: string;
  selectedJobId?: number | "all";
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

function formatNullableCount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "\u2014";
  return formatCompactNumber(value);
}

function formatStageDays(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "\u2014";
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)} Days`;
}

function formatTodayValue(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "\u2014";
  return `${value} Today`;
}

function normalizeStageKey(label: string): string {
  return label.trim().toLowerCase();
}

function normalizeInterviewDetails(payload: unknown): InterviewStageDetails {
  const source = (payload ?? {}) as Record<string, unknown>;
  const screening =
    typeof source.screeningToInterview === "object" && source.screeningToInterview !== null
      ? (source.screeningToInterview as Record<string, unknown>)
      : {};

  return {
    activeInterviewLoops: typeof source.activeInterviewLoops === "number" ? source.activeInterviewLoops : null,
    avgTimeInStageDays: typeof source.avgTimeInStageDays === "number" ? source.avgTimeInStageDays : null,
    interviewsScheduledToday: typeof source.interviewsScheduledToday === "number" ? source.interviewsScheduledToday : null,
    screeningToInterview: {
      currentRate: typeof screening.currentRate === "number" ? screening.currentRate : null,
      delta: typeof screening.delta === "number" ? screening.delta : null,
      direction:
        screening.direction === "up" || screening.direction === "down" || screening.direction === "neutral" || screening.direction === "flat"
          ? screening.direction
          : "neutral",
    },
    periodLabel: typeof source.periodLabel === "string" ? source.periodLabel : null,
    comparisonLabel: typeof source.comparisonLabel === "string" ? source.comparisonLabel : null,
  };
}

function getDirectionDisplay(direction: string | null | undefined, delta: number | null | undefined) {
  if (delta == null || Number.isNaN(delta) || delta === 0 || direction === "neutral" || direction === "flat") {
    return { arrow: "", className: "text-[#6B7280]", text: formatNullablePercent(delta ?? 0) };
  }

  if (direction === "down") {
    return { arrow: "\u2193 ", className: "text-[#DC2626]", text: formatPercent(Math.abs(delta)) };
  }

  return { arrow: "\u2191 ", className: "text-[#16A34A]", text: formatPercent(Math.abs(delta ?? 0)) };
}

function buildSummary(
  hoveredStage: StageSegment | null,
  details: InterviewStageDetails | null,
  appliedCount: number | null,
): {
  parts: string[];
  deltaIndex: number;
  deltaClassName: string;
} {
  const currentRate = details?.screeningToInterview.currentRate ?? null;
  const delta = details?.screeningToInterview.delta ?? null;
  const direction = details?.screeningToInterview.direction ?? "neutral";
  const periodLabel = details?.periodLabel ?? "\u2014";
  const comparisonLabel = details?.comparisonLabel ?? "\u2014";
  const activeInterviewLoops = details?.activeInterviewLoops ?? null;
  const avgTimeInStageDays = details?.avgTimeInStageDays ?? null;
  const interviewsScheduledToday = details?.interviewsScheduledToday ?? null;
  const directionDisplay = getDirectionDisplay(direction, delta);
  const stageName = hoveredStage?.name.toLowerCase() ?? "";

  if (!hoveredStage) {
    return {
      parts: [
        `${periodLabel}: ${formatNullableCount(activeInterviewLoops)} candidates in active interview loops. Screening to interview rate is ${formatNullablePercent(currentRate)}, `,
        `${directionDisplay.arrow}${directionDisplay.text}`,
        ` ${comparisonLabel}.`,
      ],
      deltaIndex: 1,
      deltaClassName: directionDisplay.className,
    };
  }

  if (stageName.includes("applied")) {
    return {
      parts: [
        `${periodLabel}: ${formatNullableCount(appliedCount)} candidates entered the pipeline. Screening conversion rate is currently ${formatNullablePercent(currentRate)} ${comparisonLabel}.`,
      ],
      deltaIndex: -1,
      deltaClassName: "text-[#464555]",
    };
  }

  if (stageName.includes("screen")) {
    return {
      parts: [
        `${formatNullableCount(activeInterviewLoops)} candidates are actively moving through screening. Conversion from Screening to Interview is ${formatNullablePercent(currentRate)}, `,
        `${directionDisplay.arrow}${directionDisplay.text}`,
        ` ${comparisonLabel}.`,
      ],
      deltaIndex: 1,
      deltaClassName: directionDisplay.className,
    };
  }

  if (stageName.includes("interview")) {
    const movementText =
      direction === "up" ? "increased" : direction === "down" ? "decreased" : "changed";

    return {
      parts: [
        `${formatNullableCount(activeInterviewLoops)} candidates are in active interview loops. Your screening to interview rate has ${movementText} by `,
        `${directionDisplay.arrow}${directionDisplay.text}`,
        ` ${comparisonLabel}.`,
      ],
      deltaIndex: 1,
      deltaClassName: directionDisplay.className,
    };
  }

  if (stageName.includes("offer")) {
    return {
      parts: [
        `${formatNullableCount(interviewsScheduledToday)} interviews completed today. ${formatNullableCount(activeInterviewLoops)} candidates are progressing toward final decision ${comparisonLabel}.`,
      ],
      deltaIndex: -1,
      deltaClassName: "text-[#464555]",
    };
  }

  if (stageName.includes("hired")) {
    return {
      parts: [
        `Pipeline is converting at ${formatNullablePercent(currentRate)} from screening to interview ${comparisonLabel}. Avg time to close is ${avgTimeInStageDays == null ? "\u2014" : `${avgTimeInStageDays % 1 === 0 ? avgTimeInStageDays.toFixed(0) : avgTimeInStageDays.toFixed(1)} days`}.`,
      ],
      deltaIndex: -1,
      deltaClassName: "text-[#464555]",
    };
  }

  if (stageName.includes("reject")) {
    return {
      parts: [
        `${formatNullablePercent(currentRate)} of screened candidates advanced. Avg stage duration was ${avgTimeInStageDays == null ? "\u2014" : `${avgTimeInStageDays % 1 === 0 ? avgTimeInStageDays.toFixed(0) : avgTimeInStageDays.toFixed(1)} days`} ${comparisonLabel}.`,
      ],
      deltaIndex: -1,
      deltaClassName: "text-[#464555]",
    };
  }

  return {
    parts: [`${periodLabel}: ${formatNullableCount(activeInterviewLoops)} candidates in active interview loops.`],
    deltaIndex: -1,
    deltaClassName: "text-[#464555]",
  };
}

export function StageFunnel({
  title,
  data,
  isLoading,
  onStageClick,
  rangePreset = "30d",
  selectedJobId = "all",
}: StageFunnelProps) {
  const [hoveredStageIndex, setHoveredStageIndex] = useState<number | null>(null);
  const [contentVisible, setContentVisible] = useState(true);
  const [connectorPath, setConnectorPath] = useState<string>("");
  const [showConnector, setShowConnector] = useState(false);
  const [details, setDetails] = useState<InterviewStageDetails | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);
  const stageRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const hoveredStage = hoveredStageIndex != null ? data[hoveredStageIndex] ?? null : null;
  const maxCount = useMemo(() => Math.max(...data.map((stage) => stage.count), 1), [data]);
  const totalCount = useMemo(() => data.reduce((sum, stage) => sum + stage.count, 0), [data]);
  const appliedStageCount = useMemo(
    () => data.find((stage) => normalizeStageKey(stage.name) === "applied")?.count ?? null,
    [data],
  );

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      range: rangePreset,
      jobId: selectedJobId === "all" ? "all" : String(selectedJobId),
    });

    setContentVisible(false);
    setDetails(null);

    const loadDetails = async () => {
      try {
        const response = await fetch(`/api/recruiter-dashboard/interview-stage-details?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to fetch interview stage details");
        }

        const payload = await response.json();
        if (!controller.signal.aborted) {
          setDetails(normalizeInterviewDetails(payload));
          window.setTimeout(() => {
            if (!controller.signal.aborted) {
              setContentVisible(true);
            }
          }, 70);
        }
      } catch {
        if (!controller.signal.aborted) {
          setDetails(null);
          setContentVisible(true);
        }
      }
    };

    void loadDetails();
    return () => controller.abort();
  }, [hoveredStage?.name, rangePreset, selectedJobId]);

  useLayoutEffect(() => {
    const updateConnector = () => {
      const container = containerRef.current;
      const panel = detailPanelRef.current;
      const stageEl = hoveredStageIndex != null ? stageRefs.current[hoveredStageIndex] : null;

      if (!container || !panel || !stageEl || window.innerWidth < 1024) {
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
  }, [hoveredStageIndex, data.length]);

  const summary = buildSummary(hoveredStage, details, appliedStageCount);
  const rightStat = useMemo(() => {
    const stageName = hoveredStage?.name.toLowerCase() ?? "";
    const currentRate = details?.screeningToInterview.currentRate ?? null;

    if (!hoveredStage) {
      return {
        label: "Interviews Today",
        value: formatTodayValue(details?.interviewsScheduledToday),
      };
    }

    if (stageName.includes("applied")) {
      return {
        label: "Screening Rate",
        value: formatNullablePercent(currentRate),
      };
    }

    if (stageName.includes("screen")) {
      return {
        label: "Active Loops",
        value: formatNullableCount(details?.activeInterviewLoops),
      };
    }

    if (stageName.includes("interview")) {
      return {
        label: "Interviews Today",
        value: formatTodayValue(details?.interviewsScheduledToday),
      };
    }

    if (stageName.includes("offer")) {
      return {
        label: "Conversion Rate",
        value: formatNullablePercent(currentRate),
      };
    }

    if (stageName.includes("hired")) {
      return {
        label: "Avg Time To Hire",
        value: formatStageDays(details?.avgTimeInStageDays),
      };
    }

    if (stageName.includes("reject")) {
      return {
        label: "Avg Time In Stage",
        value: formatStageDays(details?.avgTimeInStageDays),
      };
    }

    return {
      label: "Interviews Today",
      value: formatTodayValue(details?.interviewsScheduledToday),
    };
  }, [details, hoveredStage]);

  return (
    <Card className="overflow-hidden rounded-[28px] border-0 bg-white shadow-none">
      <CardHeader className="pb-4">
        <CardTitle
          className="text-[20px] font-[700] leading-tight text-[#0F172A]"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-6 pb-6 pt-0 lg:px-8 lg:pb-8">
        {isLoading ? (
          <div className="h-[420px] rounded-[24px] bg-[#F5F7FA] animate-pulse" />
        ) : data.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center rounded-[24px] bg-[#F5F7FA] text-sm text-muted-foreground">
            No data available
          </div>
        ) : (
          <div ref={containerRef} className="relative">
            <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,55%)_minmax(0,45%)]">
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
                              onClick={() => onStageClick?.(stage)}
                              onMouseEnter={() => setHoveredStageIndex(index)}
                              onMouseLeave={() => setHoveredStageIndex((current) => (current === index ? null : current))}
                              onFocus={() => setHoveredStageIndex(index)}
                              onBlur={() => setHoveredStageIndex((current) => (current === index ? null : current))}
                              className="group relative flex h-[76px] shrink-0 items-center justify-center bg-transparent text-center outline-none transition duration-300 ease-out focus-visible:ring-2 focus-visible:ring-[#4D41DF] focus-visible:ring-offset-2"
                              style={{
                                width: visualWidth,
                                filter: isHovered ? "brightness(1.08)" : "none",
                                clipPath: "polygon(14px 0%, calc(100% - 14px) 0%, 100% 100%, 0% 100%)",
                                background: STAGE_COLORS[index] ?? STAGE_COLORS[STAGE_COLORS.length - 1],
                              }}
                              aria-label={`${stage.name}: ${stage.count} candidates`}
                            >
                              <span
                                className="px-5 text-center text-[14px] font-[600] tracking-[-0.01em] text-white"
                                style={{ fontFamily: "Manrope, sans-serif" }}
                              >
                                {stage.name}
                              </span>
                            </button>
                          </div>
                        </div>

                        <div className="w-[96px] shrink-0 text-left">
                          <div
                            className="text-[18px] font-[700] leading-none text-[#111827]"
                            style={{ fontFamily: "Manrope, sans-serif" }}
                          >
                            {formatCompactNumber(stage.count)}
                          </div>
                          <div
                            className="mt-1 text-[12px] leading-none text-[#6B7280]"
                            style={{ fontFamily: "Inter, sans-serif" }}
                          >
                            {formatPercent(percentage)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                ref={detailPanelRef}
                className="relative rounded-[16px] bg-[#F2F4F6] p-6 shadow-[0_10px_30px_rgba(77,65,223,0.08)]"
              >
                <div
                  className={cn(
                    "transition-opacity ease-out",
                    contentVisible ? "opacity-100" : "opacity-0",
                  )}
                  style={{ transitionDuration: `${CONTENT_FADE_MS}ms` }}
                >
                  <h3
                    className="text-[24px] font-[700] leading-tight text-[#191C1E]"
                    style={{ fontFamily: "Manrope, sans-serif" }}
                  >
                    {hoveredStage ? `${hoveredStage.name} Efficiency` : "Pipeline Overview"}
                  </h3>

                  <p
                    className="mt-6 max-w-[30rem] text-[14px] leading-[1.6] text-[#464555]"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    {summary.parts.map((part, index) =>
                      index === summary.deltaIndex ? (
                        <span key={`${part}-${index}`} className={summary.deltaClassName}>
                          {part}
                        </span>
                      ) : (
                        <span key={`${part}-${index}`}>{part}</span>
                      ),
                    )}
                  </p>

                  <div className="mt-8 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-[12px] bg-white p-4">
                      <div
                        className="text-[10px] font-[600] uppercase tracking-[0.08em] text-[#6B7280]"
                        style={{ fontFamily: "Inter, sans-serif" }}
                      >
                        Avg. Time In Stage
                      </div>
                      <div
                        className="mt-2 text-[22px] font-[700] leading-tight text-[#111827]"
                        style={{ fontFamily: "Manrope, sans-serif" }}
                      >
                        {formatStageDays(details?.avgTimeInStageDays)}
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
