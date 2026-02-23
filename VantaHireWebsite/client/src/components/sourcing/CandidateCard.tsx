import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Star,
  MapPin,
  Building,
  Briefcase,
  Github,
  Code,
  Package,
  Database,
  GraduationCap,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SourcedCandidateForUI } from "@/hooks/use-sourcing";

interface CandidateCardProps {
  candidate: SourcedCandidateForUI;
  onClick: () => void;
  onShortlist: () => void;
  isUpdating: boolean;
}

// -- Fit score badge ----------------------------------------------------------

function FitBadge({ score }: { score: number | null }) {
  if (score == null) return <Badge variant="outline" className="text-xs">No score</Badge>;
  const color =
    score >= 75
      ? "bg-green-100 text-green-800 border-green-200"
      : score >= 50
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-red-100 text-red-800 border-red-200";
  return (
    <Badge variant="outline" className={cn("text-xs font-semibold", color)}>
      Fit: {score}
    </Badge>
  );
}

// -- Fit breakdown chips (top 2) ----------------------------------------------

const FIT_LABELS: Record<string, string> = {
  skillScore: "Skill",
  seniorityScore: "Seniority",
  locationScore: "Location",
  activityFreshnessScore: "Freshness",
};

function FitChips({ breakdown }: { breakdown: Record<string, unknown> | null }) {
  if (!breakdown) return null;
  const chips = Object.entries(breakdown)
    .filter(([k, v]) => k !== "total" && typeof v === "number" && v > 0.1)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 2);
  if (chips.length === 0) return null;
  return (
    <>
      {chips.map(([key, value]) => (
        <Badge key={key} variant="outline" className="text-[10px] font-normal text-muted-foreground">
          {FIT_LABELS[key] || key}: {Math.round((value as number) * 100)}%
        </Badge>
      ))}
    </>
  );
}

// -- Identity badge with confidence -------------------------------------------

function IdentityBadge({
  status,
  confidence,
}: {
  status: string | null | undefined;
  confidence: number | null | undefined;
}) {
  if (!status) return null;
  const styles: Record<string, string> = {
    verified: "bg-green-100 text-green-800 border-green-200",
    review: "bg-amber-100 text-amber-800 border-amber-200",
    weak: "bg-red-100 text-red-800 border-red-200",
  };
  // Show confidence % only when >= 0.5 (avoid false precision)
  const showConfidence = typeof confidence === "number" && confidence >= 0.5;
  return (
    <Badge variant="outline" className={cn("text-xs capitalize", styles[status] || "")}>
      {status}
      {showConfidence && (
        <span className="ml-1 font-mono text-[10px]">
          {Math.round(confidence * 100)}%
        </span>
      )}
    </Badge>
  );
}

// -- Source badge --------------------------------------------------------------

function SourceBadge({ bucket }: { bucket: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs",
        bucket === "talent_pool"
          ? "bg-blue-50 text-blue-700 border-blue-200"
          : "bg-purple-50 text-purple-700 border-purple-200",
      )}
    >
      {bucket === "talent_pool" ? "Talent Pool" : "Discovered"}
    </Badge>
  );
}

// -- Enrichment status badge ---------------------------------------------------

function EnrichmentBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const style =
    status === "completed"
      ? "bg-green-50 text-green-700 border-green-200"
      : status === "pending"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-red-50 text-red-700 border-red-200";
  return (
    <Badge variant="outline" className={cn("text-[10px] capitalize", style)}>
      <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
      {status}
    </Badge>
  );
}

// -- Platform icons (first 2 + overflow) --------------------------------------

function getPlatformIcon(platform: string) {
  switch (platform) {
    case "github":
      return <Github className="h-3.5 w-3.5" />;
    case "stackoverflow":
      return <Code className="h-3.5 w-3.5" />;
    case "npm":
    case "pypi":
      return <Package className="h-3.5 w-3.5" />;
    case "kaggle":
    case "huggingface":
    case "dockerhub":
      return <Database className="h-3.5 w-3.5" />;
    case "scholar":
    case "orcid":
    case "researchgate":
      return <GraduationCap className="h-3.5 w-3.5" />;
    default:
      return <ExternalLink className="h-3.5 w-3.5" />;
  }
}

