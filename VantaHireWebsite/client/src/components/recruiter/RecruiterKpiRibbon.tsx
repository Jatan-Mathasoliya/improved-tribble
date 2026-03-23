import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DASHBOARD_PANEL, DASHBOARD_PANEL_SOFT, DASHBOARD_EYEBROW } from "@/lib/dashboard-theme";
import { cn } from "@/lib/utils";
import { ArrowUpRight, HelpCircle } from "lucide-react";

type KpiVariant = "pipeline" | "roles" | "apps" | "review" | "interview";

type KpiItem = {
  label: string;
  value: string | number;
  hint?: string | undefined;
  secondary?: string | undefined;
  trend?: "up" | "down" | "flat" | undefined;
  trendValue?: string | undefined;
  tooltip?: string | undefined;
  variant?: KpiVariant | undefined;
};

interface RecruiterKpiRibbonProps {
  items: KpiItem[];
  heroLabel?: string | undefined;
  heroTooltip?: string | undefined;
  className?: string | undefined;
}

function PipelineRingIcon({ value }: { value: string | number }) {
  const numericValue =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).replace(/[^\d.]/g, ""));
  const progress = Number.isFinite(numericValue) ? Math.max(0, Math.min(numericValue, 100)) : 0;
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress / 100);

  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="pipeline-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7C74FF" />
          <stop offset="100%" stopColor="#524AE8" />
        </linearGradient>
      </defs>
      <circle cx="28" cy="28" r="19" fill="none" stroke="#E9E7FF" strokeWidth="3.5" />
      <circle
        cx="28"
        cy="28"
        r="19"
        fill="none"
        stroke="url(#pipeline-ring-gradient)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 28 28)"
      />
    </svg>
  );
}

function RolesBarsIcon() {
  return (
    <div className="flex h-12 w-12 items-end justify-center gap-1">
      <span className="w-[5px] rounded-full bg-[#DDD8FF]" style={{ height: 16 }} />
      <span className="w-[5px] rounded-full bg-[#C7C0FF]" style={{ height: 26 }} />
      <span className="w-[5px] rounded-full bg-[#897DFF]" style={{ height: 36 }} />
      <span className="w-[5px] rounded-full bg-[#5B52F5]" style={{ height: 20 }} />
    </div>
  );
}

function AppsTrendIcon() {
  return (
    <div className="flex h-9 w-14 items-center justify-center rounded-md bg-[#EAF8EE]">
      <svg width="24" height="24" viewBox="0 0 34 34" aria-hidden="true">
        <path
          d="M8 22.5L14.5 16L20 21.5L27 12.5"
          fill="none"
          stroke="#22C55E"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M23.6 12.5H27V15.9"
          fill="none"
          stroke="#22C55E"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function ReviewClockIcon() {
  return (
    <div className="flex h-12 w-12 items-center justify-center">
      <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
        <circle cx="23" cy="23" r="15.5" fill="none" stroke="#F6CCB3" strokeWidth="3.5" />
        <path
          d="M23 23L28.5 17.5"
          fill="none"
          stroke="#9A4B10"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="23" cy="23" r="3" fill="#9A4B10" />
      </svg>
    </div>
  );
}

function InterviewFlowIcon() {
  return (
    <div className="flex h-12 w-12 items-center justify-center">
      <svg width="38" height="38" viewBox="0 0 46 46" aria-hidden="true">
        <path
          d="M12 15C12 12.8 13.8 11 16 11H22C24.2 11 26 12.8 26 15C26 17.2 24.2 19 22 19H19C16.8 19 15 20.8 15 23C15 25.2 16.8 27 19 27H27C29.2 27 31 28.8 31 31C31 33.2 29.2 35 27 35H23"
          fill="none"
          stroke="#5B52F5"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="11" cy="15" r="3.2" fill="#5B52F5" />
        <circle cx="35" cy="31" r="3.2" fill="#5B52F5" />
      </svg>
    </div>
  );
}

function renderVisual(item: KpiItem): ReactNode {
  switch (item.variant) {
    case "pipeline":
      return <PipelineRingIcon value={item.value} />;
    case "roles":
      return <RolesBarsIcon />;
    case "apps":
      return <AppsTrendIcon />;
    case "review":
      return <ReviewClockIcon />;
    case "interview":
      return <InterviewFlowIcon />;
    default:
      return null;
  }
}

function getBottomContent(item: KpiItem) {
  if (item.variant === "pipeline") {
    const isHealthy = item.hint?.toLowerCase().includes("healthy");
    return (
      <p className={cn("mt-1.5 flex items-center gap-1 whitespace-nowrap text-[13px] font-semibold", isHealthy ? "text-[#16A34A]" : "text-[#DC2626]")}>
        {isHealthy ? <ArrowUpRight className="h-3.5 w-3.5" /> : null}
        <span>{isHealthy ? "Healthy" : "At risk"}</span>
      </p>
    );
  }

  if (item.variant === "apps") {
    const isPositive = item.trend === "up" && item.trendValue;
    return (
      <p className={cn("mt-1.5 flex items-center gap-1 whitespace-nowrap text-[13px] font-semibold", isPositive ? "text-[#16A34A]" : "text-[#6B7280]")}>
        {isPositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : null}
        <span>{isPositive ? `${item.trendValue} vs last week` : "vs last week"}</span>
      </p>
    );
  }

  if (item.variant === "review") {
    return <p className="mt-1.5 whitespace-nowrap text-[13px] font-medium text-[#C26B2C]">{item.secondary}</p>;
  }

  if (item.variant === "interview") {
    return <p className="mt-1.5 whitespace-nowrap text-[13px] font-medium text-[#5B52F5]">Screen -&gt; Interview</p>;
  }

  return <p className="mt-1.5 whitespace-nowrap text-[13px] font-normal text-[#6B7280]">{item.secondary}</p>;
}

export function RecruiterKpiRibbon({ items, heroLabel, heroTooltip, className }: RecruiterKpiRibbonProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5", className)}>
        {items.map((item, idx) => {
          const tooltipText = item.tooltip ?? (heroLabel === item.label ? heroTooltip : undefined);

          return (
            <Card
              key={idx}
              className={cn(
                DASHBOARD_PANEL,
                "group rounded-[24px] transition-transform duration-200 hover:-translate-y-0.5",
              )}
            >
              <div className="flex h-full min-h-[158px] flex-col px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div className={cn(DASHBOARD_EYEBROW, "text-[10px] tracking-[0.22em]")}>
                    {item.label}
                  </div>
                  {tooltipText ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="rounded-full text-[#334155] transition-colors hover:text-[#5B52F5]"
                          aria-label={`About ${item.label}`}
                        >
                          <HelpCircle className="h-[15px] w-[15px]" strokeWidth={1.8} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs leading-relaxed">
                        {tooltipText}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>

                <div className="mt-5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[32px] font-bold leading-none tracking-[-0.03em] text-[#0F172A]">
                      {item.value}
                    </div>
                    {getBottomContent(item)}
                  </div>
                  <div className={cn(DASHBOARD_PANEL_SOFT, "shrink-0 p-2.5")}>{renderVisual(item)}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
