/**
 * ActiveKG sync queue diagnostic.
 *
 * Quick DB-only check — no ActiveKG calls needed.
 * Shows recent sync jobs, status counts, and flags stuck/stale jobs.
 *
 * Usage:
 *   npm run check:activekg-sync
 *   npx tsx --env-file=.env server/scripts/check-activekg-sync-status.ts
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

interface StatusCount {
  status: string;
  count: string;
}

interface SyncJob {
  id: number;
  application_id: number;
  status: string;
  attempts: number;
  activekg_tenant_id: string;
  activekg_parent_node_id: string | null;
  chunk_count: number | null;
  last_error: string | null;
  next_attempt_at: string;
  created_at: string;
  updated_at: string;
}

async function main() {
  console.log('=== ActiveKG Sync Queue Status ===\n');

  // Status counts
  const counts = (await db.execute(sql`
    SELECT status, count(*)::text FROM application_graph_sync_jobs GROUP BY status ORDER BY status
  `)).rows as StatusCount[];

  if (counts.length === 0) {
    console.log('No sync jobs found. Table is empty.');
    process.exit(0);
  }

  console.log('Status counts:');
  let total = 0;
  for (const row of counts) {
    const n = parseInt(row.count, 10);
    total += n;
    const icon = row.status === 'succeeded' ? 'OK' :
                 row.status === 'pending' ? '..' :
                 row.status === 'processing' ? '>>' :
                 row.status === 'failed' ? '!!' :
                 row.status === 'dead_letter' ? 'XX' : '??';
    console.log(`  [${icon}] ${row.status}: ${row.count}`);
  }
  console.log(`  Total: ${total}`);

  // Stale processing jobs (stuck > 5 min)
  const staleMs = parseInt(process.env.ACTIVEKG_SYNC_PROCESSING_LEASE_MS || '300000', 10);
  const stale = (await db.execute(sql`
    SELECT id, application_id, attempts, updated_at
    FROM application_graph_sync_jobs
    WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '1 millisecond' * ${staleMs}
    ORDER BY updated_at ASC
  `)).rows as any[];

  if (stale.length > 0) {
    console.log(`\nStale processing jobs (>${Math.round(staleMs / 60000)} min):`);
    for (const row of stale) {
      console.log(`  Job ${row.id} (app=${row.application_id}): stuck since ${row.updated_at}, attempts=${row.attempts}`);
    }
  }

  // Recent failures
  const failures = (await db.execute(sql`
    SELECT id, application_id, attempts, last_error, updated_at
    FROM application_graph_sync_jobs
    WHERE status IN ('failed', 'dead_letter')
    ORDER BY updated_at DESC
    LIMIT 10
  `)).rows as any[];

  if (failures.length > 0) {
    console.log('\nRecent failures:');
    for (const row of failures) {
      const errPreview = row.last_error ? row.last_error.slice(0, 120) : 'n/a';
      console.log(`  Job ${row.id} (app=${row.application_id}): attempts=${row.attempts}, error="${errPreview}"`);
    }
  }

  // Recent jobs (last 10)
  const recent = (await db.execute(sql`
    SELECT id, application_id, status, attempts, activekg_tenant_id,
           activekg_parent_node_id, chunk_count, last_error,
           created_at, updated_at
    FROM application_graph_sync_jobs
    ORDER BY id DESC
    LIMIT 10
  `)).rows as SyncJob[];

  console.log('\nRecent jobs (last 10):');
  console.log('  ID | App | Status      | Attempts | Tenant  | Node ID                              | Chunks | Error');
  console.log('  ' + '-'.repeat(110));
  for (const row of recent) {
    const nodeId = row.activekg_parent_node_id ?? '-';
    const chunks = row.chunk_count ?? '-';
    const err = row.last_error ? row.last_error.slice(0, 30) + '...' : '-';
    const status = row.status.padEnd(11);
    console.log(`  ${String(row.id).padStart(3)} | ${String(row.application_id).padStart(3)} | ${status} | ${String(row.attempts).padStart(8)} | ${row.activekg_tenant_id.padEnd(7)} | ${String(nodeId).padEnd(36)} | ${String(chunks).padStart(6)} | ${err}`);
  }

  console.log('\n=== Done ===');
  process.exit(0);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
