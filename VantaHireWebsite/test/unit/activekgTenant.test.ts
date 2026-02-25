import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('activekgTenant', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.ACTIVEKG_TENANT_STRATEGY;
    delete process.env.ACTIVEKG_TENANT_PREFIX;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function load() {
    // Re-import each time so module reads fresh env
    const mod = await import('../../server/lib/activekgTenant');
    return mod;
  }

  describe('getTenantStrategy', () => {
    it('defaults to shared when env is unset', async () => {
      const { getTenantStrategy } = await load();
      expect(getTenantStrategy()).toBe('shared');
    });

    it('returns shared when explicitly set', async () => {
      process.env.ACTIVEKG_TENANT_STRATEGY = 'shared';
      const { getTenantStrategy } = await load();
      expect(getTenantStrategy()).toBe('shared');
    });

    it('returns org_scoped when set', async () => {
      process.env.ACTIVEKG_TENANT_STRATEGY = 'org_scoped';
      const { getTenantStrategy } = await load();
      expect(getTenantStrategy()).toBe('org_scoped');
    });

    it('falls back to shared for invalid values', async () => {
      process.env.ACTIVEKG_TENANT_STRATEGY = 'bogus';
      const { getTenantStrategy } = await load();
      expect(getTenantStrategy()).toBe('shared');
    });

    it('handles whitespace and case insensitivity', async () => {
      process.env.ACTIVEKG_TENANT_STRATEGY = '  ORG_SCOPED  ';
      const { getTenantStrategy } = await load();
      expect(getTenantStrategy()).toBe('org_scoped');
    });
  });

  describe('getTenantPrefix', () => {
    it('defaults to org', async () => {
      const { getTenantPrefix } = await load();
      expect(getTenantPrefix()).toBe('org');
    });

    it('uses env value when set', async () => {
      process.env.ACTIVEKG_TENANT_PREFIX = 'tenant';
      const { getTenantPrefix } = await load();
      expect(getTenantPrefix()).toBe('tenant');
    });

    it('falls back to org when env is empty or whitespace', async () => {
      process.env.ACTIVEKG_TENANT_PREFIX = '   ';
      const { getTenantPrefix } = await load();
      expect(getTenantPrefix()).toBe('org');
    });
  });

  describe('resolveActiveKGTenantId', () => {
    it('returns default for shared strategy', async () => {
      const { resolveActiveKGTenantId } = await load();
      expect(resolveActiveKGTenantId(42)).toBe('default');
    });

    it('returns org-scoped ID with default prefix', async () => {
      process.env.ACTIVEKG_TENANT_STRATEGY = 'org_scoped';
      const { resolveActiveKGTenantId } = await load();
      expect(resolveActiveKGTenantId(42)).toBe('org_42');
    });

    it('uses custom prefix for org_scoped', async () => {
      process.env.ACTIVEKG_TENANT_STRATEGY = 'org_scoped';
      process.env.ACTIVEKG_TENANT_PREFIX = 'company';
      const { resolveActiveKGTenantId } = await load();
      expect(resolveActiveKGTenantId(7)).toBe('company_7');
    });
  });
});
