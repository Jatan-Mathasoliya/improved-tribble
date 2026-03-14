import { validateResumeText } from './resumeExtractor';

export type ResumeImportItemStatus =
  | 'queued'
  | 'processing'
  | 'processed'
  | 'needs_review'
  | 'finalized'
  | 'failed'
  | 'duplicate';

export type ResumeImportBatchStatus =
  | 'queued'
  | 'processing'
  | 'ready_for_review'
  | 'completed'
  | 'failed';

export interface ParsedResumeFields {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface ResumeImportItemAssessment {
  status: Extract<ResumeImportItemStatus, 'processed' | 'needs_review' | 'failed'>;
  errorReason: string | null;
}

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /\b[\p{L}][\p{L}0-9._%+-]*@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/giu;

// US: (xxx) xxx-xxxx, xxx-xxx-xxxx, +1 xxx xxx xxxx
const US_PHONE_REGEX =
  /(?:\+?1[\s().-]*)?(?:\(?\d{3}\)?[\s().-]*)\d{3}[\s().-]*\d{4}\b/g;

// Indian: +91 XXXXXXXXXX, +91-XXXX-XXXXXX, bare 10-digit starting with 6-9
// Use lookahead instead of \b because digits may be followed by letters (e.g. "9655728080Madurai")
const INDIAN_PHONE_REGEX =
  /(?:\+?91[\s.-]*)?(?<![0-9])[6-9]\d{9}(?=[^0-9]|$)/g;

// Quick check for phone-like content (used by looksLikeName to reject lines)
const PHONE_LIKE_REGEX =
  /(?:\+?91[\s.-]*)?[6-9]\d{9}\b|(?:\+?1[\s().-]*)?\(?\d{3}\)?[\s().-]*\d{3}[\s().-]*\d{4}\b/;

// ---------------------------------------------------------------------------
// Name scoring constants
// ---------------------------------------------------------------------------

const IGNORED_NAME_TOKENS = new Set([
  'resume',
  'curriculum vitae',
  'cv',
  'profile',
  'profile summary',
  'summary',
  'experience',
  'work experience',
  'professional experience',
  'professional summary',
  'projects',
  'skills',
  'education',
  'contact',
  'contact information',
  'contact details',
  'personal details',
  'personal information',
  'objective',
  'career objective',
  'about me',
  'about',
  'email',
  'phone',
  'mobile',
  'linkedin',
  'portfolio',
  'references',
  'certifications',
  'achievements',
  'core competencies',
  'key skills',
  'technical skills',
  'core strengths',
  'work history',
]);

const TITLE_WORDS = new Set([
  // Role nouns
  'engineer', 'developer', 'designer', 'manager', 'director', 'analyst',
  'consultant', 'architect', 'specialist', 'coordinator', 'administrator',
  'intern', 'trainee', 'fellow', 'associate', 'assistant', 'executive',
  'officer', 'advisor', 'strategist', 'researcher', 'scientist', 'expert',
  'practitioner', 'evangelist', 'advocate',
  // Seniority / org level
  'lead', 'senior', 'junior', 'principal', 'staff', 'head', 'chief',
  'vp', 'cto', 'ceo', 'cfo', 'coo', 'svp', 'evp',
  // Domain / function
  'software', 'hardware', 'frontend', 'backend', 'fullstack', 'full-stack',
  'devops', 'data', 'product', 'project', 'program', 'marketing', 'sales',
  'operations', 'hr', 'human', 'resources', 'finance', 'accounting',
  'qa', 'quality', 'assurance', 'test', 'testing', 'support', 'technical',
  'digital', 'growth', 'business', 'systems', 'network', 'security',
  'platform', 'solutions', 'delivery', 'service', 'content', 'creative',
  'visual', 'graphic', 'ui', 'ux', 'web', 'mobile', 'cloud', 'machine',
  'learning', 'stack', 'full',
  // Tech terms that are NOT plausible names
  'python', 'javascript', 'typescript', 'angular', 'react', 'vue', 'kotlin',
  'scala', 'php', 'sql', 'html', 'css', 'aws', 'azure', 'gcp', 'kubernetes',
  'docker', 'linux', 'android', 'ios', 'tableau', 'salesforce', 'sap',
]);

// ---------------------------------------------------------------------------
// Pre-processing
// ---------------------------------------------------------------------------

/**
 * Collapse spaced-letter text like "U N N A T I   P A N C H A L" → "UNNATI PANCHAL".
 * Matches sequences of single uppercase letters separated by single spaces,
 * with word groups separated by 2+ spaces.
 */
function collapseSpacedLetters(text: string): string {
  // Match lines where content is single letters separated by single spaces,
  // with word groups separated by 2+ spaces. Handles any case (not just uppercase).
  return text.replace(/^([\p{L}](?: [\p{L}]){2,}(?:  +[\p{L}](?: [\p{L}]){0,})*)$/gmu, (match) => {
    // Split on 2+ spaces to get word groups, then collapse each group
    return match
      .split(/  +/)
      .map((group) => group.replace(/ /g, ''))
      .join(' ');
  });
}

/**
 * Rejoin email addresses split across lines.
 * Handles patterns like "localpart\n@domain.com" or "localpart@\ndomain.com".
 */
function rejoinSplitEmails(text: string): string {
  // localpart\n@domain
  let result = text.replace(/([\w._%+-]+)\s*\n\s*(@[\w.-]+\.\w{2,})/gi, '$1$2');
  // localpart@\ndomain
  result = result.replace(/([\w._%+-]+@)\s*\n\s*([\w.-]+\.\w{2,})/gi, '$1$2');
  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

/** Checks if a line could plausibly be a person's name (basic structural check). */
function looksLikeName(line: string): boolean {
  if (!line) return false;
  const lower = line.toLowerCase();
  if (lower.length < 2 || lower.length > 80) return false;
  if (lower.includes('@')) return false;
  if (PHONE_LIKE_REGEX.test(line)) return false;
  if (line.includes('|') || line.includes(':') || line.includes('/') || line.includes(',') || /\d/.test(line)) return false;
  if (IGNORED_NAME_TOKENS.has(lower)) return false;
  const words = line
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}''\-]/gu, ''))
    .filter(Boolean);
  if (words.length < 1 || words.length > 4) return false;
  return words.every((word) => /^[\p{L}][\p{L}''\-]*$/u.test(word));
}

