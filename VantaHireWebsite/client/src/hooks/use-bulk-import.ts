import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import {
  bulkImportApi,
  bulkImportQueryKeys,
  type UploadResponse,
  type GetBatchResponse,
  type PatchItemRequest,
  type PatchItemResponse,
  type FinalizeResponse,
  type ReprocessResponse,
} from '@/lib/bulkImportApi';

// ---------------------------------------------------------------------------
// Batch query with conditional polling
// ---------------------------------------------------------------------------

export function useBulkImportBatch(jobId: number, batchId: number | null) {
  return useQuery<GetBatchResponse>({
    queryKey: batchId ? bulkImportQueryKeys.batch(jobId, batchId) : ['__noop_bulk_import'],
    queryFn: () => bulkImportApi.getBatch(jobId, batchId!),
    enabled: !!batchId,
    refetchInterval: (q) => {
      const status = q.state.data?.batch.status;
      if (!status) return false;
      if (status === 'queued' || status === 'processing') return 3000;
      return false;
    },
  });
}

// ---------------------------------------------------------------------------
// Upload mutation
// ---------------------------------------------------------------------------

export function useBulkImportUpload(jobId: number) {
  const { toast } = useToast();

  return useMutation<UploadResponse, Error, File[]>({
    mutationFn: (files) => bulkImportApi.upload(jobId, files),
    onError: (error) => {
      const is404 = error.message.startsWith('404');
      toast({
        title: is404 ? 'Feature unavailable' : 'Upload failed',
        description: is404
          ? 'Bulk resume import is not currently available.'
          : error.message,
        variant: 'destructive',
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Patch item mutation
// ---------------------------------------------------------------------------

export function useBulkImportPatchItem(jobId: number, batchId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<PatchItemResponse, Error, { itemId: number; data: PatchItemRequest }>({
    mutationFn: ({ itemId, data }) => bulkImportApi.patchItem(jobId, itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: bulkImportQueryKeys.batch(jobId, batchId),
      });
    },
    onError: (error) => {
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Reprocess mutation
// ---------------------------------------------------------------------------

export function useBulkImportReprocess(jobId: number, batchId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<ReprocessResponse, Error, void>({
    mutationFn: () => bulkImportApi.reprocess(jobId, batchId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: bulkImportQueryKeys.batch(jobId, batchId),
      });
      toast({
        title: 'Re-parsed',
        description: `${data.reprocessed} of ${data.total} items re-processed with latest parser.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Reprocess failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Finalize mutation
// ---------------------------------------------------------------------------

export function useBulkImportFinalize(jobId: number, batchId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<FinalizeResponse, Error, number[] | undefined>({
    mutationFn: (itemIds) => bulkImportApi.finalize(jobId, batchId, itemIds),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: bulkImportQueryKeys.batch(jobId, batchId),
      });
      // Refresh applications kanban so finalized candidates appear
      queryClient.invalidateQueries({
        queryKey: ['/api/jobs', jobId, 'applications'],
      });
    },
    onError: (error) => {
      toast({
        title: 'Finalize failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
