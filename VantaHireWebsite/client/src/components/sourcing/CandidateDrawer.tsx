import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ExternalLink,
  Star,
  EyeOff,
  Eye,
  Lock,
  MapPin,
  Building,
  Briefcase,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SourcedCandidateForUI } from "@/hooks/use-sourcing";
import {
  fitDescription,
  tierLabel,
  tierColor,
  identityLabel,
  enrichmentLabel,
  freshnessLabel,
  locationConfidence,
  locationLabelText,
  confidenceLabel,
  FIT_LABELS,
  FIT_INTERNAL_KEYS,
  toPctFitClient,
} from "@/lib/sourcing-labels";

interface CandidateDrawerProps {
  candidate: SourcedCandidateForUI | null;
  open: boolean;
  onClose: () => void;
  onUpdateState: (
    candidateId: number,
    state: "new" | "shortlisted" | "hidden",
  ) => void;
  isUpdating: boolean;
}

function FitBadge({ score }: { score: number | null }) {
  if (score == null) {
    return <Badge variant="outline" className="text-xs">No score</Badge>;
  }
  const color =
    score >= 75
      ? "bg-green-100 text-green-800 border-green-200"
      : score >= 50
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-red-100 text-red-800 border-red-200";
  return (
    <Badge variant="outline" className={cn("text-xs font-semibold", color)}>
      {fitDescription(score)} &middot; {score}
    </Badge>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

function formatDateLabel(input: string): string {
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? input : parsed.toLocaleDateString();
}

export function CandidateDrawer({
  candidate,
  open,
  onClose,
  onUpdateState,
  isUpdating,
}: CandidateDrawerProps) {
  if (!candidate) return null;

  const c = candidate;
  const isShortlisted = c.state === "shortlisted";
  const isHidden = c.state === "hidden";
  const skills = Array.isArray(c.snapshot?.skillsNormalized)
    ? (c.snapshot?.skillsNormalized as string[])
    : [];

  const fitBreakdownEntries = c.fitBreakdown
    ? Object.entries(c.fitBreakdown)
        .filter(([k, v]) => v != null && v !== "" && !FIT_INTERNAL_KEYS.has(k))
        .sort(([, a], [, b]) => (typeof b === "number" ? b : -1) - (typeof a === "number" ? a : -1))
    : [];

  const locConf = locationConfidence(c.locationMatchType, c.locationConfidenceNumeric);
  const locLabel = locationLabelText(c.locationLabel);
  const dataConf = confidenceLabel(c.dataConfidence);

  // Check for professionalValidation in candidateSummary
  const cs = c.candidateSummary && typeof c.candidateSummary === "object"
    ? c.candidateSummary as Record<string, unknown>
    : null;
  const hasProfValidation = cs?.professionalValidation != null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="right" className="sm:max-w-lg w-full overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="text-lg">{c.nameHint || "Unknown Candidate"}</SheetTitle>
          {c.headlineHint && <p className="text-sm text-muted-foreground">{c.headlineHint}</p>}
        </SheetHeader>

        <div className="mt-4 space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {c.companyHint && (
              <span className="flex items-center gap-1">
                <Building className="h-3.5 w-3.5" />
                {c.companyHint}
              </span>
            )}
            {(c.locationHint || c.snapshot?.location) && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {c.locationHint || c.snapshot?.location}
              </span>
            )}
            {c.linkedinUrl && (
              <a
                href={c.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-blue-600 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                LinkedIn
              </a>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <FitBadge score={c.fitScore} />
            <Badge
              variant="outline"
              className={cn("text-xs", tierColor(c.matchTier, c.displayBucket))}
            >
              {tierLabel(c.matchTier, c.displayBucket)}
            </Badge>
            {c.engagementReady && (
              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                <CheckCircle2 className="h-3 w-3 mr-0.5" />
                Ready to engage
              </Badge>
            )}
            {c.identitySummary?.displayStatus && (
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  c.identitySummary.displayStatus === "verified"
                    ? "bg-green-100 text-green-800 border-green-200"
                    : c.identitySummary.displayStatus === "review"
                      ? "bg-amber-100 text-amber-800 border-amber-200"
                      : "bg-red-100 text-red-800 border-red-200",
                )}
              >
                {identityLabel(c.identitySummary.displayStatus)}
              </Badge>
            )}
            {c.enrichmentStatus && (
              <Badge variant="outline" className="text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {enrichmentLabel(c.enrichmentStatus)}
              </Badge>
            )}
            {hasProfValidation && (
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                Professional background verified
              </Badge>
            )}
          </div>

          {/* Location confidence section */}
          {locConf.label && (
            <div className="flex items-center gap-2 text-sm">
              <span className={cn("inline-block h-2.5 w-2.5 rounded-full shrink-0", locConf.dotColor)} />
              <span className={locConf.color}>{locConf.label}</span>
              {locLabel && <span className="text-xs text-muted-foreground">({locLabel})</span>}
            </div>
          )}

          <Separator />

          {fitBreakdownEntries.length > 0 && (
            <Section title="Why this candidate matched">
              <div className="space-y-2">
                {fitBreakdownEntries.map(([key, value]) => {
                  const pct = typeof value === "number" ? toPctFitClient(value) : null;
                  return (
                    <div key={key} className="space-y-0.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {FIT_LABELS[key] || key.replace(/([A-Z])/g, " $1").trim()}
                        </span>
                        <span className="font-medium">{pct != null ? `${pct}%` : String(value)}</span>
                      </div>
                      {pct != null && (
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-red-400",
                            )}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                {dataConf && (
                  <p className="text-xs text-muted-foreground mt-1">{dataConf}</p>
                )}
              </div>
            </Section>
          )}

          {c.snapshot && (
            <Section title="Profile snapshot">
              <div className="space-y-2">
                {(c.snapshot.roleType || c.snapshot.seniorityBand) && (
                  <div className="flex items-center gap-2 text-sm">
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                    {[c.snapshot.roleType, c.snapshot.seniorityBand].filter(Boolean).join(" \u00b7 ")}
                  </div>
                )}
                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {skills.map((skill) => (
                      <Badge key={skill} variant="secondary" className="text-xs font-normal">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                )}
                {c.searchSnippet && (
                  <p className="text-sm text-muted-foreground">{c.searchSnippet}</p>
                )}
              </div>
            </Section>
          )}

          {c.identitySummary && (
            <Section title="Profile verification">
              <div className="space-y-1 text-sm">
                {c.identitySummary.platforms.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {c.identitySummary.platforms.map((p) => (
                      <Badge key={p} variant="secondary" className="text-xs font-normal">
                        {p}
                      </Badge>
                    ))}
                  </div>
                )}
                {typeof c.identitySummary.maxIdentityConfidence === "number" && (
                  <p className="text-xs text-muted-foreground">
                    Verification confidence: {Math.round(c.identitySummary.maxIdentityConfidence * 100)}%
                  </p>
                )}
                {c.freshness.lastIdentityCheckAt && (
                  <p className="text-xs text-muted-foreground">
                    Last checked: {new Date(c.freshness.lastIdentityCheckAt).toLocaleDateString()}
                    {c.freshness.identityCheckDaysAgo != null && ` (${c.freshness.identityCheckDaysAgo}d ago)`}
                  </p>
                )}
              </div>
            </Section>
          )}

          <Section title="Data freshness">
            <div className="text-sm text-muted-foreground space-y-1">
              {c.freshness.lastEnrichedAt && (
                <p>
                  {freshnessLabel("enriched")}: {new Date(c.freshness.lastEnrichedAt).toLocaleDateString()}
                  {c.freshness.enrichedDaysAgo != null && ` (${c.freshness.enrichedDaysAgo}d ago)`}
                </p>
              )}
              {c.searchSignals.serpDate && (
                <p>
                  {freshnessLabel("serp")}: {formatDateLabel(c.searchSignals.serpDate)}
                  {c.searchSignals.serpDateDaysAgo != null && ` (${c.searchSignals.serpDateDaysAgo}d ago)`}
                </p>
              )}
              {c.snapshot?.computedAt && (
                <p>{freshnessLabel("snapshot")}: {new Date(c.snapshot.computedAt).toLocaleDateString()}</p>
              )}
            </div>
          </Section>
        </div>

        <div className="sticky bottom-0 pt-4 pb-4 mt-6 bg-background border-t flex gap-2 flex-wrap">
          {c.state === "new" && (
            <>
              <Button size="sm" onClick={() => onUpdateState(c.id, "shortlisted")} disabled={isUpdating}>
                <Star className="h-4 w-4 mr-1.5" />
                Shortlist
              </Button>
              <Button variant="outline" size="sm" onClick={() => onUpdateState(c.id, "hidden")} disabled={isUpdating}>
                <EyeOff className="h-4 w-4 mr-1.5" />
                Hide
              </Button>
            </>
          )}

          {isShortlisted && (
            <>
              <Button variant="outline" size="sm" onClick={() => onUpdateState(c.id, "new")} disabled={isUpdating}>
                <Star className="h-4 w-4 mr-1.5" />
                Remove from Shortlist
              </Button>
              <Button variant="outline" size="sm" onClick={() => onUpdateState(c.id, "hidden")} disabled={isUpdating}>
                <EyeOff className="h-4 w-4 mr-1.5" />
                Hide
              </Button>
            </>
          )}

          {isHidden && (
            <>
              <Button variant="outline" size="sm" onClick={() => onUpdateState(c.id, "new")} disabled={isUpdating}>
                <Eye className="h-4 w-4 mr-1.5" />
                Unhide
              </Button>
              <Button size="sm" onClick={() => onUpdateState(c.id, "shortlisted")} disabled={isUpdating}>
                <Star className="h-4 w-4 mr-1.5" />
                Shortlist
              </Button>
            </>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" disabled>
                <Lock className="h-4 w-4 mr-1.5" />
                Unlock Contact
              </Button>
            </TooltipTrigger>
            <TooltipContent>Coming soon</TooltipContent>
          </Tooltip>
        </div>
      </SheetContent>
    </Sheet>
  );
}
