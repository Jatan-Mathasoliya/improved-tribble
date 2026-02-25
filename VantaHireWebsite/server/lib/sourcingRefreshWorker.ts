import { Worker, Job, UnrecoverableError } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { jobSourcingRuns, organizations } from '../../shared/schema';
import {
  SOURCING_REFRESH_QUEUE,
  type SourcingRefreshJobData,
} from './sourcingRefreshQueue';
import { syncSignalResultsIntoVanta } from './services/sourcing-sync';

const REDIS_NAMESPACE = process.env.NODE_ENV || 'development';
const REFRESH_CONCURRENCY = parseInt(process.env.SOURCING_REFRESH_CONCURRENCY || '1', 10);
const MAX_REFRESH_AGE_MS = parseInt(
  process.env.SOURCING_REFRESH_MAX_AGE_MS || String(6 * 60 * 60 * 1000),
  10,
);

type RefreshMeta = {
  attempts?: number;
  lastAttemptAt?: string;
  status?: string;
  queueJobId?: string | null;
  lastError?: string | null;
};

function coerceObject(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object'
    ? input as Record<string, unknown>
    : {};
}

async function processSourcingRefreshJob(
  job: Job<SourcingRefreshJobData>,
): Promise<{
  requestId: string;
  inProgress: boolean;
  pendingCount: number;
  enrichedCount: number;
}> {
  const nowIso = new Date().toISOString();
  const run = await db.query.jobSourcingRuns.findFirst({
    where: eq(jobSourcingRuns.requestId, job.data.requestId),
  });

  if (!run) {
    throw new UnrecoverableError(`Unknown requestId: ${job.data.requestId}`);
  }

  if (run.status === 'failed' || run.status === 'expired') {
    return {
      requestId: run.requestId,
      inProgress: false,
      pendingCount: 0,
      enrichedCount: 0,
    };
  }

  if (run.status !== 'completed') {
    throw new Error(`Run not ready for refresh (status=${run.status})`);
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, run.organizationId),
    columns: { signalTenantId: true },
  });

  if (!org?.signalTenantId) {
    throw new UnrecoverableError(`Organization ${run.organizationId} has no signalTenantId`);
  }

  const baseMeta = coerceObject(run.meta);
  const prevRefreshMeta = coerceObject(baseMeta.enrichmentRefresh) as RefreshMeta;
  const attempts = typeof prevRefreshMeta.attempts === 'number'
    ? prevRefreshMeta.attempts + 1
    : 1;

  try {
    const sync = await syncSignalResultsIntoVanta({
      organizationId: run.organizationId,
      jobId: run.jobId,
      requestId: run.requestId,
      externalJobId: run.externalJobId,
      signalTenantId: org.signalTenantId,
    });

    const runAgeMs = Date.now() - new Date(run.completedAt ?? run.updatedAt ?? run.createdAt).getTime();
    const ageLimitReached = sync.enrichmentProgress.inProgress && runAgeMs > MAX_REFRESH_AGE_MS;
    const effectiveProgress = ageLimitReached
      ? { ...sync.enrichmentProgress, inProgress: false }
      : sync.enrichmentProgress;
    const refreshStatus = ageLimitReached
      ? 'stopped_max_age'
      : effectiveProgress.inProgress
        ? 'in_progress'
        : 'completed';

    await db.update(jobSourcingRuns)
      .set({
        candidateCount: sync.candidateCount,
        meta: {
          ...baseMeta,
          ...sync.metaPatch,
          enrichmentProgress: effectiveProgress,
          enrichmentRefresh: {
            attempts,
            lastAttemptAt: nowIso,
            status: refreshStatus,
            queueJobId: prevRefreshMeta.queueJobId ?? null,
            lastError: null,
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(jobSourcingRuns.id, run.id));

    if (ageLimitReached) {
      return {
        requestId: run.requestId,
        inProgress: false,
        pendingCount: effectiveProgress.pendingCount,
        enrichedCount: effectiveProgress.enrichedCount,
      };
    }

    if (effectiveProgress.inProgress) {
      throw new Error(`ENRICHMENT_PENDING:${effectiveProgress.pendingCount}`);
    }

    return {
      requestId: run.requestId,
      inProgress: false,
      pendingCount: 0,
      enrichedCount: effectiveProgress.enrichedCount,
    };
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.startsWith('ENRICHMENT_PENDING:')) {
      throw error;
    }

    await db.update(jobSourcingRuns)
      .set({
        meta: {
          ...baseMeta,
          enrichmentRefresh: {
            attempts,
            lastAttemptAt: nowIso,
            status: 'error',
            queueJobId: prevRefreshMeta.queueJobId ?? null,
            lastError: error?.message ?? 'Unknown refresh error',
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(jobSourcingRuns.id, run.id));
    throw error;
  }
}

export function createSourcingRefreshWorker(connection: any): Worker<SourcingRefreshJobData> {
  return new Worker<SourcingRefreshJobData>(
    SOURCING_REFRESH_QUEUE,
    processSourcingRefreshJob,
    {
      connection,
      concurrency: REFRESH_CONCURRENCY,
      prefix: `{${REDIS_NAMESPACE}}`,
    },
  );
}
