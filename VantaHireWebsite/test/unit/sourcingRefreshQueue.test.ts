import { describe, expect, it } from 'vitest';
import { deriveSourcingRefreshAttempts } from '../../server/lib/sourcingRefreshQueue';

describe('deriveSourcingRefreshAttempts', () => {
  it('derives attempts from refresh timeout and retry delay', () => {
    const attempts = deriveSourcingRefreshAttempts(
      6 * 60 * 60 * 1000,
      5 * 60 * 1000,
      0,
    );
    expect(attempts).toBe(74); // ceil(360/5) + 2
  });

  it('never allows user-configured attempts below timeout-derived minimum', () => {
    const attempts = deriveSourcingRefreshAttempts(
      60 * 60 * 1000,
      10 * 60 * 1000,
      3,
    );
    expect(attempts).toBe(8); // ceil(60/10) + 2
  });

  it('uses higher user-configured attempts when above timeout-derived minimum', () => {
    const attempts = deriveSourcingRefreshAttempts(
      60 * 60 * 1000,
      10 * 60 * 1000,
      20,
    );
    expect(attempts).toBe(20);
  });
});
