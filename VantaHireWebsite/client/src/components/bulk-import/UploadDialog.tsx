import { useState, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { Upload, X, FileText, Loader2, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useBulkImportUpload } from '@/hooks/use-bulk-import';

// Must stay aligned with server BULK_RESUME_IMPORT_MAX_FILES (default 10)
const MAX_BULK_RESUME_FILES = 10;
const ACCEPTED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const ACCEPTED_EXTENSIONS = '.pdf,.doc,.docx';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

interface UploadDialogProps {
  jobId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadDialog({ jobId, open, onOpenChange }: UploadDialogProps) {
  const [, setLocation] = useLocation();
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [skippedWarning, setSkippedWarning] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useBulkImportUpload(jobId);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const all = Array.from(incoming);
    const skippedReasons: string[] = [];
    const valid: File[] = [];

    for (const f of all) {
      if (!ACCEPTED_TYPES.includes(f.type) && !f.name.match(/\.(pdf|doc|docx)$/i)) {
        skippedReasons.push(`${f.name}: unsupported format`);
      } else if (f.size > MAX_FILE_SIZE) {
        skippedReasons.push(`${f.name}: exceeds 5 MB`);
      } else {
        valid.push(f);
      }
    }

    setFiles((prev) => {
      const combined = [...prev, ...valid];
      const overflow = combined.length - MAX_BULK_RESUME_FILES;
      if (overflow > 0) {
        skippedReasons.push(`${overflow} file${overflow > 1 ? 's' : ''} skipped: limit is ${MAX_BULK_RESUME_FILES}`);
      }
      setSkippedWarning(skippedReasons.length > 0 ? skippedReasons.join('. ') : null);
      return combined.slice(0, MAX_BULK_RESUME_FILES);
    });
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const handleSubmit = async () => {
    if (files.length === 0) return;
    const result = await upload.mutateAsync(files);
    setFiles([]);
    onOpenChange(false);
    setLocation(`/jobs/${jobId}/bulk-import?batchId=${result.batch.id}`);
  };

  const handleClose = (nextOpen: boolean) => {
    if (upload.isPending) return;
    if (!nextOpen) {
      setFiles([]);
      setSkippedWarning(null);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Import Resumes
          </DialogTitle>
          <DialogDescription>
            Upload up to {MAX_BULK_RESUME_FILES} resume files (PDF, DOC, DOCX). Max 5 MB each.
          </DialogDescription>
        </DialogHeader>

        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`
            mt-2 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed
            px-6 py-10 text-center cursor-pointer transition-colors
            ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
          `}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drag & drop files here, or <span className="text-primary font-medium">browse</span>
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {/* Skipped files warning */}
        {skippedWarning && (
          <div className="mt-2 flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{skippedWarning}</span>
          </div>
        )}

        {/* File list */}
        {files.length > 0 && (
          <div className="mt-3 max-h-48 overflow-y-auto space-y-1">
            {files.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(i);
                  }}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground text-right pt-1">
              {files.length} / {MAX_BULK_RESUME_FILES} files
            </p>
          </div>
        )}

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => handleClose(false)} disabled={upload.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={files.length === 0 || upload.isPending}>
            {upload.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload {files.length > 0 ? `${files.length} file${files.length > 1 ? 's' : ''}` : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
