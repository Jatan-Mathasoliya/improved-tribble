/**
 * Candidate Semantic Search & Move Routes
 *
 * POST /api/candidates/semantic-search  — search org candidates via ActiveKG
 * POST /api/candidates/move-to-job      — clone a candidate application to another job
 */

import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireRole, requireSeat } from './auth';
import { getUserOrganization } from './lib/organizationService';
import { storage } from './storage';
import { resolveActiveKGTenantId } from './lib/activekgTenant';
import { getSearchDefaults } from './lib/activekgSearchConfig';
import { search as activekgSearch, type ActiveKGSearchResult } from './lib/services/activekg-client';
import { getSignedDownloadUrl } from './gcs-storage';
import type { CsrfMiddleware } from './types/routes';
import { db } from './db';
import { applicationStageHistory } from '@shared/schema';

// ── Validation schemas ─────────────────────────────────────────────

const semanticSearchSchema = z.object({
  query: z.string().min(1).max(2000),
  top_k: z.number().int().min(1).max(100).optional(),
  use_reranker: z.boolean().optional(),
  metadata_filters: z.record(z.unknown()).optional(),
});

const moveToJobSchema = z.object({
  sourceApplicationId: z.number().int().positive().optional(),
  applicationId: z.number().int().positive().optional(), // backward-compat alias
  targetJobId: z.number().int().positive(),
  targetStageId: z.number().int().positive().optional(),
  notes: z.string().max(2000).optional(),
  searchQuery: z.string().max(2000).optional(),
}).refine((v) => Boolean(v.sourceApplicationId ?? v.applicationId), {
  message: 'sourceApplicationId (or applicationId) is required',
  path: ['sourceApplicationId'],
});

// ── Helpers ────────────────────────────────────────────────────────

interface GroupedResult {
  applicationId: number;
  bestScore: number;
  matchedChunks: number;
  highlights: string[];
}

/**
 * Group ActiveKG search results by application_id, keeping the best
 * similarity score and collecting highlight snippets per application.
 */
