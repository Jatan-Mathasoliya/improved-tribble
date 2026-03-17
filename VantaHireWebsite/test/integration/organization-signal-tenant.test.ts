// @vitest-environment node
import '../setup.integration';
import { describe, it, expect, afterEach } from 'vitest';
import { db } from '../../server/db';
import { organizations, users } from '@shared/schema';
import { inArray } from 'drizzle-orm';
import {
  createOrganizationWithOwner,
  createRecruiterUser,
} from '../utils/db-helpers';

const HAS_DB = !!process.env.DATABASE_URL;
const maybeDescribe = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[TEST] Skipping organization signal tenant tests: DATABASE_URL not set');
}

maybeDescribe('Organization signal tenant provisioning', () => {
  const created = {
    userIds: [] as number[],
    orgIds: [] as number[],
  };

  afterEach(async () => {
    if (created.orgIds.length > 0) {
      await db.delete(organizations).where(inArray(organizations.id, created.orgIds));
    }
    if (created.userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, created.userIds));
    }
    created.orgIds = [];
    created.userIds = [];
  });

  it('assigns signal_tenant_id using the org_<id> pattern on creation', async () => {
    const owner = await createRecruiterUser({
      username: `org-signal-${Date.now()}@test.com`,
      password: 'TestPassword123!',
    });
    created.userIds.push(owner.id);

    const org = await createOrganizationWithOwner({
      name: `Signal Tenant Org ${Date.now()}`,
      ownerId: owner.id,
    });
    created.orgIds.push(org.id);

    expect(org.signalTenantId).toBe(`org_${org.id}`);
  });
});
