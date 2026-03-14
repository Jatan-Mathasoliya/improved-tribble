import { useState } from 'react';
import { Pencil, Save, X, Loader2, EyeOff, Sparkles } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ResumeImportItemDTO, PatchItemRequest } from '@/lib/bulkImportApi';

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  processed: { label: 'Ready', variant: 'default' },
  needs_review: { label: 'Needs Review', variant: 'secondary' },
  duplicate: { label: 'Duplicate', variant: 'outline' },
  failed: { label: 'Failed', variant: 'destructive' },
  queued: { label: 'Queued', variant: 'outline' },
  processing: { label: 'Processing', variant: 'outline' },
  finalized: { label: 'Finalized', variant: 'default' },
};

interface BatchItemsTableProps {
  items: ResumeImportItemDTO[];
  selectedIds: Set<number>;
  onSelectionChange: (ids: Set<number>) => void;
  onPatchItem: (itemId: number, data: PatchItemRequest) => Promise<void>;
  onAdvancedExtract: (itemId: number) => Promise<void>;
  isPatchPending: boolean;
  advancedExtractingItemId: number | null;
  dismissedIds: Set<number>;
  onDismiss: (id: number) => void;
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_LABELS[status] ?? { label: status, variant: 'outline' as const };
  const colorClass =
    status === 'processed' ? 'bg-emerald-600 hover:bg-emerald-700' :
    status === 'needs_review' ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' :
    status === 'finalized' ? 'bg-emerald-600 hover:bg-emerald-700' :
    undefined;

  return (
    <Badge variant={config.variant} className={colorClass}>
      {config.label}
    </Badge>
  );
}

