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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SourcedCandidateForUI } from "@/hooks/use-sourcing";

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
  if (score == null)
    return (
      <Badge variant="outline" className="text-xs">
        No score
      </Badge>
    );
  const color =
    score >= 75
      ? "bg-green-100 text-green-800 border-green-200"
      : score >= 50
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-red-100 text-red-800 border-red-200";
  return (
    <Badge variant="outline" className={cn("text-sm font-semibold", color)}>
      Fit: {score}
    </Badge>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
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
    ? (c.snapshot!.skillsNormalized as string[])
    : [];

  const fitBreakdownEntries = c.fitBreakdown
    ? Object.entries(c.fitBreakdown).filter(
        ([, v]) => v != null && v !== "",
      )
    : [];

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="right" className="sm:max-w-lg w-full overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="text-lg">
            {c.nameHint || "Unknown Candidate"}
          </SheetTitle>
          {c.headlineHint && (
            <p className="text-sm text-muted-foreground">{c.headlineHint}</p>
          )}
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Info row */}
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

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <FitBadge score={c.fitScore} />
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                c.displayBucket === "talent_pool"
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-purple-50 text-purple-700 border-purple-200",
              )}
            >
              {c.displayBucket === "talent_pool"
                ? "Talent Pool"
                : "Discovered"}
            </Badge>
            {c.identitySummary?.displayStatus && (
              <Badge
                variant="outline"
                className={cn(
                  "text-xs capitalize",
                  c.identitySummary.displayStatus === "verified"
                    ? "bg-green-100 text-green-800 border-green-200"
                    : c.identitySummary.displayStatus === "review"
                      ? "bg-amber-100 text-amber-800 border-amber-200"
                      : "bg-red-100 text-red-800 border-red-200",
                )}
              >
                {c.identitySummary.displayStatus}
              </Badge>
            )}
          </div>

          <Separator />

          {/* Match Summary */}
          {fitBreakdownEntries.length > 0 && (
            <Section title="Match Summary">
              <div className="space-y-1">
                {fitBreakdownEntries.map(([key, value]) => (
                  <div
                    key={key}
                    className="flex justify-between text-sm"
                  >
                    <span className="text-muted-foreground capitalize">
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </span>
                    <span className="font-medium">{String(value)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Identity */}
          {c.identitySummary && (
            <Section title="Identity Status">
              <div className="space-y-1 text-sm">
                {c.identitySummary.platforms.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {c.identitySummary.platforms.map((p) => (
                      <Badge
                        key={p}
                        variant="secondary"
                        className="text-xs font-normal"
                      >
                        {p}
                      </Badge>
                    ))}
                  </div>
                )}
                {c.freshness.lastIdentityCheckAt && (
                  <p className="text-xs text-muted-foreground">
                    Last checked:{" "}
                    {new Date(c.freshness.lastIdentityCheckAt).toLocaleDateString()}
                    {c.freshness.identityCheckDaysAgo != null &&
                      ` (${c.freshness.identityCheckDaysAgo}d ago)`}
                  </p>
                )}
              </div>
            </Section>
          )}

          {/* Snapshot Highlights */}
          {c.snapshot && (
            <Section title="Snapshot">
              <div className="space-y-2">
                {(c.snapshot.roleType || c.snapshot.seniorityBand) && (
                  <div className="flex items-center gap-2 text-sm">
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                    {[c.snapshot.roleType, c.snapshot.seniorityBand]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {skills.map((skill) => (
                      <Badge
                        key={skill}
                        variant="secondary"
                        className="text-xs font-normal"
                      >
                        {skill}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Freshness */}
          <Section title="Freshness">
            <div className="text-sm text-muted-foreground space-y-1">
              {c.freshness.lastEnrichedAt && (
                <p>
                  Enriched:{" "}
                  {new Date(c.freshness.lastEnrichedAt).toLocaleDateString()}
                  {c.freshness.enrichedDaysAgo != null &&
                    ` (${c.freshness.enrichedDaysAgo}d ago)`}
                </p>
              )}
              {c.snapshot?.computedAt && (
                <p>
                  Snapshot:{" "}
                  {new Date(c.snapshot.computedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </Section>
        </div>

        {/* Sticky action bar */}
        <div className="sticky bottom-0 pt-4 pb-2 mt-6 bg-background border-t flex gap-2 flex-wrap">
          {c.state === "new" && (
            <>
              <Button
                size="sm"
                onClick={() => onUpdateState(c.id, "shortlisted")}
                disabled={isUpdating}
              >
                <Star className="h-4 w-4 mr-1.5" />
                Shortlist
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onUpdateState(c.id, "hidden")}
                disabled={isUpdating}
              >
                <EyeOff className="h-4 w-4 mr-1.5" />
                Hide
              </Button>
            </>
          )}
          {isShortlisted && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onUpdateState(c.id, "new")}
                disabled={isUpdating}
              >
                <Star className="h-4 w-4 mr-1.5" />
                Remove from Shortlist
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onUpdateState(c.id, "hidden")}
                disabled={isUpdating}
              >
                <EyeOff className="h-4 w-4 mr-1.5" />
                Hide
              </Button>
            </>
          )}
          {isHidden && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onUpdateState(c.id, "new")}
                disabled={isUpdating}
              >
                <Eye className="h-4 w-4 mr-1.5" />
                Unhide
              </Button>
              <Button
                size="sm"
                onClick={() => onUpdateState(c.id, "shortlisted")}
                disabled={isUpdating}
              >
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
