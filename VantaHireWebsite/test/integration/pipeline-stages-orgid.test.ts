// @vitest-environment node
import '../setup.integration';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes';
import { db } from '../../server/db';
import { organizations, pipelineStages, users } from '@shared/schema';
import { inArray, sql } from 'drizzle-orm';
import { createRecruiterUser, createOrganizationWithOwner } from '../utils/db-helpers';

const HAS_DB = !!process.env.DATABASE_URL;
const maybeDescribe = HAS_DB ? describe : describe.skip;
let dbAvailable = HAS_DB;

if (!HAS_DB) {
  console.warn('[TEST] Skipping pipeline stages orgId tests: DATABASE_URL not set');
}

async function checkDbAvailability() {
  if (!dbAvailable) return;
  try {
    await db.execute(sql`select 1`);
  } catch (error) {
    dbAvailable = false;
    console.warn('[TEST] Database unavailable, skipping pipeline stages orgId tests:', error);
  }
}

maybeDescribe('Pipeline stages orgId handling', () => {
  let app: express.Express;
  let server: any;

  const created = {
    userIds: [] as number[],
    orgIds: [] as number[],
    stageIds: [] as number[],
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
  });

  it('returns default stages for super_admin when orgId=none', async () => {
    if (!dbAvailable) return;

    const superAdmin = await createRecruiterUser({
      username: `superadmin_orgid_${Date.now()}@example.com`,
      password: 'password123',
      role: 'super_admin',
    });
    created.userIds.push(superAdmin.id);

    const owner = await createRecruiterUser({
      username: `owner_orgid_${Date.now()}@example.com`,
      password: 'password123',
      role: 'recruiter',
    });
    created.userIds.push(owner.id);

    const org = await createOrganizationWithOwner({
      name: `OrgId Test Org ${Date.now()}`,
      ownerId: owner.id,
    });
    created.orgIds.push(org.id);

    const stageName = `Stage OrgId ${Date.now()}`;

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

    const agent = request.agent(app);
    await agent.post('/api/login').send({
      username: superAdmin.username,
      password: 'password123',
      expectedRole: ['super_admin'],
    });

    const response = await agent.get('/api/pipeline/stages?orgId=none');

    expect(response.status).toBe(200);
    const stageIds = (response.body as { id: number }[]).map((stage) => stage.id);
    expect(stageIds).toContain(defaultStage.id);
    expect(stageIds).not.toContain(orgStage.id);
  });
});