function EditableRow({
  item,
  selected,
  onToggle,
  onPatch,
  onAdvancedExtract,
  isPatchPending,
  advancedExtractingItemId,
  onDismiss,
}: {
  item: ResumeImportItemDTO;
  selected: boolean;
  onToggle: () => void;
  onPatch: (itemId: number, data: PatchItemRequest) => Promise<void>;
  onAdvancedExtract: (itemId: number) => Promise<void>;
  isPatchPending: boolean;
  advancedExtractingItemId: number | null;
  onDismiss: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    parsedName: item.parsedName ?? '',
    parsedEmail: item.parsedEmail ?? '',
    parsedPhone: item.parsedPhone ?? '',
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      await onPatch(item.id, {
        parsedName: draft.parsedName.trim() || null,
        parsedEmail: draft.parsedEmail.trim().replace(/\s+/g, '') || null,
        parsedPhone: draft.parsedPhone.trim().replace(/\s+/g, '') || null,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDraft({
      parsedName: item.parsedName ?? '',
      parsedEmail: item.parsedEmail ?? '',
      parsedPhone: item.parsedPhone ?? '',
    });
    setEditing(false);
  };

  const notes = item.errorReason || item.reviewSummary || null;
  const isFailed = item.status === 'failed';
  const isFinalized = item.status === 'finalized';
  const isEditable =
    item.status === 'needs_review' ||
    item.status === 'processed' ||
    item.status === 'duplicate';
  const canAdvancedExtract = !isFinalized && item.status !== 'duplicate';
  const isAdvancedPending = advancedExtractingItemId === item.id;
  const canDismiss = !isFinalized;

  return (
    <TableRow className={isFailed ? 'bg-destructive/5' : undefined}>
      <TableCell className="w-10">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          disabled={!item.canFinalize || isFinalized}
          aria-label={`Select ${item.originalFilename}`}
        />
      </TableCell>
      <TableCell className="font-medium text-sm max-w-[180px] truncate" title={item.originalFilename}>
        {item.originalFilename}
      </TableCell>
      <TableCell>
        {editing ? (
          <Input
            value={draft.parsedName}
            onChange={(e) => setDraft((d) => ({ ...d, parsedName: e.target.value }))}
            className="h-8 text-sm"
          />
        ) : (
          <span className="text-sm">{item.parsedName ?? '—'}</span>
        )}
      </TableCell>
      <TableCell>
        {editing ? (
          <Input
            value={draft.parsedEmail}
            onChange={(e) => setDraft((d) => ({ ...d, parsedEmail: e.target.value }))}
            className="h-8 text-sm"
          />
        ) : (
          <span className="text-sm">{item.parsedEmail ?? '—'}</span>
        )}
      </TableCell>
      <TableCell>
        {editing ? (
          <Input
            value={draft.parsedPhone}
            onChange={(e) => setDraft((d) => ({ ...d, parsedPhone: e.target.value }))}
            className="h-8 text-sm"
          />
        ) : (
          <span className="text-sm">{item.parsedPhone ?? '—'}</span>
        )}
      </TableCell>
      <TableCell>
        <StatusBadge status={item.status} />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground max-w-[200px]">
        {notes && (
          <span className={isFailed ? 'text-destructive' : undefined} title={notes}>
            {notes.length > 80 ? notes.slice(0, 80) + '...' : notes}
          </span>
        )}
      </TableCell>
      <TableCell className="w-[220px]">
        {editing ? (
          <div className="flex gap-1 justify-end">
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={handleSave} disabled={saving || isPatchPending}>
              {saving || isPatchPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            </Button>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={handleCancel} disabled={saving || isPatchPending}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 justify-end items-center flex-wrap">
            {isEditable && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 px-2"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
            )}
            {canAdvancedExtract && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => onAdvancedExtract(item.id)}
                disabled={isAdvancedPending}
                title="Run advanced extraction"
              >
                {isAdvancedPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                )}
                {item.canFinalize ? 'Re-extract' : 'Advanced Extraction'}
              </Button>
            )}
            {canDismiss && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => onDismiss(item.id)}
                title="Dismiss from view"
              >
                <EyeOff className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

export function BatchItemsTable({
  items,
  selectedIds,
  onSelectionChange,
  onPatchItem,
  onAdvancedExtract,
  isPatchPending,
  advancedExtractingItemId,
  dismissedIds,
  onDismiss,
}: BatchItemsTableProps) {
  const visibleItems = items.filter((i) => !dismissedIds.has(i.id));
  const finalizableItems = visibleItems.filter((i) => i.canFinalize && i.status !== 'finalized');
  const allFinalizableSelected =
    finalizableItems.length > 0 && finalizableItems.every((i) => selectedIds.has(i.id));

  const toggleAll = () => {
    if (allFinalizableSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(finalizableItems.map((i) => i.id)));
    }
  };

  const toggleOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  return (
    <div className="rounded-md border overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allFinalizableSelected && finalizableItems.length > 0}
                onCheckedChange={toggleAll}
                disabled={finalizableItems.length === 0}
                aria-label="Select all finalizable"
              />
            </TableHead>
            <TableHead>Filename</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="w-[220px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleItems.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                {dismissedIds.size > 0 ? `All items dismissed. ${items.length} total in batch.` : 'No items in this batch.'}
              </TableCell>
            </TableRow>
          ) : (
            visibleItems.map((item) => (
              <EditableRow
                key={item.id}
                item={item}
                selected={selectedIds.has(item.id)}
                onToggle={() => toggleOne(item.id)}
                onPatch={onPatchItem}
                onAdvancedExtract={onAdvancedExtract}
                isPatchPending={isPatchPending}
                advancedExtractingItemId={advancedExtractingItemId}
                onDismiss={onDismiss}
              />
            ))
          )}
        </TableBody>
      </Table>
      {dismissedIds.size > 0 && visibleItems.length > 0 && (
        <p className="text-xs text-muted-foreground text-right px-4 py-2">
          {dismissedIds.size} item{dismissedIds.size !== 1 ? 's' : ''} dismissed
        </p>
      )}
    </div>
  );
}
