/**
 * Run a single ActiveKG sync poll cycle.
 * Tests the full flow: claim → process → succeed/fail.
 */
import { storage } from '../storage';
import {
  createNode,
  createEdge,
  getNodeByExternalId,
  ActiveKGClientError,
} from '../lib/services/activekg-client';
import { chunkText, buildParentExternalId } from '../lib/activekgChunker';
import { resolveActiveKGTenantId } from '../lib/activekgTenant';
import type { ApplicationGraphSyncJob } from '@shared/schema';

async function processJob(job: ApplicationGraphSyncJob): Promise<void> {
  if (!job.applicationId || !job.activekgTenantId || !job.effectiveRecruiterId) {
    const missing = [
      !job.applicationId && 'applicationId',
      !job.activekgTenantId && 'activekgTenantId',
      !job.effectiveRecruiterId && 'effectiveRecruiterId',
    ].filter(Boolean).join(', ');
    await storage.markApplicationGraphSyncJobDeadLetter(job.id, `Missing required fields: ${missing}`);
    return;
  }

  const application = await storage.getApplication(job.applicationId);
  if (!application) {
    await storage.markApplicationGraphSyncJobDeadLetter(job.id, `Application ${job.applicationId} not found`);
    return;
  }

  if (!application.organizationId) {
    await storage.markApplicationGraphSyncJobDeadLetter(job.id, 'Application has no organizationId');
    return;
  }

  if (!application.extractedResumeText || application.extractedResumeText.trim().length < 50) {
    await storage.markApplicationGraphSyncJobDeadLetter(job.id, 'No extracted resume text or text too short');
    return;
  }

  const expectedTenantId = resolveActiveKGTenantId(application.organizationId);
  if (job.activekgTenantId !== expectedTenantId) {
    await storage.markApplicationGraphSyncJobDeadLetter(
      job.id,
      `Tenant mismatch for application ${application.id}: job=${job.activekgTenantId} expected=${expectedTenantId}`
    );
    return;
  }

  const tenantId = expectedTenantId;
  const parentExternalId = buildParentExternalId(application.organizationId, application.id);

  console.log('  Creating parent node...');
  let parentNodeId: string;
  const existingParent = await getNodeByExternalId(tenantId, parentExternalId);

  if (existingParent) {
    parentNodeId = existingParent.id;
    console.log(`  Parent already exists: ${parentNodeId}`);
  } else {
    const parentResponse = await createNode(tenantId, {
      classes: ['Document', 'Resume'],
      props: {
        title: `Application Resume ${application.id}`,
        external_id: parentExternalId,
        is_parent: true,
        has_chunks: true,
        resume_text: application.extractedResumeText,
        application_id: application.id,
        job_id: application.jobId,
        org_id: application.organizationId,
        effective_recruiter_id: job.effectiveRecruiterId,
        resume_source: 'application',
      },
      metadata: {
        source: 'vantahire',
        org_id: application.organizationId,
        job_id: application.jobId,
        application_id: application.id,
        resume_source: 'application',
        effective_recruiter_id: job.effectiveRecruiterId,
        submitted_by_recruiter: application.submittedByRecruiter || false,
      },
      tenant_id: tenantId,
    });
    parentNodeId = parentResponse.id;
    console.log(`  Parent created: ${parentNodeId}`);
  }

  const chunks = chunkText(application.extractedResumeText, parentExternalId);
  console.log(`  Chunks: ${chunks.length}`);

  for (const chunk of chunks) {
    const existingChunk = await getNodeByExternalId(tenantId, chunk.externalId);
    let chunkNodeId: string;

    if (existingChunk) {
      chunkNodeId = existingChunk.id;
    } else {
      const chunkResponse = await createNode(tenantId, {
        classes: ['Chunk', 'Resume'],
        props: {
          text: chunk.text,
          chunk_index: chunk.chunkIndex,
          total_chunks: chunk.totalChunks,
          parent_id: parentExternalId,
          parent_title: `Application Resume ${application.id}`,
          external_id: chunk.externalId,
          application_id: application.id,
          job_id: application.jobId,
          org_id: application.organizationId,
          effective_recruiter_id: job.effectiveRecruiterId,
        },
        metadata: {
          source: 'vantahire',
          org_id: application.organizationId,
          job_id: application.jobId,
          application_id: application.id,
          resume_source: 'application',
          effective_recruiter_id: job.effectiveRecruiterId,
          submitted_by_recruiter: application.submittedByRecruiter || false,
        },
        tenant_id: tenantId,
      });
      chunkNodeId = chunkResponse.id;
    }

    try {
      await createEdge(tenantId, {
        src: chunkNodeId,
        dst: parentNodeId,
        rel: 'DERIVED_FROM',
        props: { chunk_index: chunk.chunkIndex, total_chunks: chunk.totalChunks },
        tenant_id: tenantId,
      });
    } catch (edgeError) {
      if (edgeError instanceof ActiveKGClientError &&
        (edgeError.statusCode === 409 || edgeError.message.includes('duplicate') || edgeError.message.includes('already exists'))) {
        // skip
      } else {
        throw edgeError;
      }
    }
  }

  await storage.markApplicationGraphSyncJobSucceeded(job.id, parentNodeId, chunks.length);
  console.log(`  SUCCEEDED: parentNodeId=${parentNodeId}, chunks=${chunks.length}`);
}

async function main() {
  console.log('=== Single Sync Cycle ===');

  // Check before
  const before = await storage.claimPendingApplicationGraphSyncJobs(5, new Date());
  console.log(`Claimed ${before.length} job(s)`);

  for (const job of before) {
    console.log(`\nProcessing job ${job.id} (app=${job.applicationId}, tenant=${job.activekgTenantId}):`);
    try {
      await processJob(job);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  FAILED: ${msg}`);
      await storage.markApplicationGraphSyncJobDeadLetter(job.id, msg);
    }
  }

  console.log('\n=== Final DB state ===');
  // Raw query to check final state
  const { rows } = await (await import('../db')).db.execute(
    (await import('drizzle-orm')).sql`SELECT id, application_id, status, attempts, activekg_parent_node_id, chunk_count, last_error FROM application_graph_sync_jobs ORDER BY id`
  );
  for (const r of rows as any[]) {
    console.log(`  Job ${r.id}: status=${r.status}, parentNode=${r.activekg_parent_node_id ?? 'n/a'}, chunks=${r.chunk_count ?? 'n/a'}, error=${r.last_error ?? 'none'}`);
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