const PLATFORM_LABELS: Record<string, string> = {
  github: "GitHub",
  stackoverflow: "Stack Overflow",
  npm: "npm",
  pypi: "PyPI",
  kaggle: "Kaggle",
  huggingface: "Hugging Face",
  dockerhub: "Docker Hub",
  scholar: "Google Scholar",
  orcid: "ORCID",
  researchgate: "ResearchGate",
  leetcode: "LeetCode",
  gitlab: "GitLab",
  medium: "Medium",
  twitter: "Twitter/X",
};

function PlatformIcons({ platforms }: { platforms: string[] | undefined }) {
  if (!platforms || platforms.length === 0) return null;
  const visible = platforms.slice(0, 2);
  const overflow = platforms.length - 2;
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      {visible.map((p) => (
        <span key={p} title={PLATFORM_LABELS[p] || p}>
          {getPlatformIcon(p)}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-[10px] font-medium" title={platforms.slice(2).map(p => PLATFORM_LABELS[p] || p).join(", ")}>
          +{overflow}
        </span>
      )}
    </span>
  );
}

// -- Freshness text -----------------------------------------------------------

function freshnessText(daysAgo: number | null, label: string): string | null {
  if (daysAgo == null) return null;
  if (daysAgo === 0) return `${label} today`;
  return `${label} ${daysAgo}d ago`;
}

// -- Main card ----------------------------------------------------------------

export function CandidateCard({ candidate, onClick, onShortlist, isUpdating }: CandidateCardProps) {
  const c = candidate;
  const isShortlisted = c.state === "shortlisted";
  const skills = Array.isArray(c.snapshot?.skillsNormalized)
    ? (c.snapshot!.skillsNormalized as string[]).slice(0, 4)
    : [];

  const enrichedText = freshnessText(c.freshness.enrichedDaysAgo, "Enriched");
  const identityText = freshnessText(c.freshness.identityCheckDaysAgo, "Identity checked");
  const freshnessLine = [enrichedText, identityText].filter(Boolean).join(" · ");

  // Truncate snippet to ~120 chars
  const snippet = c.searchSnippet
    ? c.searchSnippet.length > 120
      ? c.searchSnippet.slice(0, 117) + "..."
      : c.searchSnippet
    : null;

  return (
    <div
      className={cn(
        "p-4 rounded-lg border bg-white hover:shadow-sm transition-shadow cursor-pointer",
        c.state === "hidden" && "opacity-60",
        isShortlisted && "border-primary/30 bg-primary/5",
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Row 1: Name + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">
              {c.nameHint || "Unknown Candidate"}
            </span>
            <FitBadge score={c.fitScore} />
            <FitChips breakdown={c.fitBreakdown} />
            <SourceBadge bucket={c.displayBucket} />
            <IdentityBadge
              status={c.identitySummary?.displayStatus}
              confidence={c.identitySummary?.maxIdentityConfidence}
            />
            <PlatformIcons platforms={c.identitySummary?.platforms} />
            <EnrichmentBadge status={c.enrichmentStatus} />
          </div>

          {/* Row 2: Headline + company + location */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
            {c.headlineHint && <span className="truncate">{c.headlineHint}</span>}
            {c.companyHint && (
              <span className="flex items-center gap-1">
                <Building className="h-3 w-3" />
                {c.companyHint}
              </span>
            )}
            {(c.locationHint || c.snapshot?.location) && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {c.locationHint || c.snapshot?.location}
              </span>
            )}
          </div>

          {/* Row 3: Skills + seniority */}
          <div className="flex items-center gap-2 flex-wrap">
            {skills.map((skill) => (
              <Badge key={skill} variant="secondary" className="text-xs font-normal">
                {skill}
              </Badge>
            ))}
            {c.snapshot?.seniorityBand && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Briefcase className="h-3 w-3" />
                {c.snapshot.seniorityBand}
              </span>
            )}
          </div>

          {/* Row 4: Web snippet */}
          {snippet && (
            <p className="text-xs text-muted-foreground/80 italic truncate">
              {snippet}
            </p>
          )}

          {/* Row 5: Freshness */}
          {freshnessLine && (
            <p className="text-xs text-muted-foreground">{freshnessLine}</p>
          )}
        </div>

        {/* Shortlist button */}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          disabled={isUpdating}
          onClick={(e) => {
            e.stopPropagation();
            onShortlist();
          }}
          title={isShortlisted ? "Remove from shortlist" : "Add to shortlist"}
        >
          <Star
            className={cn(
              "h-5 w-5",
              isShortlisted ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
            )}
          />
        </Button>
      </div>
    </div>
  );
}
