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
import { getTenantStrategy, resolveActiveKGTenantId } from './lib/activekgTenant';
import { getSearchDefaults } from './lib/activekgSearchConfig';
import { search as activekgSearch, type ActiveKGSearchResult } from './lib/services/activekg-client';
import { getSignedDownloadUrl, getSignedViewUrl, downloadFromGCS } from './gcs-storage';
import type { CsrfMiddleware } from './types/routes';
import { db } from './db';
import { applicationStageHistory, applications, organizations, type Application } from '@shared/schema';
import { inArray } from 'drizzle-orm';

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

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getResumeContentType(filename?: string | null): string {
  const lower = (filename ?? '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.doc')) return 'application/msword';
  return 'application/octet-stream';
}

function extractGsPathFromGcsId(raw: string): string | null {
  // ActiveKG GCS connector IDs commonly look like:
  // gcs:<tenant>:<bucket>/<object> or gcs:<bucket>/<object>
  if (!raw.startsWith('gcs:')) return null;
  const parts = raw.split(':');
  if (parts.length >= 3) {
    const bucketAndObject = parts.slice(2).join(':');
    const slashIdx = bucketAndObject.indexOf('/');
    if (slashIdx > 0) {
      const bucket = bucketAndObject.slice(0, slashIdx);
      const object = bucketAndObject.slice(slashIdx + 1);
      if (bucket && object) return `gs://${bucket}/${object}`;
    }
  }
  if (parts.length === 2) {
    const bucketAndObject = parts[1]!;
    const slashIdx = bucketAndObject.indexOf('/');
    if (slashIdx > 0) {
      const bucket = bucketAndObject.slice(0, slashIdx);
      const object = bucketAndObject.slice(slashIdx + 1);
      if (bucket && object) return `gs://${bucket}/${object}`;
    }
  }
  return null;
}

// ── Route registration ─────────────────────────────────────────────