function normalizeName(raw: string): string {
  const trimmed = cleanLine(raw);
  if (trimmed === trimmed.toUpperCase()) {
    return trimmed
      .toLowerCase()
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  return trimmed;
}

/**
 * Score a candidate name line. Higher = more likely to be a real name.
 * Returns a negative score if the line should be disqualified.
 */
function scoreNameCandidate(line: string, lineIndex: number, allLines: string[]): number {
  const lower = line.toLowerCase();
  const words = lower.split(/\s+/);
  let score = 0;

  // Base: passing looksLikeName is required
  if (!looksLikeName(line)) return -1000;

  // Bonus: 2-3 word names are ideal
  if (words.length === 2) score += 20;
  else if (words.length === 3) score += 15;
  else if (words.length === 1) score += 5;
  else score += 2; // 4 words

  // Bonus: earlier lines (names usually appear near top)
  score += Math.max(0, 10 - lineIndex * 2);

  // Bonus: ALL_CAPS or Title Case (common for name headers)
  if (line === line.toUpperCase()) score += 10;
  else if (words.every((w) => w.length <= 1 || w[0] === w[0]!.toUpperCase())) score += 5;

  // Penalty: title/role words
  let titleWordCount = 0;
  for (const w of words) {
    if (TITLE_WORDS.has(w)) titleWordCount++;
  }
  if (titleWordCount > 0) {
    // If every word is a title word → strong penalty (pure role line)
    if (titleWordCount === words.length) score -= 50;
    // If majority title → moderate penalty
    else if (titleWordCount > words.length / 2) score -= 30;
    // One title word in a multi-word line → mild penalty (could be "Staff Doe" edge case)
    else score -= 10;
  }

  // Bonus: adjacent to email/phone/linkedin lines
  const adjacentLines = [
    lineIndex > 0 ? allLines[lineIndex - 1] : '',
    lineIndex < allLines.length - 1 ? allLines[lineIndex + 1] : '',
  ];
  for (const adj of adjacentLines) {
    if (!adj) continue;
    const adjLower = adj.toLowerCase();
    if (adjLower.includes('@')) score += 8;
    if (PHONE_LIKE_REGEX.test(adj) || /\d{10}/.test(adj)) score += 8;
    if (adjLower.includes('linkedin')) score += 5;
  }

  // Penalty: looks like a professional summary phrase
  if (words.length >= 3) {
    const summaryIndicators = ['with', 'and', 'in', 'of', 'for', 'the', 'a', 'an', 'to', 'at', 'by', 'on'];
    const summaryWordCount = words.filter((w) => summaryIndicators.includes(w)).length;
    if (summaryWordCount >= 2) score -= 25;
  }

  return score;
}

// ---------------------------------------------------------------------------
// Exported extractors
// ---------------------------------------------------------------------------

export function extractEmail(text: string): string | null {
  // Pre-process: rejoin split emails, split concatenated phone+email
  let processed = rejoinSplitEmails(text);
  processed = processed.replace(/\d{10,}([\p{L}])/gu, ' $1');
  const matches = processed.match(EMAIL_REGEX);
  if (!matches?.length) return null;
  return matches[0]!.trim().toLowerCase();
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');

  // US: 11 digits starting with 1 → strip country code
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  // US: exactly 10 digits
  if (digits.length === 10) {
    return digits;
  }
  // Indian: 12 digits starting with 91 → strip country code to bare 10
  if (digits.length === 12 && digits.startsWith('91') && /^91[6-9]/.test(digits)) {
    return digits.slice(2);
  }
  // Indian with leading 0: 0XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith('0') && /^0[6-9]/.test(digits)) {
    return digits.slice(1);
  }

  return null;
}

