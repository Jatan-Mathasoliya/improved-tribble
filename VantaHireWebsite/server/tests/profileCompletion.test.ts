// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUserProfileMock = vi.fn();

vi.mock('../storage', () => ({
  storage: {
    getUserProfile: getUserProfileMock,
  },
}));

vi.mock('../db', () => ({
  db: {},
}));

describe('computeProfileCompletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires phone for recruiters', async () => {
    getUserProfileMock.mockResolvedValue({
      company: 'TechStart Inc',
      phone: null,
      linkedin: null,
      location: null,
      bio: null,
    });

    const { computeProfileCompletion } = await import('../lib/profileCompletion');

    const result = await computeProfileCompletion({
      id: 42,
      role: 'recruiter',
      firstName: 'Alice',
      lastName: 'Recruiter',
    } as any);

    expect(result.complete).toBe(false);
    expect(result.missingRequired).toContain('phone');
    expect(result.missingRequired).not.toContain('company');
  });

  it('marks recruiters complete when company and phone are present', async () => {
    getUserProfileMock.mockResolvedValue({
      company: 'TechStart Inc',
      phone: '+91 99999 88888',
      linkedin: null,
      location: null,
      bio: null,
    });

    const { computeProfileCompletion } = await import('../lib/profileCompletion');

    const result = await computeProfileCompletion({
      id: 42,
      role: 'recruiter',
      firstName: 'Alice',
      lastName: 'Recruiter',
    } as any);

    expect(result.complete).toBe(true);
    expect(result.missingRequired).toEqual([]);
  });
});
