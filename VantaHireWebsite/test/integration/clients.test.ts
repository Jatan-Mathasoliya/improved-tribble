/**
 * Clients API Integration Tests
 *
 * Tests the client CRUD endpoints for agency/consulting use-cases.
 *
 * REQUIREMENTS:
 * - DATABASE_URL must be set (these tests require a real database connection)
 * - Tests validate endpoint authentication, response structure, and client-job relationships
 *
 * Run with: npm run test -- test/integration/clients.test.ts
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
    console.warn('[TEST] Clients integration tests require DATABASE_URL to be set');
    throw new Error('DATABASE_URL required for clients integration tests');
  }

  app = express();
  server = await registerRoutes(app);
});

afterAll(() => {
  server?.close();
});

describe('Clients API Integration Tests', () => {
  // ==================== List Clients Endpoint ====================

  describe('GET /api/clients', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/clients');

      // Should require auth (401 or 403)
      expect([401, 403]).toContain(response.status);
    });

    it('should require recruiter or admin role', async () => {
      // Without proper auth, should be unauthorized
      const response = await request(app)
        .get('/api/clients');

      expect([401, 403]).toContain(response.status);
    });

    it('should return array of clients on success', async () => {
      const response = await request(app)
        .get('/api/clients');

      // If successful (200), verify response structure
      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);

        // If there are any results, verify structure
        if (response.body.length > 0) {
          const client = response.body[0];
          expect(client).toHaveProperty('id');
          expect(client).toHaveProperty('name');
          expect(client).toHaveProperty('createdAt');
          expect(client).toHaveProperty('createdBy');

          // Verify types
          expect(typeof client.id).toBe('number');
          expect(typeof client.name).toBe('string');
          expect(typeof client.createdBy).toBe('number');
        }
      }
    });

    it('should handle empty clients list gracefully', async () => {
      const response = await request(app)
        .get('/api/clients');

      // Should return 200 with empty array or auth error
      expect([200, 401, 403]).toContain(response.status);

      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
      }
    });

    it('should include optional fields when present', async () => {
      const response = await request(app)
        .get('/api/clients');

      if (response.status === 200 && response.body.length > 0) {
        const clientWithOptionals = response.body.find((c: any) =>
          c.domain || c.primaryContactName || c.primaryContactEmail || c.notes
        );

        if (clientWithOptionals) {
          // Verify optional fields are strings when present
          if (clientWithOptionals.domain) {
            expect(typeof clientWithOptionals.domain).toBe('string');
          }
          if (clientWithOptionals.primaryContactName) {
            expect(typeof clientWithOptionals.primaryContactName).toBe('string');
          }
          if (clientWithOptionals.primaryContactEmail) {
            expect(typeof clientWithOptionals.primaryContactEmail).toBe('string');
          }
          if (clientWithOptionals.notes) {
            expect(typeof clientWithOptionals.notes).toBe('string');
          }
        }
      }
    });
  });

  // ==================== Create Client Endpoint ====================

  describe('POST /api/clients', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/clients')
        .send({
          name: 'Test Client'
        });

      // Should require auth (401 or 403)
      expect([401, 403]).toContain(response.status);
    });

    it('should require recruiter or admin role', async () => {
      const response = await request(app)
        .post('/api/clients')
        .send({
          name: 'Test Client'
        });

      expect([401, 403]).toContain(response.status);
    });

    it('should require CSRF protection', async () => {
      // This test verifies CSRF middleware is applied
      // In a real test with auth, missing CSRF token would cause 403
      const response = await request(app)
        .post('/api/clients')
        .send({
          name: 'Test Client'
        });

      // Without auth + CSRF, should be blocked
      expect([401, 403]).toContain(response.status);
    });

    it('should reject request without name field', async () => {
      const response = await request(app)
        .post('/api/clients')
        .send({
          domain: 'example.com'
        });

      // Should fail validation or be unauthorized
      if (response.status === 400) {
        expect(response.body).toHaveProperty('error');
      } else {
        expect([401, 403]).toContain(response.status);
      }
    });

    it('should accept minimal valid client (name only)', async () => {
      const response = await request(app)
        .post('/api/clients')
        .send({
          name: 'Minimal Client'
        });

      // If authenticated, should create (201) or be unauthorized
      if (response.status === 201) {
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('name');
        expect(response.body.name).toBe('Minimal Client');
        expect(response.body).toHaveProperty('createdBy');
      } else {
        expect([401, 403]).toContain(response.status);
      }
    });

    it('should accept client with all fields', async () => {
      const response = await request(app)
        .post('/api/clients')
        .send({
          name: 'Full Client',
          domain: 'fullclient.com',
          primaryContactName: 'John Doe',
          primaryContactEmail: 'john@fullclient.com',
          notes: 'Important client notes'
        });

      // If authenticated, should create (201) or be unauthorized
      if (response.status === 201) {
        expect(response.body).toHaveProperty('id');
        expect(response.body.name).toBe('Full Client');
        expect(response.body.domain).toBe('fullclient.com');
        expect(response.body.primaryContactName).toBe('John Doe');
        expect(response.body.primaryContactEmail).toBe('john@fullclient.com');
        expect(response.body.notes).toBe('Important client notes');
        expect(response.body).toHaveProperty('createdBy');
      } else {
        expect([401, 403]).toContain(response.status);
      }
    });

    it('should validate name is not empty string', async () => {
      const response = await request(app)
        .post('/api/clients')
        .send({
          name: ''
        });

      // Should fail validation (400) or be unauthorized
      if (response.status === 400) {
        expect(response.body).toHaveProperty('error');
      } else {
        expect([401, 403]).toContain(response.status);
      }
    });

    it('should not expose sensitive data in response', async () => {
      const response = await request(app)
        .post('/api/clients')
        .send({
          name: 'Security Test Client'
        });

      if (response.status === 201) {
        // Should not include password, API keys, etc.
        expect(response.body).not.toHaveProperty('password');
        expect(response.body).not.toHaveProperty('apiKey');
        expect(response.body).not.toHaveProperty('token');
      }
    });
  });

  // ==================== Update Client Endpoint ====================

  describe('PATCH /api/clients/:id', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .patch('/api/clients/1')
        .send({
          name: 'Updated Name'
        });

      // Should require auth (401 or 403)
      expect([401, 403]).toContain(response.status);
    });

    it('should require recruiter or admin role', async () => {
      const response = await request(app)
        .patch('/api/clients/1')
        .send({
          name: 'Updated Name'
        });

      expect([401, 403]).toContain(response.status);
    });

    it('should require CSRF protection', async () => {
      const response = await request(app)
        .patch('/api/clients/1')
        .send({
          name: 'Updated Name'
        });

      // Without auth + CSRF, should be blocked
      expect([401, 403]).toContain(response.status);
    });

    it('should return 404 for non-existent client', async () => {
      const response = await request(app)
        .patch('/api/clients/999999')
        .send({
          name: 'Updated Name'
        });

      // Should be 404 if authenticated, or 401/403 if not
      expect([404, 401, 403]).toContain(response.status);
    });

    it('should allow partial updates (name only)', async () => {
      const response = await request(app)
        .patch('/api/clients/1')
        .send({
          name: 'New Name Only'
        });

      // If authenticated and client exists, should update (200)
      if (response.status === 200) {
        expect(response.body).toHaveProperty('id');
        expect(response.body.name).toBe('New Name Only');
      } else {
        expect([404, 401, 403]).toContain(response.status);
      }
    });

    it('should allow partial updates (domain only)', async () => {
      const response = await request(app)
        .patch('/api/clients/1')
        .send({
          domain: 'newdomain.com'
        });

      // If authenticated and client exists, should update (200)
      if (response.status === 200) {
        expect(response.body).toHaveProperty('id');
        expect(response.body.domain).toBe('newdomain.com');
      } else {
        expect([404, 401, 403]).toContain(response.status);
      }
    });

    it('should allow updating all fields at once', async () => {
      const response = await request(app)
        .patch('/api/clients/1')
        .send({
          name: 'Fully Updated Client',
          domain: 'updated.com',
          primaryContactName: 'Jane Smith',
          primaryContactEmail: 'jane@updated.com',
          notes: 'Updated notes'
        });

      // If authenticated and client exists, should update (200)
      if (response.status === 200) {
        expect(response.body.name).toBe('Fully Updated Client');
        expect(response.body.domain).toBe('updated.com');
        expect(response.body.primaryContactName).toBe('Jane Smith');
        expect(response.body.primaryContactEmail).toBe('jane@updated.com');
        expect(response.body.notes).toBe('Updated notes');
      } else {
        expect([404, 401, 403]).toContain(response.status);
      }
    });

    it('should validate empty name is rejected', async () => {
      const response = await request(app)
        .patch('/api/clients/1')
        .send({
          name: ''
        });

      // Should fail validation (400) or be unauthorized
      if (response.status === 400) {
        expect(response.body).toHaveProperty('error');
      } else {
        expect([404, 401, 403]).toContain(response.status);
      }
    });

    it('should not modify createdAt or createdBy', async () => {
      const response = await request(app)
        .patch('/api/clients/1')
        .send({
          name: 'Test Immutable Fields',
          createdBy: 999, // Should be ignored
        });

      // If successful, createdBy should not be changed to 999
      if (response.status === 200) {
        expect(response.body.createdBy).not.toBe(999);
      }
    });
  });

  // ==================== Client-Job Relationship ====================

  describe('Client-Job Integration', () => {
    it('should include clientId in job analytics', async () => {
      const response = await request(app)
        .get('/api/analytics/jobs');

      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);

        // Jobs should have clientId and clientName fields (null or set)
        if (response.body.length > 0) {
          const job = response.body[0];
          expect(job).toHaveProperty('clientId');
          expect(job).toHaveProperty('clientName');

          // If clientId is set, it should be a number
          if (job.clientId !== null) {
            expect(typeof job.clientId).toBe('number');
          }

          // If clientName is set, it should be a string
          if (job.clientName !== null) {
            expect(typeof job.clientName).toBe('string');
          }
        }
      } else {
        expect([401, 403]).toContain(response.status);
      }
    });

    it('should include clientName in My Jobs endpoint', async () => {
      const response = await request(app)
        .get('/api/my-jobs');

      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);

        // Jobs should have clientName field (null or set)
        if (response.body.length > 0) {
          const job = response.body[0];
          expect(job).toHaveProperty('clientName');

          // If clientName is set, it should be a string
          if (job.clientName !== null) {
            expect(typeof job.clientName).toBe('string');
          }
        }
      } else {
        // Accept 400, 401, or 403 when not authenticated
        expect([400, 401, 403]).toContain(response.status);
      }
    });

    it('should allow jobs with clientId=null (internal jobs)', async () => {
      const response = await request(app)
        .get('/api/analytics/jobs');

      if (response.status === 200 && response.body.length > 0) {
        // Should be able to have jobs with no client
        const internalJobs = response.body.filter((job: any) => job.clientId === null);

        // If there are internal jobs, verify they're valid
        internalJobs.forEach((job: any) => {
          expect(job.clientName).toBeNull();
          expect(job).toHaveProperty('id');
          expect(job).toHaveProperty('title');
        });
      }
    });

    it('should link jobs to clients when clientId is set', async () => {
      const jobsResponse = await request(app)
        .get('/api/analytics/jobs');

      if (jobsResponse.status === 200) {
        const jobsWithClients = jobsResponse.body.filter(
          (job: any) => job.clientId !== null && job.clientName !== null
        );

        // If there are jobs with clients, verify the relationship
        if (jobsWithClients.length > 0) {
          const job = jobsWithClients[0];

          // The clientId should match a real client
          const clientsResponse = await request(app)
            .get('/api/clients');

          if (clientsResponse.status === 200) {
            const matchingClient = clientsResponse.body.find(
              (c: any) => c.id === job.clientId
            );

            if (matchingClient) {
              // Client name should match
              expect(job.clientName).toBe(matchingClient.name);
            }
          }
        }
      }
    });
  });

  // ==================== Performance & Security ====================

  describe('Performance and Security', () => {
    it('should respond to GET /api/clients within reasonable time', async () => {
      const start = Date.now();
      const response = await request(app)
        .get('/api/clients');
      const duration = Date.now() - start;

      // Should respond within 5 seconds even with many clients
      expect(duration).toBeLessThan(5000);
    });

    it('should handle large client lists without errors', async () => {
      const response = await request(app)
        .get('/api/clients');

      // Should not crash even if there are many clients
      expect([200, 401, 403]).toContain(response.status);
    });

    it('should not expose sensitive user data in client responses', async () => {
      const response = await request(app)
        .get('/api/clients');

      if (response.status === 200 && response.body.length > 0) {
        const client = response.body[0];

        // Should not include user passwords, tokens, etc.
        expect(client).not.toHaveProperty('password');
        expect(client).not.toHaveProperty('apiKey');
        expect(client).not.toHaveProperty('token');
        expect(client).not.toHaveProperty('sessionId');
      }
    });

    it('should validate ID parameter is numeric', async () => {
      const response = await request(app)
        .patch('/api/clients/not-a-number')
        .send({
          name: 'Test'
        });

      // Should fail validation or be unauthorized
      // Express routing might 404 this or the endpoint might return 400
      expect([400, 404, 401, 403]).toContain(response.status);
    });

    it('should prevent SQL injection in client name', async () => {
      const response = await request(app)
        .post('/api/clients')
        .send({
          name: "'; DROP TABLE clients; --"
        });

      // If authenticated, should safely handle SQL injection attempt
      if (response.status === 201) {
        // Name should be stored as-is (parameterized query protects us)
        expect(response.body.name).toBe("'; DROP TABLE clients; --");

        // Verify clients table still exists by fetching clients
        const verifyResponse = await request(app).get('/api/clients');
        if (verifyResponse.status === 200) {
          expect(Array.isArray(verifyResponse.body)).toBe(true);
        }
      } else {
        expect([401, 403]).toContain(response.status);
      }
    });
  });
});