export function extractPhone(text: string): string | null {
  // Try Indian patterns first (more specific), then US
  const indianMatches = text.match(INDIAN_PHONE_REGEX);
  if (indianMatches?.length) {
    for (const match of indianMatches) {
      const normalized = normalizePhone(match);
      if (normalized) return normalized;
    }
  }

  const usMatches = text.match(US_PHONE_REGEX);
  if (usMatches?.length) {
    for (const match of usMatches) {
      const normalized = normalizePhone(match);
      if (normalized) return normalized;
    }
  }

  // Secondary pass: collapse intra-line separators between digits and retry.
  // Catches grouped formats like "98765 43210", "987-654-3210".
  // Strip +91 prefix first to avoid merging country code with subscriber digits.
  // Use [ \t.-] (not \s) to avoid collapsing across newlines.
  let preprocessed = text.replace(/\+?91[ \t.-]+(?=[6-9])/g, '');
  preprocessed = preprocessed.replace(/(\d)[ \t.-]+(?=\d)/g, '$1');
  if (preprocessed !== text) {
    const indianRetry = preprocessed.match(INDIAN_PHONE_REGEX);
    if (indianRetry?.length) {
      for (const match of indianRetry) {
        const normalized = normalizePhone(match);
        if (normalized) return normalized;
      }
    }

    const usRetry = preprocessed.match(US_PHONE_REGEX);
    if (usRetry?.length) {
      for (const match of usRetry) {
        const normalized = normalizePhone(match);
        if (normalized) return normalized;
      }
    }
  }

  return null;
}

export function extractName(text: string): string | null {
  const preprocessed = collapseSpacedLetters(text);
  const lines = preprocessed
    .split('\n')
    .map(cleanLine)
    .filter(Boolean)
    .slice(0, 12);

  // Collect scored candidates from multi-word lines
  interface Candidate { line: string; score: number }
  const candidates: Candidate[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!looksLikeName(line)) continue;
    const words = line
      .split(/\s+/)
      .map((part) => part.replace(/[^\p{L}''\-]/gu, ''))
      .filter(Boolean);
    if (words.length >= 2) {
      candidates.push({ line, score: scoreNameCandidate(line, i, lines) });
    }
  }

  // Also score adjacent single-word name-like lines joined together
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i]!;
    const b = lines[i + 1]!;
    if (
      looksLikeName(a) &&
      looksLikeName(b) &&
      a.split(/\s+/).length === 1 &&
      b.split(/\s+/).length === 1
    ) {
      const joined = `${a} ${b}`;
      // Score using the earlier line's position and context
      const joinedScore = scoreNameCandidate(joined, i, lines) + 5; // +5 bonus for split-name pattern
      candidates.push({ line: joined, score: joinedScore });
    }
  }

  if (candidates.length === 0) return null;

  // Pick highest-scoring candidate
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]!;
  if (best.score < 0) return null;

  return normalizeName(best.line);
}

export function extractResumeFields(text: string): ParsedResumeFields {
  return {
    name: extractName(text),
    email: extractEmail(text),
    phone: extractPhone(text),
  };
}

export function isPlausibleCandidateName(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  return extractName(value) !== null;
}

export function assessResumeImportItem(fields: ParsedResumeFields, extractedText: string | null | undefined): ResumeImportItemAssessment {
  if (!extractedText || !validateResumeText(extractedText)) {
    return {
      status: 'failed',
      errorReason: 'No usable resume text extracted',
    };
  }

  if (fields.name && (fields.email || fields.phone)) {
    return {
      status: 'processed',
      errorReason: null,
    };
  }

  const missing: string[] = [];
  if (!fields.name) missing.push('name');
  if (!fields.email && !fields.phone) missing.push('email_or_phone');

  return {
    status: 'needs_review',
    errorReason: `Missing ${missing.join(', ')}`,
  };
}

export function canFinalizeResumeImportItem(fields: ParsedResumeFields, gcsPath: string | null | undefined, extractedText: string | null | undefined): boolean {
  return Boolean(
    gcsPath &&
    extractedText &&
    validateResumeText(extractedText) &&
    fields.name &&
    fields.email &&
    fields.phone,
  );
}

export function computeResumeImportBatchStatus(input: {
  fileCount: number;
  queuedCount: number;
  processingCount: number;
  processedCount: number;
  needsReviewCount: number;
  failedCount: number;
  duplicateCount: number;
  finalizedCount: number;
}): ResumeImportBatchStatus {
  if (input.fileCount === 0) {
    return 'queued';
  }

  if (input.processingCount > 0 || input.queuedCount > 0) {
    return input.processedCount === 0 &&
      input.needsReviewCount === 0 &&
      input.failedCount === 0 &&
      input.duplicateCount === 0 &&
      input.finalizedCount === 0
      ? 'queued'
      : 'processing';
  }

  if (
    input.finalizedCount + input.failedCount + input.duplicateCount === input.fileCount &&
    input.needsReviewCount === 0 &&
    input.processedCount === 0
  ) {
    return input.finalizedCount > 0 || input.duplicateCount > 0 ? 'completed' : 'failed';
  }

  return 'ready_for_review';
}
