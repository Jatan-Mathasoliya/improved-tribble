// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  applications,
  jobs,
  organizations,
  resumeImportBatches,
  resumeImportItems,
  users,
} from '@shared/schema';
import { db } from '../db';
import { finalizeResumeImportItemInTransaction } from '../lib/resumeImportFinalize';

const HAS_DB = !!process.env.DATABASE_URL;
const dbDescribe = HAS_DB ? describe.sequential : describe.skip;

if (!HAS_DB) {
  console.warn(
    '[TEST] Skipping bulk resume import finalize integration tests: DATABASE_URL not set. ' +
    'This suite is required CI coverage for real Postgres finalize locking/idempotency behavior.',
  );
}

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type TestFixture = {
  organizationId: number;
  recruiterId: number;
  jobId: number;
  batchId: number;
  itemIds: number[];
};

const cleanupQueue: Array<() => Promise<void>> = [];

async function createFixture(options?: {
  emails?: string[];
}): Promise<TestFixture> {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const [organization] = await db.insert(organizations).values({
    name: `Bulk Import Test Org ${suffix}`,
    slug: `bulk-import-test-${suffix}`,
  }).returning();

  const [recruiter] = await db.insert(users).values({
    username: `bulk_import_user_${suffix}`,
    password: 'test123',
    role: 'recruiter',
    firstName: 'Bulk',
    lastName: 'Tester',
  }).returning();

  const [job] = await db.insert(jobs).values({
    organizationId: organization.id,
    title: `Bulk Import Test Job ${suffix}`,
    location: 'San Francisco',
    type: 'full-time',
    description: 'Integration test job',
    postedBy: recruiter.id,
    status: 'approved',
    isActive: true,
  }).returning();

  const [batch] = await db.insert(resumeImportBatches).values({
    organizationId: organization.id,
    jobId: job.id,
    uploadedByUserId: recruiter.id,
    status: 'ready_for_review',
    fileCount: options?.emails?.length ?? 1,
    processedCount: options?.emails?.length ?? 1,
    readyCount: options?.emails?.length ?? 1,
    needsReviewCount: 0,
    failedCount: 0,
  }).returning();

  const itemEmails = options?.emails ?? [`candidate-${suffix}@example.com`];
  const insertedItems = await db.insert(resumeImportItems).values(
    itemEmails.map((email, index) => ({
      batchId: batch.id,
      organizationId: organization.id,
      jobId: job.id,
      uploadedByUserId: recruiter.id,
      originalFilename: `resume-${index + 1}.pdf`,
      gcsPath: `gs://bulk-import-tests/${suffix}/resume-${index + 1}.pdf`,
      contentHash: `hash-${suffix}-${index + 1}`,
      extractedText: 'Experienced engineer with 10 years building resilient APIs and distributed systems.',
      extractionMethod: 'native_text',
      parsedName: `Candidate ${index + 1}`,
      parsedEmail: email,
      parsedPhone: `41555512${String(10 + index).padStart(2, '0')}`,
      status: 'processed',
      errorReason: null,
      sourceMetadata: { testFixture: suffix },
    })),
  ).returning();

  cleanupQueue.push(async () => {
    await db.delete(resumeImportItems).where(eq(resumeImportItems.batchId, batch.id));
    await db.delete(applications).where(eq(applications.jobId, job.id));
    await db.delete(resumeImportBatches).where(eq(resumeImportBatches.id, batch.id));
    await db.delete(jobs).where(eq(jobs.id, job.id));
    await db.delete(organizations).where(eq(organizations.id, organization.id));
    await db.delete(users).where(eq(users.id, recruiter.id));
  });

  return {
    organizationId: organization.id,
    recruiterId: recruiter.id,
    jobId: job.id,
    batchId: batch.id,
    itemIds: insertedItems.map((item) => item.id),
  };
}

async function finalizeItem(fixture: TestFixture, itemId: number) {
  return db.transaction((tx: any) => finalizeResumeImportItemInTransaction(tx, {
    itemId,
    batchId: fixture.batchId,
    organizationId: fixture.organizationId,
    jobId: fixture.jobId,
    recruiterId: fixture.recruiterId,
    initialStageId: null,
  }));
}

afterEach(async () => {
  while (cleanupQueue.length > 0) {
    const cleanup = cleanupQueue.pop();
    if (cleanup) {
      await cleanup();
    }
  }
});

