import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowRightLeft } from "lucide-react";

interface SemanticCandidate {
  applicationId: number;
  name: string;
  email: string;
  currentJobId: number;
  currentJobTitle: string | null;
}

interface Job {
  id: number;
  title: string;
}

interface MoveResponse {
  success: boolean;
  existing: boolean;
  applicationId: number;
}

interface MoveCandidateToJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: SemanticCandidate | null;
  searchQuery?: string;
  onMoveSuccess?: () => void;
}

export function MoveCandidateToJobDialog({
  open,
  onOpenChange,
  candidate,
  searchQuery,
  onMoveSuccess,
}: MoveCandidateToJobDialogProps) {
  const { toast } = useToast();
  const [targetJobId, setTargetJobId] = useState<string>("");
  const [notes, setNotes] = useState("");

  const { data: jobs = [], isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ["/api/my-jobs"],
    enabled: open,
  });

  const availableJobs = jobs.filter(
    (j) => j.id !== candidate?.currentJobId
  );

  const moveMutation = useMutation<MoveResponse, Error, void>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/candidates/move-to-job", {
        sourceApplicationId: candidate!.applicationId,
        targetJobId: Number(targetJobId),
        notes: notes.trim() || undefined,
        searchQuery: searchQuery || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.existing) {
        toast({
          title: "Already exists",
          description: `${candidate!.name} has already applied to this job.`,
        });
      } else {
        toast({
          title: "Candidate moved",
          description: `${candidate!.name} was added to the selected job.`,
        });
      }
      onMoveSuccess?.();
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Move failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setTargetJobId("");
    setNotes("");
    onOpenChange(false);
  };

  if (!candidate) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          onOpenChange(true);
          return;
        }
        handleClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Move Candidate to Job
          </DialogTitle>
          <DialogDescription>
            Move <strong>{candidate.name}</strong> ({candidate.email}) to a
            different job opening.
            {candidate.currentJobTitle && (
              <span className="block mt-1 text-xs">
                Currently in: {candidate.currentJobTitle}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="target-job">Target Job</Label>
            {jobsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading jobs...
              </div>
            ) : availableJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No other jobs available to move this candidate to.
              </p>
            ) : (
              <Select value={targetJobId} onValueChange={setTargetJobId}>
                <SelectTrigger id="target-job">
                  <SelectValue placeholder="Select a job..." />
                </SelectTrigger>
                <SelectContent>
                  {availableJobs.map((job) => (
                    <SelectItem key={job.id} value={String(job.id)}>
                      {job.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="move-notes">Notes (optional)</Label>
            <Textarea
              id="move-notes"
              placeholder="Add a note about why this candidate is being moved..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={moveMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => moveMutation.mutate()}
            disabled={!targetJobId || moveMutation.isPending}
          >
            {moveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Move Candidate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
