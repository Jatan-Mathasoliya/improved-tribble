import { and, eq, sql } from 'drizzle-orm';
import {
  applicationStageHistory,
  applications,
  resumeImportItems,
  type Application,
  type ResumeImportItem,
} from '@shared/schema';
import { canFinalizeResumeImportItem } from './resumeImportFieldExtraction';

type LockedResumeImportItemRow = {
  id: number;
  batch_id: number;
  organization_id: number;
  job_id: number;
  uploaded_by_user_id: number;
  original_filename: string;
  gcs_path: string | null;
  content_hash: string | null;
  extracted_text: string | null;
  extraction_method: string;
  parsed_name: string | null;
  parsed_email: string | null;
  parsed_phone: string | null;
  status: string;
  error_reason: string | null;
  application_id: number | null;
  source_metadata: unknown;
  attempts: number;
  next_attempt_at: Date | string;
  last_processed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type FinalizeResumeImportItemResult =
  | { kind: 'already_finalized'; itemId: number; applicationId: number }
  | { kind: 'finalized'; itemId: number; application: { id: number; organizationId: number | null; jobId: number; extractedResumeText: string | null } }
  | { kind: 'duplicate'; itemId: number; applicationId?: number | null; reason: string }
  | { kind: 'needs_review'; itemId: number; reason: string };

type FinalizeResumeImportItemParams = {
  itemId: number;
  batchId: number;
  organizationId: number;
  jobId: number;
  recruiterId: number;
  initialStageId?: number | null;
};

function mapResumeImportItemRow(row: LockedResumeImportItemRow): ResumeImportItem {
  return {
    id: row.id,
    batchId: row.batch_id,
    organizationId: row.organization_id,
    jobId: row.job_id,
    uploadedByUserId: row.uploaded_by_user_id,
    originalFilename: row.original_filename,
    gcsPath: row.gcs_path,
    contentHash: row.content_hash,
    extractedText: row.extracted_text,
    extractionMethod: row.extraction_method as ResumeImportItem['extractionMethod'],
    parsedName: row.parsed_name,
    parsedEmail: row.parsed_email,
    parsedPhone: row.parsed_phone,
    status: row.status as ResumeImportItem['status'],
    errorReason: row.error_reason,
    applicationId: row.application_id,
    sourceMetadata: row.source_metadata,
    attempts: row.attempts,
    nextAttemptAt: new Date(row.next_attempt_at),
    lastProcessedAt: row.last_processed_at ? new Date(row.last_processed_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function isApplicationsJobLowerEmailUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const record = error as Record<string, unknown>;
  return record.code === '23505' && record.constraint === 'applications_job_lower_email_unique';
}

export function isApplicationOwnedByResumeImportItem(
  item: Pick<ResumeImportItem, 'id' | 'batchId' | 'gcsPath'>,
  application: Pick<Application, 'resumeUrl' | 'createdByUserId' | 'sourceMetadata'>,
  recruiterId: number,
): boolean {
  const rawMetadata = application.sourceMetadata;
  const metadata = rawMetadata && typeof rawMetadata === 'object'
    ? rawMetadata as Record<string, unknown>
    : null;
  const bulkResumeImport = metadata?.bulkResumeImport;
  const bulkMeta = bulkResumeImport && typeof bulkResumeImport === 'object'
    ? bulkResumeImport as Record<string, unknown>
    : null;

  const itemId = typeof bulkMeta?.itemId === 'number' ? bulkMeta.itemId : null;
  const batchId = typeof bulkMeta?.batchId === 'number' ? bulkMeta.batchId : null;

  if (itemId === item.id) {
    return true;
  }

  return Boolean(
    batchId === item.batchId &&
    application.resumeUrl &&
    item.gcsPath &&
    application.resumeUrl === item.gcsPath &&
    application.createdByUserId === recruiterId,
  );
}

export async function finalizeResumeImportItemInTransaction(
  tx: any,
  params: FinalizeResumeImportItemParams,
): Promise<FinalizeResumeImportItemResult> {
  const applicationInsertSavepoint = sql.raw('SAVEPOINT resume_import_application_insert');
  const rollbackApplicationInsertSavepoint = sql.raw('ROLLBACK TO SAVEPOINT resume_import_application_insert');
  const releaseApplicationInsertSavepoint = sql.raw('RELEASE SAVEPOINT resume_import_application_insert');
  const lockedRows = await tx.execute(sql`
    SELECT *
    FROM resume_import_items
    WHERE id = ${params.itemId}
      AND batch_id = ${params.batchId}
      AND organization_id = ${params.organizationId}
      AND job_id = ${params.jobId}
    FOR UPDATE
  `);
  const lockedRow = (lockedRows.rows?.[0] ?? null) as LockedResumeImportItemRow | null;
  if (!lockedRow) {
    return {
      kind: 'needs_review',
      itemId: params.itemId,
      reason: 'Import item not found during finalize',
    };
  }

  const item = mapResumeImportItemRow(lockedRow);

  if (item.applicationId && item.status === 'finalized') {
    return {
      kind: 'already_finalized',
      itemId: item.id,
      applicationId: item.applicationId,
    };
  }

  if (item.status === 'duplicate') {
    return {
      kind: 'duplicate',
      itemId: item.id,
      applicationId: item.applicationId,
      reason: item.errorReason || 'Duplicate import item',
    };
  }

  const fields = {
    name: item.parsedName,
    email: item.parsedEmail,
    phone: item.parsedPhone,
  };

  if (!canFinalizeResumeImportItem(fields, item.gcsPath, item.extractedText)) {
    const reason = 'Finalization requires name, email, phone, resume file, and valid extracted text';
    await tx
      .update(resumeImportItems)
      .set({
        status: 'needs_review',
        errorReason: reason,
        applicationId: null,
        updatedAt: new Date(),
      })
      .where(eq(resumeImportItems.id, item.id));
    return {
      kind: 'needs_review',
      itemId: item.id,
      reason,
    };
  }

  const [existingApplication] = await tx
    .select()
    .from(applications)
    .where(and(
      eq(applications.jobId, item.jobId),
      sql`LOWER(${applications.email}) = LOWER(${item.parsedEmail!})`,
    ))
    .limit(1);

  if (existingApplication) {
    if (isApplicationOwnedByResumeImportItem(item, existingApplication, params.recruiterId)) {
      await tx
        .update(resumeImportItems)
        .set({
          status: 'finalized',
          applicationId: existingApplication.id,
          errorReason: null,
          updatedAt: new Date(),
        })
        .where(eq(resumeImportItems.id, item.id));
      return {
        kind: 'finalized',
        itemId: item.id,
        application: {
          id: existingApplication.id,
          organizationId: existingApplication.organizationId,
          jobId: existingApplication.jobId,
          extractedResumeText: existingApplication.extractedResumeText ?? null,
        },
      };
    }

    await tx
      .update(resumeImportItems)
      .set({
        status: 'duplicate',
        errorReason: `Application with ${item.parsedEmail} already exists for this job`,
        applicationId: existingApplication.id,
        updatedAt: new Date(),
      })
      .where(eq(resumeImportItems.id, item.id));
    return {
      kind: 'duplicate',
      itemId: item.id,
      applicationId: existingApplication.id,
      reason: `Application with ${item.parsedEmail} already exists for this job`,
    };
  }

  const now = new Date();
  let createdApplication;
  await tx.execute(applicationInsertSavepoint);
  try {
    [createdApplication] = await tx
      .insert(applications)
      .values({
        name: item.parsedName!,
        email: item.parsedEmail!,
        phone: item.parsedPhone!,
        whatsappConsent: false,
        jobId: item.jobId,
        resumeUrl: item.gcsPath!,
        resumeFilename: item.originalFilename,
        extractedResumeText: item.extractedText ?? undefined,
        submittedByRecruiter: true,
        createdByUserId: params.recruiterId,
        source: 'recruiter_add',
        sourceMetadata: {
          bulkResumeImport: {
            batchId: item.batchId,
            itemId: item.id,
            extractionMethod: item.extractionMethod,
            contentHash: item.contentHash,
          },
          ...(item.sourceMetadata ?? {}),
        },
        ...(params.initialStageId ? {
          currentStage: params.initialStageId,
          stageChangedAt: now,
          stageChangedBy: params.recruiterId,
        } : {}),
        organizationId: params.organizationId,
        status: 'submitted',
        appliedAt: now,
        updatedAt: now,
      })
      .returning();
    await tx.execute(releaseApplicationInsertSavepoint);
  } catch (insertError) {
    if (!isApplicationsJobLowerEmailUniqueViolation(insertError)) {
      throw insertError;
    }
    await tx.execute(rollbackApplicationInsertSavepoint);
    await tx.execute(releaseApplicationInsertSavepoint);

    const [conflictApplication] = await tx
      .select()
      .from(applications)
      .where(and(
        eq(applications.jobId, item.jobId),
        sql`LOWER(${applications.email}) = LOWER(${item.parsedEmail!})`,
      ))
      .limit(1);

    if (!conflictApplication) {
      throw insertError;
    }

    if (isApplicationOwnedByResumeImportItem(item, conflictApplication, params.recruiterId)) {
      await tx
        .update(resumeImportItems)
        .set({
          status: 'finalized',
          applicationId: conflictApplication.id,
          errorReason: null,
          updatedAt: new Date(),
        })
        .where(eq(resumeImportItems.id, item.id));
      return {
        kind: 'finalized',
        itemId: item.id,
        application: {
          id: conflictApplication.id,
          organizationId: conflictApplication.organizationId,
          jobId: conflictApplication.jobId,
          extractedResumeText: conflictApplication.extractedResumeText ?? null,
        },
      };
    }

    await tx
      .update(resumeImportItems)
      .set({
        status: 'duplicate',
        errorReason: `Application with ${item.parsedEmail} already exists for this job`,
        applicationId: conflictApplication.id,
        updatedAt: new Date(),
      })
      .where(eq(resumeImportItems.id, item.id));
    return {
      kind: 'duplicate',
      itemId: item.id,
      applicationId: conflictApplication.id,
      reason: `Application with ${item.parsedEmail} already exists for this job`,
    };
  }

  if (params.initialStageId) {
    await tx.insert(applicationStageHistory).values({
      applicationId: createdApplication.id,
      fromStage: null,
      toStage: params.initialStageId,
      changedBy: params.recruiterId,
      notes: 'Initial stage assigned automatically during bulk resume import finalization',
    });
  }

  await tx
    .update(resumeImportItems)
    .set({
      status: 'finalized',
      applicationId: createdApplication.id,
      errorReason: null,
      updatedAt: now,
    })
    .where(eq(resumeImportItems.id, item.id));

  return {
    kind: 'finalized',
    itemId: item.id,
    application: {
      id: createdApplication.id,
      organizationId: createdApplication.organizationId,
      jobId: createdApplication.jobId,
      extractedResumeText: createdApplication.extractedResumeText ?? null,
    },
  };
}
