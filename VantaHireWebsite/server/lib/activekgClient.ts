/**
 * ActiveKG HTTP Client
 *
 * Typed client for communicating with the ActiveKG API.
 * Uses RS256 JWT auth via signServiceJwt('activekg', ...) from jwt-signer.ts.
 * Handles node/edge creation, external_id lookups, timeouts, and transient retries.
 */

import { signServiceJwt } from './services/jwt-signer';

const BASE_URL = process.env.ACTIVEKG_BASE_URL || 'http://localhost:8000';
const TIMEOUT_MS = parseInt(process.env.ACTIVEKG_TIMEOUT_MS || '10000', 10);

// Short client-level retries for transient errors (main retries handled by job processor)
const CLIENT_MAX_RETRIES = 2;
const CLIENT_RETRY_DELAY_MS = 500;

// Scopes matching the new activekg-client.ts conventions
const SCOPE_WRITE = 'kg:write';

export interface ActiveKGNodePayload {
  classes: string[];
  props: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  tenant_id?: string;
}

export interface ActiveKGEdgePayload {
  src: string;
  dst: string;
  rel: string;
  props?: Record<string, unknown>;
  tenant_id?: string;
}

export interface ActiveKGNodeResponse {
  id: string;
  tenant_id?: string;
  classes?: string[];
  props?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  payload_ref?: string | null;
  embedding_status?: string;
  job_id?: string;
}

export class ActiveKGClientError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public retryable: boolean
  ) {
    super(message);
    this.name = 'ActiveKGClientError';
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function classifyError(status: number, body: string): ActiveKGClientError {
  const retryable = isRetryableStatus(status);
  return new ActiveKGClientError(
    `ActiveKG API error ${status}: ${body.slice(0, 200)}`,
    status,
    retryable
  );
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function request<T>(
  method: string,
  path: string,
  tenantId: string,
  scopes: string,
  body?: unknown
): Promise<T> {
  const url = `${BASE_URL}${path}`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= CLIENT_MAX_RETRIES; attempt++) {
    try {
      // Sign a fresh RS256 JWT for each attempt (short-lived tokens)
      const token = await signServiceJwt('activekg', {
        tenantId,
        scopes,
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      };

      const response = await fetchWithTimeout(
        url,
        {
          method,
          headers,
          ...(body !== undefined && { body: JSON.stringify(body) }),
        },
        TIMEOUT_MS
      );

      if (response.ok) {
        return (await response.json()) as T;
      }

      // Special handling for 404 - not retryable, caller may expect it
      if (response.status === 404) {
        const text = await response.text().catch(() => 'Not found');
        throw classifyError(404, text);
      }

      const text = await response.text().catch(() => '');
      const err = classifyError(response.status, text);

      if (!err.retryable || attempt === CLIENT_MAX_RETRIES) {
        throw err;
      }

      lastError = err;
    } catch (error) {
      if (error instanceof ActiveKGClientError) {
        if (!error.retryable || attempt === CLIENT_MAX_RETRIES) throw error;
        lastError = error;
      } else if (error instanceof Error && error.name === 'AbortError') {
        lastError = new ActiveKGClientError('Request timeout', 0, true);
        if (attempt === CLIENT_MAX_RETRIES) throw lastError;
      } else {
        // Network error - retryable
        lastError = new ActiveKGClientError(
          `Network error: ${error instanceof Error ? error.message : String(error)}`,
          0,
          true
        );
        if (attempt === CLIENT_MAX_RETRIES) throw lastError;
      }
    }

    // Wait before retry with simple backoff
    await new Promise((r) => setTimeout(r, CLIENT_RETRY_DELAY_MS * (attempt + 1)));
  }

  throw lastError || new Error('Unexpected retry exhaustion');
}

/**
 * Create a node in ActiveKG.
 * Returns the created node response with at minimum { id }.
 */
export async function createNode(
  payload: ActiveKGNodePayload,
  tenantId: string
): Promise<ActiveKGNodeResponse> {
  return request<ActiveKGNodeResponse>('POST', '/nodes', tenantId, SCOPE_WRITE, payload);
}

/**
 * Create an edge in ActiveKG.
 */
export async function createEdge(
  payload: ActiveKGEdgePayload,
  tenantId: string
): Promise<void> {
  await request<unknown>('POST', '/edges', tenantId, SCOPE_WRITE, payload);
}

/**
 * Get a node by its external_id prop.
 * Returns null if not found (404).
 */
export async function getNodeByExternalId(
  externalId: string,
  tenantId: string
): Promise<ActiveKGNodeResponse | null> {
  try {
    return await request<ActiveKGNodeResponse>(
      'GET',
      `/nodes/by-external-id?external_id=${encodeURIComponent(externalId)}`,
      tenantId,
      SCOPE_WRITE
    );
  } catch (error) {
    if (error instanceof ActiveKGClientError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}
