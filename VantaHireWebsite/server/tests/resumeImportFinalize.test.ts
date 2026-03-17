import { describe, expect, it } from 'vitest';
import { isApplicationOwnedByResumeImportItem } from '../lib/resumeImportFinalize';

describe('resume import finalize reconciliation', () => {
  it('treats an application with matching bulk import item metadata as owned by the item', () => {
    const owned = isApplicationOwnedByResumeImportItem(
      {
        id: 42,
        batchId: 7,
        gcsPath: 'gs://bucket/resume.pdf',
      },
      {
        resumeUrl: 'gs://bucket/resume.pdf',
        createdByUserId: 11,
        sourceMetadata: {
          bulkResumeImport: {
            batchId: 7,
            itemId: 42,
          },
        },
      },
      11,
    );

    expect(owned).toBe(true);
  });

  it('treats an application with matching batch, resume, and recruiter as owned when item metadata is missing', () => {
    const owned = isApplicationOwnedByResumeImportItem(
      {
        id: 42,
        batchId: 7,
        gcsPath: 'gs://bucket/resume.pdf',
      },
      {
        resumeUrl: 'gs://bucket/resume.pdf',
        createdByUserId: 11,
        sourceMetadata: {
          bulkResumeImport: {
            batchId: 7,
          },
        },
      },
      11,
    );

    expect(owned).toBe(true);
  });

  it('does not treat unrelated existing applications as owned by the item', () => {
    const owned = isApplicationOwnedByResumeImportItem(
      {
        id: 42,
        batchId: 7,
        gcsPath: 'gs://bucket/resume.pdf',
      },
      {
        resumeUrl: 'gs://bucket/other.pdf',
        createdByUserId: 99,
        sourceMetadata: {
          bulkResumeImport: {
            batchId: 8,
            itemId: 999,
          },
        },
      },
      11,
    );

    expect(owned).toBe(false);
  });
});
