import { Queue } from 'bullmq';
import { getIoRedisConnection } from './aiQueue';

export const SOURCING_REFRESH_QUEUE = 'sourcing-refresh';

const REDIS_URL = process.env.REDIS_URL || '';
const REDIS_NAMESPACE = process.env.NODE_ENV || 'development';
const REFRESH_ENABLED = process.env.SOURCING_REFRESH_ENABLED !== 'false';
const DEFAULT_INITIAL_DELAY_MS = parseInt(
  process.env.SOURCING_REFRESH_INITIAL_DELAY_MS || String(5 * 60 * 1000),
  10,
);
const DEFAULT_RETRY_DELAY_MS = parseInt(
  process.env.SOURCING_REFRESH_BACKOFF_MS || String(5 * 60 * 1000),
  10,
);
const MAX_REFRESH_AGE_MS = parseInt(
  process.env.SOURCING_REFRESH_MAX_AGE_MS || String(6 * 60 * 60 * 1000),
  10,
);
const USER_CONFIGURED_MAX_ATTEMPTS = parseInt(process.env.SOURCING_REFRESH_MAX_ATTEMPTS || '0', 10);

export function deriveSourcingRefreshAttempts(
  maxRefreshAgeMs: number,
  retryDelayMs: number,
  userConfiguredMaxAttempts: number,
): number {
  const retryDelay = Math.max(1000, retryDelayMs);
  const timeoutDerived = Math.ceil(maxRefreshAgeMs / retryDelay) + 2;
  if (userConfiguredMaxAttempts > 0) {
    return Math.max(timeoutDerived, userConfiguredMaxAttempts);
  }
  return timeoutDerived;
}

const DERIVED_MAX_ATTEMPTS = deriveSourcingRefreshAttempts(
  MAX_REFRESH_AGE_MS,
  DEFAULT_RETRY_DELAY_MS,
  USER_CONFIGURED_MAX_ATTEMPTS,
);

export interface SourcingRefreshJobData {
  requestId: string;
}

let refreshQueue: Queue | null = null;

function getRefreshQueue(): Queue {
  if (refreshQueue) {
    return refreshQueue;
  }

  const connection = getIoRedisConnection() as any;
  refreshQueue = new Queue(SOURCING_REFRESH_QUEUE, {
    connection,
    prefix: `{${REDIS_NAMESPACE}}`,
    defaultJobOptions: {
      // Keep retries alive for at least the refresh timeout window.
      attempts: DERIVED_MAX_ATTEMPTS,
      backoff: {
        type: 'fixed',
        delay: Math.max(1000, DEFAULT_RETRY_DELAY_MS),
      },
      removeOnComplete: {
        age: 24 * 60 * 60,
        count: 2000,
      },
      removeOnFail: {
        age: 7 * 24 * 60 * 60,
      },
    },
  });

  return refreshQueue;
}

export function isSourcingRefreshQueueAvailable(): boolean {
  if (!REFRESH_ENABLED || !REDIS_URL) {
    return false;
  }

  try {
    getIoRedisConnection();
    return true;
  } catch {
    return false;
  }
}

export function buildSourcingRefreshJobId(requestId: string): string {
  return `sourcing-refresh:${requestId}`;
}

export async function enqueueSourcingRefresh(
  data: SourcingRefreshJobData,
  opts?: { delayMs?: number },
): Promise<string | null> {
  if (!isSourcingRefreshQueueAvailable()) {
    return null;
  }

  const queue = getRefreshQueue();
  const jobId = buildSourcingRefreshJobId(data.requestId);

  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'completed' || state === 'failed') {
      await existing.remove();
    } else {
      return existing.id as string;
    }
  }

  const job = await queue.add('refresh', data, {
    jobId,
    delay: opts?.delayMs ?? DEFAULT_INITIAL_DELAY_MS,
  });

  return job.id as string;
}

export async function closeSourcingRefreshQueue(): Promise<void> {
  if (refreshQueue) {
    await refreshQueue.close();
    refreshQueue = null;
  }
}
