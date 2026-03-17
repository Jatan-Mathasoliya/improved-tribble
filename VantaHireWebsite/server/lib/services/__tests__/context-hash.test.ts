import { describe, it, expect } from 'vitest';
import { deepSortKeys, computeContextHash } from '../../../signal.routes';
import { CONTEXT_HASH_VERSION } from '../signal-contracts';

describe('deepSortKeys', () => {
  it('sorts top-level keys', () => {
    expect(deepSortKeys({ b: 2, a: 1 })).toEqual({ a: 1, b: 2 });
  });

  it('sorts nested object keys recursively', () => {
    const input = { jdDigest: { b: 2, a: 1 } };
    const expected = { jdDigest: { a: 1, b: 2 } };
    expect(deepSortKeys(input)).toEqual(expected);
  });

  it('handles deep nesting', () => {
    const a = { jdDigest: { sections: { z: 1, a: 2 }, title: 'x' } };
    const b = { jdDigest: { title: 'x', sections: { a: 2, z: 1 } } };
    expect(JSON.stringify(deepSortKeys(a))).toBe(JSON.stringify(deepSortKeys(b)));
  });

  it('preserves array element order (arrays are positional)', () => {
    expect(deepSortKeys(['b', 'a'])).toEqual(['b', 'a']);
    expect(JSON.stringify(deepSortKeys(['b', 'a']))).not.toBe(
      JSON.stringify(deepSortKeys(['a', 'b'])),
    );
  });

  it('handles null and primitives', () => {
    expect(deepSortKeys(null)).toBe(null);
    expect(deepSortKeys(undefined)).toBe(undefined);
    expect(deepSortKeys(42)).toBe(42);
    expect(deepSortKeys('hello')).toBe('hello');
  });

  it('handles arrays of objects with different key order', () => {
    const input = [{ b: 2, a: 1 }, { d: 4, c: 3 }];
    const result = deepSortKeys(input) as Record<string, number>[];
    expect(Object.keys(result[0]!)).toEqual(['a', 'b']);
    expect(Object.keys(result[1]!)).toEqual(['c', 'd']);
  });
});

describe('computeContextHash', () => {
  const baseJob = {
    jdDigest: { skills: ['python'], title: 'Engineer' } as Record<string, unknown>,
    jdDigestVersion: 1,
    title: 'Software Engineer',
    skills: ['python', 'typescript'] as string[],
    goodToHaveSkills: ['go'] as string[],
    location: 'Delhi, India',
    experienceYears: 3,
    educationRequirement: 'bachelors',
  };

  it('produces consistent hash for identical input', () => {
    const h1 = computeContextHash(baseJob);
    const h2 = computeContextHash({ ...baseJob });
    expect(h1).toBe(h2);
  });

  it('nested key order in jdDigest does not change the hash', () => {
    const jobA = { ...baseJob, jdDigest: { b: 2, a: 1 } };
    const jobB = { ...baseJob, jdDigest: { a: 1, b: 2 } };
    expect(computeContextHash(jobA)).toBe(computeContextHash(jobB));
  });

  it('deeply nested jdDigest key order does not change the hash', () => {
    const jobA = { ...baseJob, jdDigest: { sections: { z: 1, a: 2 } } };
    const jobB = { ...baseJob, jdDigest: { sections: { a: 2, z: 1 } } };
    expect(computeContextHash(jobA)).toBe(computeContextHash(jobB));
  });

  it('nested jdDigest value changes produce different hash', () => {
    const jobA = { ...baseJob, jdDigest: { sections: { a: 1, b: { c: 1 } } } };
    const jobB = { ...baseJob, jdDigest: { sections: { a: 1, b: { c: 2 } } } };
    expect(computeContextHash(jobA)).not.toBe(computeContextHash(jobB));
  });

  it('null jdDigest produces consistent hash', () => {
    const job = { ...baseJob, jdDigest: null, jdDigestVersion: null };
    const h1 = computeContextHash(job);
    const h2 = computeContextHash({ ...job });
    expect(h1).toBe(h2);
  });

  it('different content produces different hash', () => {
    const jobA = { ...baseJob };
    const jobB = { ...baseJob, title: 'Product Manager' };
    expect(computeContextHash(jobA)).not.toBe(computeContextHash(jobB));
  });

  it('hash is a 64-char hex string (sha256)', () => {
    const hash = computeContextHash(baseJob);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('current CONTEXT_HASH_VERSION is 4', () => {
    expect(CONTEXT_HASH_VERSION).toBe(4);
  });

  it('skill order does not change the hash (normalized + sorted)', () => {
    const jobA = { ...baseJob, skills: ['Python', 'TypeScript'] };
    const jobB = { ...baseJob, skills: ['TypeScript', 'Python'] };
    expect(computeContextHash(jobA)).toBe(computeContextHash(jobB));
  });

  it('skill casing does not change the hash (normalized to lowercase)', () => {
    const jobA = { ...baseJob, skills: ['Python', 'TypeScript'] };
    const jobB = { ...baseJob, skills: ['python', 'typescript'] };
    expect(computeContextHash(jobA)).toBe(computeContextHash(jobB));
  });
});
