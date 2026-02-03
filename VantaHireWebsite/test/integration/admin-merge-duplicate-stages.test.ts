// @vitest-environment node
import '../setup.integration';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes';
import { db } from '../../server/db';
import { applications, jobs, organizations, pipelineStages, users } from '@shared/schema';
import { inArray, sql } from 'drizzle-orm';
import { createRecruiterUser, createOrganizationWithOwner } from '../utils/db-helpers';

const HAS_DB = !!process.env.DATABASE_URL;
const maybeDescribe = HAS_DB ? describe : describe.skip;
let dbAvailable = HAS_DB;

if (!HAS_DB) {
  console.warn('[TEST] Skipping admin duplicate stage merge tests: DATABASE_URL not set');
}

async function checkDbAvailability() {
  if (!dbAvailable) return;
  try {
    await db.execute(sql`select 1`);
  } catch (error) {
    dbAvailable = false;
    console.warn('[TEST] Database unavailable, skipping admin duplicate stage merge tests:', error);
  }
}

maybeDescribe('Admin Ops - Merge Duplicate Pipeline Stages', () => {
  let app: express.Express;
  let server: any;

  const created = {
    userIds: [] as number[],
    orgIds: [] as number[],
    stageIds: [] as number[],
    jobIds: [] as number[],
    appIds: [] as number[],
  };

  beforeAll(async () => {
    app = express();
    server = await registerRoutes(app);
    await checkDbAvailability();
  });

  afterAll(() => {
    server?.close();
  });

  afterEach(async () => {
    if (!HAS_DB || !dbAvailable) return;

    if (created.appIds.length > 0) {
      await db.delete(applications).where(inArray(applications.id, created.appIds));
    }
    if (created.jobIds.length > 0) {
      await db.delete(jobs).where(inArray(jobs.id, created.jobIds));
    }
    if (created.stageIds.length > 0) {
      await db.delete(pipelineStages).where(inArray(pipelineStages.id, created.stageIds));
    }
    if (created.orgIds.length > 0) {
      await db.delete(organizations).where(inArray(organizations.id, created.orgIds));
    }
    if (created.userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, created.userIds));
    }

    created.userIds = [];
    created.orgIds = [];
    created.stageIds = [];
    created.jobIds = [];
    created.appIds = [];
  });

  it('returns duplicate groups and counts in dry run', async () => {
    if (!dbAvailable) return;

    const superAdmin = await createRecruiterUser({
      username: `superadmin_merge_${Date.now()}@example.com`,
      password: 'password123',
      role: 'super_admin',
    });
    created.userIds.push(superAdmin.id);

    const owner = await createRecruiterUser({
      username: `owner_merge_${Date.now()}@example.com`,
      password: 'password123',
      role: 'recruiter',
    });
    created.userIds.push(owner.id);

    const org = await createOrganizationWithOwner({
      name: `Merge Stage Org ${Date.now()}`,
      ownerId: owner.id,
    });
    created.orgIds.push(org.id);

    const stageName = `Duplicate Stage ${Date.now()}`;

    const [defaultStage] = await db.insert(pipelineStages).values({
      name: stageName,
      order: 1,
      isDefault: true,
      organizationId: null,
    }).returning();
    created.stageIds.push(defaultStage.id);

    const [orgStage] = await db.insert(pipelineStages).values({
      name: stageName,
      order: 2,
      isDefault: false,
      organizationId: org.id,
      createdBy: owner.id,
    }).returning();
    created.stageIds.push(orgStage.id);

    const [job] = await db.insert(jobs).values({
      title: `Merge Stage Job ${Date.now()}`,
      location: 'Remote',
      type: 'full-time',
      description: 'Merge stage test job',
      postedBy: owner.id,
      organizationId: org.id,
    }).returning();
    created.jobIds.push(job.id);

    const [appRecord] = await db.insert(applications).values({
      jobId: job.id,
      name: 'Merge Stage Candidate',
      email: `candidate_${Date.now()}@example.com`,
      phone: '1234567890',
      resumeUrl: 'https://example.com/resume.pdf',
      organizationId: org.id,
      currentStage: defaultStage.id,
    }).returning();
    created.appIds.push(appRecord.id);

    const agent = request.agent(app);
    await agent.post('/api/login').send({
      username: superAdmin.username,
      password: 'password123',
      expectedRole: ['super_admin'],
    });

    const csrfResponse = await agent.get('/api/csrf-token');
    const csrfToken = csrfResponse.body?.token;

    const response = await agent
      .post('/api/admin/ops/merge-duplicate-stages')
      .set('x-csrf-token', csrfToken)
      .send({ orgId: org.id, dryRun: true });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('dryRun', true);
    expect(Array.isArray(response.body.duplicateGroups)).toBe(true);
    expect(response.body.duplicateGroups.length).toBeGreaterThan(0);

    const matchingGroup = response.body.duplicateGroups.find(
      (group: any) => Array.isArray(group.duplicateStageIds) && group.duplicateStageIds.includes(defaultStage.id)
    );
    expect(matchingGroup).toBeTruthy();
    expect(matchingGroup.canonicalId).toBe(orgStage.id);

    expect(response.body.totals).toHaveProperty('applicationsToMove', 1);
  });
});
