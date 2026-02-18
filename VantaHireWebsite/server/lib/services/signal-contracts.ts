/**
 * Signal API contract types for Vanta ↔ Signal integration.
 *
 * These types match the live Signal v3 API routes:
 * - POST /api/v3/jobs/{externalJobId}/source  (pepolehub/src/app/api/v3/jobs/[id]/source/route.ts)
 * - GET  /api/v3/jobs/{externalJobId}/results (pepolehub/src/app/api/v3/jobs/[id]/results/route.ts)
 * - Callback: pepolehub/src/lib/sourcing/callback.ts + types.ts
 *
 * Raw Signal source_type values are stored as-is; fit scores are normalized at ingest.
 * UI-level derivations happen at read time.
 */

// =====================================================
// SOURCE TYPES (raw Signal values — store as-is)
// =====================================================

/** Raw Signal source type values. Never map/transform before storage. */
export type SignalSourceType = 'pool_enriched' | 'pool' | 'discovered';

/** UI display bucket — derived at read time, never stored. */
export type SourceDisplayBucket = 'talent_pool' | 'newly_discovered';

/** Derive UI bucket from raw Signal source type. */
export function toDisplayBucket(sourceType: SignalSourceType): SourceDisplayBucket {
  return sourceType === 'pool_enriched' || sourceType === 'pool'
    ? 'talent_pool'
    : 'newly_discovered';
}

// =====================================================
// SIGNAL POST /api/v3/jobs/{externalJobId}/source
// =====================================================

/** Request body for Signal POST /api/v3/jobs/{externalJobId}/source */
export interface SignalSourceRequest {
  jobContext: {
    jdDigest: string;                       // required — Vanta's pre-analyzed JD digest (JSON-stringified)
    location?: string;
    experienceYears?: number;
    education?: string;
  };
  callbackUrl: string;                      // Vanta webhook URL for async results
}

/**
 * Response from Signal POST /api/v3/jobs/{externalJobId}/source.
 *
 * Three cases:
 * - New request created:     { success, requestId, status: 'queued', idempotent: false }
 * - Idempotent hit:          { success, requestId, status: <existing>, idempotent: true }
 * - Retried failed request:  { success, requestId, status: 'queued', idempotent: false, retried: true }
 */
export interface SignalSourceResponse {
  success: boolean;
  requestId: string;                        // Signal's internal sourcing request ID
  status: string;                           // 'queued' for new, or existing status for idempotent
  idempotent: boolean;
  retried?: boolean;
  error?: string;
}

// =====================================================
// SIGNAL GET /api/v3/jobs/{externalJobId}/results
// =====================================================

/** Response from Signal GET /api/v3/jobs/{externalJobId}/results?requestId=... */
export interface SignalResultsResponse {
  success: boolean;
  requestId: string;
  externalJobId: string;
  status: string;                           // SourcingRequestStatus passthrough
  requestedAt: string;                      // ISO 8601
  completedAt: string | null;
  resultCount: number | null;
  candidates: SignalResultCandidate[];
  error?: string;
}

export interface SignalResultCandidate {
  candidateId: string;
  fitScore: number | null;
  fitBreakdown: Record<string, unknown> | null;
  sourceType: string;                       // raw Signal value
  enrichmentStatus: string;
  rank: number;
  candidate: SignalCandidateDetail;
  snapshot: SignalIntelligenceSnapshot | null;
  freshness: {
    stale: boolean | null;
    lastEnrichedAt: string | null;          // ISO 8601
  };
}

export interface SignalCandidateDetail {
  id: string;
  linkedinUrl: string | null;
  linkedinId: string | null;
  nameHint: string | null;
  headlineHint: string | null;
  locationHint: string | null;
  companyHint: string | null;
  enrichmentStatus: string;
  confidenceScore: number | null;
  lastEnrichedAt: string | null;            // ISO 8601
  intelligenceSnapshots: SignalIntelligenceSnapshot[];
}

export interface SignalIntelligenceSnapshot {
  skillsNormalized: unknown;
  roleType: string;
  seniorityBand: string;
  location: string;
  computedAt: string;                       // ISO 8601
  staleAfter: string;                       // ISO 8601
}

// =====================================================
// SIGNAL CALLBACK (webhook POST to Vanta)
// =====================================================

/**
 * Callback JWT claims (from Signal's callback.ts signCallbackJWT):
 * - iss: 'signal', aud: 'vantahire', sub: 'sourcing'
 * - Custom claims (snake_case): tenant_id, request_id, scopes: 'callbacks:write'
 * - Standard: jti (uuid), iat, exp (5m)
 *
 * Verified by jwt-signer.ts verifySignalCallbackJwt().
 */

/** HTTP body of Signal callback POST (SourcingCallbackPayload from Signal types.ts) */
export interface SignalCallbackPayload {
  version: 1;
  requestId: string;                        // camelCase in body (NOT snake_case)
  externalJobId: string;
  status: 'complete' | 'partial' | 'failed';
  candidateCount: number;
  enrichedCount: number;
  error?: string;
}

// =====================================================
// CONTEXT HASH
// =====================================================

/** Fields included in context hash computation. Order is fixed for determinism. */
export interface ContextHashInput {
  jdDigest: Record<string, unknown> | null;
  jdDigestVersion: number | null;
  location: string;
  experienceYears: number | null;
  educationRequirement: string | null;
  contextVersion: number;                   // bump to force re-run on hash logic changes
}

/** Current context hash version. Bump when hash input fields change. */
export const CONTEXT_HASH_VERSION = 1;

// =====================================================
// SOURCING RUN STATUS (Vanta-side)
// =====================================================

export type SourcingRunStatus = 'pending' | 'submitted' | 'processing' | 'completed' | 'failed' | 'expired';

/** Terminal statuses — no further transitions allowed. */
export const TERMINAL_RUN_STATUSES: ReadonlySet<SourcingRunStatus> = new Set(['completed', 'failed', 'expired']);

/** Check if a run is in a terminal state. */
export function isTerminalStatus(status: SourcingRunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

/**
 * Map Signal callback status to Vanta run status.
 * Signal sends: 'complete' | 'partial' | 'failed'
 * Vanta stores: 'completed' | 'failed'
 * 'partial' maps to 'completed' (results are available, even if incomplete).
 */
export function mapCallbackStatusToRunStatus(callbackStatus: SignalCallbackPayload['status']): 'completed' | 'failed' {
  return callbackStatus === 'failed' ? 'failed' : 'completed';
}

// =====================================================
// AUTH SCOPES (for signServiceJwt)
// =====================================================

/** Signal v3 scopes used by Vanta. */
export const SIGNAL_SCOPES = {
  SOURCE: 'jobs:source',
  RESULTS: 'jobs:results',
  ENRICH_BATCH: 'enrich:batch',
  PDL_CONTACT: 'pdl:contact',
} as const;
