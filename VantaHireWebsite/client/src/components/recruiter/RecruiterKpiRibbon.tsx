import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowRight, ArrowUpRight, HelpCircle } from "lucide-react";

type KpiStatus = "healthy" | "needs_attention" | "at_risk";
type TrendDirection = "up" | "down" | "flat";

type KpiInsightCard = {
  id: string;
  label: string;
  status: KpiStatus;
  value: number | null;
  displayValue: string | null;
  trendDelta: number | null;
  trendDirection: TrendDirection;
  comparisonLabel: string | null;
  contextLine: string | null;
  unit?: string | null;
  insights: Record<string, unknown> | null;
};

export type RecruiterDashboardKpiResponse = {
  generatedAt: string;
  range: string;
  jobId: number | null;
  comparisonLabel: string | null;
  cards: {
    pipelineHealth: KpiInsightCard;
    activeRoles: KpiInsightCard;
    todaysApplications: KpiInsightCard;
    firstReviewTime: KpiInsightCard;
    screenToInterview: KpiInsightCard;
  };
};

interface RecruiterKpiRibbonProps {
  data?: RecruiterDashboardKpiResponse | null | undefined;
  isLoading?: boolean;
  className?: string;
}

type DetailLine = {
  label: string;
  value: string;
};

const statusMap: Record<KpiStatus, { label: string; badge: string }> = {
  healthy: {
    label: "Healthy",
    badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  },
  needs_attention: {
    label: "Needs attention",
    badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  },
  at_risk: {
    label: "At risk",
    badge: "bg-rose-50 text-rose-700 ring-1 ring-rose-100",
  },
};

const tooltipMap: Record<string, string> = {
  pipelineHealth: "AI score measuring how efficiently candidates move through your pipeline",
  activeRoles: "Total number of open job positions currently accepting applications",
  todaysApplications: "New candidate applications received today across all your active jobs",
  firstReviewTime: "Average time taken by you to first respond to a new candidate application",
  screenToInterview: "Percentage of screened candidates who successfully moved from Screening to Interview stage",
};

function fallbackText(value?: string | null) {
  return value && value.trim() ? value : "—";
}

function formatCount(value: unknown) {
  return typeof value === "number" && !Number.isNaN(value) ? String(value) : "—";
}

function formatFixed(value: unknown, digits = 1, suffix = "") {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}

function formatPercent(value: unknown, digits = 1) {
  return formatFixed(value, digits, "%");
}

function stageLabelToSentence(label?: string | null) {
  if (!label) return "—";
  return label.replace(/\s*→\s*/g, " to ").replace(/\s*->\s*/g, " to ");
}

function formatTrend(card: KpiInsightCard) {
  if (card.trendDelta == null || Number.isNaN(card.trendDelta)) {
    return {
      icon: ArrowRight,
      className: "text-slate-400",
      text: "No change",
    };
  }

  if (card.trendDirection === "up") {
    return {
      icon: ArrowUpRight,
      className: "text-emerald-600",
      text: `${Math.abs(card.trendDelta).toFixed(1)}%`,
    };
  }

  if (card.trendDirection === "down") {
    return {
      icon: ArrowDownRight,
      className: "text-rose-600",
      text: `${Math.abs(card.trendDelta).toFixed(1)}%`,
    };
  }

  return {
    icon: ArrowRight,
    className: "text-slate-500",
    text: `${Math.abs(card.trendDelta).toFixed(1)}%`,
  };
}