export function registerCandidateSemanticRoutes(
  app: Express,
  csrfProtection: CsrfMiddleware,
) {
  app.get(
    '/api/candidates/external-resume',
    requireRole(['recruiter', 'super_admin']),
    requireSeat({ allowNoOrg: true }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const locatorRaw = typeof req.query.locator === 'string' ? req.query.locator : '';
        const filenameRaw = typeof req.query.filename === 'string' ? req.query.filename : 'resume.pdf';
        const download = req.query.download === '1';

        if (!locatorRaw || !locatorRaw.startsWith('gs://')) {
          res.status(400).json({ error: 'Invalid external resume locator' });
          return;
        }

        const buffer = await downloadFromGCS(locatorRaw);
        const safeFilename = filenameRaw.replace(/[^a-zA-Z0-9._-]/g, '_') || 'resume.pdf';

        res.setHeader('Content-Type', getResumeContentType(safeFilename));
        res.setHeader(
          'Content-Disposition',
          `${download ? 'attachment' : 'inline'}; filename="${safeFilename}"`,
        );
        res.status(200).send(buffer);
        return;
      } catch (error) {
        console.error('[EXTERNAL_RESUME] Error:', error);
        next(error);
      }
    },
  );

  /**
   * POST /api/candidates/semantic-search
   *
   * Search the recruiter's org candidates via ActiveKG vector search.
   * Returns hydrated application rows with match scores and highlights.
   */
  app.post(
    '/api/candidates/semantic-search',
    requireRole(['recruiter', 'super_admin']),
    requireSeat({ allowNoOrg: true }),
    csrfProtection,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // ── Auth & org ─────────────────────────────────────────
        const orgResult = await getUserOrganization(req.user!.id);
        const isSuperAdmin = req.user!.role === 'super_admin';
        const isSuperAdminGlobalSearch = isSuperAdmin;

        if (!orgResult && !isSuperAdminGlobalSearch) {
          res.status(403).json({ error: 'You must belong to an organization' });
          return;
        }
        const orgId = orgResult?.organization.id;

        // ── Validate body ──────────────────────────────────────
        const parsed = semanticSearchSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
          return;
        }
        const { query, top_k, use_reranker, metadata_filters } = parsed.data;

        // ── Resolve config ─────────────────────────────────────
        const tenantId = orgId != null ? resolveActiveKGTenantId(orgId) : 'default';
        const defaults = getSearchDefaults();

        // ── Check feature gate ─────────────────────────────────
        if (!process.env.ACTIVEKG_BASE_URL) {
          res.status(503).json({ error: 'Semantic search is not configured' });
          return;
        }

        // ── Call ActiveKG /search ──────────────────────────────
        const searchPayloadBase = {
          query,
          top_k: top_k ?? defaults.topK,
          use_hybrid: defaults.mode === 'hybrid',
          use_reranker: use_reranker ?? defaults.useReranker,
        };
        const superAdminSearchPayload = {
          ...searchPayloadBase,
          top_k: 100,
          use_reranker: false,
        };

        let activekgResults: ActiveKGSearchResult[] = [];
        const strategy = getTenantStrategy();
        if (isSuperAdminGlobalSearch) {
          if (strategy === 'org_scoped') {
            const orgRows = await db.select({ id: organizations.id }).from(organizations) as Array<{ id: number }>;
            const tenantIds: string[] = orgRows.map((row) => resolveActiveKGTenantId(row.id));
            // Compatibility: include shared default tenant to surface legacy indexed data.
            tenantIds.push('default');
            const uniqueTenantIds: string[] = Array.from(new Set(tenantIds));

            if (uniqueTenantIds.length > 0) {
              const responses = await Promise.all(
                uniqueTenantIds.map((tenant) =>
                  activekgSearch(tenant, {
                    ...superAdminSearchPayload,
                    tenant_id: tenant,
                    ...(metadata_filters && { metadata_filters }),
                  }),
                ),
              );
              activekgResults = responses.flatMap((r) => r.results);
            }
          } else {
            const response = await activekgSearch(tenantId, {
              ...superAdminSearchPayload,
              tenant_id: tenantId,
              ...(metadata_filters && { metadata_filters }),
            });
            activekgResults = response.results;
          }
        } else {
          const response = await activekgSearch(tenantId, {
            ...searchPayloadBase,
            tenant_id: tenantId,
            metadata_filters: {
              ...metadata_filters,
              source: 'vantahire',
              org_id: orgId,
            },
          });
          activekgResults = response.results;

          // Compatibility fallback for mixed deployments:
          // if org-scoped is configured but data still exists only in shared tenant,
          // do a second search against default and merge results.
          if (strategy === 'org_scoped' && tenantId !== 'default' && activekgResults.length === 0) {
            const legacyResponse = await activekgSearch('default', {
              ...searchPayloadBase,
              tenant_id: 'default',
              metadata_filters: {
                ...metadata_filters,
                source: 'vantahire',
                org_id: orgId,
              },
            });
            activekgResults = legacyResponse.results;
          }
        }

        // ── Group by application ───────────────────────────────
        const grouped = groupByApplication(activekgResults);
        if (!isSuperAdminGlobalSearch && grouped.length === 0) {
          res.json({
            query,
            count: 0,
            results: [],
            candidates: [],
            total: 0,
          });
          return;
        }

        // ── Hydrate applications ───────────────────────────────
        const appIds = grouped.map((g) => g.applicationId);
        let apps: Application[] = [];
        if (appIds.length > 0) {
          apps = isSuperAdminGlobalSearch
            ? await db.select().from(applications).where(inArray(applications.id, appIds))
            : await storage.getApplicationsByIdsForOrg(appIds, orgId!);
        }
        const appMap = new Map(apps.map((a) => [a.id, a]));
        const jobIds = Array.from(new Set(apps.map((a) => a.jobId)));
        const jobs = await storage.getJobsByIds(jobIds);
        const jobMap = new Map(jobs.map((j) => [j.id, j]));
        const stageMap = new Map<number, { name: string }>();
        if (isSuperAdminGlobalSearch) {
          const orgIds = Array.from(new Set(apps.map((a) => a.organizationId).filter((id): id is number => id != null)));
          const stageLists = await Promise.all(orgIds.map((id) => storage.getPipelineStages(id)));
          for (const list of stageLists) {
            for (const stage of list) {
              stageMap.set(stage.id, { name: stage.name });
            }
          }
        } else {
          const stages = await storage.getPipelineStages(orgId!);
          for (const stage of stages) {
            stageMap.set(stage.id, { name: stage.name });
          }
        }

        // ── Build response, generate signed resume URLs ────────
        const results: Array<Record<string, unknown>> = [];
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
                previewUrl: null,
                signedUrl: signedResumeUrl,
                locator: app.resumeUrl ?? null,
                expiresAt,
              },
            source: 'vantahire',
            isExternal: false,
            canMoveToJob: true,
            canOpenResume: Boolean(app.resumeUrl),
          });
        }

        // For super_admin global search, include non-VantaHire/non-application hits too.
        if (isSuperAdminGlobalSearch) {
          const externalMap = new Map<string, {
            bestScore: number;
            matchedChunks: number;
            highlights: string[];
            sample: ActiveKGSearchResult;
          }>();

          for (const r of activekgResults) {
            const appId = Number(r.metadata?.application_id ?? r.props?.application_id);
            if (Number.isFinite(appId) && appId > 0 && appMap.has(appId)) {
              continue;
            }

            const key = Number.isFinite(appId) && appId > 0 ? `app:${appId}` : `node:${r.id}`;
            const snippet = String(r.props?.text ?? r.props?.chunk_text ?? '').slice(0, 300);
            const existing = externalMap.get(key);

            if (existing) {
              if (r.similarity > existing.bestScore) existing.bestScore = r.similarity;
              existing.matchedChunks += 1;
              if (snippet && !existing.highlights.includes(snippet) && existing.highlights.length < 3) {
                existing.highlights.push(snippet);
              }
            } else {
              externalMap.set(key, {
                bestScore: r.similarity,
                matchedChunks: 1,
                highlights: snippet ? [snippet] : [],
                sample: r,
              });
            }
          }

          let syntheticId = -1;
          const externalSorted = Array.from(externalMap.values()).sort((a, b) => b.bestScore - a.bestScore);
          for (const item of externalSorted) {
            const props = (item.sample.props ?? {}) as Record<string, unknown>;
            const metadata = (item.sample.metadata ?? {}) as Record<string, unknown>;

            const name =
              asNonEmptyString(props.name) ??
              asNonEmptyString(props.full_name) ??
              asNonEmptyString(props.title) ??
              asNonEmptyString(metadata.name) ??
              'External Candidate';

            const email =
              asNonEmptyString(props.email) ??
              asNonEmptyString(props.contact_email) ??
              asNonEmptyString(metadata.email);

            const phone =
              asNonEmptyString(props.phone) ??
              asNonEmptyString(props.mobile) ??
              asNonEmptyString(metadata.phone);

            const externalResumeUrl =
              asNonEmptyString(props.resume_url) ??
              asNonEmptyString(props.url) ??
              asNonEmptyString(metadata.url);
            const gcsBucket =
              asNonEmptyString(props.bucket) ??
              asNonEmptyString(metadata.bucket);
            const gcsObject =
              asNonEmptyString(props.object) ??
              asNonEmptyString(metadata.object);
            const derivedGsUrl = gcsBucket && gcsObject ? `gs://${gcsBucket}/${gcsObject}` : null;
            const externalResumeFilename =
              asNonEmptyString(props.resume_filename) ??
              asNonEmptyString(metadata.resume_filename) ??
              asNonEmptyString(props.title) ??
              asNonEmptyString(metadata.title);
            const gcsFromParent =
              extractGsPathFromGcsId(asNonEmptyString(props.parent_id) ?? '') ??
              extractGsPathFromGcsId(asNonEmptyString(metadata.parent_id) ?? '');
            const gcsFromExternalId =
              extractGsPathFromGcsId(asNonEmptyString(props.external_id) ?? '') ??
              extractGsPathFromGcsId(asNonEmptyString(metadata.external_id) ?? '');
            const gcsFromSourceFile =
              asNonEmptyString(props.source_file)?.startsWith('gs://')
                ? asNonEmptyString(props.source_file)
                : asNonEmptyString(metadata.source_file)?.startsWith('gs://')
                  ? asNonEmptyString(metadata.source_file)
                  : null;

            let safeExternalResumeUrl: string | null = null;
            let safeExternalPreviewUrl: string | null = null;
            const candidateResumeLocator =
              externalResumeUrl ?? derivedGsUrl ?? gcsFromParent ?? gcsFromExternalId ?? gcsFromSourceFile;
            if (candidateResumeLocator) {
              if (/^https?:\/\//i.test(candidateResumeLocator)) {
                safeExternalResumeUrl = candidateResumeLocator;
                safeExternalPreviewUrl = candidateResumeLocator;
              } else if (candidateResumeLocator.startsWith('gs://')) {
                try {
                  safeExternalPreviewUrl = await getSignedViewUrl(
                    candidateResumeLocator,
                    defaults.signedUrlMinutes,
                  );
                  safeExternalResumeUrl = await getSignedDownloadUrl(
                    candidateResumeLocator,
                    externalResumeFilename,
                    defaults.signedUrlMinutes,
                  );
                } catch {
                  // Non-blocking: keep null if signing fails
                }
              }
            }

            results.push({
              applicationId: syntheticId--,
              name,
              email,
              phone,
              currentJobId: null,
              currentJobTitle: null,
              currentStageId: null,
              currentStageName: null,
              matchScore: Math.round(item.bestScore * 100),
              matchedChunks: item.matchedChunks,
              highlights: item.highlights,
              resume: {
                resumeFilename: externalResumeFilename,
                previewUrl: safeExternalPreviewUrl,
                signedUrl: safeExternalResumeUrl,
                locator: candidateResumeLocator,
                expiresAt: null,
              },
              source: asNonEmptyString(metadata.source) ?? asNonEmptyString(props.source) ?? 'external',
              isExternal: true,
              canMoveToJob: false,
              canOpenResume: Boolean(safeExternalPreviewUrl ?? safeExternalResumeUrl),
            });
          }
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
          moveNotes = 'Added to another job via semantic search';
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
