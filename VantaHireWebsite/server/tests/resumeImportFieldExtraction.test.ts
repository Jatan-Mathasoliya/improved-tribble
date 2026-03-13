import { describe, expect, it } from 'vitest';
import {
  assessResumeImportItem,
  canFinalizeResumeImportItem,
  computeResumeImportBatchStatus,
  extractEmail,
  extractName,
  extractPhone,
  extractResumeFields,
  normalizePhone,
} from '../lib/resumeImportFieldExtraction';

// ===========================================================================
// Phone normalization
// ===========================================================================

describe('phone normalization', () => {
  it('normalizes US +1 prefixed numbers to 10 digits', () => {
    expect(normalizePhone('+1 (650) 555-1010')).toBe('6505551010');
    expect(normalizePhone('+16505551010')).toBe('6505551010');
  });

  it('normalizes US 10-digit numbers', () => {
    expect(normalizePhone('650-555-1010')).toBe('6505551010');
    expect(normalizePhone('(415) 555-1212')).toBe('4155551212');
  });

  it('normalizes Indian +91 prefixed numbers to bare 10 digits', () => {
    expect(normalizePhone('+91 9655728080')).toBe('9655728080');
    expect(normalizePhone('+919655728080')).toBe('9655728080');
    expect(normalizePhone('+91-9655-728080')).toBe('9655728080');
    expect(normalizePhone('+91 8989400515')).toBe('8989400515');
  });

  it('normalizes bare 10-digit Indian numbers', () => {
    expect(normalizePhone('9655728080')).toBe('9655728080');
    expect(normalizePhone('8989400515')).toBe('8989400515');
  });

  it('normalizes Indian 0-prefixed numbers to bare 10 digits', () => {
    expect(normalizePhone('09876543210')).toBe('9876543210');
  });

  it('passes 10-digit numbers starting with digits below 6 (US-like)', () => {
    expect(normalizePhone('5555555555')).toBe('5555555555');
  });

  it('rejects too-short numbers', () => {
    expect(normalizePhone('555')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
  });

  it('rejects too-long numbers', () => {
    expect(normalizePhone('123456789012345')).toBeNull();
  });
});

// ===========================================================================
// Phone extraction
// ===========================================================================

describe('phone extraction', () => {
  it('extracts Indian phone from resume text with location on same line', () => {
    expect(extractPhone('9655728080Madurai, Tamil Nadu')).toBe('9655728080');
  });

  it('extracts Indian phone with +91 prefix from resume text', () => {
    expect(extractPhone('+91 8989400515hipranjul@gmail.com')).toBe('8989400515');
  });

  it('extracts Indian phone from standalone line', () => {
    expect(extractPhone('Phone: +91-9876543210')).toBe('9876543210');
  });

  it('extracts US phone from standard formats', () => {
    expect(extractPhone('Call me at (415) 555-1212')).toBe('4155551212');
    expect(extractPhone('650-555-1010 office')).toBe('6505551010');
  });

  // Grouped Indian phone formats (item 2)
  it('extracts grouped 5+5 Indian phone with space', () => {
    expect(extractPhone('98765 43210')).toBe('9876543210');
  });

  it('extracts grouped 5+5 Indian phone with hyphen', () => {
    expect(extractPhone('98765-43210')).toBe('9876543210');
  });

  it('extracts grouped 3+3+4 Indian phone with spaces', () => {
    expect(extractPhone('987 654 3210')).toBe('9876543210');
  });

  it('extracts grouped 3+3+4 Indian phone with hyphens', () => {
    expect(extractPhone('987-654-3210')).toBe('9876543210');
  });

  it('extracts grouped Indian phone with +91 prefix and spaces', () => {
    expect(extractPhone('+91 98765 43210')).toBe('9876543210');
  });

  it('extracts grouped Indian phone with dots', () => {
    expect(extractPhone('98765.43210')).toBe('9876543210');
  });
});

// ===========================================================================
// Email extraction
// ===========================================================================

describe('email extraction', () => {
  it('extracts clean email when phone digits are concatenated before it', () => {
    expect(extractEmail('+91 8989400515hipranjul@gmail.com')).toBe('hipranjul@gmail.com');
  });

  it('extracts email when 10 digits precede it without space', () => {
    expect(extractEmail('9876543210john@example.com')).toBe('john@example.com');
  });

  it('extracts normal standalone email', () => {
    expect(extractEmail('Email: haswinbabu10@gmail.com')).toBe('haswinbabu10@gmail.com');
  });

  it('extracts email from standard resume text', () => {
    expect(extractEmail('jane.doe@example.com | (415) 555-1212')).toBe('jane.doe@example.com');
  });

  it('extracts email with unicode local part', () => {
    expect(extractEmail('café@example.com')).toBe('café@example.com');
  });
});

// ===========================================================================
// Name extraction — scoring-based (item 3)
// ===========================================================================

describe('name extraction', () => {
  it('extracts standard two-word name on first line', () => {
    expect(extractName('JANE DOE\nSoftware Engineer\njane@example.com')).toBe('Jane Doe');
  });

  it('handles mixed-case single-line names', () => {
    expect(extractName('Vijayabaskar S\nUI/UX Designer')).toBe('Vijayabaskar S');
  });

  it('joins adjacent single-word uppercase name lines', () => {
    const text = `PRANJUL
JAIN
UI/UX DESIGNER
+91 8989400515hipranjul@gmail.com`;
    expect(extractName(text)).toBe('Pranjul Jain');
  });

  it('extracts name that appears after ignored header lines', () => {
    const text = `Profile Summary
PROJECTS
9655728080Madurai, Tamil Nadu
Portfolio
haswinbabu10@gmail.com
LinkedIn
HASWIN BABU
UI/UX DESIGNER`;
    expect(extractName(text)).toBe('Haswin Babu');
  });

  it('rejects location lines containing commas as names', () => {
    const text1 = `New Delhi, India\n9313217206\nroshanpandit9313@gmail.com`;
    expect(extractName(text1)).toBeNull();
    const text2 = `Ahmedabad, Gujrat\n8849782694\nunnatipanchal812@gmail.com`;
    expect(extractName(text2)).toBeNull();
  });

  it('extracts real name even when location line comes first', () => {
    const text = `New Delhi, India
Roshan Pandit
UIUX Designer
roshanpandit9313@gmail.com`;
    expect(extractName(text)).toBe('Roshan Pandit');
  });

  // Scoring: role line above name (item 3 key test)
  it('prefers actual name over role line that appears first', () => {
    const text = `Senior Software Engineer
John Smith
john.smith@example.com
(415) 555-1212`;
    expect(extractName(text)).toBe('John Smith');
  });

  it('prefers actual name over generic role line', () => {
    const text = `Full Stack Developer
Priya Sharma
priya.sharma@example.com`;
    expect(extractName(text)).toBe('Priya Sharma');
  });

  it('handles role line between name and contact', () => {
    const text = `Maria Garcia
Product Manager
maria.garcia@company.com`;
    expect(extractName(text)).toBe('Maria Garcia');
  });

  it('prefers short name near contact info over long role description', () => {
    const text = `Senior Technical Program Manager
Amit Kumar
amit@example.com
+91 9876543210`;
    expect(extractName(text)).toBe('Amit Kumar');
  });

  // Unicode names (item 4)
  it('extracts names with accented characters', () => {
    expect(extractName('José García\nSoftware Engineer\njose@example.com')).toBe('José García');
  });

  it('extracts names with umlauts', () => {
    expect(extractName('Müller Schröder\nBackend Developer')).toBe('Müller Schröder');
  });

  it('extracts names with Cyrillic-like diacritics', () => {
    expect(extractName('Dvořák Novák\ndvorak@example.com')).toBe('Dvořák Novák');
  });

  // Spaced-letter name extraction (real case: Unnati Panchal resume)
  it('collapses spaced-letter names like "U N N A T I   P A N C H A L"', () => {
    const text = `U I / U X   D E S I G N E R
U N N A T I   P A N C H A L
E D U C A T I O N
+91 8849782694
Ahmedabad, Gujrat
unnatipanchal812@gmail.com`;
    expect(extractName(text)).toBe('Unnati Panchal');
  });

  // Split email extraction (real case: Yash Singh resume)
  it('extracts email split across two lines', () => {
    expect(extractEmail('yashghugtyal076\n@gmail.com')).toBe('yashghugtyal076@gmail.com');
  });

  it('extracts email when domain is on next line', () => {
    expect(extractEmail('user@\nexample.com')).toBe('user@example.com');
  });

  // Negative fixture tests (item 5)
  it('returns null for text with only role lines and no name', () => {
    expect(extractName('Software Engineer\nFull Stack Developer\nPython Expert')).toBeNull();
  });

  it('does not extract OCR-mashed header text as a name', () => {
    const text = `EXPERIENCEEDUCATIONSKILLS
Contact: john@example.com
+91 9876543210`;
    expect(extractName(text)).toBeNull();
  });

  it('handles name with single initial', () => {
    expect(extractName('S Vijayabaskar\nUI/UX Designer')).toBe('S Vijayabaskar');
  });

  it('handles name with hyphen', () => {
    expect(extractName('Anne-Marie Johnson\nProject Manager')).toBe('Anne-Marie Johnson');
  });

  it('handles name with apostrophe', () => {
    expect(extractName("O'Brien Patrick\nDevOps Engineer")).toBe("O'Brien Patrick");
  });
});

// ===========================================================================
// Full field extraction — real resume layouts
// ===========================================================================

describe('full extraction — real layouts', () => {
  it('extracts all fields from standard US resume', () => {
    const text = `JANE DOE
Senior Backend Engineer
jane.doe@example.com
(415) 555-1212

Experience
Built distributed systems with Go and Kubernetes.`;

    expect(extractResumeFields(text)).toEqual({
      name: 'Jane Doe',
      email: 'jane.doe@example.com',
      phone: '4155551212',
    });
  });

  it('extracts all fields from Haswin Babu resume layout', () => {
    const text = `Profile Summary
PROJECTS
9655728080Madurai, Tamil Nadu
Portfolio
haswinbabu10@gmail.com
LinkedIn
HASWIN BABU
UI/UX DESIGNER
Certified UI/UX Designer with 3+ years of experience`;

    const fields = extractResumeFields(text);
    expect(fields.name).toBe('Haswin Babu');
    expect(fields.email).toBe('haswinbabu10@gmail.com');
    expect(fields.phone).toBe('9655728080');
  });

  it('extracts all fields from Pranjul Jain resume layout', () => {
    const text = `PRANJUL
JAIN
UI/UX DESIGNER
+91 8989400515hipranjul@gmail.com
UI/UX Designer with a foundation in marketing`;

    const fields = extractResumeFields(text);
    expect(fields.name).toBe('Pranjul Jain');
    expect(fields.email).toBe('hipranjul@gmail.com');
    expect(fields.phone).toBe('8989400515');
  });

  it('extracts all fields from Vijaya Baskar resume (baseline)', () => {
    const text = `Vijayabaskar S
UI/UX Designer (AI & User-Centered Design)
 9345404115 | baskar2004267@gmail.com
 Portfolio: www.behance.net/vijayabaskars2`;

    const fields = extractResumeFields(text);
    expect(fields.name).toBe('Vijayabaskar S');
    expect(fields.email).toBe('baskar2004267@gmail.com');
    expect(fields.phone).toBe('9345404115');
  });

  it('extracts fields when role line precedes name', () => {
    const text = `Senior Data Engineer
Rahul Verma
rahul.verma@gmail.com
+91 98765 43210
5 years experience in big data pipelines`;

    const fields = extractResumeFields(text);
    expect(fields.name).toBe('Rahul Verma');
    expect(fields.email).toBe('rahul.verma@gmail.com');
    expect(fields.phone).toBe('9876543210');
  });

  it('extracts fields with grouped Indian phone number', () => {
    const text = `Sneha Patel
UX Researcher
sneha.patel@outlook.com
+91 87654-32109`;

    const fields = extractResumeFields(text);
    expect(fields.name).toBe('Sneha Patel');
    expect(fields.email).toBe('sneha.patel@outlook.com');
    expect(fields.phone).toBe('8765432109');
  });

  it('extracts fields from spaced-letter resume (Unnati Panchal)', () => {
    const text = `UP
U I / U X   D E S I G N E R
U N N A T I   P A N C H A L
E D U C A T I O N
+91 8849782694
Ahmedabad, Gujrat
unnatipanchal812@gmail.com
C O N T A C T`;

    const fields = extractResumeFields(text);
    expect(fields.name).toBe('Unnati Panchal');
    expect(fields.email).toBe('unnatipanchal812@gmail.com');
    expect(fields.phone).toBe('8849782694');
  });

  it('extracts fields with split email (Yash Singh)', () => {
    const text = `YASH SINGH
UI/UX DESIGNER
CARRIER OBJECTIVE
CONTACT
A highly motivated and detail-oriented.
+91 7690834118
yashghugtyal076
@gmail.com
Sirsi-Bindayaka ,Jaipur`;

    const fields = extractResumeFields(text);
    expect(fields.name).toBe('Yash Singh');
    expect(fields.email).toBe('yashghugtyal076@gmail.com');
    expect(fields.phone).toBe('7690834118');
  });
});

// ===========================================================================
// Assessment + finalize gate
// ===========================================================================

describe('resume import item assessment', () => {
  it('marks items processed when name and at least one contact method exist', () => {
    const assessment = assessResumeImportItem(
      { name: 'Jane Doe', email: 'jane.doe@example.com', phone: null },
      'Experienced engineer with 10 years building resilient APIs and distributed systems.',
    );
    expect(assessment).toEqual({ status: 'processed', errorReason: null });
  });

  it('marks items as needs_review when required fields are missing', () => {
    const assessment = assessResumeImportItem(
      { name: null, email: null, phone: '4155551212' },
      'Experienced engineer with 10 years building resilient APIs and distributed systems.',
    );
    expect(assessment.status).toBe('needs_review');
    expect(assessment.errorReason).toContain('name');
  });

  it('marks items as failed when no usable text', () => {
    const assessment = assessResumeImportItem(
      { name: 'Jane', email: 'jane@example.com', phone: null },
      '',
    );
    expect(assessment.status).toBe('failed');
  });

  it('requires name, email, phone, gcs path, and valid text for finalize', () => {
    expect(
      canFinalizeResumeImportItem(
        { name: 'Jane Doe', email: 'jane.doe@example.com', phone: '4155551212' },
        'gs://bucket/resume.pdf',
        'Experienced engineer with 10 years building resilient APIs and distributed systems.',
      ),
    ).toBe(true);

    expect(
      canFinalizeResumeImportItem(
        { name: 'Jane Doe', email: 'jane.doe@example.com', phone: null },
        'gs://bucket/resume.pdf',
        'Experienced engineer with 10 years building resilient APIs and distributed systems.',
      ),
    ).toBe(false);
  });
});

// ===========================================================================
// Batch status computation
// ===========================================================================

describe('resume import batch status', () => {
  it('stays queued before any processor work starts', () => {
    expect(computeResumeImportBatchStatus({
      fileCount: 3, queuedCount: 3, processingCount: 0,
      processedCount: 0, needsReviewCount: 0, failedCount: 0,
      duplicateCount: 0, finalizedCount: 0,
    })).toBe('queued');
  });

  it('moves to processing once some items are resolved but queued work remains', () => {
    expect(computeResumeImportBatchStatus({
      fileCount: 3, queuedCount: 1, processingCount: 0,
      processedCount: 1, needsReviewCount: 1, failedCount: 0,
      duplicateCount: 0, finalizedCount: 0,
    })).toBe('processing');
  });

  it('moves to ready_for_review when extraction is complete but manual action remains', () => {
    expect(computeResumeImportBatchStatus({
      fileCount: 3, queuedCount: 0, processingCount: 0,
      processedCount: 1, needsReviewCount: 1, failedCount: 1,
      duplicateCount: 0, finalizedCount: 0,
    })).toBe('ready_for_review');
  });

  it('moves to completed when every item is finalized, failed, or duplicate', () => {
    expect(computeResumeImportBatchStatus({
      fileCount: 4, queuedCount: 0, processingCount: 0,
      processedCount: 0, needsReviewCount: 0, failedCount: 1,
      duplicateCount: 1, finalizedCount: 2,
    })).toBe('completed');
  });
});
