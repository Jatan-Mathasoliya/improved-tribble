/**
 * Backfill Organization IDs for Jobs, Applications, Clients, and Child Tables
 *
 * This script associates orphaned records (organization_id IS NULL) with their
 * creator's organization via organization_members lookup.
 *
 * Tables covered:
 * - jobs, applications, clients (core tables)
 * - job_analytics, job_audit_log (job child tables)
 * - pipeline_stages, email_templates (user-created, excluding defaults)
 * - forms, form_invitations, form_responses (form hierarchy)
 *
 * Run with: npx tsx server/scripts/backfill-org-ids.ts
 *
 * Environment variables:
 *   DRY_RUN=true - Preview changes without applying them
 */

import { db } from '../db';
import { jobs, applications, clients, pipelineStages, emailTemplates, forms } from '../../shared/schema';
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

  const [pipelineBefore] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pipelineStages)
    .where(isNull(pipelineStages.organizationId));

  const [templatesBefore] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailTemplates)
    .where(isNull(emailTemplates.organizationId));

  const [formsBefore] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(forms)
    .where(isNull(forms.organizationId));

  console.log(`   Jobs with NULL organization_id: ${jobsBefore.count}`);
  console.log(`   Applications with NULL organization_id: ${appsBefore.count}`);
  console.log(`   Clients with NULL organization_id: ${clientsBefore.count}`);
  console.log(`   Pipeline stages with NULL organization_id: ${pipelineBefore.count}`);
  console.log(`   Email templates with NULL organization_id: ${templatesBefore.count}`);
  console.log(`   Forms with NULL organization_id: ${formsBefore.count}\n`);

  const totalOrphaned = jobsBefore.count + appsBefore.count + clientsBefore.count +
    pipelineBefore.count + templatesBefore.count + formsBefore.count;

  if (totalOrphaned === 0) {
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

  // 5. UPDATE PIPELINE_STAGES (excluding defaults)
  console.log('Step 5: Backfilling pipeline stages (excluding defaults)...');
  if (!DRY_RUN) {
    const pipelineResult = await db.execute(sql`
      UPDATE pipeline_stages ps
      SET organization_id = om.organization_id
      FROM organization_members om
      WHERE ps.organization_id IS NULL
        AND ps.created_by = om.user_id
        AND (ps.is_default IS NULL OR ps.is_default = false)
        AND ps.created_by IS NOT NULL
    `);
    console.log(`   ✅ Updated ${pipelineResult.rowCount} pipeline_stages rows\n`);
  } else {
    const pipelineCount = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM pipeline_stages ps
      INNER JOIN organization_members om ON ps.created_by = om.user_id
      WHERE ps.organization_id IS NULL
        AND (ps.is_default IS NULL OR ps.is_default = false)
        AND ps.created_by IS NOT NULL
    `);
    console.log(`   Would update ${(pipelineCount.rows[0] as any)?.count || 0} pipeline_stages rows\n`);
  }

  // 5b. UPDATE EMAIL_TEMPLATES (excluding defaults)
  console.log('Step 5b: Backfilling email templates (excluding defaults)...');
  if (!DRY_RUN) {
    const templatesResult = await db.execute(sql`
      UPDATE email_templates et
      SET organization_id = om.organization_id
      FROM organization_members om
      WHERE et.organization_id IS NULL
        AND et.created_by = om.user_id
        AND (et.is_default IS NULL OR et.is_default = false)
        AND et.created_by IS NOT NULL
    `);
    console.log(`   ✅ Updated ${templatesResult.rowCount} email_templates rows\n`);
  } else {
    const templatesCount = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM email_templates et
      INNER JOIN organization_members om ON et.created_by = om.user_id
      WHERE et.organization_id IS NULL
        AND (et.is_default IS NULL OR et.is_default = false)
        AND et.created_by IS NOT NULL
    `);
    console.log(`   Would update ${(templatesCount.rows[0] as any)?.count || 0} email_templates rows\n`);
  }

  // 5c. UPDATE FORMS
  console.log('Step 5c: Backfilling forms...');
  if (!DRY_RUN) {
    const formsResult = await db.execute(sql`
      UPDATE forms f
      SET organization_id = om.organization_id
      FROM organization_members om
      WHERE f.organization_id IS NULL
        AND f.created_by = om.user_id
    `);
    console.log(`   ✅ Updated ${formsResult.rowCount} forms rows\n`);
  } else {
    const formsCount = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM forms f
      INNER JOIN organization_members om ON f.created_by = om.user_id
      WHERE f.organization_id IS NULL
    `);
    console.log(`   Would update ${(formsCount.rows[0] as any)?.count || 0} forms rows\n`);
  }

  // 5d. UPDATE FORM_INVITATIONS (via form FK)
  console.log('Step 5d: Backfilling form invitations...');
  if (!DRY_RUN) {
    const formInvitationsResult = await db.execute(sql`
      UPDATE form_invitations fi
      SET organization_id = f.organization_id
      FROM forms f
      WHERE fi.organization_id IS NULL
        AND fi.form_id = f.id
        AND f.organization_id IS NOT NULL
    `);
    console.log(`   ✅ Updated ${formInvitationsResult.rowCount} form_invitations rows\n`);
  } else {
    const formInvitationsCount = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM form_invitations fi
      INNER JOIN forms f ON fi.form_id = f.id
      WHERE fi.organization_id IS NULL AND f.organization_id IS NOT NULL
    `);
    console.log(`   Would update ${(formInvitationsCount.rows[0] as any)?.count || 0} form_invitations rows\n`);
  }

  // 5e. UPDATE FORM_RESPONSES (via form invitation FK)
  console.log('Step 5e: Backfilling form responses...');
  if (!DRY_RUN) {
    const formResponsesResult = await db.execute(sql`
      UPDATE form_responses fr
      SET organization_id = f.organization_id
      FROM form_invitations fi
      INNER JOIN forms f ON fi.form_id = f.id
      WHERE fr.organization_id IS NULL
        AND fr.invitation_id = fi.id
        AND f.organization_id IS NOT NULL
    `);
    console.log(`   ✅ Updated ${formResponsesResult.rowCount} form_responses rows\n`);
  } else {
    const formResponsesCount = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM form_responses fr
      INNER JOIN form_invitations fi ON fr.invitation_id = fi.id
      INNER JOIN forms f ON fi.form_id = f.id
      WHERE fr.organization_id IS NULL AND f.organization_id IS NOT NULL
    `);
    console.log(`   Would update ${(formResponsesCount.rows[0] as any)?.count || 0} form_responses rows\n`);
  }

  // 6. COUNT AFTER + REPORT LEFTOVERS
  console.log('Step 6: Final counts...');
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

  const [pipelineAfter] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pipelineStages)
    .where(isNull(pipelineStages.organizationId));

  const [templatesAfter] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailTemplates)
    .where(isNull(emailTemplates.organizationId));

  const [formsAfter] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(forms)
    .where(isNull(forms.organizationId));

  console.log(`   Jobs still with NULL organization_id: ${DRY_RUN ? jobsBefore.count : jobsAfter.count}`);
  console.log(`   Applications still with NULL organization_id: ${DRY_RUN ? appsBefore.count : appsAfter.count}`);
  console.log(`   Clients still with NULL organization_id: ${DRY_RUN ? clientsBefore.count : clientsAfter.count}`);
  console.log(`   Pipeline stages still with NULL organization_id: ${DRY_RUN ? pipelineBefore.count : pipelineAfter.count}`);
  console.log(`   Email templates still with NULL organization_id: ${DRY_RUN ? templatesBefore.count : templatesAfter.count}`);
  console.log(`   Forms still with NULL organization_id: ${DRY_RUN ? formsBefore.count : formsAfter.count}\n`);

  // 7. LIST REMAINING ORPHANS (users without org membership)
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
