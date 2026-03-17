/**
 * ActiveKG integration smoke test (Vanta -> ActiveKG with scoped RS256 JWT).
 *
 * What it validates:
 * 1) Optional unauthenticated /search probe (shows if JWT is enforced)
 * 2) Authenticated write path: POST /nodes (scope: kg:write)
 * 3) Authenticated read path: GET /nodes/by-external-id (scope: kg:write)
 * 4) Authenticated search path: POST /search (scope: search:read)
 *
 * Usage:
 *   npx tsx --env-file=.env server/scripts/test-activekg-integration.ts --org-id 1
 *
 * Useful flags:
 *   --org-id 1                 Use org-scoped tenant resolution
 *   --tenant-id org:1          Override tenant directly
 *   --tenant-format colon      org:1 (default: underscore -> org_1)
 *   --search-attempts 8        Poll attempts for search hit
 *   --search-interval-ms 5000  Delay between search attempts
 *   --require-search-hit       Exit non-zero if search hit not found
 */

import { randomUUID } from 'node:crypto';
import {
  ActiveKGClientError,
  createNode,
  getNodeByExternalId,
  search,
} from '../lib/services/activekg-client';

type TenantFormat = 'underscore' | 'colon';

interface Args {
  orgId?: number;
  tenantId?: string;
  tenantFormat: TenantFormat;
  searchAttempts: number;
  searchIntervalMs: number;
  requireSearchHit: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    tenantFormat: 'underscore',
    searchAttempts: 6,
    searchIntervalMs: 5000,
    requireSearchHit: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    if (!current) continue;

