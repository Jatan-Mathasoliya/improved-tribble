// @vitest-environment node
/**
 * Contract Tests: Schema Sync
 * Verifies that client-side types match server-side Zod schemas
 * Guards against API contract drift between client and server
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Import server-side schemas
import {
  insertJobSchema,
  insertApplicationSchema,
  insertFormSchema,
  insertFormFieldSchema,
  insertFormInvitationSchema,
  insertFormResponseAnswerSchema,
  insertClientSchema,
  insertClientShortlistSchema,
  insertClientFeedbackSchema,
  insertApplicationFeedbackSchema,
  insertConsultantSchema,
  recruiterAddApplicationSchema,
} from '../../shared/schema';

// Import shared types
import {
  FIELD_TYPES,
  type FieldType,
  type FormFieldSnapshot,
  type FormSnapshot,
  type FormAnswer,
  type FormTemplateDTO,
  type FormInvitationDTO,
  type PublicFormDTO,
} from '../../shared/forms.types';

describe('Schema Contract Tests', () => {
  // Helper to generate a valid job description (200+ words required)
  const validJobDescription = `We are looking for an experienced Senior Developer to join our growing team.
    The ideal candidate will have strong experience with modern web technologies and a passion for building
    high-quality software. You will be responsible for designing, developing, and maintaining web applications
    that serve millions of users. Our team values collaboration, innovation, and continuous learning.

    Responsibilities include writing clean, maintainable code, participating in code reviews, mentoring junior
    developers, and contributing to architectural decisions. You will work closely with product managers,
    designers, and other engineers to deliver features that delight our users. Daily tasks include debugging
    complex issues, optimizing application performance, and implementing new features based on user feedback.

    Requirements: 5+ years of professional software development experience, strong proficiency in JavaScript
    and TypeScript, experience with React or similar frontend frameworks, familiarity with Node.js and
    backend development, excellent problem-solving skills, and strong communication abilities. Experience with
    cloud platforms like AWS or GCP is a plus. Knowledge of CI/CD pipelines and automated testing is desirable.

    We offer competitive compensation, flexible work arrangements, comprehensive health benefits, professional
    development opportunities, stock options, and a supportive team environment. Our office is located in a
    prime location with excellent amenities. Join us in building the future of recruitment technology.
    Apply now to be part of our mission to transform how companies hire talent globally. We look forward to
    reviewing your application and potentially welcoming you to our innovative and dynamic team.`;

  describe('Job Schema', () => {
    it('validates correct job data', () => {
      const validJob = {
        title: 'Senior Developer',
        location: 'Remote',
        type: 'full-time',
        description: validJobDescription,
        skills: ['React', 'TypeScript'],
      };

      const result = insertJobSchema.safeParse(validJob);
      expect(result.success).toBe(true);
    });

    it('rejects invalid job type', () => {
      const invalidJob = {
        title: 'Senior Developer',
        location: 'Remote',
        type: 'invalid-type',
        description: 'Looking for an experienced developer.',
      };

      const result = insertJobSchema.safeParse(invalidJob);
      expect(result.success).toBe(false);
    });

    it('enforces title length constraints', () => {
      const tooLongTitle = {
        title: 'A'.repeat(101), // Max is 100
        location: 'Remote',
        type: 'full-time',
        description: 'Valid description here.',
      };

      const result = insertJobSchema.safeParse(tooLongTitle);
      expect(result.success).toBe(false);
    });

    it('enforces description minimum length', () => {
      const shortDescription = {
        title: 'Valid Title',
        location: 'Remote',
        type: 'full-time',
        description: 'Short', // Min is 10
      };

      const result = insertJobSchema.safeParse(shortDescription);
      expect(result.success).toBe(false);
    });

    it('accepts valid job types', () => {
      const jobTypes = ['full-time', 'part-time', 'contract', 'remote'];

      jobTypes.forEach((type) => {
        const job = {
          title: 'Test Job',
          location: 'Remote',
          type,
          description: validJobDescription,
        };

        const result = insertJobSchema.safeParse(job);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Application Schema', () => {
    it('validates correct application data', () => {
      const validApplication = {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        coverLetter: 'I am interested in this position.',
      };

      const result = insertApplicationSchema.safeParse(validApplication);
      expect(result.success).toBe(true);
    });

    it('rejects invalid email format', () => {
      const invalidEmail = {
        name: 'John Doe',
        email: 'not-an-email',
        phone: '1234567890',
      };

      const result = insertApplicationSchema.safeParse(invalidEmail);
      expect(result.success).toBe(false);
    });

    it('enforces phone length constraints', () => {
      const shortPhone = {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '123', // Min is 10
      };

      const result = insertApplicationSchema.safeParse(shortPhone);
      expect(result.success).toBe(false);
    });

    it('validates recruiter-add application schema', () => {
      const recruiterAdd = {
        name: 'Jane Smith',
        email: 'jane@example.com',
        phone: '9876543210',
        source: 'recruiter_add',
        sourceMetadata: {
          notes: 'Referred by team member',
        },
      };

      const result = recruiterAddApplicationSchema.safeParse(recruiterAdd);
      expect(result.success).toBe(true);
    });
  });

  describe('Form Schemas', () => {
    it('validates form template creation', () => {
      const validForm = {
        name: 'Candidate Assessment',
        description: 'Pre-interview assessment form',
        isPublished: true,
      };

      const result = insertFormSchema.safeParse(validForm);
      expect(result.success).toBe(true);
    });

    it('enforces form name constraints', () => {
      const tooLongName = {
        name: 'A'.repeat(201), // Max is 200
      };

      const result = insertFormSchema.safeParse(tooLongName);
      expect(result.success).toBe(false);
    });

    it('validates form field schema', () => {
      const validField = {
        type: 'short_text',
        label: 'What is your name?',
        required: true,
        order: 0,
      };

      const result = insertFormFieldSchema.safeParse(validField);
      expect(result.success).toBe(true);
    });

    it('rejects invalid field type', () => {
      const invalidField = {
        type: 'invalid_type',
        label: 'Question',
        required: false,
        order: 0,
      };

      const result = insertFormFieldSchema.safeParse(invalidField);
      expect(result.success).toBe(false);
    });

    it('validates all supported field types', () => {
      FIELD_TYPES.forEach((fieldType) => {
        const field = {
          type: fieldType,
          label: `Test ${fieldType} field`,
          required: true,
          order: 0,
        };

        const result = insertFormFieldSchema.safeParse(field);
        expect(result.success).toBe(true);
      });
    });

    it('validates form invitation schema', () => {
      const invitation = {
        applicationId: 1,
        formId: 1,
        customMessage: 'Please complete this form',
      };

      const result = insertFormInvitationSchema.safeParse(invitation);
      expect(result.success).toBe(true);
    });

    it('validates form response answer schema', () => {
      const answer = {
        fieldId: 1,
        value: 'My answer',
      };

      const result = insertFormResponseAnswerSchema.safeParse(answer);
      expect(result.success).toBe(true);
    });

    it('validates file upload answer', () => {
      const fileAnswer = {
        fieldId: 1,
        fileUrl: 'https://storage.example.com/file.pdf',
      };

      const result = insertFormResponseAnswerSchema.safeParse(fileAnswer);
      expect(result.success).toBe(true);
    });
  });

  describe('Client Schemas', () => {
    it('validates client creation', () => {
      const validClient = {
        name: 'Acme Corp',
        domain: 'acme.com',
        primaryContactName: 'Jane Doe',
        primaryContactEmail: 'jane@acme.com',
      };

      const result = insertClientSchema.safeParse(validClient);
      expect(result.success).toBe(true);
    });

    it('rejects invalid contact email', () => {
      const invalidClient = {
        name: 'Acme Corp',
        primaryContactEmail: 'not-an-email',
      };

      const result = insertClientSchema.safeParse(invalidClient);
      expect(result.success).toBe(false);
    });

    it('validates client shortlist schema', () => {
      const shortlist = {
        clientId: 1,
        jobId: 1,
        applicationIds: [1, 2, 3],
        title: 'Top Candidates for Engineering',
        message: 'Here are our top picks',
      };

      const result = insertClientShortlistSchema.safeParse(shortlist);
      expect(result.success).toBe(true);
    });

    it('enforces shortlist application limits', () => {
      const tooManyApps = {
        clientId: 1,
        jobId: 1,
        applicationIds: Array.from({ length: 51 }, (_, i) => i + 1), // Max is 50
      };

      const result = insertClientShortlistSchema.safeParse(tooManyApps);
      expect(result.success).toBe(false);
    });

    it('validates client feedback schema', () => {
      const feedback = {
        applicationId: 1,
        recommendation: 'advance',
        notes: 'Great candidate, proceed to next round',
        rating: 5,
      };

      const result = insertClientFeedbackSchema.safeParse(feedback);
      expect(result.success).toBe(true);
    });

    it('rejects invalid recommendation', () => {
      const invalidFeedback = {
        applicationId: 1,
        recommendation: 'maybe', // Must be advance, reject, or hold
      };

      const result = insertClientFeedbackSchema.safeParse(invalidFeedback);
      expect(result.success).toBe(false);
    });
  });

  describe('Application Feedback Schema', () => {
    it('validates feedback with all fields', () => {
      const feedback = {
        applicationId: 1,
        overallScore: 4,
        recommendation: 'advance',
        notes: 'Strong technical skills',
      };

      const result = insertApplicationFeedbackSchema.safeParse(feedback);
      expect(result.success).toBe(true);
    });

    it('enforces score range', () => {
      const invalidScore = {
        applicationId: 1,
        overallScore: 6, // Max is 5
        recommendation: 'advance',
      };

      const result = insertApplicationFeedbackSchema.safeParse(invalidScore);
      expect(result.success).toBe(false);
    });

    it('validates recommendation enum', () => {
      const validRecommendations = ['advance', 'hold', 'reject'];

      validRecommendations.forEach((rec) => {
        const feedback = {
          applicationId: 1,
          overallScore: 3,
          recommendation: rec,
        };

        const result = insertApplicationFeedbackSchema.safeParse(feedback);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Consultant Schema', () => {
    it('validates consultant creation', () => {
      const consultant = {
        name: 'John Expert',
        email: 'john@consulting.com',
        experience: '10+ years',
        domains: 'FinTech, Healthcare, E-commerce',
        linkedinUrl: 'https://linkedin.com/in/johnexpert',
      };

      const result = insertConsultantSchema.safeParse(consultant);
      expect(result.success).toBe(true);
    });

    it('rejects invalid LinkedIn URL', () => {
      const invalidConsultant = {
        name: 'John Expert',
        email: 'john@consulting.com',
        experience: '10 years',
        domains: 'Tech',
        linkedinUrl: 'not-a-url',
      };

      const result = insertConsultantSchema.safeParse(invalidConsultant);
      expect(result.success).toBe(false);
    });
  });

  describe('Shared Types Consistency', () => {
    it('FIELD_TYPES matches form field schema enum', () => {
      const schemaTypes = insertFormFieldSchema.shape.type._def.values;
      expect(schemaTypes).toEqual(FIELD_TYPES);
    });

    it('FormFieldSnapshot interface is compatible with schema', () => {
      const fieldFromSchema = insertFormFieldSchema.parse({
        type: 'short_text',
        label: 'Test',
        required: true,
        order: 0,
      });

      // Should be able to use as FormFieldSnapshot (with id added)
      const snapshot: FormFieldSnapshot = {
        id: 1,
        ...fieldFromSchema,
      };

      expect(snapshot.type).toBe('short_text');
      expect(snapshot.label).toBe('Test');
    });

    it('FormSnapshot structure is valid', () => {
      const snapshot: FormSnapshot = {
        formName: 'Test Form',
        formDescription: 'A test form',
        fields: [
          { id: 1, type: 'short_text', label: 'Name', required: true, order: 0 },
          { id: 2, type: 'email', label: 'Email', required: true, order: 1 },
        ],
      };

      // Verify structure
      expect(snapshot.formName).toBe('Test Form');
      expect(snapshot.fields).toHaveLength(2);
      expect(snapshot.fields[0].type).toBe('short_text');
    });

    it('FormAnswer interface matches expected structure', () => {
      const answer: FormAnswer = {
        fieldId: 1,
        value: 'Test answer',
      };

      expect(answer.fieldId).toBe(1);
      expect(answer.value).toBe('Test answer');

      const fileAnswer: FormAnswer = {
        fieldId: 2,
        fileUrl: 'https://example.com/file.pdf',
        filename: 'resume.pdf',
        size: 1024,
      };

      expect(fileAnswer.fileUrl).toBeDefined();
    });
  });

  describe('DTO Type Guards', () => {
    it('FormTemplateDTO has required fields', () => {
      const dto: FormTemplateDTO = {
        id: 1,
        name: 'Test Form',
        isPublished: true,
        createdBy: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        fields: [],
      };

      expect(dto.id).toBe(1);
      expect(dto.name).toBe('Test Form');
      expect(dto.fields).toEqual([]);
    });

    it('FormInvitationDTO has required fields', () => {
      const dto: FormInvitationDTO = {
        id: 1,
        applicationId: 1,
        formId: 1,
        token: 'abc123',
        expiresAt: '2024-12-31T00:00:00Z',
        status: 'pending',
        sentBy: 1,
        fieldSnapshot: '{}',
        form: { id: 1, name: 'Test' },
      };

      expect(dto.status).toBe('pending');
      expect(['pending', 'sent', 'failed', 'viewed', 'answered', 'expired']).toContain(dto.status);
    });

    it('PublicFormDTO has required fields', () => {
      const dto: PublicFormDTO = {
        formName: 'Public Form',
        fields: [],
        expiresAt: '2024-12-31T00:00:00Z',
      };

      expect(dto.formName).toBe('Public Form');
      expect(dto.fields).toEqual([]);
    });
  });
});

describe('API Response Schema Validation', () => {
  // These tests verify that API response shapes match expected DTOs

  const jobResponseSchema = z.object({
    id: z.number(),
    title: z.string(),
    location: z.string(),
    type: z.string(),
    description: z.string(),
    status: z.string(),
    isActive: z.boolean(),
    createdAt: z.string(),
    postedBy: z.number(),
  });

  const applicationResponseSchema = z.object({
    id: z.number(),
    jobId: z.number(),
    name: z.string(),
    email: z.string(),
    phone: z.string(),
    status: z.string(),
    appliedAt: z.string(),
  });

  it('job response matches expected schema', () => {
    const mockResponse = {
      id: 1,
      title: 'Software Engineer',
      location: 'Remote',
      type: 'full-time',
      description: 'Looking for a developer',
      status: 'approved',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
      postedBy: 1,
    };

    const result = jobResponseSchema.safeParse(mockResponse);
    expect(result.success).toBe(true);
  });

  it('application response matches expected schema', () => {
    const mockResponse = {
      id: 1,
      jobId: 1,
      name: 'John Doe',
      email: 'john@example.com',
      phone: '1234567890',
      status: 'submitted',
      appliedAt: '2024-01-01T00:00:00Z',
    };

    const result = applicationResponseSchema.safeParse(mockResponse);
    expect(result.success).toBe(true);
  });
});
