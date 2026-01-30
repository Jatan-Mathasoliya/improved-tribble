import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface AiPipelineSummaryProps {
  pipelineHealthScore: { score: number; tag: string; isEmpty?: boolean };
  preGeneratedSummary?: string | undefined;
  aiLoading?: boolean | undefined;
  generatedAt?: string | undefined;
}

export function AiPipelineSummary({
  pipelineHealthScore,
  preGeneratedSummary,
  aiLoading = false,
  generatedAt,
}: AiPipelineSummaryProps) {
  const fallback = pipelineHealthScore.isEmpty
    ? "Post your first job to start tracking pipeline health and get AI-powered insights."
    : pipelineHealthScore.score >= 80
      ? "Pipeline healthy. Keep candidates moving."
      : pipelineHealthScore.score >= 60
        ? "Stable pipeline. Watch slow stages."
        : "Pipeline needs attention. Clear bottlenecks.";

  const formattedDate = generatedAt
    ? new Date(generatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <Card className={cn(
      "shadow-sm border-l-4",
      pipelineHealthScore.isEmpty ? "border-l-slate-300" :
      pipelineHealthScore.score >= 70 ? "border-l-emerald-400" :
      pipelineHealthScore.score >= 50 ? "border-l-amber-400" : "border-l-red-400"
    )}>
      <CardContent className="py-3">
        <div className="flex items-start gap-3">
          <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            {aiLoading ? (
              <p className="text-sm text-muted-foreground">Analyzing pipeline...</p>
            ) : (
              <p className="text-sm text-foreground leading-relaxed">
                {preGeneratedSummary || fallback}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {formattedDate && (
              <span className="text-[10px] text-muted-foreground">{formattedDate}</span>
            )}
            <Badge variant="outline" className="text-[9px] uppercase tracking-wide px-1.5 py-0">
              AI
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
