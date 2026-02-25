/**
 * ActiveKG Search Configuration
 *
 * Centralizes search-tuning env vars so route handlers and services
 * read from one place with validated defaults.
 *
 * Env vars:
 *   ACTIVEKG_SEARCH_MODE             — 'hybrid' | 'vector' | 'keyword' (default: 'hybrid')
 *   ACTIVEKG_SEARCH_TOP_K            — max results to return (default: 20, range 1-100)
 *   ACTIVEKG_SEARCH_USE_RERANKER     — enable reranker pass (default: true)
 *   ACTIVEKG_SEARCH_SIGNED_URL_MINUTES — signed URL expiry for resume links (default: 15, range 1-1440)
 */

export type ActiveKGSearchMode = 'hybrid' | 'vector' | 'keyword';

const VALID_SEARCH_MODES: ReadonlySet<string> = new Set(['hybrid', 'vector', 'keyword']);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseIntSafe(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getSearchMode(): ActiveKGSearchMode {
  const raw = (process.env.ACTIVEKG_SEARCH_MODE || 'hybrid').trim().toLowerCase();
  if (!VALID_SEARCH_MODES.has(raw)) {
    return 'hybrid';
  }
  return raw as ActiveKGSearchMode;
}

export function getSearchTopK(): number {
  return clamp(parseIntSafe(process.env.ACTIVEKG_SEARCH_TOP_K, 20), 1, 100);
}

export function getSearchUseReranker(): boolean {
  const raw = (process.env.ACTIVEKG_SEARCH_USE_RERANKER ?? 'true').toString().trim().toLowerCase();
  return raw !== 'false' && raw !== '0';
}

export function getSearchSignedUrlMinutes(): number {
  return clamp(parseIntSafe(process.env.ACTIVEKG_SEARCH_SIGNED_URL_MINUTES, 15), 1, 1440);
}

export interface ActiveKGSearchDefaults {
  mode: ActiveKGSearchMode;
  topK: number;
  useReranker: boolean;
  signedUrlMinutes: number;
}

export function getSearchDefaults(): ActiveKGSearchDefaults {
  return {
    mode: getSearchMode(),
    topK: getSearchTopK(),
    useReranker: getSearchUseReranker(),
    signedUrlMinutes: getSearchSignedUrlMinutes(),
  };
}