function groupByApplication(results: ActiveKGSearchResult[]): GroupedResult[] {
  const map = new Map<number, GroupedResult>();

  for (const r of results) {
    const appId = Number(r.metadata?.application_id ?? r.props?.application_id);
    if (!Number.isFinite(appId) || appId <= 0) continue;

    const existing = map.get(appId);
    const snippet = String(r.props?.text ?? r.props?.chunk_text ?? '').slice(0, 300);

    if (existing) {
      if (r.similarity > existing.bestScore) {
        existing.bestScore = r.similarity;
      }
      existing.matchedChunks += 1;
      if (snippet && !existing.highlights.includes(snippet) && existing.highlights.length < 3) {
        existing.highlights.push(snippet);
      }
    } else {
      map.set(appId, {
        applicationId: appId,
        bestScore: r.similarity,
        matchedChunks: 1,
        highlights: snippet ? [snippet] : [],
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.bestScore - a.bestScore);
}

// ── Route registration ─────────────────────────────────────────────

export function registerCandidateSemanticRoutes(
  app: Express,
  csrfProtection: CsrfMiddleware,
) {
  /**
   * POST /api/candidates/semantic-search
   *
   * Search the recruiter's org candidates via ActiveKG vector search.
   * Returns hydrated application rows with match scores and highlights.
   */
  app.post(
    '/api/candidates/semantic-search',
    requireRole(['recruiter', 'super_admin']),
    requireSeat(),
    csrfProtection,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // ── Auth & org ─────────────────────────────────────────
        const orgResult = await getUserOrganization(req.user!.id);
        if (!orgResult) {
          res.status(403).json({ error: 'You must belong to an organization' });
          return;
        }
        const orgId = orgResult.organization.id;

        // ── Validate body ──────────────────────────────────────
        const parsed = semanticSearchSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
          return;
        }
        const { query, top_k, use_reranker, metadata_filters } = parsed.data;

        // ── Resolve config ─────────────────────────────────────
        const tenantId = resolveActiveKGTenantId(orgId);
        const defaults = getSearchDefaults();

        // ── Check feature gate ─────────────────────────────────
        if (!process.env.ACTIVEKG_BASE_URL) {
          res.status(503).json({ error: 'Semantic search is not configured' });
          return;
        }

        // ── Call ActiveKG /search ──────────────────────────────
        const searchResponse = await activekgSearch(tenantId, {
          query,
          top_k: top_k ?? defaults.topK,
          use_hybrid: defaults.mode === 'hybrid',
          use_reranker: use_reranker ?? defaults.useReranker,
          tenant_id: tenantId,
          metadata_filters: {
            ...metadata_filters,
            source: 'vantahire',
            org_id: orgId,
          },
        });

        // ── Group by application ───────────────────────────────
        const grouped = groupByApplication(searchResponse.results);
        if (grouped.length === 0) {
          res.json({ candidates: [], total: 0 });
          return;
        }

        // ── Hydrate applications (org-scoped) ──────────────────
        const appIds = grouped.map((g) => g.applicationId);
        const apps = await storage.getApplicationsByIdsForOrg(appIds, orgId);
        const appMap = new Map(apps.map((a) => [a.id, a]));
        const jobIds = Array.from(new Set(apps.map((a) => a.jobId)));
        const jobs = await storage.getJobsByIds(jobIds);
        const jobMap = new Map(jobs.map((j) => [j.id, j]));
        const stages = await storage.getPipelineStages(orgId);
        const stageMap = new Map(stages.map((s) => [s.id, s]));

        // ── Build response, generate signed resume URLs ────────
        const results = [];
        for (const g of grouped) {
          const app = appMap.get(g.applicationId);
          if (!app) continue; // filtered out by org isolation

          let signedResumeUrl: string | null = null;
          if (app.resumeUrl?.startsWith('gs://')) {
            try {
              signedResumeUrl = await getSignedDownloadUrl(
                app.resumeUrl,
                app.resumeFilename,
                defaults.signedUrlMinutes,
              );
            } catch {
              // non-blocking — leave null
            }
          }

          const stage = app.currentStage ? stageMap.get(app.currentStage) : undefined;
          const job = jobMap.get(app.jobId);
          const expiresAt = signedResumeUrl
            ? new Date(Date.now() + defaults.signedUrlMinutes * 60_000).toISOString()
            : null;

          results.push({
            applicationId: app.id,
            name: app.name,
            email: app.email,
            phone: app.phone,
            currentJobId: app.jobId,
            currentJobTitle: job?.title ?? null,
            currentStageId: app.currentStage ?? null,
            currentStageName: stage?.name ?? null,
            matchScore: Math.round(g.bestScore * 100),
            matchedChunks: g.matchedChunks,
            highlights: g.highlights,
            resume: {
              resumeFilename: app.resumeFilename ?? null,
              signedUrl: signedResumeUrl,
              expiresAt,
            },
          });
        }

        // Keep both shapes for backward compatibility with in-flight clients.
        res.json({
          query,
          count: results.length,
          results,
          candidates: results,
          total: results.length,
        });
        return;
      } catch (error) {
        console.error('[SEMANTIC_SEARCH] Error:', error);
        next(error);
      }
    },
  );

  /**
   * POST /api/candidates/move-to-job
   *
   * Clone an application to a different job (within the same org).
   * Deduplicates by target job + email. Enqueues ActiveKG sync for the clone.
   */
  app.post(
    '/api/candidates/move-to-job',
    requireRole(['recruiter', 'super_admin']),
    requireSeat(),
    csrfProtection,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // ── Auth & org ─────────────────────────────────────────
        const orgResult = await getUserOrganization(req.user!.id);
        if (!orgResult) {
          res.status(403).json({ error: 'You must belong to an organization' });
          return;
        }
        const orgId = orgResult.organization.id;

        // ── Validate body ──────────────────────────────────────
        const parsed = moveToJobSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
          return;
        }
        const sourceApplicationId = parsed.data.sourceApplicationId ?? parsed.data.applicationId!;
        const { targetJobId, targetStageId, notes, searchQuery } = parsed.data;

        // ── Load source application (org-scoped) ───────────────
        const [sourceApp] = await storage.getApplicationsByIdsForOrg([sourceApplicationId], orgId);
        if (!sourceApp) {
          res.status(404).json({ error: 'Application not found in your organization' });
          return;
        }

        // ── Validate target job belongs to same org ────────────
        const [targetJob] = await storage.getJobsByIds([targetJobId]);
        if (!targetJob || targetJob.organizationId !== orgId) {
          res.status(404).json({ error: 'Target job not found in your organization' });
          return;
        }

        // ── Dedupe: check if candidate already applied to target job
        const existing = await storage.findApplicationByJobAndEmail(targetJobId, sourceApp.email);
        if (existing) {
          res.status(200).json({
            success: true,
            existing: true,
            applicationId: existing.id,
          });
          return;
        }

        // ── Resolve initial pipeline stage for target job ──────
        let initialStageId: number | null = null;
        let moveNotes = notes;
        try {
          const stages = await storage.getPipelineStages(orgId);
          if (stages.length > 0) {
            if (targetStageId) {
              const explicit = stages.find((s) => s.id === targetStageId);
              if (!explicit) {
                res.status(400).json({ error: 'Invalid targetStageId for your organization' });
                return;
              }
              initialStageId = explicit.id;
            } else {
              const defaultStage = stages.find((s) => s.isDefault);
              initialStageId = (defaultStage ?? stages[0]!).id;
            }
          }
        } catch {
          // non-blocking
        }

        if (!moveNotes) {
          moveNotes = 'Moved from another job via semantic search';
        }

        const now = new Date();

        // ── Clone application ──────────────────────────────────
        const cloned = await storage.createApplication({
          name: sourceApp.name,
          email: sourceApp.email,
          phone: sourceApp.phone,
          jobId: targetJobId,
          resumeUrl: sourceApp.resumeUrl,
          whatsappConsent: true,
          resumeFilename: sourceApp.resumeFilename,
          coverLetter: sourceApp.coverLetter ?? undefined,
          submittedByRecruiter: true,
          createdByUserId: req.user!.id,
          source: 'internal_move',
          sourceMetadata: {
            movedFromApplicationId: sourceApp.id,
            movedFromJobId: sourceApp.jobId,
            movedByUserId: req.user!.id,
            movedAt: now.toISOString(),
            semanticQuery: searchQuery ?? null,
            notes: notes ?? null,
          },
          organizationId: orgId,
          ...(initialStageId !== null && {
            currentStage: initialStageId,
            stageChangedAt: now,
            stageChangedBy: req.user!.id,
          }),
        });

        // ── Record stage history if initial stage assigned ──────
        if (initialStageId !== null) {
          try {
            await db.insert(applicationStageHistory).values({
              applicationId: cloned.id,
              fromStage: null,
              toStage: initialStageId,
              changedBy: req.user!.id,
              notes: moveNotes,
            });
          } catch {
            // non-blocking
          }
        }

        // ── Enqueue ActiveKG sync for the clone (non-blocking) ─
        if (process.env.ACTIVEKG_SYNC_ENABLED === 'true') {
          try {
            const tenantId = resolveActiveKGTenantId(orgId);
            await storage.enqueueApplicationGraphSyncJob({
              applicationId: cloned.id,
              organizationId: orgId,
              jobId: targetJobId,
              effectiveRecruiterId: req.user!.id,
              activekgTenantId: tenantId,
            });
          } catch (syncErr) {
            console.error('[SEMANTIC_MOVE] Failed to enqueue graph sync:', {
              clonedApplicationId: cloned.id,
              error: syncErr,
            });
          }
        }

        res.status(201).json({
          success: true,
          existing: false,
          applicationId: cloned.id,
        });
        return;
      } catch (error) {
        console.error('[SEMANTIC_MOVE] Error:', error);
        next(error);
      }
    },
  );
}