    if (current === '--org-id') {
      const value = argv[i + 1];
      if (!value) throw new Error('--org-id requires a value');
      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid --org-id value: ${value}`);
      }
      args.orgId = parsed;
      i++;
      continue;
    }

    if (current === '--tenant-id') {
      const value = argv[i + 1];
      if (!value) throw new Error('--tenant-id requires a value');
      args.tenantId = value;
      i++;
      continue;
    }

    if (current === '--tenant-format') {
      const value = argv[i + 1];
      if (!value) throw new Error('--tenant-format requires a value');
      if (value !== 'underscore' && value !== 'colon') {
        throw new Error(`Invalid --tenant-format value: ${value}`);
      }
      args.tenantFormat = value;
      i++;
      continue;
    }

    if (current === '--search-attempts') {
      const value = argv[i + 1];
      if (!value) throw new Error('--search-attempts requires a value');
      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 30) {
        throw new Error(`Invalid --search-attempts value: ${value}`);
      }
      args.searchAttempts = parsed;
      i++;
      continue;
    }

    if (current === '--search-interval-ms') {
      const value = argv[i + 1];
      if (!value) throw new Error('--search-interval-ms requires a value');
      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed < 250 || parsed > 120000) {
        throw new Error(`Invalid --search-interval-ms value: ${value}`);
      }
      args.searchIntervalMs = parsed;
      i++;
      continue;
    }

    if (current === '--require-search-hit') {
      args.requireSearchHit = true;
      continue;
    }
  }

  return args;
}

function resolveTenantId(
  tenantStrategy: string,
  tenantFormat: TenantFormat,
  orgId?: number,
  explicitTenantId?: string,
): string {
  if (explicitTenantId) return explicitTenantId;

  if (tenantStrategy === 'org_scoped') {
    if (!orgId) {
      throw new Error('org_scoped tenant strategy requires --org-id (or --tenant-id override)');
    }
    return tenantFormat === 'colon' ? `org:${orgId}` : `org_${orgId}`;
  }

  return 'default';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function unauthenticatedSearchProbe(baseUrl: string, tenantId: string): Promise<number> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'health probe', top_k: 1, tenant_id: tenantId }),
  });
  return res.status;
}

function formatStatus(ok: boolean): string {
  return ok ? 'PASS' : 'FAIL';
}

async function run(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const tenantStrategy = process.env.ACTIVEKG_TENANT_STRATEGY || 'shared';
  const activeKgBaseUrl = process.env.ACTIVEKG_BASE_URL;

  if (!activeKgBaseUrl) {
    throw new Error('ACTIVEKG_BASE_URL is not set');
  }
  if (!process.env.VANTAHIRE_JWT_PRIVATE_KEY) {
    throw new Error('VANTAHIRE_JWT_PRIVATE_KEY is not set');
  }

  const tenantId = resolveTenantId(
    tenantStrategy,
    args.tenantFormat,
    args.orgId,
    args.tenantId,
  );

  const marker = `vh_activekg_smoke_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const externalId = `vantahire:${tenantId}:smoke:${marker}`;

  let step1Status = 'SKIP';
  let step2Ok = false;
  let step3Ok = false;
  let step4SearchHit = false;
  let createdNodeId: string | null = null;

  console.log('--- ActiveKG Integration Smoke Test ---');
  console.log(`ActiveKG URL: ${activeKgBaseUrl}`);
  console.log(`Tenant strategy: ${tenantStrategy}`);
  console.log(`Resolved tenant: ${tenantId}`);
  console.log(`Org ID: ${args.orgId ?? 'n/a'}`);
  console.log(`Marker: ${marker}`);

  // Step 1: Unauthenticated probe (informational only)
  try {
    const statusCode = await unauthenticatedSearchProbe(activeKgBaseUrl, tenantId);
    step1Status = `${statusCode}`;
    if (statusCode === 401 || statusCode === 403) {
      console.log(`Step 1 unauthenticated /search probe: PASS (JWT enforced, status ${statusCode})`);
    } else {
      console.log(`Step 1 unauthenticated /search probe: WARN (status ${statusCode})`);
    }
  } catch (error) {
    step1Status = 'ERR';
    console.log(`Step 1 unauthenticated /search probe: WARN (${String(error)})`);
  }

  // Step 2: Create node (kg:write)
  try {
    const createRes = await createNode(tenantId, {
      classes: ['Resume', 'Chunk'],
      props: {
        external_id: externalId,
        text: `ActiveKG integration smoke test node. Marker=${marker}.`,
        resume_text: `ActiveKG integration smoke test node. Marker=${marker}.`,
        source: 'vantahire',
        org_id: args.orgId ?? null,
        smoke_test: true,
      },
      metadata: {
        source: 'vantahire',
        org_id: args.orgId ?? null,
        smoke_test: true,
        marker,
      },
      tenant_id: tenantId,
      extract: false,
    });
    createdNodeId = createRes.id;
    step2Ok = true;
    console.log(`Step 2 createNode: PASS (nodeId=${createdNodeId})`);
  } catch (error) {
    if (error instanceof ActiveKGClientError) {
      console.error(
        `Step 2 createNode: FAIL (status=${error.statusCode}, retryable=${error.retryable})`,
      );
    } else {
      console.error(`Step 2 createNode: FAIL (${String(error)})`);
    }
  }

  // Step 3: Read by external_id (kg:write)
  if (step2Ok) {
    try {
      const found = await getNodeByExternalId(tenantId, externalId);
      step3Ok = !!found && typeof found.id === 'string' && found.id.length > 0;
      console.log(
        `Step 3 getNodeByExternalId: ${formatStatus(step3Ok)}${
          found ? ` (nodeId=${found.id})` : ''
        }`,
      );
    } catch (error) {
      if (error instanceof ActiveKGClientError) {
        console.error(
          `Step 3 getNodeByExternalId: FAIL (status=${error.statusCode}, retryable=${error.retryable})`,
        );
      } else {
        console.error(`Step 3 getNodeByExternalId: FAIL (${String(error)})`);
      }
    }
  }

  // Step 4: Search (search:read), poll for embedding latency
  if (step2Ok) {
    for (let attempt = 1; attempt <= args.searchAttempts; attempt++) {
      try {
        const res = await search(tenantId, {
          query: marker,
          top_k: 20,
          use_hybrid: true,
          use_reranker: true,
          metadata_filters: {
            source: 'vantahire',
            ...(args.orgId != null ? { org_id: args.orgId } : {}),
          },
        });

        const hit = res.results.find((r) => {
          const props = r.props as Record<string, unknown>;
          const ext = props.external_id;
          return r.id === createdNodeId || ext === externalId;
        });

        if (hit) {
          step4SearchHit = true;
          console.log(`Step 4 search: PASS (attempt ${attempt}, count=${res.count})`);
          break;
        }

        console.log(
          `Step 4 search: attempt ${attempt}/${args.searchAttempts}, no direct hit yet (count=${res.count})`,
        );
      } catch (error) {
        if (error instanceof ActiveKGClientError) {
          console.error(
            `Step 4 search: FAIL (status=${error.statusCode}, retryable=${error.retryable})`,
          );
        } else {
          console.error(`Step 4 search: FAIL (${String(error)})`);
        }
        break;
      }

      if (attempt < args.searchAttempts) {
        await sleep(args.searchIntervalMs);
      }
    }
  }

  console.log('\n--- Summary ---');
  console.log(`1) Unauthenticated probe: ${step1Status}`);
  console.log(`2) Authenticated write (/nodes): ${formatStatus(step2Ok)}`);
  console.log(`3) Authenticated lookup (/nodes/by-external-id): ${formatStatus(step3Ok)}`);
  console.log(`4) Authenticated search hit (/search): ${step4SearchHit ? 'PASS' : 'WARN'}`);
  console.log(`Created node id: ${createdNodeId ?? 'n/a'}`);
  console.log(`Tenant used: ${tenantId}`);
  console.log(`External ID: ${externalId}`);

  if (!step2Ok || !step3Ok) {
    return 1;
  }

  if (args.requireSearchHit && !step4SearchHit) {
    return 2;
  }

  return 0;
}

run()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error('Smoke test failed:', error);
    process.exit(1);
  });
