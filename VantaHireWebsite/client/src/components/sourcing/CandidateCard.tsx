import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, MapPin, Building, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SourcedCandidateForUI } from "@/hooks/use-sourcing";

interface CandidateCardProps {
  candidate: SourcedCandidateForUI;
  onClick: () => void;
  onShortlist: () => void;
  isUpdating: boolean;
}

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
      Fit {score}
    </Badge>
  );
}

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
    <div className="flex items-center gap-1 flex-wrap">
      {chips.map(([key, value]) => (
        <Badge key={key} variant="outline" className="text-[10px] font-normal text-muted-foreground">
          {FIT_LABELS[key] || key}: {Math.round((value as number) * 100)}%
        </Badge>
      ))}
    </div>
  );
}

function TierBadge({ candidate }: { candidate: SourcedCandidateForUI }) {
  const tier = candidate.matchTier;
  if (tier === "broader_pool") {
    return <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">Broader Pool</Badge>;
  }
  if (tier === "best_matches") {
    return <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">Best Match</Badge>;
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs",
        candidate.displayBucket === "talent_pool"
          ? "bg-blue-50 text-blue-700 border-blue-200"
          : "bg-purple-50 text-purple-700 border-purple-200",
      )}
    >
      {candidate.displayBucket === "talent_pool" ? "Talent Pool" : "Discovered"}
    </Badge>
  );
}

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
  return (
    <Badge variant="outline" className={cn("text-xs capitalize", styles[status] || "") }>
      {status}
      {typeof confidence === "number" && confidence >= 0.5 && (
        <span className="ml-1 font-mono text-[10px]">{Math.round(confidence * 100)}%</span>
      )}
    </Badge>
  );
}

function freshnessText(daysAgo: number | null, label: string): string | null {
  if (daysAgo == null) return null;
  if (daysAgo === 0) return `${label} today`;
  return `${label} ${daysAgo}d ago`;
}

export function CandidateCard({ candidate, onClick, onShortlist, isUpdating }: CandidateCardProps) {
  const isShortlisted = candidate.state === "shortlisted";
  const skills = Array.isArray(candidate.snapshot?.skillsNormalized)
    ? (candidate.snapshot?.skillsNormalized as string[]).slice(0, 3)
    : [];

  const enrichedText = freshnessText(candidate.freshness.enrichedDaysAgo, "Enriched");
  const identityText = freshnessText(candidate.freshness.identityCheckDaysAgo, "Identity checked");
  const freshnessLine = [enrichedText, identityText].filter(Boolean).join(" · ");

  return (
    <div
      className={cn(
        "p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow cursor-pointer",
        candidate.state === "hidden" && "opacity-60",
        isShortlisted && "border-primary/30 bg-primary/5",
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm truncate max-w-[200px]">{candidate.nameHint || "Unknown Candidate"}</span>
            <FitBadge score={candidate.fitScore} />
            <TierBadge candidate={candidate} />
            <IdentityBadge
              status={candidate.identitySummary?.displayStatus}
              confidence={candidate.identitySummary?.maxIdentityConfidence}
            />
          </div>

          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
            {candidate.headlineHint && <span className="truncate">{candidate.headlineHint}</span>}
            {candidate.companyHint && (
              <span className="flex items-center gap-1">
                <Building className="h-3 w-3" />
                {candidate.companyHint}
              </span>
            )}
            {(candidate.locationHint || candidate.snapshot?.location) && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {candidate.locationHint || candidate.snapshot?.location}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <FitChips breakdown={candidate.fitBreakdown} />
            {skills.map((skill) => (
              <Badge key={skill} variant="secondary" className="text-[10px] font-normal">
                {skill}
              </Badge>
            ))}
            {candidate.snapshot?.seniorityBand && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Briefcase className="h-3 w-3" />
                {candidate.snapshot.seniorityBand}
              </span>
            )}
          </div>

          {freshnessLine && (
            <p className="text-xs text-muted-foreground">{freshnessLine}</p>
          )}
        </div>

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
