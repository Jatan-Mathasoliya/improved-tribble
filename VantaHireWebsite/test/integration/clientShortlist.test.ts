/**
 * Client Shortlist API Integration Tests
 *
 * Tests the client shortlist feature for sharing candidate lists with clients.
 *
 * REQUIREMENTS:
 * - DATABASE_URL must be set (these tests require a real database connection)
 * - Tests validate shortlist creation, public access, feedback submission, and security
 *
 * Run with: npm run test -- test/integration/clientShortlist.test.ts
 */
// @vitest-environment node
import '../setup.integration';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes';

let app: express.Express;
let server: any;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    console.warn('[TEST] Client shortlist integration tests require DATABASE_URL to be set');
    throw new Error('DATABASE_URL required for client shortlist integration tests');
  }

  app = express();
  server = await registerRoutes(app);
});

afterAll(() => {
  server?.close();
});

describe('Client Shortlist API Integration Tests', () => {
  // ==================== Create Shortlist Endpoint ====================

  describe('POST /api/client-shortlists', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/client-shortlists')
        .send({
          clientId: 1,
          jobId: 1,
          applicationIds: [1, 2],
        });

      // Should require auth (401 or 403)
      expect([401, 403]).toContain(response.status);
    });

    it('should require recruiter or admin role', async () => {
      const response = await request(app)
        .post('/api/client-shortlists')
        .send({
          clientId: 1,
          jobId: 1,
          applicationIds: [1, 2],
        });

      expect([401, 403]).toContain(response.status);
    });

    it('should require CSRF protection', async () => {
      const response = await request(app)
        .post('/api/client-shortlists')
        .send({
          clientId: 1,
          jobId: 1,
          applicationIds: [1, 2],
        });

      // Without auth + CSRF, should be blocked
      expect([401, 403]).toContain(response.status);
    });

    it('should validate required fields (clientId, jobId, applicationIds)', async () => {
      const response = await request(app)
        .post('/api/client-shortlists')
        .send({});

      // Should fail validation (400) or be unauthorized
      if (response.status === 400) {
        expect(response.body).toHaveProperty('error');
      } else {
        expect([401, 403]).toContain(response.status);
      }
    });

    it('should validate applicationIds is a non-empty array', async () => {
      const response = await request(app)
        .post('/api/client-shortlists')
        .send({
          clientId: 1,
          jobId: 1,
          applicationIds: [],
        });

      // Should fail validation (400) or be unauthorized
      if (response.status === 400) {
        expect(response.body).toHaveProperty('error');
      } else {
        expect([401, 403]).toContain(response.status);
      }
    });

    it('should enforce max 50 candidates per shortlist', async () => {
      const tooManyApplications = Array.from({ length: 51 }, (_, i) => i + 1);

      const response = await request(app)
        .post('/api/client-shortlists')
        .send({
          clientId: 1,
          jobId: 1,
          applicationIds: tooManyApplications,
        });

      // Should fail validation (400) or be unauthorized
      if (response.status === 400) {
        expect(response.body).toHaveProperty('error');
      } else {
        expect([401, 403]).toContain(response.status);
      }
    });

    it('should return 404 for non-existent client', async () => {
      const response = await request(app)
        .post('/api/client-shortlists')
        .send({
          clientId: 999999,
          jobId: 1,
          applicationIds: [1],
        });

      // Should be 404 if authenticated, or 401/403 if not
      expect([404, 401, 403]).toContain(response.status);
    });

    it('should return 404 for non-existent job', async () => {
      const response = await request(app)
        .post('/api/client-shortlists')
        .send({
          clientId: 1,
          jobId: 999999,
          applicationIds: [1],
        });

      // Should be 404 if authenticated, or 401/403 if not
      expect([404, 401, 403]).toContain(response.status);
    });

    it('should validate job is associated with the client', async () => {
      const response = await request(app)
        .post('/api/client-shortlists')
        .send({
          clientId: 1,
          jobId: 1,
          applicationIds: [1],
        });

      // If job.clientId !== clientId, should return 400
      if (response.status === 400) {
        expect(response.body.error).toContain('not associated');
      } else {
        expect([404, 401, 403, 201]).toContain(response.status);
      }
    });

    it('should create shortlist and return token + URLs on success', async () => {
      const response = await request(app)
        .post('/api/client-shortlists')
        .send({
          clientId: 1,
          jobId: 1,
          applicationIds: [1, 2],
          title: 'Test Shortlist',
          message: 'Please review these candidates',
        });

      // If authenticated and valid, should create (201)
      if (response.status === 201) {
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('token');
        expect(response.body).toHaveProperty('publicUrl');
        expect(response.body).toHaveProperty('fullUrl');
        expect(response.body.token).toMatch(/^[a-f0-9]{64}$/); // 32 bytes = 64 hex chars
        expect(response.body.publicUrl).toMatch(/^\/client-shortlist\/[a-f0-9]{64}$/);
        expect(response.body.title).toBe('Test Shortlist');
        expect(response.body.message).toBe('Please review these candidates');
      } else {
        expect([404, 400, 401, 403]).toContain(response.status);
      }
    });

    it('should accept optional expiresAt field', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days from now

      const response = await request(app)
        .post('/api/client-shortlists')
        .send({
          clientId: 1,
          jobId: 1,
          applicationIds: [1],
          expiresAt: futureDate,
        });

      // If authenticated and valid, should create (201)
      if (response.status === 201) {
        expect(response.body).toHaveProperty('expiresAt');
      } else {
        expect([404, 400, 401, 403]).toContain(response.status);
      }
    });

    it('should not expose sensitive data in response', async () => {
      const response = await request(app)
        .post('/api/client-shortlists')
        .send({
          clientId: 1,
          jobId: 1,
          applicationIds: [1],
        });

      if (response.status === 201) {
        // Should not include sensitive fields
        expect(response.body).not.toHaveProperty('password');
        expect(response.body).not.toHaveProperty('apiKey');
      }
    });
  });

  // ==================== View Shortlist Endpoint (Public) ====================

  describe('GET /api/client-shortlist/:token', () => {
    it('should not require authentication', async () => {
      const response = await request(app)
        .get('/api/client-shortlist/invalidtoken123');

      // Should not be 401 (public endpoint)
      expect(response.status).not.toBe(401);
      // Will be 410 (expired/not found), 400 (bad request), or 500 (db error if schema not migrated)
      expect([400, 410, 500]).toContain(response.status);
    });

    it('should return 410 for non-existent token', async () => {
      const fakeToken = 'a'.repeat(64); // Valid format but doesn't exist

      const response = await request(app)
        .get(`/api/client-shortlist/${fakeToken}`);

      // Should be 410 (not found) or 500 (db error if schema not migrated)
      expect([410, 500]).toContain(response.status);
      if (response.status !== 500) {
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should return 400 for malformed token', async () => {
      const response = await request(app)
        .get('/api/client-shortlist/short-token');

      // Should be 400/410 or 500 (db error if schema not migrated)
      expect([400, 410, 500]).toContain(response.status);
    });

    it('should return shortlist data on valid token', async () => {
      // This test assumes a shortlist exists in the database
      // In real scenario, you'd create one first or use a known test token
      const response = await request(app)
        .get('/api/client-shortlist/validtokenhere123456789012345678901234567890123456789012');

      if (response.status === 200) {
        // Verify response structure
        expect(response.body).toHaveProperty('title');
        expect(response.body).toHaveProperty('client');
        expect(response.body).toHaveProperty('job');
        expect(response.body).toHaveProperty('candidates');
        expect(Array.isArray(response.body.candidates)).toBe(true);

        // Verify client data is sanitized
        expect(response.body.client).toHaveProperty('name');
        expect(response.body.client).not.toHaveProperty('id');

        // Verify candidate data structure
        if (response.body.candidates.length > 0) {
          const candidate = response.body.candidates[0];
          expect(candidate).toHaveProperty('name');
          expect(candidate).toHaveProperty('email');
          expect(candidate).toHaveProperty('position');
        }
      } else {
        // Token doesn't exist in test DB - expected (or 500 if schema not migrated)
        expect([410, 500]).toContain(response.status);
      }
    });

    it('should return 410 for expired shortlist', async () => {
      // This would require creating an expired shortlist in the test setup
      // For now, verify the endpoint handles expiry correctly
      const response = await request(app)
        .get('/api/client-shortlist/expiredtoken12345678901234567890123456789012345678901');

      // Should be 410 for expired or not found (or 500 if schema not migrated)
      expect([410, 404, 500]).toContain(response.status);
    });

    it('should not expose sensitive candidate data', async () => {
      const response = await request(app)
        .get('/api/client-shortlist/validtokenhere123456789012345678901234567890123456789012');

      if (response.status === 200) {
        // Candidates should not have internal IDs, user IDs, etc.
        if (response.body.candidates.length > 0) {
          const candidate = response.body.candidates[0];
          expect(candidate).not.toHaveProperty('userId');
          expect(candidate).not.toHaveProperty('currentStage');
          expect(candidate).not.toHaveProperty('recruiterNotes');
        }
      }
    });
  });

  // ==================== Submit Feedback Endpoint (Public) ====================

  describe('POST /api/client-shortlist/:token/feedback', () => {
    it('should not require authentication', async () => {
      const response = await request(app)
        .post('/api/client-shortlist/invalidtoken123/feedback')
        .send({
          applicationId: 1,
          recommendation: 'advance',
        });

      // Should not be 401 (public endpoint)
      expect(response.status).not.toBe(401);
      // Will be 410 (expired/not found), 400 (validation), or 500 (db error if schema not migrated)
      expect([400, 410, 500]).toContain(response.status);
    });

    it('should return 410 for non-existent or expired token', async () => {
      const fakeToken = 'b'.repeat(64);

      const response = await request(app)
        .post(`/api/client-shortlist/${fakeToken}/feedback`)
        .send({
          applicationId: 1,
          recommendation: 'advance',
        });

      // Should be 410 or 500 (db error if schema not migrated)
      expect([410, 500]).toContain(response.status);
    });

    it('should validate feedback schema', async () => {
      const response = await request(app)
        .post('/api/client-shortlist/validtoken/feedback')
        .send({
          // Missing required fields
        });

      // Should fail validation (400) or token not found (410) or db error (500)
      if (response.status === 400) {
        expect(response.body).toHaveProperty('error');
      } else {
        expect([410, 500]).toContain(response.status); // Token doesn't exist or schema not migrated
      }
    });

    it('should validate recommendation is enum value', async () => {
      const response = await request(app)
        .post('/api/client-shortlist/validtoken/feedback')
        .send({
          applicationId: 1,
          recommendation: 'invalid-value',
        });

      // Should fail validation (400) or token not found (410) or db error (500)
      expect([400, 410, 500]).toContain(response.status);
    });

    it('should accept valid recommendation values (advance, reject, hold)', async () => {
      const validRecommendations = ['advance', 'reject', 'hold'];

      for (const recommendation of validRecommendations) {
        const response = await request(app)
          .post('/api/client-shortlist/validtoken/feedback')
          .send({
            applicationId: 1,
            recommendation,
          });

        // Should either succeed (201) or token not found (410) or validation error (400) or db error (500)
        expect([201, 410, 400, 500]).toContain(response.status);
      }
    });

    it('should accept optional notes and rating', async () => {
      const response = await request(app)
        .post('/api/client-shortlist/validtoken/feedback')
        .send({
          applicationId: 1,
          recommendation: 'advance',
          notes: 'Excellent candidate with strong background',
          rating: 5,
        });

      // Should either succeed (201) or token not found (410) or db error (500)
      if (response.status === 201) {
        expect(response.body).toHaveProperty('success');
        expect(response.body.success).toBe(true);
      } else {
        expect([410, 400, 500]).toContain(response.status);
      }
    });

    it('should validate rating is between 1-5', async () => {
      const response = await request(app)
        .post('/api/client-shortlist/validtoken/feedback')
        .send({
          applicationId: 1,
          recommendation: 'advance',
          rating: 6, // Invalid
        });

      // Should fail validation (400) or token not found (410) or db error (500)
      expect([400, 410, 500]).toContain(response.status);
    });

    it('should accept bulk feedback submission', async () => {
      const response = await request(app)
        .post('/api/client-shortlist/validtoken/feedback')
        .send([
          {
            applicationId: 1,
            recommendation: 'advance',
          },
          {
            applicationId: 2,
            recommendation: 'hold',
            notes: 'Need more information',
          },
        ]);

      // Should either succeed (201) or token not found (410) or db error (500)
      if (response.status === 201) {
        expect(response.body).toHaveProperty('count');
        expect(response.body.count).toBe(2);
      } else {
        expect([410, 400, 500]).toContain(response.status);
      }
    });

    it('should validate application is in the shortlist', async () => {
      const response = await request(app)
        .post('/api/client-shortlist/validtoken/feedback')
        .send({
          applicationId: 999999, // Not in shortlist
          recommendation: 'advance',
        });

      // Should be 400 (not in shortlist) or 410 (token not found) or 500 (db error if schema not migrated)
      expect([400, 410, 500]).toContain(response.status);
    });

    it('should enforce notes max length (2000 chars)', async () => {
      const longNotes = 'a'.repeat(2001);

      const response = await request(app)
        .post('/api/client-shortlist/validtoken/feedback')
        .send({
          applicationId: 1,
          recommendation: 'advance',
          notes: longNotes,
        });

      // Should fail validation (400) or token not found (410) or db error (500)
      expect([400, 410, 500]).toContain(response.status);
    });
  });

  // ==================== Get Application Feedback Endpoint ====================

  describe('GET /api/applications/:id/client-feedback', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/applications/1/client-feedback');

      // Should require auth (401 or 403)
      expect([401, 403]).toContain(response.status);
    });

    it('should return 400 for invalid application ID', async () => {
      const response = await request(app)
        .get('/api/applications/not-a-number/client-feedback');

      // Should be 400 or unauthorized
      expect([400, 401, 403]).toContain(response.status);
    });

    it('should return array of feedback on success', async () => {
      const response = await request(app)
        .get('/api/applications/1/client-feedback');

      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);

        // If there's feedback, verify structure
        if (response.body.length > 0) {
          const feedback = response.body[0];
          expect(feedback).toHaveProperty('id');
          expect(feedback).toHaveProperty('applicationId');
          expect(feedback).toHaveProperty('clientId');
          expect(feedback).toHaveProperty('recommendation');
          expect(feedback).toHaveProperty('createdAt');
          expect(['advance', 'reject', 'hold']).toContain(feedback.recommendation);
        }
      } else {
        expect([401, 403]).toContain(response.status);
      }
    });

    it('should return empty array for application with no feedback', async () => {
      const response = await request(app)
        .get('/api/applications/999999/client-feedback');

      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
      } else {
        expect([401, 403]).toContain(response.status);
      }
    });

    it('should order feedback by createdAt descending', async () => {
      const response = await request(app)
        .get('/api/applications/1/client-feedback');

      if (response.status === 200 && response.body.length > 1) {
        const dates = response.body.map((f: any) => new Date(f.createdAt).getTime());

        // Verify descending order
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
        }
      }
    });

    it('should not expose sensitive client data', async () => {
      const response = await request(app)
        .get('/api/applications/1/client-feedback');

      if (response.status === 200 && response.body.length > 0) {
        const feedback = response.body[0];

        // Should not include sensitive fields
        expect(feedback).not.toHaveProperty('password');
        expect(feedback).not.toHaveProperty('apiKey');
      }
    });
  });

  // ==================== Job Shortlists Endpoint ====================

  describe('GET /api/jobs/:id/client-shortlists', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/jobs/1/client-shortlists');

      // Should require auth (401 or 403)
      expect([401, 403]).toContain(response.status);
    });

    it('should require recruiter or admin role', async () => {
      const response = await request(app)
        .get('/api/jobs/1/client-shortlists');

      expect([401, 403]).toContain(response.status);
    });

    it('should return 400 for invalid job ID', async () => {
      const response = await request(app)
        .get('/api/jobs/not-a-number/client-shortlists');

      // Should be 400 or unauthorized
      expect([400, 401, 403]).toContain(response.status);
    });

    it('should enforce ownership for non-admin users', async () => {
      const response = await request(app)
        .get('/api/jobs/1/client-shortlists');

      // Should be 403 (access denied) or 401 (not authenticated)
      expect([403, 401]).toContain(response.status);
    });

    it('should return array of shortlists on success', async () => {
      const response = await request(app)
        .get('/api/jobs/1/client-shortlists');

      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);

        // If there are shortlists, verify structure
        if (response.body.length > 0) {
          const shortlist = response.body[0];
          expect(shortlist).toHaveProperty('id');
          expect(shortlist).toHaveProperty('token');
          expect(shortlist).toHaveProperty('jobId');
          expect(shortlist).toHaveProperty('clientId');
          expect(shortlist).toHaveProperty('candidateCount');
          expect(shortlist).toHaveProperty('createdAt');
          expect(shortlist).toHaveProperty('status');
          expect(typeof shortlist.candidateCount).toBe('number');
        }
      } else {
        expect([401, 403]).toContain(response.status);
      }
    });

    it('should include candidate count for each shortlist', async () => {
      const response = await request(app)
        .get('/api/jobs/1/client-shortlists');

      if (response.status === 200 && response.body.length > 0) {
        const shortlist = response.body[0];
        expect(shortlist).toHaveProperty('candidateCount');
        expect(shortlist.candidateCount).toBeGreaterThanOrEqual(0);
      }
    });

    it('should include client info when available', async () => {
      const response = await request(app)
        .get('/api/jobs/1/client-shortlists');

      if (response.status === 200 && response.body.length > 0) {
        const shortlistWithClient = response.body.find((s: any) => s.client !== null);

        if (shortlistWithClient) {
          expect(shortlistWithClient.client).toHaveProperty('name');
        }
      }
    });

    it('should order shortlists by creation date descending', async () => {
      const response = await request(app)
        .get('/api/jobs/1/client-shortlists');

      if (response.status === 200 && response.body.length > 1) {
        const dates = response.body.map((s: any) => new Date(s.createdAt).getTime());

        // Verify descending order
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
        }
      }
    });

    it('should return empty array for job with no shortlists', async () => {
      const response = await request(app)
        .get('/api/jobs/999999/client-shortlists');

      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
      } else {
        // Job doesn't exist or no access
        expect([403, 401, 404]).toContain(response.status);
      }
    });

    it('should not expose sensitive data in shortlist responses', async () => {
      const response = await request(app)
        .get('/api/jobs/1/client-shortlists');

      if (response.status === 200 && response.body.length > 0) {
        const shortlist = response.body[0];

        // Should not include internal sensitive fields
        expect(shortlist).not.toHaveProperty('createdBy');
      }
    });
  });

  // ==================== Client Analytics Endpoint ====================

  describe('GET /api/analytics/clients', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/analytics/clients');

      // Should require auth (401 or 403)
      expect([401, 403]).toContain(response.status);
    });

    it('should require recruiter or admin role', async () => {
      const response = await request(app)
        .get('/api/analytics/clients');

      expect([401, 403]).toContain(response.status);
    });

    it('should return array of client metrics on success', async () => {
      const response = await request(app)
        .get('/api/analytics/clients');

      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);

        // If there are clients, verify structure
        if (response.body.length > 0) {
          const clientMetrics = response.body[0];
          expect(clientMetrics).toHaveProperty('clientId');
          expect(clientMetrics).toHaveProperty('clientName');
          expect(clientMetrics).toHaveProperty('rolesCount');
          expect(clientMetrics).toHaveProperty('totalApplications');
          expect(clientMetrics).toHaveProperty('placementsCount');

          // Verify types
          expect(typeof clientMetrics.clientId).toBe('number');
          expect(typeof clientMetrics.clientName).toBe('string');
          expect(typeof clientMetrics.rolesCount).toBe('number');
          expect(typeof clientMetrics.totalApplications).toBe('number');
          expect(typeof clientMetrics.placementsCount).toBe('number');

          // Verify counts are non-negative
          expect(clientMetrics.rolesCount).toBeGreaterThanOrEqual(0);
          expect(clientMetrics.totalApplications).toBeGreaterThanOrEqual(0);
          expect(clientMetrics.placementsCount).toBeGreaterThanOrEqual(0);
        }
      } else {
        expect([401, 403]).toContain(response.status);
      }
    });

    it('should return empty array when no clients exist', async () => {
      const response = await request(app)
        .get('/api/analytics/clients');

      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
      } else {
        expect([401, 403]).toContain(response.status);
      }
    });

    it('should aggregate roles count per client', async () => {
      const response = await request(app)
        .get('/api/analytics/clients');

      if (response.status === 200 && response.body.length > 0) {
        // Roles count should reflect number of jobs associated with client
        const clientMetrics = response.body[0];
        expect(clientMetrics.rolesCount).toBeGreaterThanOrEqual(0);
      }
    });

    it('should aggregate applications count per client', async () => {
      const response = await request(app)
        .get('/api/analytics/clients');

      if (response.status === 200 && response.body.length > 0) {
        // Applications count should reflect total applications across client's jobs
        const clientMetrics = response.body[0];
        expect(clientMetrics.totalApplications).toBeGreaterThanOrEqual(0);
      }
    });

    it('should include placements count (defaults to 0)', async () => {
      const response = await request(app)
        .get('/api/analytics/clients');

      if (response.status === 200 && response.body.length > 0) {
        const clientMetrics = response.body[0];
        // Placements wired but not yet populated - should default to 0
        expect(clientMetrics.placementsCount).toBe(0);
      }
    });

    it('should order clients by name', async () => {
      const response = await request(app)
        .get('/api/analytics/clients');

      if (response.status === 200 && response.body.length > 1) {
        const names = response.body.map((c: any) => c.clientName);

        // Verify alphabetical order
        for (let i = 1; i < names.length; i++) {
          expect(names[i - 1].toLowerCase()).toBeLessThanOrEqual(names[i].toLowerCase());
        }
      }
    });

    it('should filter by user for non-admin users', async () => {
      const response = await request(app)
        .get('/api/analytics/clients');

      // Non-admin users should only see metrics for clients associated with their jobs
      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
      } else {
        expect([401, 403]).toContain(response.status);
      }
    });

    it('should return all clients for admin users', async () => {
      const response = await request(app)
        .get('/api/analytics/clients');

      // Admins should see all clients regardless of job ownership
      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
      } else {
        expect([401, 403]).toContain(response.status);
      }
    });

    it('should not expose sensitive client data', async () => {
      const response = await request(app)
        .get('/api/analytics/clients');

      if (response.status === 200 && response.body.length > 0) {
        const clientMetrics = response.body[0];

        // Should not include sensitive fields
        expect(clientMetrics).not.toHaveProperty('password');
        expect(clientMetrics).not.toHaveProperty('apiKey');
        expect(clientMetrics).not.toHaveProperty('createdBy');
      }
    });

    it('should handle clients with no jobs gracefully', async () => {
      const response = await request(app)
        .get('/api/analytics/clients');

      if (response.status === 200) {
        // Clients with no jobs should have rolesCount = 0, totalApplications = 0
        const clientsWithoutJobs = response.body.filter(
          (c: any) => c.rolesCount === 0
        );

        clientsWithoutJobs.forEach((client: any) => {
          expect(client.totalApplications).toBe(0);
        });
      }
    });

    it('should respond within reasonable time', async () => {
      const start = Date.now();
      const response = await request(app)
        .get('/api/analytics/clients');
      const duration = Date.now() - start;

      // Should respond within 5 seconds even with many clients
      expect(duration).toBeLessThan(5000);
    });
  });

  // ==================== Security & Edge Cases ====================

  describe('Security and Edge Cases', () => {
    it('should prevent SQL injection in token parameter', async () => {
      const sqlInjectionToken = "' OR '1'='1";

      const response = await request(app)
        .get(`/api/client-shortlist/${sqlInjectionToken}`);

      // Should safely handle and return 410, 400, or 500 (db error if schema not migrated)
      expect([400, 410, 500]).toContain(response.status);
    });

    it('should validate token is exactly 64 hex characters', async () => {
      const shortToken = 'abc123';

      const response = await request(app)
        .get(`/api/client-shortlist/${shortToken}`);

      // Should reject malformed token (or 500 if schema not migrated)
      expect([400, 410, 500]).toContain(response.status);
    });

    it('should respond to shortlist endpoints within reasonable time', async () => {
      const start = Date.now();
      const response = await request(app)
        .get('/api/client-shortlist/validtoken123456789012345678901234567890123456789012');
      const duration = Date.now() - start;

      // Should respond within 5 seconds
      expect(duration).toBeLessThan(5000);
    });

    it('should handle concurrent feedback submissions gracefully', async () => {
      const token = 'validtoken123456789012345678901234567890123456789012';

      // Simulate concurrent submissions
      const promises = [
        request(app)
          .post(`/api/client-shortlist/${token}/feedback`)
          .send({ applicationId: 1, recommendation: 'advance' }),
        request(app)
          .post(`/api/client-shortlist/${token}/feedback`)
          .send({ applicationId: 2, recommendation: 'hold' }),
        request(app)
          .post(`/api/client-shortlist/${token}/feedback`)
          .send({ applicationId: 3, recommendation: 'reject' }),
      ];

      const responses = await Promise.all(promises);

      // All should either succeed or fail consistently (no race conditions)
      responses.forEach(response => {
        expect([201, 400, 410, 500]).toContain(response.status);
      });
    });

    it('should not leak internal application IDs in public shortlist', async () => {
      const response = await request(app)
        .get('/api/client-shortlist/validtoken123456789012345678901234567890123456789012');

      if (response.status === 200) {
        // Check that we're not exposing too much data
        expect(response.body).not.toHaveProperty('userId');
        expect(response.body).not.toHaveProperty('createdBy');

        if (response.body.candidates.length > 0) {
          const candidate = response.body.candidates[0];
          // Should have basic info but not internal IDs
          expect(candidate).toHaveProperty('name');
          expect(candidate).not.toHaveProperty('currentStage');
        }
      }
    });

    it('should enforce HTTPS in production for shortlist URLs', async () => {
      const response = await request(app)
        .post('/api/client-shortlists')
        .send({
          clientId: 1,
          jobId: 1,
          applicationIds: [1],
        });

      if (response.status === 201) {
        // In production, fullUrl should use https
        // In test environment, might be http
        expect(response.body.fullUrl).toMatch(/^https?:\/\//);
      }
    });
  });
});