dbDescribe('bulk resume import finalize integration', () => {
  it('serializes concurrent finalize calls for the same import item in Postgres', async () => {
    const fixture = await createFixture();
    const holdCommit = createDeferred<void>();
    const firstFinalized = createDeferred<void>();

    const first = db.transaction(async (tx: any) => {
      const result = await finalizeResumeImportItemInTransaction(tx, {
        itemId: fixture.itemIds[0]!,
        batchId: fixture.batchId,
        organizationId: fixture.organizationId,
        jobId: fixture.jobId,
        recruiterId: fixture.recruiterId,
        initialStageId: null,
      });
      firstFinalized.resolve();
      await holdCommit.promise;
      return result;
    });

    await firstFinalized.promise;

    const second = finalizeItem(fixture, fixture.itemIds[0]!);
    await delay(50);
    holdCommit.resolve();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    const createdApplications = await db
      .select()
      .from(applications)
      .where(eq(applications.jobId, fixture.jobId));
    const [item] = await db
      .select()
      .from(resumeImportItems)
      .where(eq(resumeImportItems.id, fixture.itemIds[0]!));

    expect(createdApplications).toHaveLength(1);
    expect([firstResult.kind, secondResult.kind].sort()).toEqual(['already_finalized', 'finalized']);
    expect(item?.status).toBe('finalized');
    expect(item?.applicationId).toBe(createdApplications[0]!.id);
  });

  it('enforces one winner for different import items with the same email under concurrent finalize', async () => {
    const sharedEmail = `race-${Date.now()}@example.com`;
    const fixture = await createFixture({
      emails: [sharedEmail, sharedEmail],
    });
    const holdCommit = createDeferred<void>();
    const firstFinalized = createDeferred<void>();

    const first = db.transaction(async (tx: any) => {
      const result = await finalizeResumeImportItemInTransaction(tx, {
        itemId: fixture.itemIds[0]!,
        batchId: fixture.batchId,
        organizationId: fixture.organizationId,
        jobId: fixture.jobId,
        recruiterId: fixture.recruiterId,
        initialStageId: null,
      });
      firstFinalized.resolve();
      await holdCommit.promise;
      return result;
    });

    await firstFinalized.promise;

    const second = finalizeItem(fixture, fixture.itemIds[1]!);
    await delay(50);
    holdCommit.resolve();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    const createdApplications = await db
      .select()
      .from(applications)
      .where(eq(applications.jobId, fixture.jobId));
    const persistedItems = await db
      .select()
      .from(resumeImportItems)
      .where(eq(resumeImportItems.batchId, fixture.batchId));

    expect(firstResult.kind).toBe('finalized');
    expect(secondResult.kind).toBe('duplicate');
    expect(createdApplications).toHaveLength(1);
    expect(persistedItems.find((item) => item.id === fixture.itemIds[0])?.status).toBe('finalized');
    expect(persistedItems.find((item) => item.id === fixture.itemIds[1])?.status).toBe('duplicate');
    expect(persistedItems.find((item) => item.id === fixture.itemIds[1])?.applicationId).toBe(createdApplications[0]!.id);
  });

  it('reconciles a retry to the existing application when bulk-import provenance already exists', async () => {
    const fixture = await createFixture();
    const [item] = await db
      .select()
      .from(resumeImportItems)
      .where(eq(resumeImportItems.id, fixture.itemIds[0]!));

    const [existingApplication] = await db.insert(applications).values({
      organizationId: fixture.organizationId,
      jobId: fixture.jobId,
      name: item!.parsedName!,
      email: item!.parsedEmail!,
      phone: item!.parsedPhone!,
      resumeUrl: item!.gcsPath!,
      resumeFilename: item!.originalFilename,
      extractedResumeText: item!.extractedText ?? undefined,
      submittedByRecruiter: true,
      createdByUserId: fixture.recruiterId,
      source: 'recruiter_add',
      sourceMetadata: {
        bulkResumeImport: {
          batchId: fixture.batchId,
          itemId: item!.id,
          extractionMethod: item!.extractionMethod,
          contentHash: item!.contentHash,
        },
      },
      status: 'submitted',
    }).returning();

    const result = await finalizeItem(fixture, fixture.itemIds[0]!);
    const createdApplications = await db
      .select()
      .from(applications)
      .where(eq(applications.jobId, fixture.jobId));
    const [persistedItem] = await db
      .select()
      .from(resumeImportItems)
      .where(eq(resumeImportItems.id, fixture.itemIds[0]!));

    expect(result.kind).toBe('finalized');
    expect(createdApplications).toHaveLength(1);
    expect(createdApplications[0]!.id).toBe(existingApplication.id);
    expect(persistedItem?.status).toBe('finalized');
    expect(persistedItem?.applicationId).toBe(existingApplication.id);
  });
});
