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
import { eq, and, sql } from 'drizzle-orm';
import {
  webhookEvents,
  jobSourcingRuns,
  jobSourcedCandidates,
  organizations,
  type WebhookStatus,
} from '@shared/schema';
import { verifySignalCallbackJwt } from '../lib/services/jwt-signer';
import { getResults } from '../lib/services/signal-client';
import {
  mapCallbackStatusToRunStatus,
  type SignalCallbackPayload,
  type SignalResultCandidate,
} from '../lib/services/signal-contracts';

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

/**
 * Upsert sourced candidates from Signal results.
 *
 * State-safe: only updates scores/summary when recruiter state is still 'new'.
 * Recruiter actions (shortlisted/hidden/converted) are never overwritten.
 */
async function upsertCandidates(
  organizationId: number,
  jobId: number,
  requestId: string,
  candidates: SignalResultCandidate[],
): Promise<number> {
  let upserted = 0;

  for (const c of candidates) {
    // Build summary from Signal's candidate + snapshot data
    const summary = {
      nameHint: c.candidate.nameHint,
      headlineHint: c.candidate.headlineHint,
      locationHint: c.candidate.locationHint,
      companyHint: c.candidate.companyHint,
      linkedinUrl: c.candidate.linkedinUrl,
      enrichmentStatus: c.candidate.enrichmentStatus,
      confidenceScore: c.candidate.confidenceScore,
      snapshot: c.snapshot,
      rank: c.rank,
    };

    await db.execute(sql`
      INSERT INTO job_sourced_candidates (
        organization_id, job_id, request_id, signal_candidate_id,
        fit_score, fit_breakdown, source_type, state,
        candidate_summary, last_synced_at, created_at, updated_at
      ) VALUES (
        ${organizationId}, ${jobId}, ${requestId}, ${c.candidateId},
        ${c.fitScore}, ${JSON.stringify(c.fitBreakdown)}::jsonb, ${c.sourceType}, 'new',
        ${JSON.stringify(summary)}::jsonb, NOW(), NOW(), NOW()
      )
      ON CONFLICT (job_id, signal_candidate_id) DO UPDATE SET
        fit_score = EXCLUDED.fit_score,
        fit_breakdown = EXCLUDED.fit_breakdown,
        candidate_summary = EXCLUDED.candidate_summary,
        last_synced_at = NOW(),
        updated_at = NOW()
      WHERE job_sourced_candidates.state = 'new'
    `);
    upserted++;
  }

  return upserted;
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

      // 8. If completed/partial, fetch results and upsert candidates
      if (runStatus === 'completed') {
        try {
          const results = await getResults(
            org.signalTenantId,
            run.externalJobId,
            payload.requestId,
          );

          if (results.candidates?.length) {
            await upsertCandidates(
              run.organizationId,
              run.jobId,
              payload.requestId,
              results.candidates,
            );
            candidateCount = results.candidates.length;
          }
        } catch (fetchError: any) {
          console.error(`Failed to fetch Signal results for ${payload.requestId}:`, fetchError.message);
          processError = `Results fetch failed: ${fetchError.message}`;
        }
      }

      // 9. Update run status
      await db.update(jobSourcingRuns)
        .set({
          status: runStatus,
          candidateCount,
          completedAt: new Date(),
          errorMessage: payload.error || processError || null,
          meta: {
            ...(run.meta as Record<string, unknown> || {}),
            callbackStatus: payload.status,
            enrichedCount: payload.enrichedCount,
          },
          updatedAt: new Date(),
        })
        .where(eq(jobSourcingRuns.id, run.id));

      // 10. Finalize webhook event
      await finalizeWebhookEvent(claims.jti, processError ? 'failed' : 'processed', processError);

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
