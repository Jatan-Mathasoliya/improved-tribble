import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('activekgSearchConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.ACTIVEKG_SEARCH_MODE;
    delete process.env.ACTIVEKG_SEARCH_TOP_K;
    delete process.env.ACTIVEKG_SEARCH_USE_RERANKER;
    delete process.env.ACTIVEKG_SEARCH_SIGNED_URL_MINUTES;
    delete process.env.ACTIVEKG_SEARCH_ALLOW_GLOBAL_SUPER_ADMIN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function load() {
    const mod = await import('../../server/lib/activekgSearchConfig');
    return mod;
  }

  describe('getSearchMode', () => {
    it('defaults to hybrid', async () => {
      const { getSearchMode } = await load();
      expect(getSearchMode()).toBe('hybrid');
    });

    it('accepts vector', async () => {
      process.env.ACTIVEKG_SEARCH_MODE = 'vector';
      const { getSearchMode } = await load();
      expect(getSearchMode()).toBe('vector');
    });

    it('accepts keyword', async () => {
      process.env.ACTIVEKG_SEARCH_MODE = 'keyword';
      const { getSearchMode } = await load();
      expect(getSearchMode()).toBe('keyword');
    });

    it('falls back to hybrid for invalid value', async () => {
      process.env.ACTIVEKG_SEARCH_MODE = 'fuzzy';
      const { getSearchMode } = await load();
      expect(getSearchMode()).toBe('hybrid');
    });
  });

  describe('getSearchTopK', () => {
    it('defaults to 20', async () => {
      const { getSearchTopK } = await load();
      expect(getSearchTopK()).toBe(20);
    });

    it('reads env value', async () => {
      process.env.ACTIVEKG_SEARCH_TOP_K = '50';
      const { getSearchTopK } = await load();
      expect(getSearchTopK()).toBe(50);
    });

    it('clamps to minimum 1', async () => {
      process.env.ACTIVEKG_SEARCH_TOP_K = '0';
      const { getSearchTopK } = await load();
      expect(getSearchTopK()).toBe(1);
    });

    it('clamps to maximum 100', async () => {
      process.env.ACTIVEKG_SEARCH_TOP_K = '999';
      const { getSearchTopK } = await load();
      expect(getSearchTopK()).toBe(100);
    });

    it('falls back to default for non-numeric', async () => {
      process.env.ACTIVEKG_SEARCH_TOP_K = 'abc';
      const { getSearchTopK } = await load();
      expect(getSearchTopK()).toBe(20);
    });
  });

  describe('getSearchUseReranker', () => {
    it('defaults to true', async () => {
      const { getSearchUseReranker } = await load();
      expect(getSearchUseReranker()).toBe(true);
    });

    it('returns false when set to false', async () => {
      process.env.ACTIVEKG_SEARCH_USE_RERANKER = 'false';
      const { getSearchUseReranker } = await load();
      expect(getSearchUseReranker()).toBe(false);
    });

    it('returns false when set to 0', async () => {
      process.env.ACTIVEKG_SEARCH_USE_RERANKER = '0';
      const { getSearchUseReranker } = await load();
      expect(getSearchUseReranker()).toBe(false);
    });

    it('returns true for any other truthy value', async () => {
      process.env.ACTIVEKG_SEARCH_USE_RERANKER = 'yes';
      const { getSearchUseReranker } = await load();
      expect(getSearchUseReranker()).toBe(true);
    });
  });

  describe('getSearchSignedUrlMinutes', () => {
    it('defaults to 15', async () => {
      const { getSearchSignedUrlMinutes } = await load();
      expect(getSearchSignedUrlMinutes()).toBe(15);
    });

    it('reads env value', async () => {
      process.env.ACTIVEKG_SEARCH_SIGNED_URL_MINUTES = '30';
      const { getSearchSignedUrlMinutes } = await load();
      expect(getSearchSignedUrlMinutes()).toBe(30);
    });

    it('clamps to minimum 1', async () => {
      process.env.ACTIVEKG_SEARCH_SIGNED_URL_MINUTES = '-5';
      const { getSearchSignedUrlMinutes } = await load();
      expect(getSearchSignedUrlMinutes()).toBe(1);
    });

    it('clamps to maximum 1440', async () => {
      process.env.ACTIVEKG_SEARCH_SIGNED_URL_MINUTES = '9999';
      const { getSearchSignedUrlMinutes } = await load();
      expect(getSearchSignedUrlMinutes()).toBe(1440);
    });
  });

  describe('getSearchAllowGlobalSuperAdmin', () => {
    it('defaults to false', async () => {
      const { getSearchAllowGlobalSuperAdmin } = await load();
      expect(getSearchAllowGlobalSuperAdmin()).toBe(false);
    });

    it('returns true when set to true', async () => {
      process.env.ACTIVEKG_SEARCH_ALLOW_GLOBAL_SUPER_ADMIN = 'true';
      const { getSearchAllowGlobalSuperAdmin } = await load();
      expect(getSearchAllowGlobalSuperAdmin()).toBe(true);
    });

    it('returns true when set to 1', async () => {
      process.env.ACTIVEKG_SEARCH_ALLOW_GLOBAL_SUPER_ADMIN = '1';
      const { getSearchAllowGlobalSuperAdmin } = await load();
      expect(getSearchAllowGlobalSuperAdmin()).toBe(true);
    });

    it('returns false for any other value', async () => {
      process.env.ACTIVEKG_SEARCH_ALLOW_GLOBAL_SUPER_ADMIN = 'yes';
      const { getSearchAllowGlobalSuperAdmin } = await load();
      expect(getSearchAllowGlobalSuperAdmin()).toBe(false);
    });
  });

  describe('getSearchDefaults', () => {
    it('returns all defaults as a bundle', async () => {
      const { getSearchDefaults } = await load();
      expect(getSearchDefaults()).toEqual({
        mode: 'hybrid',
        topK: 20,
        useReranker: true,
        signedUrlMinutes: 15,
        allowGlobalSuperAdmin: false,
      });
    });

    it('reflects env overrides', async () => {
      process.env.ACTIVEKG_SEARCH_MODE = 'vector';
      process.env.ACTIVEKG_SEARCH_TOP_K = '10';
      process.env.ACTIVEKG_SEARCH_USE_RERANKER = 'false';
      process.env.ACTIVEKG_SEARCH_SIGNED_URL_MINUTES = '60';
      process.env.ACTIVEKG_SEARCH_ALLOW_GLOBAL_SUPER_ADMIN = 'true';
      const { getSearchDefaults } = await load();
      expect(getSearchDefaults()).toEqual({
        mode: 'vector',
        topK: 10,
        useReranker: false,
        signedUrlMinutes: 60,
        allowGlobalSuperAdmin: true,
      });
    });
  });
});
