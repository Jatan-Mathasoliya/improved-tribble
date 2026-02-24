/**
 * Signal sourcing routes — recruiter-facing endpoints for candidate discovery.
 *
 * POST /api/jobs/:id/find-candidates  — trigger Signal sourcing
 * GET  /api/jobs/:id/sourcing-status  — poll run status
 * GET  /api/jobs/:id/sourced-candidates — list sourced candidates
 */

import type { Express, Request, Response, NextFunction } from 'express';
import { db } from './db';
import { eq, and, desc, asc } from 'drizzle-orm';
import { jobs, jobSourcingRuns, jobSourcedCandidates, type JobSourcingRun, type JobSourcedCandidate } from '@shared/schema';
import { requireRole } from './auth';
import { requireSeat } from './auth';
import { getUserOrganization, requireSignalTenantId } from './lib/organizationService';
import { sourceJob } from './lib/services/signal-client';
import {
  CONTEXT_HASH_VERSION,
  toDisplayBucket,
  isTerminalStatus,
  flattenCandidateForUI,
  type ContextHashInput,
  type SignalIdentitySummary,
  type SignalSourceRequest,
  type SourcingRunStatus,
} from './lib/services/signal-contracts';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

function normalizeSkillList(skills: unknown): string[] {
  if (!Array.isArray(skills)) {
    return [];
  }
  return skills.filter((skill): skill is string => typeof skill === 'string');
}

function isIdentityDisplayStatus(value: unknown): value is SignalIdentitySummary['displayStatus'] {
  return value === 'verified' || value === 'review' || value === 'weak';
}

function readIdentitySummary(candidateSummary: unknown): SignalIdentitySummary | null {
  if (!candidateSummary || typeof candidateSummary !== 'object') {
    return null;
  }

  const identitySummary = (candidateSummary as { identitySummary?: unknown }).identitySummary;
  if (!identitySummary || typeof identitySummary !== 'object') {
    return null;
  }

  const parsed = identitySummary as { displayStatus?: unknown; platforms?: unknown };
  if (!isIdentityDisplayStatus(parsed.displayStatus)) {
    return null;
  }
  if (!Array.isArray(parsed.platforms) || parsed.platforms.some((p) => typeof p !== 'string')) {
    return null;
  }

  return identitySummary as SignalIdentitySummary;
}

/**
 * Compute deterministic context hash from job fields.
 * Uses jdDigest when available, falls back to raw fields.
 */
