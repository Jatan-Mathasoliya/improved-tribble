import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { storage } from '../storage';
import { db } from '../db';
import { jobs, jobAuditLog, users } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Gate DB-dependent tests - skip when DATABASE_URL not set
const HAS_DB = !!process.env.DATABASE_URL;
const maybeDescribe = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[TEST] Skipping Job Lifecycle tests: DATABASE_URL not set');
}

maybeDescribe('Job Lifecycle System', () => {
  let testUserId: number;
  let testJobId: number;

  beforeAll(async () => {
    // Create test user
    const [user] = await db.insert(users).values({
      username: 'test_lifecycle_user',
      password: 'test123',
      role: 'recruiter',
      firstName: 'Test',
      lastName: 'User'
    }).returning();
    testUserId = user.id;

    // Create test job
    const [job] = await db.insert(jobs).values({
      title: 'Test Job for Lifecycle',
      location: 'Test Location',
      type: 'full-time',
      description: 'Test description',
      postedBy: testUserId,
      status: 'approved',
      isActive: true
    }).returning();
    testJobId = job.id;
  });

  afterAll(async () => {
    // Cleanup
    await db.delete(jobs).where(eq(jobs.id, testJobId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  describe('Database Schema', () => {
    it('should have all lifecycle columns', async () => {
      const job = await storage.getJob(testJobId);
      expect(job).toBeDefined();
      expect(job).toHaveProperty('deactivatedAt');
      expect(job).toHaveProperty('reactivatedAt');
      expect(job).toHaveProperty('reactivationCount');
      expect(job).toHaveProperty('deactivationReason');
      expect(job).toHaveProperty('warningEmailSent');
    });

    it('should have default values for new jobs', async () => {
      const job = await storage.getJob(testJobId);
      expect(job!.deactivatedAt).toBeNull();
      expect(job!.reactivatedAt).toBeNull();
      expect(job!.reactivationCount).toBe(0);
      expect(job!.deactivationReason).toBeNull();
      expect(job!.warningEmailSent).toBe(false);
    });
  });

  describe('Job Deactivation', () => {
    it('should set deactivatedAt when deactivating', async () => {
      const before = await storage.getJob(testJobId);
      expect(before!.isActive).toBe(true);

      const updated = await storage.updateJobStatus(
        testJobId,
        false,
        'filled',
        testUserId
      );

      expect(updated).toBeDefined();
      expect(updated!.isActive).toBe(false);
      expect(updated!.deactivatedAt).not.toBeNull();
      expect(updated!.deactivationReason).toBe('filled');
      expect(updated!.warningEmailSent).toBe(false);
    });

    it('should create audit log entry on deactivation', async () => {
      const logs = await db.select()
        .from(jobAuditLog)
        .where(eq(jobAuditLog.jobId, testJobId));

      expect(logs.length).toBeGreaterThan(0);
      const deactivationLog = logs.find((l: any) => l.action === 'deactivated');
      expect(deactivationLog).toBeDefined();
      expect(deactivationLog!.performedBy).toBe(testUserId);
      expect(deactivationLog!.reason).toBe('filled');
    });
  });

  describe('Job Reactivation', () => {
    it('should set reactivatedAt when reactivating', async () => {
      const updated = await storage.updateJobStatus(
        testJobId,
        true,
        'manual_reactivation',
        testUserId
      );

      expect(updated).toBeDefined();
      expect(updated!.isActive).toBe(true);
      expect(updated!.reactivatedAt).not.toBeNull();
      expect(updated!.reactivationCount).toBe(1);
      expect(updated!.deactivationReason).toBeNull(); // Cleared on reactivation
    });

    it('should increment reactivationCount on multiple reactivations', async () => {
      // Deactivate again
      await storage.updateJobStatus(testJobId, false, 'test', testUserId);

      // Reactivate again
      const updated = await storage.updateJobStatus(
        testJobId,
        true,
        undefined,
        testUserId
      );

      expect(updated!.reactivationCount).toBe(2);
    });

    it('should create audit log entry on reactivation', async () => {
      const logs = await db.select()
        .from(jobAuditLog)
        .where(eq(jobAuditLog.jobId, testJobId));

      const reactivationLogs = logs.filter((l: any) => l.action === 'reactivated');
      expect(reactivationLogs.length).toBeGreaterThanOrEqual(1);

      const latestReactivation = reactivationLogs[reactivationLogs.length - 1];
      expect(latestReactivation.performedBy).toBe(testUserId);
    });
  });

  describe('Audit Logging', () => {
    it('should log actions with metadata', async () => {
      const testLog = await storage.logJobAction({
        jobId: testJobId,
        action: 'approved',
        performedBy: testUserId,
        reason: 'test_reason',
        metadata: { test: 'data' }
      });

      expect(testLog).toBeDefined();
      expect(testLog.action).toBe('approved');
      expect(testLog.reason).toBe('test_reason');
      expect(testLog.metadata).toEqual({ test: 'data' });
    });

    it('should track audit log timeline', async () => {
      const logs = await db.select()
        .from(jobAuditLog)
        .where(eq(jobAuditLog.jobId, testJobId))
        .orderBy(jobAuditLog.timestamp);

      expect(logs.length).toBeGreaterThan(0);

      // Verify timestamps are in order
      for (let i = 1; i < logs.length; i++) {
        expect(new Date(logs[i].timestamp).getTime())
          .toBeGreaterThanOrEqual(new Date(logs[i - 1].timestamp).getTime());
      }
    });
  });
});

console.log('✅ Job Lifecycle Tests defined - run with: npm test');