function getDetailLines(card: KpiInsightCard): DetailLine[] {
  const insights = card.insights ?? {};

  switch (card.id) {
    case "pipelineHealth": {
      const stuck = Array.isArray(insights.stuckCandidates)
        ? (insights.stuckCandidates as Array<{ stage?: string; count?: number }>)
        : [];
      const strongest = (insights.strongestConvertingStage ?? null) as { label?: string; rate?: number } | null;
      const weakest = (insights.weakestConvertingStage ?? null) as { label?: string; rate?: number } | null;
      const delayedStages = stuck.filter((item) => item.stage && typeof item.count === "number" && item.count > 0);

      return [
        {
          label: "Candidate stuck",
          value: delayedStages.length
            ? delayedStages.map((item) => `${item.stage} (${item.count})`).join(", ")
            : "Not enough pipeline movement to highlight delays clearly",
        },
        {
          label: "Best conversion",
          value:
            strongest?.label && typeof strongest.rate === "number"
              ? `${stageLabelToSentence(strongest.label)} (${formatPercent(strongest.rate, 1)})`
              : "—",
        },
        {
          label: "Lowest conversion",
          value:
            weakest?.label && typeof weakest.rate === "number"
              ? `${stageLabelToSentence(weakest.label)} (${formatPercent(weakest.rate, 1)})`
              : "—",
        },
      ];
    }
    case "activeRoles": {
      const highest = (insights.highestDemandRole ?? null) as { jobTitle?: string; applications?: number } | null;
      const lowest = (insights.lowestCandidateVolumeRole ?? null) as { jobTitle?: string; activeCandidates?: number } | null;
      const closingSoon = (insights.closingSoonRole ?? null) as { jobTitle?: string; daysToClose?: number } | null;
      const hasMeaningfulRoleInsights =
        Boolean(highest?.jobTitle && typeof highest.applications === "number" && highest.applications > 0) ||
        Boolean(lowest?.jobTitle && typeof lowest.activeCandidates === "number" && lowest.activeCandidates > 0) ||
        Boolean(closingSoon?.jobTitle && typeof closingSoon.daysToClose === "number");

      if (!hasMeaningfulRoleInsights) {
        return [
          {
            label: "Role insights",
            value: "Not enough role activity to highlight detailed insights right now",
          },
        ];
      }

      return [
        {
          label: "Highest demand",
          value: highest?.jobTitle ? `${highest.jobTitle} with ${formatCount(highest.applications)} applications` : "—",
        },
        {
          label: "Needs sourcing",
          value: lowest?.jobTitle ? `${lowest.jobTitle} with ${formatCount(lowest.activeCandidates)} active candidates` : "—",
        },
        {
          label: "Closing soon",
          value:
            closingSoon?.jobTitle && typeof closingSoon.daysToClose === "number"
              ? `${closingSoon.jobTitle} closes in ${closingSoon.daysToClose} day${closingSoon.daysToClose === 1 ? "" : "s"}`
              : "—",
        },
      ];
    }
    case "todaysApplications": {
      const topJob = (insights.topJobToday ?? null) as { jobTitle?: string; applications?: number } | null;
      const newApplicationsToday = typeof insights.newApplicationsToday === "number" ? insights.newApplicationsToday : null;
      const topJobApplications = typeof topJob?.applications === "number" ? topJob.applications : null;
      const sevenDayAverage = typeof insights.sevenDayAverage === "number" ? insights.sevenDayAverage : null;

      if ((newApplicationsToday ?? 0) <= 0 && (topJobApplications ?? 0) <= 0) {
        return [
          {
            label: "Activity today",
            value: "No meaningful application activity to highlight today",
          },
        ];
      }

      return [
        {
          label: "Today",
          value:
            typeof newApplicationsToday === "number" && newApplicationsToday > 0
              ? `${newApplicationsToday} new application${newApplicationsToday === 1 ? "" : "s"} today`
              : "—",
        },
        {
          label: "Top role today",
          value:
            topJob?.jobTitle && (topJobApplications ?? 0) > 0
              ? `${topJob.jobTitle} received the most today (${topJobApplications})`
              : "Not enough activity today to identify a standout role",
        },
        {
          label: "7-day average",
          value:
            typeof sevenDayAverage === "number" && sevenDayAverage > 0
              ? `${sevenDayAverage.toFixed(1)} applications per day`
              : "—",
        },
      ];
    }
    case "firstReviewTime": {
      const progressionRate = typeof insights.progressionRate === "number" ? insights.progressionRate : null;
      const hasMeaningfulReviewInsights =
        typeof card.value === "number" || typeof insights.benchmark === "string" || (progressionRate ?? 0) > 0;

      if (!hasMeaningfulReviewInsights) {
        return [
          {
            label: "Review speed",
            value: "Not enough recent review activity to show deeper timing insights",
          },
        ];
      }

      return [
        {
          label: "Current average",
          value:
            typeof card.value === "number"
              ? `${card.value.toFixed(1)} hours to first review`
              : "—",
        },
        {
          label: "Healthy benchmark",
          value: typeof insights.benchmark === "string" ? insights.benchmark : "—",
        },
        {
          label: "Progression rate",
          value:
            typeof progressionRate === "number" && progressionRate > 0
              ? `${progressionRate.toFixed(1)}% candidate progression rate`
              : "—",
        },
      ];
    }
    case "screenToInterview": {
      const activeInterviewLoops = typeof insights.activeInterviewLoops === "number" ? insights.activeInterviewLoops : null;
      const interviewsScheduledToday =
        typeof insights.interviewsScheduledToday === "number" ? insights.interviewsScheduledToday : null;

      if ((card.value ?? 0) <= 0 && (activeInterviewLoops ?? 0) <= 0 && (interviewsScheduledToday ?? 0) <= 0) {
        return [
          {
            label: "Interview flow",
            value: "Not enough interview activity yet to show detailed conversion insights",
          },
        ];
      }

      return [
        {
          label: "Conversion rate",
          value:
            typeof card.value === "number" && card.value > 0
              ? `${card.value.toFixed(1)}% moved from screening to interview`
              : "—",
        },
        {
          label: "Interview loops",
          value:
            typeof activeInterviewLoops === "number" && activeInterviewLoops > 0
              ? `${activeInterviewLoops} candidates are currently in interview loops`
              : "—",
        },
        {
          label: "Scheduled today",
          value:
            typeof interviewsScheduledToday === "number" && interviewsScheduledToday > 0
              ? `${interviewsScheduledToday} interviews are scheduled today`
              : "—",
        },
      ];
    }
    default:
      return [];
  }
}