function computeContextHash(job: {
  jdDigest: unknown;
  jdDigestVersion: number | null;
  title: string;
  skills: string[] | null;
  goodToHaveSkills: string[] | null;
  location: string;
  experienceYears: number | null;
  educationRequirement: string | null;
}): string {
  const skills = normalizeSkillList(job.skills);
  const goodToHaveSkills = normalizeSkillList(job.goodToHaveSkills);

  const input: ContextHashInput = {
    jdDigest: (job.jdDigest as Record<string, unknown>) ?? null,
    jdDigestVersion: job.jdDigestVersion ?? null,
    title: job.title,
    skills,
    goodToHaveSkills,
    location: job.location,
    experienceYears: job.experienceYears ?? null,
    educationRequirement: job.educationRequirement ?? null,
    contextVersion: CONTEXT_HASH_VERSION,
  };

  // Canonical JSON: sorted keys for determinism
  const canonical = JSON.stringify(input, Object.keys(input).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

export function registerSignalRoutes(app: Express, csrfProtection: any) {

  /**
   * POST /api/jobs/:id/find-candidates
   *
   * Triggers a Signal sourcing run for the given job.
   * - Fail-fast if org has no signal_tenant_id.
   * - Context hash dedupe: returns existing run if one is active with same hash.
   * - Creates run record, calls Signal /source, updates run status.
   */
  app.post('/api/jobs/:id/find-candidates', csrfProtection, requireRole(['recruiter', 'super_admin']), requireSeat(), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jobId = parseInt(req.params.id || '', 10);
      if (isNaN(jobId)) {
        res.status(400).json({ error: 'Invalid job ID' });
        return;
      }

      // Get org context
      const orgResult = await getUserOrganization(req.user!.id);
      if (!orgResult) {
        res.status(403).json({ error: 'Organization required', code: 'NO_ORGANIZATION' });
        return;
      }
      const org = orgResult.organization;

      // Fail-fast: require Signal integration
      const signalTenantId = await requireSignalTenantId(org.id);

      // Verify job exists and belongs to org
      const job = await db.query.jobs.findFirst({
        where: and(eq(jobs.id, jobId), eq(jobs.organizationId, org.id)),
      });
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const externalJobId = `vanta:jobs:${job.id}`;
      const contextHash = computeContextHash(job);

      // Check for existing active (non-terminal) run with same context
      const existingRun = await db.query.jobSourcingRuns.findFirst({
        where: and(
          eq(jobSourcingRuns.organizationId, org.id),
          eq(jobSourcingRuns.externalJobId, externalJobId),
          eq(jobSourcingRuns.contextHash, contextHash),
        ),
        orderBy: desc(jobSourcingRuns.createdAt),
      });

      if (existingRun && !isTerminalStatus(existingRun.status as SourcingRunStatus)) {
        // Dedupe: return existing active run
        res.status(200).json({
          success: true,
          requestId: existingRun.requestId,
          status: existingRun.status,
          idempotent: true,
        });
        return;
      }

      // Build callback URL
      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      const callbackUrl = `${baseUrl}/api/webhooks/signal/callback`;

      // Build Signal request
      const sourceRequest: SignalSourceRequest = {
        jobContext: {
          jdDigest: job.jdDigest ? JSON.stringify(job.jdDigest) : '',
          title: job.title,
          skills: normalizeSkillList(job.skills),
          goodToHaveSkills: normalizeSkillList(job.goodToHaveSkills),
          location: job.location,
          experienceYears: job.experienceYears ?? undefined,
          education: job.educationRequirement ?? undefined,
        },
        callbackUrl,
      };

      // Call Signal first to get canonical requestId before persisting
      let signalResponse;
      try {
        signalResponse = await sourceJob(signalTenantId, externalJobId, sourceRequest);
      } catch (signalError: any) {
        throw signalError;
      }

      // If Signal returned an existing requestId we already have, return it
      const existingByRequestId = await db.query.jobSourcingRuns.findFirst({
        where: eq(jobSourcingRuns.requestId, signalResponse.requestId),
      });

      if (existingByRequestId) {
        res.status(200).json({
          success: true,
          requestId: existingByRequestId.requestId,
          status: existingByRequestId.status,
          candidateCount: existingByRequestId.candidateCount,
          idempotent: true,
        });
        return;
      }

      // Persist run with Signal's canonical requestId (upsert-safe)
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      try {
        await db.insert(jobSourcingRuns).values({
          organizationId: org.id,
          jobId: job.id,
          requestId: signalResponse.requestId,
          externalJobId,
          status: 'submitted',
          contextHash,
          callbackUrl,
          expiresAt,
          submittedAt: new Date(),
        });
      } catch (insertError: any) {
        // 23505 = unique_violation — concurrent request already inserted this requestId
        if (insertError.code === '23505') {
          const conflictRun = await db.query.jobSourcingRuns.findFirst({
            where: eq(jobSourcingRuns.requestId, signalResponse.requestId),
          });
          if (conflictRun) {
            res.status(200).json({
              success: true,
              requestId: conflictRun.requestId,
              status: conflictRun.status,
              candidateCount: conflictRun.candidateCount,
              idempotent: true,
            });
            return;
          }
        }
        throw insertError;
      }

      res.status(202).json({
        success: true,
        requestId: signalResponse.requestId,
        status: 'submitted',
        idempotent: signalResponse.idempotent,
      });
    } catch (error: any) {
      if (error.message?.includes('no Signal integration configured')) {
        res.status(400).json({
          error: 'Signal integration not configured',
          code: 'NO_SIGNAL_TENANT',
          message: 'Set signal_tenant_id in organization settings to enable candidate sourcing.',
        });
        return;
      }
      next(error);
    }
  });

  /**
   * GET /api/jobs/:id/sourcing-status
   *
   * Returns the latest sourcing run status for a job.
   * Frontend polls this every 7s until terminal status or 10m timeout.
   */
  app.get('/api/jobs/:id/sourcing-status', requireRole(['recruiter', 'super_admin']), requireSeat(), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jobId = parseInt(req.params.id || '', 10);
      if (isNaN(jobId)) {
        res.status(400).json({ error: 'Invalid job ID' });
        return;
      }

      const orgResult = await getUserOrganization(req.user!.id);
      if (!orgResult) {
        res.status(403).json({ error: 'Organization required', code: 'NO_ORGANIZATION' });
        return;
      }

      const latestRun = await db.query.jobSourcingRuns.findFirst({
        where: and(
          eq(jobSourcingRuns.organizationId, orgResult.organization.id),
          eq(jobSourcingRuns.jobId, jobId),
        ),
        orderBy: desc(jobSourcingRuns.createdAt),
      });

      if (!latestRun) {
        res.json({ hasRun: false });
        return;
      }

      res.json({
        hasRun: true,
        requestId: latestRun.requestId,
        status: latestRun.status,
        candidateCount: latestRun.candidateCount,
        submittedAt: latestRun.submittedAt,
        completedAt: latestRun.completedAt,
        errorMessage: latestRun.status === 'failed' ? latestRun.errorMessage : undefined,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/jobs/:id/sourced-candidates
   *
   * Returns sourced candidates for a job, grouped by UI display bucket.
   * Stores raw Signal sourceType; derives talent_pool vs newly_discovered at read time.
   */
  app.get('/api/jobs/:id/sourced-candidates', requireRole(['recruiter', 'super_admin']), requireSeat(), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jobId = parseInt(req.params.id || '', 10);
      if (isNaN(jobId)) {
        res.status(400).json({ error: 'Invalid job ID' });
        return;
      }

      const orgResult = await getUserOrganization(req.user!.id);
      if (!orgResult) {
        res.status(403).json({ error: 'Organization required', code: 'NO_ORGANIZATION' });
        return;
      }

      const candidates: JobSourcedCandidate[] = await db.query.jobSourcedCandidates.findMany({
        where: and(
          eq(jobSourcedCandidates.organizationId, orgResult.organization.id),
          eq(jobSourcedCandidates.jobId, jobId),
        ),
        orderBy: [desc(jobSourcedCandidates.fitScore), asc(jobSourcedCandidates.id)],
      });

      // Flatten to UI shape with deterministic sort (fitScore desc, id asc)
      const enriched = candidates.map((c: JobSourcedCandidate) => flattenCandidateForUI(c));

      const counts = {
        total: enriched.length,
        talentPool: enriched.filter((c) => c.displayBucket === 'talent_pool').length,
        newlyDiscovered: enriched.filter((c) => c.displayBucket === 'newly_discovered').length,
      };

      // Grouping metadata for UI clarity (strict-vs-broader).
      const hasExplicitTier = enriched.some((c) => c.matchTier === 'best_matches' || c.matchTier === 'broader_pool');
      const hasLocationMatchType = enriched.some((c) => !!c.locationMatchType);

      let bestMatches = enriched.length;
      let broaderPool = 0;

      if (hasExplicitTier) {
        bestMatches = enriched.filter((c) => c.matchTier !== 'broader_pool').length;
        broaderPool = enriched.filter((c) => c.matchTier === 'broader_pool').length;
      } else if (hasLocationMatchType) {
        bestMatches = enriched.filter((c) => c.locationMatchType !== 'none').length;
        broaderPool = enriched.filter((c) => c.locationMatchType === 'none').length;
      }

      res.json({
        candidates: enriched,
        counts,
        groupCounts: { bestMatches, broaderPool },
        expansionReason: broaderPool > 0 ? 'expanded_location_results' : null,
        requestedLocation: null,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/jobs/:id/sourced-candidates/:candidateId
   *
   * Update candidate state (shortlist/hide/unhide).
   * Blocks updates while the candidate's sourcing run is still active.
   */
  const patchStateSchema = z.object({
    state: z.enum(['new', 'shortlisted', 'hidden']),
  });

  app.patch('/api/jobs/:id/sourced-candidates/:candidateId', csrfProtection, requireRole(['recruiter', 'super_admin']), requireSeat(), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jobId = parseInt(req.params.id || '', 10);
      const candidateId = parseInt(req.params.candidateId || '', 10);
      if (isNaN(jobId) || isNaN(candidateId)) {
        res.status(400).json({ error: 'Invalid job ID or candidate ID' });
        return;
      }

      const parseResult = patchStateSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: 'Invalid body', details: parseResult.error.flatten() });
        return;
      }
      const { state: newState } = parseResult.data;

      const orgResult = await getUserOrganization(req.user!.id);
      if (!orgResult) {
        res.status(403).json({ error: 'Organization required', code: 'NO_ORGANIZATION' });
        return;
      }

      // Fetch candidate — verify it belongs to org + job
      const candidate = await db.query.jobSourcedCandidates.findFirst({
        where: and(
          eq(jobSourcedCandidates.id, candidateId),
          eq(jobSourcedCandidates.jobId, jobId),
          eq(jobSourcedCandidates.organizationId, orgResult.organization.id),
        ),
      });

      if (!candidate) {
        res.status(404).json({ error: 'Candidate not found' });
        return;
      }

      // Block updates while the candidate's sourcing run is still active
      const run = await db.query.jobSourcingRuns.findFirst({
        where: eq(jobSourcingRuns.requestId, candidate.requestId),
      });
      if (run && !isTerminalStatus(run.status as SourcingRunStatus)) {
        res.status(409).json({
          error: 'Cannot update candidate while sourcing run is still active',
          code: 'RUN_NOT_TERMINAL',
        });
        return;
      }

      // Reject transition to 'converted' (separate flow)
      const currentState = candidate.state;
      if (currentState === 'converted') {
        res.status(400).json({ error: 'Cannot update converted candidates' });
        return;
      }

      if (currentState === newState) {
        // No-op — return current state
        res.json({ success: true, id: candidate.id, state: newState });
        return;
      }

      await db
        .update(jobSourcedCandidates)
        .set({ state: newState, updatedAt: new Date() })
        .where(eq(jobSourcedCandidates.id, candidateId));

      res.json({ success: true, id: candidate.id, state: newState });
    } catch (error) {
      next(error);
    }
  });
}
