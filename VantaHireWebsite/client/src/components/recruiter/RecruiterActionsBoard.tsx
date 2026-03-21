import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  Clock3,
  Eye,
  type LucideIcon,
  Loader2,
  MessageSquareMore,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RecruiterActionSectionId =
  | "candidatesToReview"
  | "jobsLowOnPipeline"
  | "feedbackPending"
  | "finalStageCandidates";

type RecruiterActionUrgency = "high" | "medium" | "low";

type RecruiterActionItem = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  urgency: RecruiterActionUrgency;
  ctaLabel: string;
  ctaHref: string;
  badge?: string;
};

type RecruiterActionSection = {
  id: RecruiterActionSectionId;
  title: string;
  description: string;
  count: number;
  emptyMessage: string;
  viewAllHref: string;
  items: RecruiterActionItem[];
};

type RecruiterActionsResponse = {
  generatedAt: string;
  viewer: {
    role: string;
    organizationId: number | null;
    organizationRole: string | null;
    dashboardScope: "recruiter";
  };
  sections: RecruiterActionSection[];
};

const sectionIconMap = {
  candidatesToReview: Eye,
  jobsLowOnPipeline: Briefcase,
  feedbackPending: MessageSquareMore,
  finalStageCandidates: CheckCircle2,
} satisfies Record<RecruiterActionSectionId, LucideIcon>;

const urgencyBadgeClass = {
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-warning/10 text-warning-foreground border-warning/30",
  low: "bg-muted text-muted-foreground border-border",
} satisfies Record<RecruiterActionUrgency, string>;

export function RecruiterActionsBoard() {
  const [, setLocation] = useLocation();

  const { data, isLoading, error } = useQuery<RecruiterActionsResponse>({
    queryKey: ["/api/recruiter-dashboard/actions"],
  });

  const generatedLabel = useMemo(() => {
    if (!data?.generatedAt) return null;
    return new Date(data.generatedAt).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }, [data?.generatedAt]);

  if (isLoading) {
    return (
      <Card className="shadow-sm border-border">
        <CardContent className="py-10 flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading action board...
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="shadow-sm border-border">
        <CardContent className="py-10 flex items-center justify-center gap-3 text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          Action board unavailable.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="recruiter-actions-board">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Recommended Actions</h2>
          <p className="text-sm text-muted-foreground">
            Four focused queues for the work that needs movement now.
          </p>
        </div>
        {generatedLabel && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            Updated {generatedLabel}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {data.sections.map((section) => {
          const Icon = sectionIconMap[section.id];
          return (
            <Card key={section.id} className="shadow-sm border-border">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary" />
                      {section.title}
                    </CardTitle>
                    <CardDescription>{section.description}</CardDescription>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {section.count}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {section.items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                    {section.emptyMessage}
                  </div>
                ) : (
                  section.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-medium text-foreground">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {item.badge && (
                            <Badge variant="outline" className="hidden sm:inline-flex">
                              {item.badge}
                            </Badge>
                          )}
                          <Badge variant="outline" className={cn(urgencyBadgeClass[item.urgency])}>
                            {item.urgency}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        {item.badge ? (
                          <span className="text-[11px] text-muted-foreground sm:hidden">
                            {item.badge}
                          </span>
                        ) : (
                          <span />
                        )}
                        <Button size="sm" variant="outline" onClick={() => setLocation(item.ctaHref)}>
                          {item.ctaLabel}
                        </Button>
                      </div>
                    </div>
                  ))
                )}

                {section.count > section.items.length && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setLocation(section.viewAllHref)}
                  >
                    View all {section.count}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
