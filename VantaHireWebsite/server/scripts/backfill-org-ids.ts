/**
 * Backfill Organization IDs for Jobs, Applications, Clients, and Child Tables
 *
 * This script associates orphaned records (organization_id IS NULL) with their
 * creator's organization via organization_members lookup.
 *
 * Run with: npx tsx server/scripts/backfill-org-ids.ts
 *
 * Environment variables:
 *   DRY_RUN=true - Preview changes without applying them
 */

import { db } from '../db';
import { jobs, applications, clients } from '../../shared/schema';
import { sql, isNull } from 'drizzle-orm';

const DRY_RUN = process.env.DRY_RUN === 'true';

async function main() {
  console.log('=== Organization ID Backfill Script ===\n');
  if (DRY_RUN) {
    console.log('*** DRY RUN MODE - No changes will be made ***\n');
  }

  // 1. PRECHECK: Ensure no user has multiple memberships
  console.log('Step 1: Checking for users with multiple org memberships...');
  const duplicateMemberships = await db.execute(sql`
    SELECT user_id, COUNT(*) as count
    FROM organization_members
    GROUP BY user_id
    HAVING COUNT(*) > 1
  `);

  if (duplicateMemberships.rows.length > 0) {
    console.error('❌ Found users with multiple org memberships:');
    console.table(duplicateMemberships.rows);
    console.error('\nPlease resolve duplicate memberships before running this script.');
    process.exit(1);
  }
  console.log('✅ No duplicate memberships found\n');

  // 2. COUNT BEFORE
  console.log('Step 2: Counting orphaned records...');
  const [jobsBefore] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(isNull(jobs.organizationId));

  const [appsBefore] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applications)
    .where(isNull(applications.organizationId));

  const [clientsBefore] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clients)
    .where(isNull(clients.organizationId));

  console.log(`   Jobs with NULL organization_id: ${jobsBefore.count}`);
  console.log(`   Applications with NULL organization_id: ${appsBefore.count}`);
  console.log(`   Clients with NULL organization_id: ${clientsBefore.count}\n`);

  if (jobsBefore.count === 0 && appsBefore.count === 0 && clientsBefore.count === 0) {
    console.log('✅ No orphaned records to backfill. Exiting.\n');
    process.exit(0);
  }

  // 3. UPDATE JOBS
  console.log('Step 3: Backfilling jobs...');
  if (!DRY_RUN) {
    const jobsResult = await db.execute(sql`
      UPDATE jobs j
      SET organization_id = om.organization_id
      FROM organization_members om
      WHERE j.organization_id IS NULL
        AND j.posted_by = om.user_id
    `);
    console.log(`   ✅ Updated ${jobsResult.rowCount} jobs\n`);
  } else {
    const jobsToUpdate = await db.execute(sql`
      SELECT j.id, j.title, j.posted_by, om.organization_id
      FROM jobs j
      INNER JOIN organization_members om ON j.posted_by = om.user_id
      WHERE j.organization_id IS NULL
      LIMIT 20
    `);
    console.log(`   Would update ${jobsBefore.count} jobs. Sample:`);
    if (jobsToUpdate.rows.length > 0) {
      console.table(jobsToUpdate.rows);
    }
    console.log('');
  }

  // 3b. UPDATE CLIENTS
  console.log('Step 3b: Backfilling clients...');
  if (!DRY_RUN) {
    const clientsResult = await db.execute(sql`
      UPDATE clients c
      SET organization_id = om.organization_id
      FROM organization_members om
      WHERE c.organization_id IS NULL
        AND c.created_by = om.user_id
    `);
    console.log(`   ✅ Updated ${clientsResult.rowCount} clients\n`);
  } else {
    const clientsToUpdate = await db.execute(sql`
      SELECT c.id, c.name, c.created_by, om.organization_id
      FROM clients c
      INNER JOIN organization_members om ON c.created_by = om.user_id
      WHERE c.organization_id IS NULL
      LIMIT 20
    `);
    console.log(`   Would update clients. Sample:`);
    if (clientsToUpdate.rows.length > 0) {
      console.table(clientsToUpdate.rows);
    }
    console.log('');
  }

  // 4. UPDATE APPLICATIONS (using job's org)
  console.log('Step 4: Backfilling applications...');
  if (!DRY_RUN) {
    const appsResult = await db.execute(sql`
      UPDATE applications a
      SET organization_id = j.organization_id
      FROM jobs j
      WHERE a.organization_id IS NULL
        AND a.job_id = j.id
        AND j.organization_id IS NOT NULL
    `);
    console.log(`   ✅ Updated ${appsResult.rowCount} applications\n`);
  } else {
    const appsToUpdate = await db.execute(sql`
      SELECT a.id, a.job_id, j.organization_id
      FROM applications a
      INNER JOIN jobs j ON a.job_id = j.id
      WHERE a.organization_id IS NULL
        AND j.organization_id IS NOT NULL
      LIMIT 20
    `);
    console.log(`   Would update applications for jobs now having org_id. Sample:`);
    if (appsToUpdate.rows.length > 0) {
      console.table(appsToUpdate.rows);
    }
    console.log('');
  }

  // 4b. UPDATE CHILD TABLES (job_analytics, job_audit_log) via job FK
  console.log('Step 4b: Backfilling child tables from jobs...');
  if (!DRY_RUN) {
    const analyticsResult = await db.execute(sql`
      UPDATE job_analytics ja
      SET organization_id = j.organization_id
      FROM jobs j
      WHERE ja.organization_id IS NULL
        AND ja.job_id = j.id
        AND j.organization_id IS NOT NULL
    `);
    console.log(`   ✅ Updated ${analyticsResult.rowCount} job_analytics rows`);

    const auditResult = await db.execute(sql`
      UPDATE job_audit_log jal
      SET organization_id = j.organization_id
      FROM jobs j
      WHERE jal.organization_id IS NULL
        AND jal.job_id = j.id
        AND j.organization_id IS NOT NULL
    `);
    console.log(`   ✅ Updated ${auditResult.rowCount} job_audit_log rows\n`);
  } else {
    const analyticsCount = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM job_analytics ja
      INNER JOIN jobs j ON ja.job_id = j.id
      WHERE ja.organization_id IS NULL AND j.organization_id IS NOT NULL
    `);
    const auditCount = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM job_audit_log jal
      INNER JOIN jobs j ON jal.job_id = j.id
      WHERE jal.organization_id IS NULL AND j.organization_id IS NOT NULL
    `);
    console.log(`   Would update ${(analyticsCount.rows[0] as any)?.count || 0} job_analytics rows`);
    console.log(`   Would update ${(auditCount.rows[0] as any)?.count || 0} job_audit_log rows\n`);
  }

  // 5. COUNT AFTER + REPORT LEFTOVERS
  console.log('Step 5: Final counts...');
  const [jobsAfter] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(isNull(jobs.organizationId));

  const [appsAfter] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applications)
    .where(isNull(applications.organizationId));

  const [clientsAfter] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clients)
    .where(isNull(clients.organizationId));

  console.log(`   Jobs still with NULL organization_id: ${DRY_RUN ? jobsBefore.count : jobsAfter.count}`);
  console.log(`   Applications still with NULL organization_id: ${DRY_RUN ? appsBefore.count : appsAfter.count}`);
  console.log(`   Clients still with NULL organization_id: ${DRY_RUN ? clientsBefore.count : clientsAfter.count}\n`);

  // 6. LIST REMAINING ORPHANS (users without org membership)
  const remainingOrphanedJobs = DRY_RUN ? jobsBefore.count : jobsAfter.count;
  if (remainingOrphanedJobs > 0) {
    console.log('Step 6: Listing remaining orphaned jobs (posted by users without org membership)...');
    const orphanedJobs = await db.execute(sql`
      SELECT j.id, j.title, j.posted_by, u.username, u.first_name, u.last_name
      FROM jobs j
      LEFT JOIN users u ON j.posted_by = u.id
      LEFT JOIN organization_members om ON j.posted_by = om.user_id
      WHERE j.organization_id IS NULL
        AND om.user_id IS NULL
      LIMIT 20
    `);
    if (orphanedJobs.rows.length > 0) {
      console.log('   These jobs cannot be auto-assigned (user has no org membership):');
      console.table(orphanedJobs.rows);
      if (remainingOrphanedJobs > 20) {
        console.log(`   ... and ${remainingOrphanedJobs - 20} more\n`);
      }
    }
  }

  if (DRY_RUN) {
    console.log('=== DRY RUN COMPLETE - Run without DRY_RUN=true to apply changes ===\n');
  } else {
    console.log('=== BACKFILL COMPLETE ===\n');
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Error during backfill:', e);
  process.exit(1);
});
