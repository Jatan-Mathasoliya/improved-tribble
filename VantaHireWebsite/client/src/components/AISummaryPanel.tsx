import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sparkles, RefreshCw, CheckCircle, AlertCircle, XCircle, Zap, DollarSign, Clock, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAiCreditExhaustionToast } from "@/hooks/use-ai-credit-exhaustion";
import { PipelineStage } from "@shared/schema";
import { apiRequest, isRateLimitError, RateLimitError } from "@/lib/queryClient";

interface AISummaryPanelProps {
  applicationId: number;
  jobId: number;
  aiSummary?: string | null;
  aiSuggestedAction?: string | null;
  aiSuggestedActionReason?: string | null;
  aiSummaryComputedAt?: Date | string | null;
  pipelineStages?: PipelineStage[];
  currentStageId?: number | null;
  onMoveStage?: (stageId: number, notes?: string) => void;
  onAddNote?: (note: string) => void;
  onUpdateStatus?: ((status: string, notes?: string) => void) | undefined;
}

interface AISummaryResult {
  message: string;
  summary: {
    text: string;
    suggestedAction: 'advance' | 'hold' | 'reject';
    suggestedActionReason: string;
    strengths: string[];
    concerns: string[];
    keyHighlights: string[];
    modelVersion: string;
    computedAt: Date;
    cost: number;
    durationMs: number;
  };
}

