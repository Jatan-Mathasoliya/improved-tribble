import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MessageSquare, Star, ThumbsUp, Clock, User, CheckCircle, AlertCircle, XCircle } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface FeedbackPanelProps {
  applicationId: number;
  jobId: number;
  canAdd?: boolean;
}

interface FeedbackAuthor {
  id: number;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

interface Feedback {
  id: number;
  applicationId: number;
  authorId: number;
  overallScore: number;
  recommendation: 'advance' | 'hold' | 'reject';
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  author: FeedbackAuthor | null;
}

export function FeedbackPanel({ applicationId, jobId, canAdd = true }: FeedbackPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [overallScore, setOverallScore] = useState<number | null>(null);
  const [recommendation, setRecommendation] = useState<string>("");
  const [notes, setNotes] = useState("");

  const { data: feedbackList = [], isLoading } = useQuery<Feedback[]>({
    queryKey: ["/api/applications", applicationId, "feedback"],
    queryFn: async () => {
      const response = await fetch(`/api/applications/${applicationId}/feedback`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error("Failed to fetch feedback");
      return response.json();
    },
  });

  const addFeedbackMutation = useMutation({
    mutationFn: async (data: { overallScore: number; recommendation: string; notes: string }) => {
      // Use apiRequest to include CSRF token automatically
      const response = await apiRequest("POST", `/api/applications/${applicationId}/feedback`, data);
      return response;
    },
    onSuccess: () => {
      // Reset form
      setOverallScore(null);
      setRecommendation("");
      setNotes("");

      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ["/api/applications", applicationId, "feedback"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hiring-manager/jobs", jobId, "applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hiring-manager/jobs"] });

      toast({
        title: "Feedback Added",
        description: "Your feedback has been recorded successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Add Feedback",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!overallScore || !recommendation) {
      toast({
        title: "Missing Information",
        description: "Please provide both a score and recommendation.",
        variant: "destructive",
      });
      return;
    }

    addFeedbackMutation.mutate({
      overallScore,
      recommendation,
      notes: notes.trim() || "",
    });
  };

  const getRecommendationBadge = (rec: string) => {
    switch (rec) {
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

  const renderStars = (score: number, interactive: boolean = false) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((starValue) => (
          <Star
            key={starValue}
            className={`h-5 w-5 ${
              starValue <= score
                ? "fill-yellow-400 text-warning"
                : "text-muted-foreground/50"
            } ${interactive ? "cursor-pointer hover:scale-110 transition-transform" : ""}`}
            onClick={interactive ? () => setOverallScore(starValue) : undefined}
          />
        ))}
      </div>
    );
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-info" />
          <CardTitle>Feedback</CardTitle>
        </div>
        <CardDescription>
          Team feedback and recommendations for this candidate
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Add Feedback Form */}
        {canAdd && (
          <Card className="bg-muted/50 border-border">
            <CardHeader>
              <CardTitle className="text-base">Add Your Feedback</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Overall Score */}
              <div className="space-y-2">
                <Label className="text-foreground">Overall Score (1-5)</Label>
                {renderStars(overallScore || 0, true)}
              </div>

              {/* Recommendation */}
              <div className="space-y-2">
                <Label className="text-foreground">Recommendation</Label>
                <RadioGroup value={recommendation} onValueChange={setRecommendation}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="advance" id="advance" />
                    <Label htmlFor="advance" className="cursor-pointer flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-success" />
                      <span>Advance - Strong fit, move forward</span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="hold" id="hold" />
                    <Label htmlFor="hold" className="cursor-pointer flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-warning" />
                      <span>Hold - Needs more evaluation</span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="reject" id="reject" />
                    <Label htmlFor="reject" className="cursor-pointer flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-destructive" />
                      <span>Reject - Not a good fit</span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-foreground">Notes (Optional)</Label>
                <Textarea
                  placeholder="Share your detailed thoughts on this candidate..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="bg-white border-border placeholder:text-muted-foreground min-h-[100px]"
                  maxLength={2000}
                />
                <p className="text-xs text-muted-foreground">{notes.length}/2000 characters</p>
              </div>

              {/* Submit Button */}
              <Button
                onClick={handleSubmit}
                disabled={!overallScore || !recommendation || addFeedbackMutation.isPending}
                className="w-full"
              >
                {addFeedbackMutation.isPending ? (
                  <>
                    <ThumbsUp className="h-4 w-4 mr-2 animate-pulse" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <ThumbsUp className="h-4 w-4 mr-2" />
                    Submit Feedback
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Feedback List */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-foreground">
            Team Feedback ({feedbackList.length})
          </h4>

          {isLoading ? (
            <p className="text-muted-foreground text-sm text-center py-8">Loading feedback...</p>
          ) : feedbackList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm">No feedback yet.</p>
              <p className="text-xs mt-1">Be the first to share your thoughts!</p>
            </div>
          ) : (
            feedbackList.map((feedback) => (
              <Card key={feedback.id} className="bg-white border-border">
                <CardContent className="p-4 space-y-3">
                  {/* Header: Author + Date */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">
                        {feedback.author
                          ? `${feedback.author.firstName || ''} ${feedback.author.lastName || ''}`.trim()
                          : 'Unknown User'}
                      </span>
                      {feedback.author && (
                        <Badge variant="outline" className="text-xs">
                          {feedback.author.role}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(feedback.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  {/* Score + Recommendation */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Score:</span>
                      {renderStars(feedback.overallScore)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Recommendation:</span>
                      {getRecommendationBadge(feedback.recommendation)}
                    </div>
                  </div>

                  {/* Notes */}
                  {feedback.notes && (
                    <p className="text-sm text-muted-foreground leading-relaxed border-t border-border pt-3">
                      {feedback.notes}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
