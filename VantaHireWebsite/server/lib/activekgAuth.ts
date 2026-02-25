/**
 * ActiveKG JWT Authentication
 *
 * Builds JWT tokens for authenticating VantaHire requests to ActiveKG.
 * Supports HS256 signing with Node built-in crypto (no external dependency).
 * When ACTIVEKG_AUTH_MODE=none, returns no auth headers (dev mode).
 */

import { createHmac } from 'crypto';

export interface ActiveKGAuthContext {
  tenantId: string;
  effectiveRecruiterId: number;
  headers: Record<string, string>;
}

const TENANT_STRATEGY = process.env.ACTIVEKG_TENANT_STRATEGY || 'default';
const AUTH_MODE = process.env.ACTIVEKG_AUTH_MODE || 'jwt';
const JWT_SECRET = process.env.ACTIVEKG_JWT_SECRET || '';
const JWT_ALG = process.env.ACTIVEKG_JWT_ALG || 'HS256';
const JWT_AUD = process.env.ACTIVEKG_JWT_AUD || 'activekg';
const JWT_ISS = process.env.ACTIVEKG_JWT_ISS || 'vantahire';
const JWT_TTL_SECONDS = 300; // 5 minutes

function base64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf.toString('base64url');
}

function signHS256(header: string, payload: string, secret: string): string {
  const data = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(data).digest();
  return base64url(signature);
}

function buildJWT(claims: Record<string, unknown>): string {
  // Always use HS256 regardless of env config — this is the only supported algorithm
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    ...claims,
    iat: now,
    exp: now + JWT_TTL_SECONDS,
    aud: JWT_AUD,
    iss: JWT_ISS,
  }));
  const signature = signHS256(header, payload, JWT_SECRET);
  return `${header}.${payload}.${signature}`;
}

/**
 * Validate ActiveKG auth configuration at startup.
 * Throws descriptive error if config is invalid.
 */
export function validateActiveKGAuthConfig(): void {
  if (AUTH_MODE === 'none') {
    return;
  }

  if (AUTH_MODE !== 'jwt') {
    throw new Error(
      `Invalid ACTIVEKG_AUTH_MODE="${AUTH_MODE}". Must be "jwt" or "none".`
    );
  }

  if (JWT_ALG !== 'HS256') {
    throw new Error(
      `Invalid ACTIVEKG_JWT_ALG="${JWT_ALG}". Only "HS256" is supported.`
    );
  }

  if (!JWT_SECRET) {
    throw new Error(
      'ACTIVEKG_JWT_SECRET must be non-empty when ACTIVEKG_AUTH_MODE=jwt.'
    );
  }

  if (!JWT_AUD) {
    throw new Error(
      'ACTIVEKG_JWT_AUD must be non-empty when ACTIVEKG_AUTH_MODE=jwt.'
    );
  }

  if (!JWT_ISS) {
    throw new Error(
      'ACTIVEKG_JWT_ISS must be non-empty when ACTIVEKG_AUTH_MODE=jwt.'
    );
  }
}

/**
 * Build auth context for an ActiveKG request.
 * Returns headers to include in HTTP requests.
 */
export function buildAuthContext(
  tenantId: string,
  effectiveRecruiterId: number
): ActiveKGAuthContext {
  const ctx: ActiveKGAuthContext = {
    tenantId,
    effectiveRecruiterId,
    headers: {},
  };

  if (AUTH_MODE === 'none') {
    return ctx;
  }

  const token = buildJWT({
    tenant_id: tenantId,
    sub: `recruiter_${effectiveRecruiterId}`,
    actor_type: 'user',
    scopes: ['write', 'read'],
  });

  ctx.headers['Authorization'] = `Bearer ${token}`;
  return ctx;
}

/**
 * Resolve the ActiveKG tenant ID based on the configured strategy.
 *
 * Strategies:
 * - 'default': all data goes into the shared "default" tenant (Phase 1 unified search)
 * - 'org_scoped': data is isolated per organization as "org_<orgId>"
 */
export function resolveActiveKGTenantId(organizationId: number | null): string {
  if (TENANT_STRATEGY === 'org_scoped') {
    if (!organizationId) {
      throw new Error('organizationId is required when ACTIVEKG_TENANT_STRATEGY=org_scoped');
    }
    return `org_${organizationId}`;
  }
  return 'default';
}
