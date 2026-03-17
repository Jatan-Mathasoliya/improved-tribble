import { describe, it, expect } from 'vitest';

/**
 * Tests for the ActiveKG graph sync enqueue gate logic.
 *
 * The gating pattern used across all 3 enqueue sites:
 *   const hasValidResumeText = text && text.trim().length >= MIN_RESUME_TEXT_LENGTH;
 *
 * We test the pure logic here without needing Express/storage mocks.
 */

// Import the constant directly
import { MIN_RESUME_TEXT_LENGTH } from '../../server/lib/applicationGraphSyncProcessor';

/** Mirrors the gate check used in applications.routes.ts and candidates.semantic.routes.ts */
function shouldEnqueueSync(extractedResumeText: string | null | undefined): boolean {
  return !!(extractedResumeText && extractedResumeText.trim().length >= MIN_RESUME_TEXT_LENGTH);
}

/** Mirrors the skip-reason logic used at all 3 enqueue sites */
function getSyncSkipReason(extractedResumeText: string | null | undefined): string | null {
  if (shouldEnqueueSync(extractedResumeText)) return null;
  return !extractedResumeText ? 'resume_text_missing' : 'resume_text_below_threshold';
}

describe('ActiveKG graph sync enqueue gate', () => {
  describe('MIN_RESUME_TEXT_LENGTH constant', () => {
    it('should equal 50 (matches processor threshold)', () => {
      expect(MIN_RESUME_TEXT_LENGTH).toBe(50);
    });
  });

  describe('shouldEnqueueSync', () => {
    it('should return true when extractedResumeText is valid (>= 50 chars)', () => {
      const validText = 'A'.repeat(50);
      expect(shouldEnqueueSync(validText)).toBe(true);
    });

    it('should return true for text much longer than threshold', () => {
      const longText = 'A'.repeat(5000);
      expect(shouldEnqueueSync(longText)).toBe(true);
    });

    it('should return false when extractedResumeText is null', () => {
      expect(shouldEnqueueSync(null)).toBe(false);
    });

    it('should return false when extractedResumeText is undefined', () => {
      expect(shouldEnqueueSync(undefined)).toBe(false);
    });

    it('should return false when extractedResumeText is below threshold', () => {
      const shortText = 'A'.repeat(49);
      expect(shouldEnqueueSync(shortText)).toBe(false);
    });

    it('should return false when extractedResumeText is empty string', () => {
      expect(shouldEnqueueSync('')).toBe(false);
    });

    it('should return false when extractedResumeText is only whitespace', () => {
      expect(shouldEnqueueSync('   \n\t   ')).toBe(false);
    });

    it('should use trimmed length (whitespace-padded text below threshold)', () => {
      // 30 real chars + lots of whitespace = still below threshold after trim
      const paddedText = '   ' + 'A'.repeat(30) + '   ';
      expect(shouldEnqueueSync(paddedText)).toBe(false);
    });

    it('should use trimmed length (whitespace-padded text at threshold)', () => {
      // Exactly 50 real chars with surrounding whitespace
      const paddedText = '   ' + 'A'.repeat(50) + '   ';
      expect(shouldEnqueueSync(paddedText)).toBe(true);
    });
  });

  describe('getSyncSkipReason', () => {
    it('should return null when text is valid (no skip)', () => {
      expect(getSyncSkipReason('A'.repeat(100))).toBeNull();
    });

    it('should return resume_text_missing when text is null', () => {
      expect(getSyncSkipReason(null)).toBe('resume_text_missing');
    });

    it('should return resume_text_missing when text is undefined', () => {
      expect(getSyncSkipReason(undefined)).toBe('resume_text_missing');
    });

    it('should return resume_text_below_threshold when text is too short', () => {
      expect(getSyncSkipReason('A'.repeat(10))).toBe('resume_text_below_threshold');
    });

    it('should return resume_text_missing when text is empty string', () => {
      // Empty string is falsy, so classified as missing
      expect(getSyncSkipReason('')).toBe('resume_text_missing');
    });

    it('should return resume_text_below_threshold when text is below threshold but non-empty', () => {
      expect(getSyncSkipReason('Short resume')).toBe('resume_text_below_threshold');
    });
  });
});
