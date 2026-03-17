import { CheckCircle, AlertTriangle, XCircle, Clock, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { ResumeImportBatchDTO } from '@/lib/bulkImportApi';

interface BatchSummaryBarProps {
  batch: ResumeImportBatchDTO;
}

export function BatchSummaryBar({ batch }: BatchSummaryBarProps) {
  const isProcessing = batch.status === 'queued' || batch.status === 'processing';
  const isFailed = batch.status === 'failed';
  const progressPercent = batch.fileCount > 0
    ? Math.round((batch.processedCount / batch.fileCount) * 100)
    : 0;

  if (isFailed) {
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertDescription>
          Batch processing failed. Some resumes could not be processed. Review the items below for details.
        </AlertDescription>
      </Alert>
    );
  }

  if (isProcessing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>
            Processing {batch.processedCount} of {batch.fileCount} resumes...
          </span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>
    );
  }

  // ready_for_review or completed
  return (
    <div className="flex flex-wrap items-center gap-2">
      {batch.readyCount > 0 && (
        <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">
          <CheckCircle className="h-3 w-3 mr-1" />
          {batch.readyCount} Ready
        </Badge>
      )}
      {batch.needsReviewCount > 0 && (
        <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-200">
          <AlertTriangle className="h-3 w-3 mr-1" />
          {batch.needsReviewCount} Needs Review
        </Badge>
      )}
      {batch.failedCount > 0 && (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          {batch.failedCount} Failed
        </Badge>
      )}
      <span className="text-xs text-muted-foreground ml-auto">
        <Clock className="h-3 w-3 inline mr-1" />
        {batch.processedCount} / {batch.fileCount} processed
      </span>
    </div>
  );
}
