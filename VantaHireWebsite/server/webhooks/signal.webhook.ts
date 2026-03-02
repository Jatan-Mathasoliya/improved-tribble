/**
 * Signal callback webhook handler.
 *
 * POST /api/webhooks/signal/callback
 *
 * Flow:
 * 1. Verify JWT (iss=signal, aud=vantahire, scopes=callbacks:write)
 * 2. DB-backed replay protection via webhook_events (provider='signal', eventId=jti)
 * 3. Parse SourcingCallbackPayload body
 * 4. Fetch results from Signal /results
 * 5. Upsert candidates with state-safe ON CONFLICT
 * 6. Update run status
 */

import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import {
  webhookEvents,
  jobSourcingRuns,
  organizations,
  type WebhookStatus,
} from '@shared/schema';
import { verifySignalCallbackJwt } from '../lib/services/jwt-signer';
import {
  mapCallbackStatusToRunStatus,
  type SignalCallbackPayload,
} from '../lib/services/signal-contracts';
import { syncSignalResultsIntoVanta } from '../lib/services/sourcing-sync';
import { enqueueSourcingRefresh } from '../lib/sourcingRefreshQueue';

const WEBHOOK_PROVIDER = 'signal';

/**
 * Atomically claim a webhook event for processing.
 * Returns true if this call acquired the lock (inserted successfully).
 * Returns false if another request already claimed it (conflict = already processing/processed).
 */
async function claimWebhookEvent(
  eventId: string,
  eventType: string,
  payload: unknown,
): Promise<boolean> {
  const result = await db.insert(webhookEvents).values({
    provider: WEBHOOK_PROVIDER,
    eventId,
    eventType,
    payload: payload as Record<string, unknown>,
    status: 'processing' as WebhookStatus,
  }).onConflictDoNothing().returning();

  return result.length > 0;
}

/** Update a claimed webhook event's final status. */
async function finalizeWebhookEvent(
  eventId: string,
  status: WebhookStatus,
  errorMessage?: string,
): Promise<void> {
  await db.update(webhookEvents)
    .set({
      status,
      ...(errorMessage ? { errorMessage } : {}),
    })
    .where(and(
      eq(webhookEvents.provider, WEBHOOK_PROVIDER),
      eq(webhookEvents.eventId, eventId),
    ));
}

