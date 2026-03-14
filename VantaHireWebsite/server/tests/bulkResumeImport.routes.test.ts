// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { applications, resumeImportItems } from '@shared/schema';

const storageMock = {
  getJob: vi.fn(),
  isRecruiterOnJob: vi.fn(),
  getResumeImportBatch: vi.fn(),
  getResumeImportItem: vi.fn(),
  getResumeImportItemsByBatch: vi.fn(),
  getPipelineStages: vi.fn(),
  refreshResumeImportBatchStats: vi.fn(),
  updateApplicationSyncSkippedReason: vi.fn(),
  enqueueApplicationGraphSyncJob: vi.fn(),
  findApplicationByJobAndEmail: vi.fn(),
  findDuplicateResumeImportItemByEmail: vi.fn(),
  markResumeImportItemProcessed: vi.fn(),
  updateResumeImportItem: vi.fn(),
};

const dbMock = {
  transaction: vi.fn(),
};

const getUserOrganizationMock = vi.fn();

const downloadFromGCSMock = vi.fn();
const extractResumeTextWithFallbackMock = vi.fn();
const extractStructuredResumeFieldsWithGroqMock = vi.fn();

vi.mock('../storage', () => ({
  storage: storageMock,
}));

vi.mock('../db', () => ({
  db: dbMock,
}));

vi.mock('../auth', () => ({
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireSeat: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/organizationService', () => ({
  getUserOrganization: getUserOrganizationMock,
}));

vi.mock('../rateLimit', () => ({
  recruiterAddRateLimit: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../gcs-storage', () => ({
  downloadFromGCS: downloadFromGCSMock,
  uploadToGCS: vi.fn(),
}));

vi.mock('../lib/resumeImportExtraction', () => ({
  extractResumeTextWithFallback: extractResumeTextWithFallbackMock,
}));

vi.mock('../lib/resumeImportAiExtraction', () => ({
  extractStructuredResumeFieldsWithGroq: extractStructuredResumeFieldsWithGroqMock,
  isGroqAdvancedExtractionEnabled: () => process.env.GROQ_RESUME_FIELD_FALLBACK_ENABLED === 'true',
}));

