import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { getResults } from './signal-client';
import type {
  SignalResultCandidate,
  SignalResultsResponse,
} from './signal-contracts';

const ENRICHED_STATUSES = new Set(['completed', 'enriched']);
const FAILED_STATUSES = new Set(['failed', 'error']);

function readOptionalStringOrNull(
  input: Record<string, unknown> | null | undefined,
  key: string,
): string | null | undefined {
  if (!input || !(key in input)) return undefined;
  const value = input[key];
  if (value == null) return null;
  return typeof value === 'string' ? value : undefined;
}

/**
 * Normalize Signal fit score for job_sourced_candidates.fit_score (INTEGER 0-100).
 * Signal may return either a ratio (0..1) or a percent-like number (0..100).
 */
function normalizeFitScoreForStorage(fitScore: number | null): number | null {
  if (typeof fitScore !== 'number' || Number.isNaN(fitScore)) {
    return null;
  }

  const scaled = fitScore <= 1 ? fitScore * 100 : fitScore;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

export interface SourcingEnrichmentProgress {
  totalCandidates: number;
  enrichedCount: number;
  pendingCount: number;
  failedCount: number;
  inProgress: boolean;
  percent: number;
  lastSyncedAt: string;
}

export interface SyncSignalResultsParams {
  organizationId: number;
  jobId: number;
  requestId: string;
  externalJobId: string;
  signalTenantId: string;
}

export interface SyncSignalResultsResult {
  fetchedResults: SignalResultsResponse;
  candidateCount: number;
  upsertedCount: number;
  enrichmentProgress: SourcingEnrichmentProgress;
  metaPatch: Record<string, unknown>;
}

export function computeEnrichmentProgress(
  candidates: SignalResultCandidate[],
): SourcingEnrichmentProgress {
  let enrichedCount = 0;
  let failedCount = 0;
  let pendingCount = 0;

  for (const candidate of candidates) {
    const statusRaw = candidate.candidate?.enrichmentStatus ?? candidate.enrichmentStatus ?? '';
    const status = typeof statusRaw === 'string' ? statusRaw.toLowerCase() : '';

    if (ENRICHED_STATUSES.has(status)) {
      enrichedCount++;
      continue;
    }
    if (FAILED_STATUSES.has(status)) {
      failedCount++;
      continue;
    }
    pendingCount++;
  }

  const totalCandidates = candidates.length;
  const percent = totalCandidates > 0
    ? Math.round((enrichedCount / totalCandidates) * 100)
    : 0;

  return {
    totalCandidates,
    enrichedCount,
    pendingCount,
    failedCount,
    inProgress: pendingCount > 0,
    percent,
    lastSyncedAt: new Date().toISOString(),
  };
}

function buildSignalRunMetaPatch(
  fetchedResults: SignalResultsResponse,
  enrichmentProgress: SourcingEnrichmentProgress,
): Record<string, unknown> {
  const resultGroupCounts = fetchedResults.groupCounts && typeof fetchedResults.groupCounts === 'object'
    ? fetchedResults.groupCounts as unknown as Record<string, unknown>
    : null;
  const resultDiagnostics = fetchedResults.diagnostics && typeof fetchedResults.diagnostics === 'object'
    ? fetchedResults.diagnostics as Record<string, unknown>
    : null;

  const groupRequestedLocation = readOptionalStringOrNull(resultGroupCounts, 'requestedLocation');
  const diagnosticsRequestedLocation = readOptionalStringOrNull(resultDiagnostics, 'requestedLocation');
  const requestedLocation = groupRequestedLocation !== undefined
    ? groupRequestedLocation
    : diagnosticsRequestedLocation;

  const groupExpansionReason = readOptionalStringOrNull(resultGroupCounts, 'expansionReason');
  const diagnosticsExpansionReason = readOptionalStringOrNull(resultDiagnostics, 'expansionReason');
  const expansionReason = groupExpansionReason !== undefined
    ? groupExpansionReason
    : diagnosticsExpansionReason;

  return {
    signalStatus: fetchedResults.status,
    resultCount: fetchedResults.resultCount,
    ...(fetchedResults.trackDecision ? { trackDecision: fetchedResults.trackDecision } : {}),
    ...(fetchedResults.groupCounts ? { groupCounts: fetchedResults.groupCounts } : {}),
    ...(fetchedResults.snapshotStats ? { snapshotStats: fetchedResults.snapshotStats } : {}),
    ...(fetchedResults.diagnostics ? { diagnostics: fetchedResults.diagnostics } : {}),
    ...(requestedLocation !== undefined ? { requestedLocation } : {}),
    ...(expansionReason !== undefined ? { expansionReason } : {}),
    enrichmentProgress,
    lastResultsSyncAt: enrichmentProgress.lastSyncedAt,
    ...(fetchedResults.lastRerankedAt !== undefined ? { lastRerankedAt: fetchedResults.lastRerankedAt } : {}),
  };
}

/**
 * Upsert sourced candidates from Signal results.
 *
 * Recruiter state is preserved on conflict; fit/summary are refreshed.
 */
export async function upsertSignalCandidates(
  organizationId: number,
  jobId: number,
  requestId: string,
  candidates: SignalResultCandidate[],
): Promise<number> {
  let upserted = 0;

  for (const c of candidates) {
    const fitScore = normalizeFitScoreForStorage(c.fitScore);
    const searchSnippet = (c.candidate as unknown as { searchSnippet?: unknown }).searchSnippet ?? null;
    const searchMeta = (c.candidate as unknown as { searchMeta?: unknown }).searchMeta ?? null;
    const searchProvider = (c.candidate as unknown as { searchProvider?: unknown }).searchProvider ?? null;
    const searchSignals = (c.candidate as unknown as { searchSignals?: unknown }).searchSignals ?? null;
    const summary = {
      nameHint: c.candidate.nameHint,
      headlineHint: c.candidate.headlineHint,
      locationHint: c.candidate.locationHint,
      companyHint: c.candidate.companyHint,
      linkedinUrl: c.candidate.linkedinUrl,
      enrichmentStatus: c.candidate.enrichmentStatus,
      confidenceScore: c.candidate.confidenceScore,
      lastEnrichedAt: c.candidate.lastEnrichedAt ?? c.freshness?.lastEnrichedAt ?? null,
      searchSnippet,
      searchMeta,
      searchProvider,
      searchSignals,
      identitySummary: c.identitySummary ?? null,
      snapshot: c.snapshot,
      rank: c.rank,
      fitScoreRaw: c.fitScore,
      matchTier: c.matchTier ?? null,
      locationMatchType: c.locationMatchType ?? null,
      countryCode: (c as any).countryCode ?? null,
      dataConfidence: c.dataConfidence ?? null,
      professionalValidation: c.professionalValidation ?? null,
      locationLabel: (c as any).locationLabel ?? null,
    };

    await db.execute(sql`
      INSERT INTO job_sourced_candidates (
        organization_id, job_id, request_id, signal_candidate_id,
        fit_score, fit_breakdown, source_type, state,
        candidate_summary, last_synced_at, created_at, updated_at
      ) VALUES (
        ${organizationId}, ${jobId}, ${requestId}, ${c.candidateId},
        ${fitScore}, ${JSON.stringify(c.fitBreakdown)}::jsonb, ${c.sourceType}, 'new',
        ${JSON.stringify(summary)}::jsonb, NOW(), NOW(), NOW()
      )
      ON CONFLICT (job_id, signal_candidate_id) DO UPDATE SET
        request_id = EXCLUDED.request_id,
        fit_score = EXCLUDED.fit_score,
        fit_breakdown = EXCLUDED.fit_breakdown,
        source_type = EXCLUDED.source_type,
        candidate_summary = EXCLUDED.candidate_summary,
        last_synced_at = NOW(),
        updated_at = NOW()
    `);
    upserted++;
  }

  return upserted;
}

/**
 * Fetch latest Signal /results and upsert candidates in Vanta.
 */
export async function syncSignalResultsIntoVanta(
  params: SyncSignalResultsParams,
): Promise<SyncSignalResultsResult> {
  const fetchedResults = await getResults(
    params.signalTenantId,
    params.externalJobId,
    params.requestId,
  );

  const candidates = Array.isArray(fetchedResults.candidates)
    ? fetchedResults.candidates
    : [];
  let candidateCount = fetchedResults.resultCount ?? 0;
  let upsertedCount = 0;

  if (candidates.length > 0) {
    upsertedCount = await upsertSignalCandidates(
      params.organizationId,
      params.jobId,
      params.requestId,
      candidates,
    );
    candidateCount = candidates.length;
  }

  const enrichmentProgress = computeEnrichmentProgress(candidates);
  const metaPatch = buildSignalRunMetaPatch(fetchedResults, enrichmentProgress);

  return {
    fetchedResults,
    candidateCount,
    upsertedCount,
    enrichmentProgress,
    metaPatch,
  };
}