function DetailSection({ card, expanded = false }: { card: KpiInsightCard; expanded?: boolean }) {
  const lines = getDetailLines(card);

  return (
    <div
      className={cn(
        "overflow-hidden transition-[max-height,opacity,transform,margin,padding] duration-200 ease-out",
        expanded
          ? "mt-3.5 max-h-64 translate-y-0 border-t border-slate-100 pt-3.5 opacity-100"
          : "max-h-0 translate-y-1 pt-0 opacity-0",
      )}
    >
      <div className="space-y-1.5">
        {lines.map((line, index) => (
          <div key={`${card.id}-${index}`} className="flex items-start gap-2 text-[12.5px] leading-5 text-slate-600">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-300" />
            <div className="min-w-0">
              <span className="font-medium text-slate-700">{line.label}:</span>{" "}
              <span>{line.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiCard({
  card,
  compact = false,
  expanded = false,
  onOpen,
  onClose,
}: {
  card: KpiInsightCard;
  compact?: boolean;
  expanded?: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const status = statusMap[card.status] ?? statusMap.needs_attention;
  const trend = formatTrend(card);
  const TrendIcon = trend.icon;

  return (
    <Card
      className={cn(
        "rounded-xl border-0 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)] transition-[transform,box-shadow] duration-200 ease-out",
        expanded
          ? "shadow-[0_18px_38px_rgba(15,23,42,0.10)] -translate-y-0.5"
          : "hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(15,23,42,0.10)]",
      )}
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
      onFocus={onOpen}
      onBlur={onClose}
    >
      <div className={cn("flex flex-col p-4", compact ? "min-h-[112px]" : "min-h-[136px]")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {card.label}
            </div>
            <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold", status.badge)}>
              {status.label}
            </span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-full text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
                aria-label={`About ${card.label}`}
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs leading-relaxed">
              {tooltipMap[card.id] ?? card.label}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="mt-3.5 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[29px] font-bold leading-none tracking-[-0.04em] text-slate-900">
              {fallbackText(card.displayValue)}
            </div>
            <div className="mt-1.5 text-[13px] font-medium text-slate-500">{fallbackText(card.contextLine)}</div>
          </div>
          <div className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", trend.className)}>
            <TrendIcon className="h-3.5 w-3.5" />
            <span>{trend.text}</span>
          </div>
        </div>

        <DetailSection card={card} expanded={expanded} />
      </div>
    </Card>
  );
}

function LoadingCard({ compact = false }: { compact?: boolean }) {
  return (
    <Card className="rounded-xl border-0 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
      <div className={cn("flex animate-pulse flex-col p-5", compact ? "min-h-[130px]" : "min-h-[160px]")}>
        <div className="h-3 w-24 rounded-full bg-slate-200" />
        <div className="mt-3 h-6 w-24 rounded-full bg-slate-100" />
        <div className="mt-8 h-9 w-28 rounded-md bg-slate-200" />
        <div className="mt-3 h-4 w-32 rounded-md bg-slate-100" />
      </div>
    </Card>
  );
}

export function RecruiterKpiRibbon({ data, isLoading, className }: RecruiterKpiRibbonProps) {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const orderedCards = data
    ? [
        data.cards.pipelineHealth,
        data.cards.activeRoles,
        data.cards.todaysApplications,
        data.cards.firstReviewTime,
        data.cards.screenToInterview,
      ]
    : [];

  const topCards = orderedCards.slice(0, 3);
  const bottomCards = orderedCards.slice(3, 5);

  if (isLoading && !data) {
    return (
      <div className={cn("space-y-[14px]", className)}>
        <div className="grid gap-[14px] md:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <LoadingCard key={index} />
          ))}
        </div>
        <div className="flex justify-center">
          <div className="grid w-full gap-[14px] md:w-[calc(66.666%-9.5px)] md:grid-cols-2">
            {[0, 1].map((index) => (
              <LoadingCard key={index} compact />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={120}>
      <div className={cn("space-y-[14px]", className)}>
        <div className="flex flex-col gap-[14px] md:flex-row md:items-start">
          {topCards.map((card) => (
            <div key={card.id} className="md:min-w-0 md:flex-1">
              <KpiCard
                card={card}
                expanded={activeCardId === card.id}
                onOpen={() => setActiveCardId(card.id)}
                onClose={() => setActiveCardId((current) => (current === card.id ? null : current))}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-center">
          <div className="flex w-full flex-col gap-[14px] md:w-[calc(66.666%-9.5px)] md:flex-row md:items-start">
            {bottomCards.map((card) => (
              <div key={card.id} className="md:min-w-0 md:flex-1">
                <KpiCard
                  card={card}
                  compact
                  expanded={activeCardId === card.id}
                  onOpen={() => setActiveCardId(card.id)}
                  onClose={() => setActiveCardId((current) => (current === card.id ? null : current))}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