export function registerSignalWebhook(app: Express) {
  app.post('/api/webhooks/signal/callback', async (req: Request & { rawBody?: string }, res: Response) => {
    let claimedJti: string | null = null;
    try {
      // 1. Extract and verify JWT
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing Authorization header' });
        return;
      }

      const token = authHeader.slice(7);
      let claims;
      try {
        claims = await verifySignalCallbackJwt(token);
      } catch (jwtError: any) {
        console.error('Signal callback JWT verification failed:', jwtError.message);
        res.status(401).json({ error: 'Invalid callback token' });
        return;
      }

      // 2. Parse callback payload (before claiming, so we can validate)
      const payload = req.body as SignalCallbackPayload;
      if (!payload.requestId || !payload.status) {
        res.status(400).json({ error: 'Invalid callback payload' });
        return;
      }

      // 3. Bind JWT claims to body — reject if mismatched
      if (claims.requestId !== payload.requestId) {
        console.error(`Signal callback claim/body mismatch: JWT request_id=${claims.requestId}, body requestId=${payload.requestId}`);
        res.status(400).json({ error: 'JWT claims do not match callback body' });
        return;
      }

      // 4. Atomic claim — insert with status 'processing'; if conflict, already handled
      const claimed = await claimWebhookEvent(claims.jti, 'callback', payload);
      if (claimed) {
        claimedJti = claims.jti;
      }
      if (!claimed) {
        console.log(`Signal callback ${claims.jti} already claimed, skipping`);
        res.json({ success: true, message: 'Already processed' });
        return;
      }

      // 5. Find the sourcing run
      const run = await db.query.jobSourcingRuns.findFirst({
        where: eq(jobSourcingRuns.requestId, payload.requestId),
      });

      if (!run) {
        await finalizeWebhookEvent(claims.jti, 'skipped', `Unknown requestId: ${payload.requestId}`);
        res.status(404).json({ error: 'Unknown request ID' });
        return;
      }

      // 6. Verify tenant binding — ensure callback org matches JWT tenant
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, run.organizationId),
        columns: { signalTenantId: true },
      });

      if (!org?.signalTenantId || org.signalTenantId !== claims.tenantId) {
        console.error(`Signal callback tenant mismatch: JWT tenant_id=${claims.tenantId}, org signal_tenant_id=${org?.signalTenantId}`);
        await finalizeWebhookEvent(claims.jti, 'failed', 'Tenant mismatch');
        res.status(403).json({ error: 'Tenant mismatch' });
        return;
      }

      // 7. Map callback status to run status
      const runStatus = mapCallbackStatusToRunStatus(payload.status);
      let processError: string | undefined;
      let candidateCount = payload.candidateCount || 0;
      let metaPatch: Record<string, unknown> | null = null;
      let refreshJobId: string | null = null;
      let refreshQueueError: string | undefined;
      let enrichmentInProgress = false;

      // 8. If completed/partial, fetch results and upsert candidates
      if (runStatus === 'completed') {
        try {
          const sync = await syncSignalResultsIntoVanta({
            organizationId: run.organizationId,
            jobId: run.jobId,
            requestId: payload.requestId,
            externalJobId: run.externalJobId,
            signalTenantId: org.signalTenantId,
          });

          candidateCount = sync.candidateCount;
          metaPatch = sync.metaPatch;
          enrichmentInProgress = sync.enrichmentProgress.inProgress;

          if (enrichmentInProgress) {
            try {
              refreshJobId = await enqueueSourcingRefresh({ requestId: payload.requestId });
            } catch (enqueueError: any) {
              refreshQueueError = enqueueError?.message || 'Failed to enqueue refresh job';
              console.error(`Failed to enqueue sourcing refresh for ${payload.requestId}:`, refreshQueueError);
            }
          }

          // Always enqueue a single delayed refresh to catch post-callback reranks.
          // Rerank coalescing window is ~90s; 2 min delay gives enough margin.
          if (!enrichmentInProgress && !refreshJobId) {
            try {
              refreshJobId = await enqueueSourcingRefresh(
                { requestId: payload.requestId },
                { delayMs: 120_000 },
              );
            } catch (delayedRefreshError: any) {
              refreshQueueError = delayedRefreshError?.message || 'Failed to enqueue delayed refresh job';
              console.error(`Failed to enqueue delayed sourcing refresh for ${payload.requestId}:`, refreshQueueError);
            }
          }
        } catch (fetchError: any) {
          console.error(`Failed to fetch Signal results for ${payload.requestId}:`, fetchError.message);
          processError = `Results fetch failed: ${fetchError.message}`;
        }
      }

      // 9. Update run status — downgrade to 'failed' if result fetch threw
      const finalStatus = processError ? 'failed' : runStatus;
      const finalCandidateCount = finalStatus === 'failed' ? 0 : candidateCount;
      const runMeta = (run.meta as Record<string, unknown>) || {};
      const priorRefreshMeta = runMeta.enrichmentRefresh && typeof runMeta.enrichmentRefresh === 'object'
        ? runMeta.enrichmentRefresh as Record<string, unknown>
        : {};
      const refreshReason = enrichmentInProgress
        ? 'enrichment_in_progress'
        : refreshJobId
          ? 'post_callback_rerank_sync'
          : null;
      const refreshStatus = !enrichmentInProgress && !refreshJobId
        ? 'completed'
        : refreshJobId
          ? 'scheduled'
          : refreshQueueError
            ? 'stopped_enqueue_error'
            : 'stopped_no_queue';
      const forcedNotInProgressMetaPatch = (refreshStatus === 'stopped_no_queue' || refreshStatus === 'stopped_enqueue_error')
        ? {
            enrichmentProgress: {
              ...(metaPatch?.enrichmentProgress as Record<string, unknown> ?? {}),
              inProgress: false,
            },
          }
        : {};
      const enrichmentRefreshMeta = finalStatus === 'completed'
        ? {
            ...priorRefreshMeta,
            status: refreshStatus,
            reason: refreshReason,
            lastEnqueueAt: new Date().toISOString(),
            queueJobId: refreshJobId,
            ...(refreshQueueError ? { lastEnqueueError: refreshQueueError } : {}),
          }
        : priorRefreshMeta;

      await db.update(jobSourcingRuns)
        .set({
          status: finalStatus,
          candidateCount: finalCandidateCount,
          completedAt: new Date(),
          errorMessage: payload.error || processError || null,
          meta: {
            ...runMeta,
            callbackStatus: payload.status,
            enrichedCount: payload.enrichedCount,
            ...(metaPatch ?? {}),
            ...forcedNotInProgressMetaPatch,
            ...(finalStatus === 'completed' ? { enrichmentRefresh: enrichmentRefreshMeta } : {}),
            ...(processError ? { errorCode: 'RESULTS_FETCH_FAILED' } : {}),
          },
          updatedAt: new Date(),
        })
        .where(eq(jobSourcingRuns.id, run.id));

      // 10. Finalize webhook event
      await finalizeWebhookEvent(claims.jti, finalStatus === 'failed' ? 'failed' : 'processed', processError);

      res.json({ success: true });
    } catch (error: any) {
      console.error('Signal webhook error:', error);
      // Unstick claimed event so retries aren't blocked
      if (claimedJti) {
        try {
          await finalizeWebhookEvent(claimedJti, 'failed', error.message || 'Unhandled error');
        } catch (finalizeError) {
          console.error('Failed to finalize webhook event after error:', finalizeError);
        }
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
