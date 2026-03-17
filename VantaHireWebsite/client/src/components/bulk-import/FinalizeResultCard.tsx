import { useState } from 'react';
import { useLocation } from 'wouter';
import { CheckCircle, AlertTriangle, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { FinalizeResponse } from '@/lib/bulkImportApi';

interface FinalizeResultCardProps {
  result: FinalizeResponse;
  jobId: number;
  onContinueReview: () => void;
}

export function FinalizeResultCard({ result, jobId, onContinueReview }: FinalizeResultCardProps) {
  const [, setLocation] = useLocation();
  const [warningsOpen, setWarningsOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Finalize Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Finalized */}
        {result.finalized.length > 0 && (
          <div className="flex items-start gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm">
                {result.finalized.length} candidate{result.finalized.length !== 1 ? 's' : ''} added to job
              </p>
            </div>
          </div>
        )}

        {/* Duplicates */}
        {result.duplicates.length > 0 && (
          <div className="flex items-start gap-2">
            <Copy className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm">
                {result.duplicates.length} duplicate{result.duplicates.length !== 1 ? 's' : ''}
              </p>
              <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                {result.duplicates.map((d) => (
                  <li key={d.itemId}>{d.reason}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Needs review */}
        {result.needsReview.length > 0 && (
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm">
                {result.needsReview.length} need{result.needsReview.length !== 1 ? '' : 's'} review
              </p>
              <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                {result.needsReview.map((nr) => (
                  <li key={nr.itemId}>{nr.reason}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Sync warnings (collapsed by default) */}
        {result.syncWarnings.length > 0 && (
          <Collapsible open={warningsOpen} onOpenChange={setWarningsOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {warningsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {result.syncWarnings.length} sync warning{result.syncWarnings.length !== 1 ? 's' : ''}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="text-xs text-muted-foreground mt-1 space-y-0.5 pl-4">
                {result.syncWarnings.map((w) => (
                  <li key={w.itemId}>{w.reason}</li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button type="button" size="sm" onClick={() => setLocation(`/jobs/${jobId}/applications`)}>
            View Applications
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onContinueReview(); }}>
            Continue Reviewing
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
