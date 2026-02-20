/**
 * ActiveKG Tenant Resolution
 *
 * Centralizes tenant ID resolution for all ActiveKG interactions.
 *
 * Strategies:
 *   - 'shared'     → single "default" tenant for all orgs (default)
 *   - 'org_scoped' → per-org tenant using configurable prefix
 *
 * Env vars:
 *   ACTIVEKG_TENANT_STRATEGY  — 'shared' | 'org_scoped' (default: 'shared')
 *   ACTIVEKG_TENANT_PREFIX    — prefix for org-scoped tenant IDs (default: 'org')
 */

export type ActiveKGTenantStrategy = 'shared' | 'org_scoped';

const VALID_STRATEGIES: ReadonlySet<string> = new Set(['shared', 'org_scoped']);

export function getTenantStrategy(): ActiveKGTenantStrategy {
  const raw = (process.env.ACTIVEKG_TENANT_STRATEGY || 'shared').trim().toLowerCase();
  if (!VALID_STRATEGIES.has(raw)) {
    return 'shared';
  }
  return raw as ActiveKGTenantStrategy;
}

export function getTenantPrefix(): string {
  const prefix = (process.env.ACTIVEKG_TENANT_PREFIX || 'org').trim();
  return prefix.length > 0 ? prefix : 'org';
}

export function resolveActiveKGTenantId(organizationId: number): string {
  const strategy = getTenantStrategy();
  if (strategy === 'org_scoped') {
    const prefix = getTenantPrefix();
    return `${prefix}_${organizationId}`;
  }
  return 'default';
}