describe('bulk resume import routes', () => {
  const csrf = (_req: any, _res: any, next: any) => next();
  const upload = {
    array: () => (_req: any, _res: any, next: any) => next(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BULK_RESUME_IMPORT_ENABLED = 'true';
    process.env.ACTIVEKG_SYNC_ENABLED = 'false';
    process.env.GROQ_RESUME_FIELD_FALLBACK_ENABLED = 'true';

    downloadFromGCSMock.mockResolvedValue(Buffer.from('pdf'));
    extractResumeTextWithFallbackMock.mockResolvedValue({
      success: true,
      text: 'Jane Doe\njane@example.com\n415-555-1212',
      rawText: 'Jane Doe\njane@example.com\n415-555-1212',
      method: 'native_text',
    });
    extractStructuredResumeFieldsWithGroqMock.mockResolvedValue(null);
    storageMock.getResumeImportItem.mockResolvedValue(undefined);
    storageMock.findApplicationByJobAndEmail.mockResolvedValue(undefined);
    storageMock.findDuplicateResumeImportItemByEmail.mockResolvedValue(undefined);
    storageMock.markResumeImportItemProcessed.mockResolvedValue(undefined);
    storageMock.updateResumeImportItem.mockResolvedValue(undefined);

    storageMock.getJob.mockResolvedValue({
      id: 5,
      organizationId: 1,
    });
    storageMock.isRecruiterOnJob.mockResolvedValue(true);
    storageMock.getResumeImportBatch.mockResolvedValue({
      id: 10,
      jobId: 5,
      organizationId: 1,
      uploadedByUserId: 11,
      status: 'ready_for_review',
      fileCount: 1,
      processedCount: 1,
      readyCount: 1,
      needsReviewCount: 0,
      failedCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    storageMock.getPipelineStages.mockResolvedValue([]);
    storageMock.refreshResumeImportBatchStats.mockResolvedValue({
      id: 10,
      jobId: 5,
      organizationId: 1,
      uploadedByUserId: 11,
      status: 'completed',
      fileCount: 1,
      processedCount: 1,
      readyCount: 1,
      needsReviewCount: 0,
      failedCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    getUserOrganizationMock.mockResolvedValue({
      organization: { id: 1 },
    });
  });

  async function buildApp() {
    const { registerBulkResumeImportRoutes } = await import('../bulkResumeImport.routes');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: 11, role: 'recruiter' };
      next();
    });
    registerBulkResumeImportRoutes(app, csrf as any, upload);
    return app;
  }

  async function invokeRoute(
    app: express.Express,
    method: 'post',
    path: string,
    input: {
      params: Record<string, string>;
      body?: unknown;
    },
  ): Promise<{ status: number; body: any }> {
    const router = (app as any)._router;
    const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods?.[method]);
    if (!layer) {
      throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
    }

    const handlers = layer.route.stack.map((entry: any) => entry.handle);
    const req: any = {
      method: method.toUpperCase(),
      params: input.params,
      body: input.body ?? {},
      user: { id: 11, role: 'recruiter' },
      headers: {},
      query: {},
      files: undefined,
    };

    return new Promise((resolve, reject) => {
      let settled = false;
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: any) {
          this.body = payload;
          if (!settled) {
            settled = true;
            resolve({ status: this.statusCode, body: payload });
          }
          return this;
        },
        send(payload: any) {
          this.body = payload;
          if (!settled) {
            settled = true;
            resolve({ status: this.statusCode, body: payload });
          }
          return this;
        },
        end(payload?: any) {
          this.body = payload;
          if (!settled) {
            settled = true;
            resolve({ status: this.statusCode, body: payload });
          }
          return this;
        },
      };

      let index = 0;
      const next = (error?: unknown) => {
        if (error) {
          if (!settled) {
            settled = true;
            reject(error);
          }
          return;
        }

        const handler = handlers[index++];
        if (!handler) {
          if (!settled) {
            settled = true;
            resolve({ status: res.statusCode, body: res.body });
          }
          return;
        }

        try {
          const result = handler(req, res, next);
          if (result && typeof result.then === 'function') {
            result.catch(reject);
          }
        } catch (handlerError) {
          if (!settled) {
            settled = true;
            reject(handlerError);
          }
        }
      };

      next();
    });
  }

  function makeApplicationEmailUniqueViolation() {
    return {
      code: '23505',
      constraint: 'applications_job_lower_email_unique',
    };
  }

  function makeImportItem(overrides: Record<string, any> = {}) {
    return {
      id: 1,
      batchId: 10,
      organizationId: 1,
      jobId: 5,
      uploadedByUserId: 11,
      originalFilename: 'resume.pdf',
      gcsPath: 'gs://bucket/resume.pdf',
      contentHash: 'hash1',
      extractedText: 'Profile Summary',
      extractionMethod: 'native_text',
      parsedName: null,
      parsedEmail: null,
      parsedPhone: null,
      status: 'needs_review',
      errorReason: 'Missing name, email_or_phone',
      applicationId: null,
      sourceMetadata: {},
      attempts: 0,
      nextAttemptAt: new Date(),
      lastProcessedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it('runs OCR plus Groq advanced extraction on demand and persists the merged result', async () => {
    const item = makeImportItem({ parsedName: 'Delhi' });
    storageMock.getResumeImportItem.mockResolvedValue(item);
    extractResumeTextWithFallbackMock.mockResolvedValue({
      success: true,
      text: 'Jane Doe\njane@example.com\nPhone: 415-555-1212\nExperienced product designer building accessible interfaces across web and mobile products.',
      rawText: 'Jane Doe\njane@example.com\nExperienced product designer building accessible interfaces across web and mobile products.',
      method: 'google_vision_ocr',
    });
    extractStructuredResumeFieldsWithGroqMock.mockResolvedValue({
      name: 'Jane Doe',
      email: null,
      phone: '4155551212',
    });

    const updatedItem = makeImportItem({
      parsedName: 'Jane Doe',
      parsedEmail: 'jane@example.com',
      parsedPhone: '4155551212',
      extractedText: 'Jane Doe\njane@example.com\nPhone: 415-555-1212\nExperienced product designer building accessible interfaces across web and mobile products.',
      extractionMethod: 'google_vision_ocr',
      status: 'processed',
      errorReason: null,
    });
    storageMock.getResumeImportItem.mockResolvedValueOnce(item).mockResolvedValueOnce(updatedItem);

    const app = await buildApp();
    const response = await invokeRoute(app, 'post', '/api/jobs/:id/bulk-resume-import/items/:itemId/advanced-extract', {
      params: { id: '5', itemId: '1' },
      body: {},
    });

    expect(response.status).toBe(200);
    expect(downloadFromGCSMock).toHaveBeenCalledWith('gs://bucket/resume.pdf');
    expect(extractResumeTextWithFallbackMock).toHaveBeenCalledWith(Buffer.from('pdf'), 'resume.pdf', { gcsPath: 'gs://bucket/resume.pdf' });
    expect(extractStructuredResumeFieldsWithGroqMock).toHaveBeenCalledWith('Jane Doe\njane@example.com\nExperienced product designer building accessible interfaces across web and mobile products.');
    expect(storageMock.markResumeImportItemProcessed).toHaveBeenCalledWith(1, expect.objectContaining({
      extractedText: 'Jane Doe\njane@example.com\nPhone: 415-555-1212\nExperienced product designer building accessible interfaces across web and mobile products.',
      extractionMethod: 'google_vision_ocr',
      parsedName: 'Jane Doe',
      parsedEmail: 'jane@example.com',
      parsedPhone: '4155551212',
      status: 'processed',
      errorReason: null,
    }));
    expect(response.body.item).toMatchObject({
      id: 1,
      parsedName: 'Jane Doe',
      parsedEmail: 'jane@example.com',
      parsedPhone: '4155551212',
      extractionMethod: 'google_vision_ocr',
      status: 'processed',
    });
  });

  it('marks advanced extraction output duplicate when the merged email already belongs to another application', async () => {
    const item = makeImportItem();
    storageMock.getResumeImportItem.mockResolvedValue(item);
    extractResumeTextWithFallbackMock.mockResolvedValue({
      success: true,
      text: 'Jane Doe\njane@example.com',
      rawText: 'Jane Doe\njane@example.com',
      method: 'native_text',
    });
    storageMock.findApplicationByJobAndEmail.mockResolvedValue({ id: 900 });
    storageMock.updateResumeImportItem.mockResolvedValue(makeImportItem({
      parsedName: 'Jane Doe',
      parsedEmail: 'jane@example.com',
      status: 'duplicate',
      errorReason: 'Application with jane@example.com already exists for this job',
      applicationId: 900,
    }));

    const app = await buildApp();
    const response = await invokeRoute(app, 'post', '/api/jobs/:id/bulk-resume-import/items/:itemId/advanced-extract', {
      params: { id: '5', itemId: '1' },
      body: {},
    });

    expect(response.status).toBe(200);
    expect(storageMock.updateResumeImportItem).toHaveBeenCalledWith(1, expect.objectContaining({
      parsedName: 'Jane Doe',
      parsedEmail: 'jane@example.com',
      status: 'duplicate',
      applicationId: 900,
    }));
    expect(response.body.item).toMatchObject({
      status: 'duplicate',
      applicationId: 900,
    });
  });

  it('serializes concurrent finalize requests for the same item so only one application is created', async () => {
    let itemState = {
      id: 1,
      batch_id: 10,
      organization_id: 1,
      job_id: 5,
      uploaded_by_user_id: 11,
      original_filename: 'resume.pdf',
      gcs_path: 'gs://bucket/resume.pdf',
      content_hash: 'hash1',
      extracted_text: 'Experienced engineer with 10 years building resilient APIs and distributed systems.',
      extraction_method: 'native_text',
      parsed_name: 'Jane Doe',
      parsed_email: 'jane@example.com',
      parsed_phone: '4155551212',
      status: 'processed',
      error_reason: null,
      application_id: null,
      source_metadata: {},
      attempts: 0,
      next_attempt_at: new Date(),
      last_processed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    storageMock.getResumeImportItemsByBatch.mockImplementation(async () => ([{
      id: 1,
      batchId: 10,
      organizationId: 1,
      jobId: 5,
      uploadedByUserId: 11,
      originalFilename: 'resume.pdf',
      gcsPath: 'gs://bucket/resume.pdf',
      contentHash: 'hash1',
      extractedText: 'Experienced engineer with 10 years building resilient APIs and distributed systems.',
      extractionMethod: 'native_text',
      parsedName: 'Jane Doe',
      parsedEmail: 'jane@example.com',
      parsedPhone: '4155551212',
      status: itemState.status,
      errorReason: itemState.error_reason,
      applicationId: itemState.application_id,
      sourceMetadata: {},
      attempts: 0,
      nextAttemptAt: new Date(),
      lastProcessedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }]));

    let createCount = 0;
    let lock = Promise.resolve();

    dbMock.transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
      const previous = lock;
      let release!: () => void;
      lock = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;

      const tx = {
        execute: vi.fn().mockResolvedValue({
          rows: [itemState],
        }),
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
        insert: vi.fn((table: any) => ({
          values: vi.fn(() => ({
            returning: vi.fn(async () => {
              if (table === applications) {
                createCount += 1;
                return [{
                  id: 500 + createCount,
                  organizationId: 1,
                  jobId: 5,
                  extractedResumeText: itemState.extracted_text,
                }];
              }
              return [];
            }),
          })),
        })),
        update: vi.fn((table: any) => ({
          set: vi.fn((values: Record<string, unknown>) => ({
            where: vi.fn(async () => {
              if (table === resumeImportItems) {
                itemState = {
                  ...itemState,
                  status: String(values.status ?? itemState.status),
                  application_id: Number(values.applicationId ?? itemState.application_id ?? 0) || itemState.application_id,
                  error_reason: values.errorReason === undefined ? itemState.error_reason : values.errorReason as string | null,
                };
              }
              return [];
            }),
          })),
        })),
      };

      try {
        return await callback(tx);
      } finally {
        release();
      }
    });

    const app = await buildApp();

    const [first, second] = await Promise.all([
      invokeRoute(app, 'post', '/api/jobs/:id/bulk-resume-import/:batchId/finalize', {
        params: { id: '5', batchId: '10' },
        body: { itemIds: [1] },
      }),
      invokeRoute(app, 'post', '/api/jobs/:id/bulk-resume-import/:batchId/finalize', {
        params: { id: '5', batchId: '10' },
        body: { itemIds: [1] },
      }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(createCount).toBe(1);
    expect(first.body.finalized).toEqual([{ itemId: 1, applicationId: 501 }]);
    expect(second.body.finalized).toEqual([{ itemId: 1, applicationId: 501 }]);
  });

  it('reconciles a partially finalized item back to finalized when the existing application belongs to the import item', async () => {
    const existingApplication = {
      id: 777,
      organizationId: 1,
      jobId: 5,
      createdByUserId: 11,
      resumeUrl: 'gs://bucket/resume.pdf',
      extractedResumeText: 'Experienced engineer with 10 years building resilient APIs and distributed systems.',
      sourceMetadata: {
        bulkResumeImport: {
          batchId: 10,
          itemId: 1,
        },
      },
    };

    storageMock.getResumeImportItemsByBatch.mockResolvedValue([{
      id: 1,
      batchId: 10,
      organizationId: 1,
      jobId: 5,
      uploadedByUserId: 11,
      originalFilename: 'resume.pdf',
      gcsPath: 'gs://bucket/resume.pdf',
      contentHash: 'hash1',
      extractedText: 'Experienced engineer with 10 years building resilient APIs and distributed systems.',
      extractionMethod: 'native_text',
      parsedName: 'Jane Doe',
      parsedEmail: 'jane@example.com',
      parsedPhone: '4155551212',
      status: 'processed',
      errorReason: null,
      applicationId: null,
      sourceMetadata: {},
      attempts: 0,
      nextAttemptAt: new Date(),
      lastProcessedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }]);

    const updateCalls: Array<Record<string, unknown>> = [];
    let selectCalls = 0;

    dbMock.transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
      const tx = {
        execute: vi.fn().mockResolvedValue({
          rows: [{
            id: 1,
            batch_id: 10,
            organization_id: 1,
            job_id: 5,
            uploaded_by_user_id: 11,
            original_filename: 'resume.pdf',
            gcs_path: 'gs://bucket/resume.pdf',
            content_hash: 'hash1',
            extracted_text: 'Experienced engineer with 10 years building resilient APIs and distributed systems.',
            extraction_method: 'native_text',
            parsed_name: 'Jane Doe',
            parsed_email: 'jane@example.com',
            parsed_phone: '4155551212',
            status: 'processed',
            error_reason: null,
            application_id: null,
            source_metadata: {},
            attempts: 0,
            next_attempt_at: new Date(),
            last_processed_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          }],
        }),
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockImplementation(async () => {
                selectCalls += 1;
                return selectCalls === 1 ? [] : [existingApplication];
              }),
            })),
          })),
        })),
        insert: vi.fn((table: any) => ({
          values: vi.fn(() => ({
            returning: vi.fn(async () => {
              if (table === applications) {
                throw makeApplicationEmailUniqueViolation();
              }
              return [];
            }),
          })),
        })),
        update: vi.fn(() => ({
          set: vi.fn((values: Record<string, unknown>) => ({
            where: vi.fn(async () => {
              updateCalls.push(values);
              return [];
            }),
          })),
        })),
      };
      return callback(tx);
    });

    const app = await buildApp();
    const response = await invokeRoute(app, 'post', '/api/jobs/:id/bulk-resume-import/:batchId/finalize', {
      params: { id: '5', batchId: '10' },
      body: { itemIds: [1] },
    });

    expect(response.status).toBe(200);
    expect(response.body.finalized).toEqual([{ itemId: 1, applicationId: 777 }]);
    expect(response.body.duplicates).toEqual([]);
    expect(updateCalls.some((call) => call.status === 'finalized' && call.applicationId === 777)).toBe(true);
  });

  it('marks the item duplicate when application insert hits the unique index and the winner belongs to a different item', async () => {
    const existingApplication = {
      id: 888,
      organizationId: 1,
      jobId: 5,
      createdByUserId: 11,
      resumeUrl: 'gs://bucket/other.pdf',
      extractedResumeText: 'Experienced engineer with 10 years building resilient APIs and distributed systems.',
      sourceMetadata: {
        bulkResumeImport: {
          batchId: 10,
          itemId: 2,
        },
      },
    };

    storageMock.getResumeImportItemsByBatch.mockResolvedValue([{
      id: 1,
      batchId: 10,
      organizationId: 1,
      jobId: 5,
      uploadedByUserId: 11,
      originalFilename: 'resume.pdf',
      gcsPath: 'gs://bucket/resume.pdf',
      contentHash: 'hash1',
      extractedText: 'Experienced engineer with 10 years building resilient APIs and distributed systems.',
      extractionMethod: 'native_text',
      parsedName: 'Jane Doe',
      parsedEmail: 'jane@example.com',
      parsedPhone: '4155551212',
      status: 'processed',
      errorReason: null,
      applicationId: null,
      sourceMetadata: {},
      attempts: 0,
      nextAttemptAt: new Date(),
      lastProcessedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }]);

    const updateCalls: Array<Record<string, unknown>> = [];
    let selectCalls = 0;

    dbMock.transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
      const tx = {
        execute: vi.fn().mockResolvedValue({
          rows: [{
            id: 1,
            batch_id: 10,
            organization_id: 1,
            job_id: 5,
            uploaded_by_user_id: 11,
            original_filename: 'resume.pdf',
            gcs_path: 'gs://bucket/resume.pdf',
            content_hash: 'hash1',
            extracted_text: 'Experienced engineer with 10 years building resilient APIs and distributed systems.',
            extraction_method: 'native_text',
            parsed_name: 'Jane Doe',
            parsed_email: 'jane@example.com',
            parsed_phone: '4155551212',
            status: 'processed',
            error_reason: null,
            application_id: null,
            source_metadata: {},
            attempts: 0,
            next_attempt_at: new Date(),
            last_processed_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          }],
        }),
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockImplementation(async () => {
                selectCalls += 1;
                return selectCalls === 1 ? [] : [existingApplication];
              }),
            })),
          })),
        })),
        insert: vi.fn((table: any) => ({
          values: vi.fn(() => ({
            returning: vi.fn(async () => {
              if (table === applications) {
                throw makeApplicationEmailUniqueViolation();
              }
              return [];
            }),
          })),
        })),
        update: vi.fn(() => ({
          set: vi.fn((values: Record<string, unknown>) => ({
            where: vi.fn(async () => {
              updateCalls.push(values);
              return [];
            }),
          })),
        })),
      };
      return callback(tx);
    });

    const app = await buildApp();
    const response = await invokeRoute(app, 'post', '/api/jobs/:id/bulk-resume-import/:batchId/finalize', {
      params: { id: '5', batchId: '10' },
      body: { itemIds: [1] },
    });

    expect(response.status).toBe(200);
    expect(response.body.finalized).toEqual([]);
    expect(response.body.duplicates).toEqual([{
      itemId: 1,
      applicationId: 888,
      reason: 'Application with jane@example.com already exists for this job',
    }]);
    expect(updateCalls.some((call) => call.status === 'duplicate' && call.applicationId === 888)).toBe(true);
  });

  it('allows only one winner when two different items with the same email finalize concurrently', async () => {
    const itemStates: Record<number, any> = {
      1: {
        id: 1,
        batch_id: 10,
        organization_id: 1,
        job_id: 5,
        uploaded_by_user_id: 11,
        original_filename: 'resume-a.pdf',
        gcs_path: 'gs://bucket/resume-a.pdf',
        content_hash: 'hash-a',
        extracted_text: 'Experienced engineer with 10 years building resilient APIs and distributed systems.',
        extraction_method: 'native_text',
        parsed_name: 'Jane Doe',
        parsed_email: 'jane@example.com',
        parsed_phone: '4155551212',
        status: 'processed',
        error_reason: null,
        application_id: null,
        source_metadata: {},
        attempts: 0,
        next_attempt_at: new Date(),
        last_processed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
      2: {
        id: 2,
        batch_id: 10,
        organization_id: 1,
        job_id: 5,
        uploaded_by_user_id: 11,
        original_filename: 'resume-b.pdf',
        gcs_path: 'gs://bucket/resume-b.pdf',
        content_hash: 'hash-b',
        extracted_text: 'Experienced engineer with 10 years building resilient APIs and distributed systems.',
        extraction_method: 'native_text',
        parsed_name: 'Jane Doe',
        parsed_email: 'jane@example.com',
        parsed_phone: '4155551212',
        status: 'processed',
        error_reason: null,
        application_id: null,
        source_metadata: {},
        attempts: 0,
        next_attempt_at: new Date(),
        last_processed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    };

    storageMock.getResumeImportItemsByBatch.mockImplementation(async () => Object.values(itemStates).map((item) => ({
      id: item.id,
      batchId: item.batch_id,
      organizationId: item.organization_id,
      jobId: item.job_id,
      uploadedByUserId: item.uploaded_by_user_id,
      originalFilename: item.original_filename,
      gcsPath: item.gcs_path,
      contentHash: item.content_hash,
      extractedText: item.extracted_text,
      extractionMethod: item.extraction_method,
      parsedName: item.parsed_name,
      parsedEmail: item.parsed_email,
      parsedPhone: item.parsed_phone,
      status: item.status,
      errorReason: item.error_reason,
      applicationId: item.application_id,
      sourceMetadata: item.source_metadata,
      attempts: item.attempts,
      nextAttemptAt: new Date(),
      lastProcessedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })));

    let createdApplication: any = null;
    let createAttempts = 0;
    let transactionIndex = 0;

    dbMock.transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
      transactionIndex += 1;
      const lockedItemId = transactionIndex === 1 ? 1 : 2;
      const tx = {
        execute: vi.fn().mockResolvedValue({
          rows: [itemStates[lockedItemId]],
        }),
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockImplementation(async () => {
                if (!createdApplication) {
                  return [];
                }
                return [createdApplication];
              }),
            })),
          })),
        })),
        insert: vi.fn((table: any) => ({
          values: vi.fn(() => ({
            returning: vi.fn(async () => {
              if (table !== applications) {
                return [];
              }
              createAttempts += 1;
              if (!createdApplication) {
                createdApplication = {
                  id: 901,
                  organizationId: 1,
                  jobId: 5,
                  createdByUserId: 11,
                  resumeUrl: itemStates[lockedItemId].gcs_path,
                  extractedResumeText: itemStates[lockedItemId].extracted_text,
                  sourceMetadata: {
                    bulkResumeImport: {
                      batchId: 10,
                      itemId: lockedItemId,
                    },
                  },
                };
                return [createdApplication];
              }
              throw makeApplicationEmailUniqueViolation();
            }),
          })),
        })),
        update: vi.fn(() => ({
          set: vi.fn((values: Record<string, unknown>) => ({
            where: vi.fn(async () => {
              if (lockedItemId != null) {
                itemStates[lockedItemId] = {
                  ...itemStates[lockedItemId],
                  status: String(values.status ?? itemStates[lockedItemId].status),
                  application_id: values.applicationId === undefined
                    ? itemStates[lockedItemId].application_id
                    : values.applicationId,
                  error_reason: values.errorReason === undefined
                    ? itemStates[lockedItemId].error_reason
                    : values.errorReason,
                };
              }
              return [];
            }),
          })),
        })),
      };

      return callback(tx);
    });

    const app = await buildApp();
    const [first, second] = await Promise.all([
      invokeRoute(app, 'post', '/api/jobs/:id/bulk-resume-import/:batchId/finalize', {
        params: { id: '5', batchId: '10' },
        body: { itemIds: [1] },
      }),
      invokeRoute(app, 'post', '/api/jobs/:id/bulk-resume-import/:batchId/finalize', {
        params: { id: '5', batchId: '10' },
        body: { itemIds: [2] },
      }),
    ]);

    const finalizedResponses = [first, second].filter((response) => response.body.finalized.length === 1);
    const duplicateResponses = [first, second].filter((response) => response.body.duplicates.length === 1);

    expect(finalizedResponses).toHaveLength(1);
    expect(duplicateResponses).toHaveLength(1);
    expect(createAttempts).toBe(2);
    expect(finalizedResponses[0]!.body.finalized[0].applicationId).toBe(901);
    expect(duplicateResponses[0]!.body.duplicates[0]).toEqual({
      itemId: expect.any(Number),
      applicationId: 901,
      reason: 'Application with jane@example.com already exists for this job',
    });
  });
});
