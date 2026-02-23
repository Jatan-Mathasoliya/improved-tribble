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
      Fit: {score}
    </Badge>
  );
}

function IdentityBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const styles: Record<string, string> = {
    verified: "bg-green-100 text-green-800 border-green-200",
    review: "bg-amber-100 text-amber-800 border-amber-200",
    weak: "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <Badge variant="outline" className={cn("text-xs capitalize", styles[status] || "")}>
      {status}
    </Badge>
  );
}

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

function freshnessText(daysAgo: number | null, label: string): string | null {
  if (daysAgo == null) return null;
  if (daysAgo === 0) return `${label} today`;
  return `${label} ${daysAgo}d ago`;
}

export function CandidateCard({ candidate, onClick, onShortlist, isUpdating }: CandidateCardProps) {
  const c = candidate;
  const isShortlisted = c.state === "shortlisted";
  const skills = Array.isArray(c.snapshot?.skillsNormalized)
    ? (c.snapshot!.skillsNormalized as string[]).slice(0, 4)
    : [];

  const enrichedText = freshnessText(c.freshness.enrichedDaysAgo, "Enriched");
  const identityText = freshnessText(c.freshness.identityCheckDaysAgo, "Identity checked");
  const freshnessLine = [enrichedText, identityText].filter(Boolean).join(" · ");

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
            <SourceBadge bucket={c.displayBucket} />
            <IdentityBadge status={c.identitySummary?.displayStatus} />
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

          {/* Row 4: Freshness */}
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