export function AISummaryPanel({
  applicationId,
  jobId,
  aiSummary,
  aiSuggestedAction,
  aiSuggestedActionReason,
  aiSummaryComputedAt,
  pipelineStages,
  currentStageId,
  onMoveStage,
  onAddNote,
  onUpdateStatus,
}: AISummaryPanelProps) {
  const { toast } = useToast();
  const { showAiCreditExhaustionToast } = useAiCreditExhaustionToast();
  const queryClient = useQueryClient();
  const [expandedSummary, setExpandedSummary] = useState<AISummaryResult['summary'] | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const generateSummaryMutation = useMutation<AISummaryResult, Error>({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/applications/${applicationId}/ai-summary`);
      return await res.json();
    },
    onSuccess: (data) => {
      // Expand the detailed summary
      setExpandedSummary(data.summary);

      // Invalidate and refetch application data
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "applications"] });

      toast({
        title: "AI Summary Generated",
        description: `Summary generated successfully in ${(data.summary.durationMs / 1000).toFixed(1)}s`,
      });
    },
    onError: (error: Error) => {
      if (showAiCreditExhaustionToast(error)) {
        return;
      }
      const is429 = isRateLimitError(error);
      const rateLimitErr = error as RateLimitError;
      const remainingInfo = is429 && rateLimitErr.formattedRemaining ? ` (${rateLimitErr.formattedRemaining})` : '';
      toast({
        title: is429 ? "AI limit reached" : "Generation failed",
        description: is429
          ? `You've reached today's AI summary limit${remainingInfo}. Try again ${rateLimitErr.formattedRetryTime}.`
          : error.message,
        variant: "destructive",
      });
    },
  });

  // Format cost for display
  const formatCost = (cost: number) => {
    if (cost < 0.01) return "<$0.01";
    return `$${cost.toFixed(3)}`;
  };

  const getActionBadge = (action: string | null | undefined) => {
    switch (action) {
      case 'advance':
        return (
          <Badge className="bg-success/20 text-success-foreground hover:bg-success/20">
            <CheckCircle className="w-3 h-3 mr-1" />
            Advance
          </Badge>
        );
      case 'hold':
        return (
          <Badge className="bg-warning/20 text-warning-foreground hover:bg-warning/20">
            <AlertCircle className="w-3 h-3 mr-1" />
            Hold
          </Badge>
        );
      case 'reject':
        return (
          <Badge className="bg-destructive/20 text-destructive hover:bg-destructive/20">
            <XCircle className="w-3 h-3 mr-1" />
            Reject
          </Badge>
        );
      default:
        return null;
    }
  };

  const handleApplySuggestion = () => {
    const action = expandedSummary?.suggestedAction || aiSuggestedAction;
    const reason = expandedSummary?.suggestedActionReason || aiSuggestedActionReason || "";

    if (!action) {
      toast({
        title: "No suggestion available",
        description: "Generate an AI summary first to get recommendations.",
        variant: "destructive",
      });
      return;
    }

    if (action === 'advance') {
      // Move to next stage
      if (!pipelineStages || !onMoveStage) {
        toast({
          title: "Cannot apply suggestion",
          description: "Stage management is not available in this context.",
          variant: "destructive",
        });
        return;
      }

      if (currentStageId == null) {
        toast({
          title: "No current stage set",
          description: "Assign a stage to this candidate before applying the AI advance suggestion.",
          variant: "destructive",
        });
        return;
      }

      // Find the next stage
      const sortedStages = [...pipelineStages].sort((a, b) => (a.order - b.order) || (a.id - b.id));
      const currentIndex = sortedStages.findIndex(s => s.id === currentStageId);
      const nextStage = currentIndex >= 0 && currentIndex < sortedStages.length - 1
        ? sortedStages[currentIndex + 1]
        : sortedStages[0]; // If no current stage or at end, use first stage

      if (!nextStage) {
        toast({
          title: "No next stage",
          description: "Cannot advance: no pipeline stages configured.",
          variant: "destructive",
        });
        return;
      }

      onMoveStage(nextStage.id, `AI recommendation: ${reason}`);
      toast({
        title: "Candidate advanced",
        description: `Moved to "${nextStage.name}"`,
      });
    } else if (action === 'reject') {
      // Update status to rejected
      if (!onUpdateStatus) {
        toast({
          title: "Cannot apply suggestion",
          description: "Status update is not available in this context.",
          variant: "destructive",
        });
        return;
      }

      onUpdateStatus('rejected', `AI recommendation: ${reason}`);
      toast({
        title: "Candidate rejected",
        description: "Status updated to rejected based on AI recommendation.",
      });
    } else if (action === 'hold') {
      // Add a note about holding
      if (!onAddNote) {
        toast({
          title: "Cannot apply suggestion",
          description: "Note adding is not available in this context.",
          variant: "destructive",
        });
        return;
      }

      onAddNote(`AI recommended hold: ${reason}`);
      toast({
        title: "Hold note added",
        description: "Added AI recommendation to notes.",
      });
    }

    setShowConfirmDialog(false);
  };

  const hasSummary = aiSummary || expandedSummary;
  const suggestedAction = expandedSummary?.suggestedAction || aiSuggestedAction;
  const canApplySuggestion = suggestedAction && (
    (suggestedAction === 'advance' && pipelineStages && onMoveStage) ||
    (suggestedAction === 'reject' && onUpdateStatus) ||
    (suggestedAction === 'hold' && onAddNote)
  );

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>AI Candidate Summary</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateSummaryMutation.mutate()}
            disabled={generateSummaryMutation.isPending}
          >
            {generateSummaryMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : hasSummary ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Summary
              </>
            )}
          </Button>
        </div>
        {aiSummaryComputedAt && (
          <CardDescription>
            Last generated: {new Date(aiSummaryComputedAt).toLocaleString()}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {hasSummary ? (
          <>
            {/* Suggested Action */}
            {(aiSuggestedAction || expandedSummary?.suggestedAction) && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Recommendation:</span>
                  {getActionBadge(expandedSummary?.suggestedAction || aiSuggestedAction)}
                </div>
                <p className="text-sm text-muted-foreground">
                  {expandedSummary?.suggestedActionReason || aiSuggestedActionReason}
                </p>
                {canApplySuggestion && (
                  <Button
                    onClick={() => setShowConfirmDialog(true)}
                    variant="outline"
                    size="sm"
                    className="w-full border-primary/30 text-primary hover:bg-primary/10"
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Apply Suggestion
                  </Button>
                )}
              </div>
            )}

            {/* Summary Text */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Summary</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {expandedSummary?.text || aiSummary}
              </p>
            </div>

            {/* Strengths */}
            {expandedSummary?.strengths && expandedSummary.strengths.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-foreground">Key Strengths</h4>
                <ul className="list-disc list-inside space-y-1">
                  {expandedSummary.strengths.map((strength, idx) => (
                    <li key={idx} className="text-sm text-muted-foreground">
                      {strength}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Concerns */}
            {expandedSummary?.concerns && expandedSummary.concerns.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-foreground">Areas of Concern</h4>
                <ul className="list-disc list-inside space-y-1">
                  {expandedSummary.concerns.map((concern, idx) => (
                    <li key={idx} className="text-sm text-muted-foreground">
                      {concern}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Key Highlights */}
            {expandedSummary?.keyHighlights && expandedSummary.keyHighlights.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-foreground">Notable Achievements</h4>
                <ul className="list-disc list-inside space-y-1">
                  {expandedSummary.keyHighlights.map((highlight, idx) => (
                    <li key={idx} className="text-sm text-muted-foreground">
                      {highlight}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Cost & Performance Info */}
            {expandedSummary && (
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {(expandedSummary.durationMs / 1000).toFixed(1)}s
                  </span>
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    {formatCost(expandedSummary.cost)}
                  </span>
                </div>
                <span>Model: {expandedSummary.modelVersion}</span>
              </div>
            )}
          </>
        ) : generateSummaryMutation.isError ? (
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 text-destructive" />
            <p className="text-sm text-destructive font-medium">Failed to generate summary</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              {isRateLimitError(generateSummaryMutation.error)
                ? `Daily AI limit reached. Try again ${(generateSummaryMutation.error as RateLimitError).formattedRetryTime}.`
                : generateSummaryMutation.error?.message || "An error occurred"}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                generateSummaryMutation.reset();
                generateSummaryMutation.mutate();
              }}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Sparkles className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm">No AI summary generated yet.</p>
            <p className="text-xs mt-1">Click "Generate Summary" to get AI-powered insights.</p>
          </div>
        )}
      </CardContent>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply AI Recommendation?</DialogTitle>
            <DialogDescription>
              This will apply the AI's suggested action to this candidate.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium">Action:</span>
              {getActionBadge(suggestedAction)}
            </div>
            <p className="text-sm text-muted-foreground">
              {expandedSummary?.suggestedActionReason || aiSuggestedActionReason}
            </p>
            {suggestedAction === 'advance' && pipelineStages && (
              <p className="text-sm text-muted-foreground mt-3">
                This will move the candidate to the next pipeline stage.
              </p>
            )}
            {suggestedAction === 'reject' && (
              <p className="text-sm text-muted-foreground mt-3">
                This will update the candidate's status to "rejected".
              </p>
            )}
            {suggestedAction === 'hold' && (
              <p className="text-sm text-muted-foreground mt-3">
                This will add a note explaining the hold recommendation.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApplySuggestion}
              className="bg-primary hover:bg-primary/90"
            >
              <Zap className="h-4 w-4 mr-2" />
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
