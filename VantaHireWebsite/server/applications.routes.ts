/**
 * Applications Routes Module
 *
 * All application, candidate, and pipeline management endpoints:
 * - Application submission (/api/jobs/:id/apply)
 * - Recruiter add candidate (/api/jobs/:id/applications/recruiter-add)
 * - Application management (stage, interview, notes, rating, feedback)
 * - Pipeline stages (/api/pipeline/stages)
 * - Candidate views (/api/candidates, /api/my-applications)
 * - User profile (/api/profile)
 * - Resume download
 */

import type { Express, Request, Response, NextFunction } from 'express';
import type { Multer } from 'multer';
import { sql, eq, and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './db';
import { storage } from './storage';
import { requireAuth, requireRole } from './auth';
import { calculateAiCost } from './lib/aiMatchingEngine';
import { syncProfileCompletionStatus } from './lib/profileCompletion';
import {
  insertApplicationSchema,
  recruiterAddApplicationSchema,
  insertPipelineStageSchema,
  insertApplicationFeedbackSchema,
  applications,
  pipelineStages,
  applicationStageHistory,
  candidateResumes,
  userAiUsage,
  applicationFeedback,
} from '@shared/schema';
import { uploadToGCS, getSignedDownloadUrl, downloadFromGCS } from './gcs-storage';
import {
  sendStatusUpdateNotification,
  sendInterviewInvitationNotification,
  sendApplicationReceivedNotification,
  sendOfferNotification,
  sendRejectionNotification,
} from './notificationService';
import { notifyRecruitersNewApplication } from './emailTemplateService';
import { generateInterviewICS, getICSFilename } from './lib/icsGenerator';
import { extractResumeText, validateResumeText } from './lib/resumeExtractor';
import { isAIEnabled, generateCandidateSummary } from './aiJobAnalyzer';
import { checkCircuitBreaker } from './lib/aiMatchingEngine';
import { applicationRateLimit, recruiterAddRateLimit, aiAnalysisRateLimit, type RateLimitInfo } from './rateLimit';
import { isQueueAvailable, enqueueSummaryBatch, removeJob, QUEUES } from './lib/aiQueue';
import { randomUUID } from 'crypto';
import type { CsrfMiddleware } from './types/routes';

// Base URL for email links
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

// Validation schemas
const updateStageSchema = z.object({
  stageId: z.number().int().positive(),
  notes: z.string().optional(),
});

const scheduleInterviewSchema = z.object({
  date: z.string().optional(),
  time: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Register all application-related routes
 */
export function registerApplicationsRoutes(
  app: Express,
  csrfProtection: CsrfMiddleware,
  upload: Multer
): void {
  // ============= APPLICATION SUBMISSION ROUTES =============

  // Submit job application with resume upload
  app.post("/api/jobs/:id/apply", applicationRateLimit, csrfProtection, upload.single('resume'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing ID parameter' });
        return;
      }
      const jobId = Number(idParam);
      if (!Number.isFinite(jobId) || jobId <= 0 || !Number.isInteger(jobId)) {
        res.status(400).json({ error: 'Invalid ID parameter' });
        return;
      }

      // Check if job exists
      const job = await storage.getJob(jobId);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'Resume file is required' });
        return;
      }

      // Validate application data
      const applicationData = insertApplicationSchema.parse(req.body);

      // Duplicate detection (case-insensitive email check)
      const existingApp = await db.query.applications.findFirst({
        where: and(
          eq(applications.jobId, jobId),
          sql`LOWER(${applications.email}) = LOWER(${applicationData.email})`
        )
      });

      if (existingApp) {
        res.status(400).json({
          error: 'Duplicate application',
          message: `You have already applied for this position with ${applicationData.email}`,
          existingApplicationId: existingApp.id
        });
        return;
      }

      // Increment apply click count for analytics (after duplicate check)
      await storage.incrementApplyClicks(jobId);

      // Upload resume to Google Cloud Storage or use placeholder if not configured
      let resumeUrl = 'placeholder-resume.pdf';
      let resumeRecordId: number | null = null;
      let resumeCountForCompletion: number | null = null;
      if (req.file) {
        try {
          resumeUrl = await uploadToGCS(req.file.buffer, req.file.originalname);
        } catch (error) {
          console.log('Google Cloud Storage not configured, using placeholder resume URL');
          resumeUrl = `resume-${Date.now()}-${req.file.originalname}`;
        }
      }

      // If candidate is authenticated, persist resume + extracted text for AI
      if (req.user?.id && req.file?.buffer) {
        try {
          // Enforce soft limit of 3 resumes like resume upload endpoint
          const existingResumes = await db.query.candidateResumes.findMany({
            where: eq(candidateResumes.userId, req.user.id),
            columns: { id: true, isDefault: true },
          });
          resumeCountForCompletion = existingResumes.length;

          if (existingResumes.length < 3) {
            const extraction = await extractResumeText(req.file.buffer);
            if (extraction.success && validateResumeText(extraction.text)) {
              const shouldBeDefault = !existingResumes.some((r: { isDefault: boolean }) => r.isDefault);
              const [resume] = await db
                .insert(candidateResumes)
                .values({
                  userId: req.user.id,
                  label: req.file.originalname || 'Uploaded Resume',
                  gcsPath: resumeUrl,
                  extractedText: extraction.text,
                  isDefault: shouldBeDefault,
                })
                .returning();
              resumeRecordId = resume.id;
              resumeCountForCompletion = existingResumes.length + 1;
            }
          }
        } catch (resumeErr) {
          console.error('Resume save/extraction failed (non-blocking):', resumeErr);
        }
      }

      // Determine default pipeline stage for new applications (if stages are configured)
      let initialStageId: number | null = null;
      try {
        const stages = await storage.getPipelineStages();
        if (stages && stages.length > 0) {
          const explicitDefault = stages.find((s) => s.isDefault);
          const chosen = explicitDefault ?? stages[0]!;
          initialStageId = chosen.id;
        }
      } catch (stageError) {
        console.error("Failed to load pipeline stages for default assignment:", stageError);
      }

      const now = new Date();

      // Create application record (with optional initial stage assignment)
      const application = await storage.createApplication({
        ...applicationData,
        jobId,
        resumeUrl,
        resumeFilename: req.file?.originalname ?? null,
        ...(resumeRecordId !== null && { resumeId: resumeRecordId }),
        ...(req.user?.id !== undefined && { userId: req.user.id }),
        ...(initialStageId !== null && {
          currentStage: initialStageId,
          stageChangedAt: now,
          stageChangedBy: job.postedBy,
        }),
      });

      if (req.user?.id && resumeCountForCompletion !== null) {
        await syncProfileCompletionStatus(req.user, { resumeCount: resumeCountForCompletion });
      }

      // Log initial stage assignment to history table (if a default stage was applied)
      if (initialStageId !== null) {
        await db.insert(applicationStageHistory).values({
          applicationId: application.id,
          fromStage: null,
          toStage: initialStageId,
          changedBy: job.postedBy,
          notes: "Initial stage assigned automatically at application submission",
        });
      }

      // Fire-and-forget: candidate confirmation via email and WhatsApp (if enabled)
      const autoNotifications = process.env.EMAIL_AUTOMATION_ENABLED === 'true' || process.env.EMAIL_AUTOMATION_ENABLED === '1' || process.env.NOTIFICATION_AUTOMATION_ENABLED === 'true';
      if (autoNotifications) {
        sendApplicationReceivedNotification(application.id).catch(err => console.error('Application received notification error:', err));
      }

      // Send notification email to all recruiters on this job (if enabled)
      try {
        const shouldNotifyRecruiter = await storage.isAutomationEnabled('notify_recruiter_new_application');
        if (shouldNotifyRecruiter) {
          notifyRecruitersNewApplication(
            application.id,
            job.id,
            {
              name: application.name,
              email: application.email,
              phone: application.phone,
              coverLetter: application.coverLetter,
            },
            {
              title: job.title,
              location: job.location,
            }
          ).catch(err => console.error('Failed to send recruiter notification:', err));
        }
      } catch (emailError) {
        console.error('Failed to send recruiter notification:', emailError);
      }

      res.status(201).json({
        success: true,
        message: 'Application submitted successfully',
        applicationId: application.id
      });
      return;
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation error',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
        return;
      } else {
        next(error);
      }
    }
  });

  // Recruiter adds candidate on behalf (MVP: Add Candidate feature)
  app.post(
    "/api/jobs/:id/applications/recruiter-add",
    requireRole(['recruiter', 'super_admin']),
    recruiterAddRateLimit,
    csrfProtection,
    upload.single('resume'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const idParam = req.params.id;
        if (!idParam) {
          res.status(400).json({ error: 'Missing ID parameter' });
          return;
        }
        const jobId = Number(idParam);
        if (!Number.isFinite(jobId) || jobId <= 0 || !Number.isInteger(jobId)) {
          res.status(400).json({ error: 'Invalid ID parameter' });
          return;
        }

        // Permission guard: Verify job access (primary recruiter, co-recruiter, or admin)
        const job = await storage.getJob(jobId);
        if (!job) {
          res.status(404).json({ error: 'Job not found' });
          return;
        }

        const hasAccess = await storage.isRecruiterOnJob(jobId, req.user!.id);
        if (!hasAccess) {
          res.status(403).json({ error: 'Access denied: You can only add candidates to your own jobs' });
          return;
        }

        if (!req.file) {
          res.status(400).json({ error: 'Resume file is required' });
          return;
        }

        // Validate with dedicated schema
        const applicationData = recruiterAddApplicationSchema.parse(req.body);

        // Duplicate detection (case-insensitive email check)
        const existingApp = await db.query.applications.findFirst({
          where: and(
            eq(applications.jobId, jobId),
            sql`LOWER(${applications.email}) = LOWER(${applicationData.email})`
          )
        });

        if (existingApp) {
          res.status(400).json({
            error: 'Duplicate application',
            message: `An application from ${applicationData.email} already exists for this job`,
            existingApplicationId: existingApp.id
          });
          return;
        }

        // Upload resume
        let resumeUrl = 'placeholder-resume.pdf';
        try {
          resumeUrl = await uploadToGCS(req.file.buffer, req.file.originalname);
        } catch (error) {
          console.log('Google Cloud Storage not configured, using placeholder resume URL');
          resumeUrl = `resume-${Date.now()}-${req.file.originalname}`;
        }

        // Determine default pipeline stage for recruiter-added candidates (if stages are configured)
        let defaultStageId: number | null = null;
        try {
          const stages = await storage.getPipelineStages();
          if (stages && stages.length > 0) {
            const explicitDefault = stages.find((s) => s.isDefault);
            const chosen = explicitDefault ?? stages[0]!;
            defaultStageId = chosen.id;
          }
        } catch (stageError) {
          console.error("Failed to load pipeline stages for recruiter-add default assignment:", stageError);
        }

        // Validate initial stage if provided, otherwise fall back to default (if available)
        let initialStage: number | null = null;
        if (applicationData.currentStage) {
          const stageExists = await db.query.pipelineStages.findFirst({
            where: eq(pipelineStages.id, applicationData.currentStage)
          });

          if (!stageExists) {
            res.status(400).json({ error: 'Invalid stage ID' });
            return;
          }

          initialStage = applicationData.currentStage;
        } else if (defaultStageId !== null) {
          initialStage = defaultStageId;
        }

        // Create application with recruiter metadata
        const application = await storage.createApplication({
          name: applicationData.name,
          email: applicationData.email,
          phone: applicationData.phone,
          whatsappConsent: applicationData.whatsappConsent,
          ...(applicationData.coverLetter && { coverLetter: applicationData.coverLetter }),
          jobId,
          resumeUrl,
          resumeFilename: req.file.originalname,
          submittedByRecruiter: true,
          createdByUserId: req.user!.id,
          source: applicationData.source,
          ...(applicationData.sourceMetadata && { sourceMetadata: applicationData.sourceMetadata }),
          ...(initialStage !== null && {
            currentStage: initialStage,
            stageChangedAt: new Date(),
            stageChangedBy: req.user!.id,
          }),
        });

        // Log initial stage assignment to history table
        if (initialStage) {
          await db.insert(applicationStageHistory).values({
            applicationId: application.id,
            fromStage: null,
            toStage: initialStage,
            changedBy: req.user!.id,
            notes: 'Initial stage assigned by recruiter during candidate addition',
          });
        }

        // Audit log (simple console log for MVP)
        console.log('[RECRUITER_ADD]', {
          applicationId: application.id,
          recruiterId: req.user!.id,
          jobId,
          candidateEmail: applicationData.email,
          source: applicationData.source,
          timestamp: new Date().toISOString()
        });

        res.status(201).json({
          success: true,
          message: 'Candidate added successfully',
          applicationId: application.id,
        });
        return;
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: 'Validation error',
            details: error.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message
            }))
          });
          return;
        }
        next(error);
      }
    }
  );

  // ====== ATS: Bulk interview scheduling ======
  app.patch(
    "/api/applications/bulk/interview",
    csrfProtection,
    requireRole(['recruiter', 'super_admin']),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const bodySchema = z.object({
          applicationIds: z.array(z.number().int().positive()).min(1),
          start: z.string(),
          intervalHours: z.number().min(0).max(24).default(0),
          location: z.string().min(1),
          timeRangeLabel: z.string().optional(),
          notes: z.string().optional(),
          stageId: z.number().int().positive().optional(),
        });

        const parsed = bodySchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: "Validation error",
            details: parsed.error.errors,
          });
          return;
        }

        const data = parsed.data as z.infer<typeof bodySchema>;
        const {
          applicationIds,
          start,
          intervalHours,
          location,
          timeRangeLabel,
          notes,
          stageId,
        } = data;

        // Normalize base start date
        let baseDate: Date | undefined;
        if (/^\d{4}-\d{2}-\d{2}$/.test(start)) {
          baseDate = new Date(`${start}T00:00:00Z`);
        } else {
          const parsedStart = new Date(start);
          if (!isNaN(parsedStart.getTime())) {
            baseDate = parsedStart;
          }
        }

        if (!baseDate) {
          res.status(400).json({ error: "Invalid start datetime" });
          return;
        }

        const results: { id: number; success: boolean; error?: string }[] = [];

        // Preload pipeline stages and map stageId -> order
        let stageOrderMap = new Map<number, number>();
        let targetStageOrder: number | null = null;
        const targetStageId = stageId ?? null;
        if (targetStageId !== null) {
          const stages = await storage.getPipelineStages();
          stageOrderMap = new Map(stages.map((s) => [s.id, s.order ?? 0]));
          targetStageOrder = stageOrderMap.get(targetStageId) ?? null;
        }

        for (let index = 0; index < applicationIds.length; index++) {
          const appId = Number(applicationIds[index]);
          try {
            const offsetMs = intervalHours * 60 * 60 * 1000 * index;
            const slotDate = new Date(baseDate.getTime() + offsetMs);

            // Persist interview details
            const interviewFields: { date?: Date; time?: string; location?: string; notes?: string } = {
              date: slotDate,
              location,
            };
            if (typeof timeRangeLabel === "string" && timeRangeLabel.length > 0) {
              interviewFields.time = timeRangeLabel;
            }
            if (typeof notes === "string" && notes.length > 0) {
              interviewFields.notes = notes;
            }

            // Get current stage order for comparison (if stage update is needed)
            let stageUpdateParams: { targetStageId: number; changedBy: number; notes?: string; currentStageOrder: number | null; targetStageOrder: number } | undefined;
            if (targetStageId !== null && targetStageOrder !== null) {
              const appRecord = await storage.getApplication(appId);
              const currentStageId = appRecord?.currentStage ?? null;
              const currentOrder = currentStageId !== null ? stageOrderMap.get(currentStageId) ?? null : null;

              stageUpdateParams = {
                targetStageId,
                changedBy: req.user!.id,
                currentStageOrder: currentOrder,
                targetStageOrder,
              };
              // Only add notes if defined (exactOptionalPropertyTypes compatibility)
              if (notes !== undefined) {
                stageUpdateParams.notes = notes;
              }
            }

            // Use atomic method for interview + stage update (prevents partial state)
            await storage.scheduleInterviewWithStage(appId, interviewFields, stageUpdateParams);

            // Fire-and-forget interview invite via email and WhatsApp (if automation enabled)
            const autoNotifications = process.env.EMAIL_AUTOMATION_ENABLED === "true" || process.env.EMAIL_AUTOMATION_ENABLED === "1" || process.env.NOTIFICATION_AUTOMATION_ENABLED === "true";
            if (autoNotifications) {
              const dateStr = slotDate.toISOString();
              const timeLabel = timeRangeLabel ?? "";
              sendInterviewInvitationNotification(appId, {
                date: dateStr,
                time: timeLabel,
                location,
              }).catch((err) =>
                console.error("Bulk interview notification error:", err)
              );
            }

            results.push({ id: appId, success: true });
          } catch (err: any) {
            console.error("Bulk interview scheduling error:", err);
            results.push({
              id: appId,
              success: false,
              error: err?.message ?? "Unknown error",
            });
          }
        }

        const scheduledCount = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success);

        res.json({
          total: applicationIds.length,
          scheduledCount,
          failedCount: failed.length,
          failed,
        });
        return;
      } catch (error) {
        next(error);
      }
    }
  );

  // Get applications for a specific job (recruiters only)
  app.get("/api/jobs/:id/applications", requireRole(['recruiter', 'super_admin']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing ID parameter' });
        return;
      }
      const jobId = Number(idParam);
      if (!Number.isFinite(jobId) || jobId <= 0 || !Number.isInteger(jobId)) {
        res.status(400).json({ error: 'Invalid ID parameter' });
        return;
      }

      const applicationsList = await storage.getApplicationsByJob(jobId);

      // Get client feedback counts for all applications
      const appIds = applicationsList.map(app => app.id);
      const feedbackCounts = await storage.getClientFeedbackCountsByApplicationIds(appIds);

      // Merge feedback counts into applications
      const applicationsWithFeedback = applicationsList.map(app => ({
        ...app,
        clientFeedbackCount: feedbackCounts[app.id] || 0,
      }));

      res.json(applicationsWithFeedback);
      return;
    } catch (error) {
      next(error);
    }
  });

  // Get AI-suggested similar candidates from other jobs
  app.get("/api/jobs/:id/ai-similar-candidates", requireRole(['recruiter', 'super_admin']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing ID parameter' });
        return;
      }

      const jobId = Number(idParam);
      if (!Number.isFinite(jobId) || jobId <= 0 || !Number.isInteger(jobId)) {
        res.status(400).json({ error: 'Invalid job ID' });
        return;
      }

      const minFitScore = req.query.minFitScore
        ? parseInt(String(req.query.minFitScore), 10)
        : undefined;
      const limit = req.query.limit
        ? parseInt(String(req.query.limit), 10)
        : undefined;

      const recruiterId = req.user!.id;

      const options: { minFitScore?: number; limit?: number } = {};
      if (typeof minFitScore === "number" && !Number.isNaN(minFitScore)) {
        options.minFitScore = minFitScore;
      }
      if (typeof limit === "number" && !Number.isNaN(limit)) {
        options.limit = limit;
      }

      const candidates = await storage.getSimilarCandidatesForJob(jobId, recruiterId, options);

      res.json(candidates);
      return;
    } catch (error) {
      console.error('[Similar Candidates] Error fetching similar candidates:', error);
      next(error);
    }
  });

  // Secure resume download via permission-gated redirect
  app.get("/api/applications/:id/resume", requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing ID parameter' });
        return;
      }
      const applicationId = Number(idParam);
      if (!Number.isFinite(applicationId) || applicationId <= 0 || !Number.isInteger(applicationId)) {
        res.status(400).json({ error: 'Invalid ID parameter' });
        return;
      }

      const appRecord = await storage.getApplication(applicationId);
      if (!appRecord) {
        res.status(404).json({ error: 'Application not found' });
        return;
      }

      // Permission checks
      const role = req.user!.role;
      if (role === 'super_admin') {
        // allowed
      } else if (role === 'recruiter') {
        // Use isRecruiterOnJob to check access (includes co-recruiters)
        const hasAccess = await storage.isRecruiterOnJob(appRecord.jobId, req.user!.id);
        if (!hasAccess) {
          res.status(403).json({ error: 'Access denied' });
          return;
        }
        await storage.markApplicationDownloaded(applicationId);
      } else if (role === 'candidate') {
        if (!appRecord.userId || appRecord.userId !== req.user!.id) {
          res.status(403).json({ error: 'Access denied' });
          return;
        }
      } else {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const url = appRecord.resumeUrl;
      if (!url) {
        res.status(404).json({ error: 'Resume not available' });
        return;
      }

      // Stream PDF through server to allow iframe embedding (avoids GCS X-Frame-Options)
      if (url.startsWith('gs://')) {
        try {
          const buffer = await downloadFromGCS(url);
          const filename = appRecord.resumeFilename || 'resume.pdf';
          const ext = filename.split('.').pop()?.toLowerCase() || 'pdf';
          const contentType = ext === 'pdf' ? 'application/pdf' : 'application/octet-stream';

          // Allow embedding in iframes from same origin only (security fix)
          res.setHeader('X-Frame-Options', 'SAMEORIGIN');
          res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
          res.setHeader('Content-Length', buffer.length);
          res.send(buffer);
          return;
        } catch (gcsError) {
          console.error('[Resume] GCS download failed:', gcsError);
          res.status(500).json({ error: 'Failed to retrieve resume' });
          return;
        }
      } else if (/^https?:\/\//i.test(url)) {
        // External URL - redirect (can't proxy arbitrary URLs)
        res.redirect(302, url);
        return;
      } else {
        res.status(404).json({ error: 'Resume not available' });
        return;
      }
    } catch (error) {
      next(error);
    }
  });

  // ============= PIPELINE MANAGEMENT ROUTES =============

  // Get pipeline stages
  app.get("/api/pipeline/stages", requireAuth, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stages = await storage.getPipelineStages();
      res.json(stages);
      return;
    } catch (e) { next(e); }
  });

  // Create pipeline stage (recruiters/admin)
  app.post("/api/pipeline/stages", csrfProtection, requireRole(['recruiter', 'super_admin']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = insertPipelineStageSchema.parse(req.body);
      const stage = await storage.createPipelineStage({ ...body, createdBy: req.user!.id });
      res.status(201).json(stage);
      return;
    } catch (e) {
      if (e instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: e.errors });
        return;
      }
      next(e);
    }
  });

  // Update pipeline stage (recruiters or admin - stages are global)
  app.patch("/api/pipeline/stages/:id", csrfProtection, requireRole(['recruiter', 'super_admin']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing stage ID parameter' });
        return;
      }
      const stageId = parseInt(idParam, 10);
      if (isNaN(stageId) || stageId <= 0) {
        res.status(400).json({ error: 'Invalid stage ID' });
        return;
      }

      const updateSchema = z.object({
        name: z.string().min(1).max(50).optional(),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        order: z.number().int().min(0).optional(),
      });

      const validation = updateSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ error: 'Validation error', details: validation.error.errors });
        return;
      }

      // Verify stage exists
      const stage = await storage.getPipelineStage(stageId);
      if (!stage) {
        res.status(404).json({ error: 'Stage not found' });
        return;
      }

      // Stages are global - all recruiters can edit. Build update object without undefined values.
      const updateData: { name?: string; color?: string | null; order?: number } = {};
      if (validation.data.name !== undefined) updateData.name = validation.data.name;
      if (validation.data.color !== undefined) updateData.color = validation.data.color;
      if (validation.data.order !== undefined) updateData.order = validation.data.order;

      const updated = await storage.updatePipelineStage(stageId, updateData);
      res.json(updated);
      return;
    } catch (e) {
      next(e);
    }
  });

  // Delete pipeline stage (recruiters or admin - stages are global)
  app.delete("/api/pipeline/stages/:id", csrfProtection, requireRole(['recruiter', 'super_admin']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing stage ID parameter' });
        return;
      }
      const stageId = parseInt(idParam, 10);
      if (isNaN(stageId) || stageId <= 0) {
        res.status(400).json({ error: 'Invalid stage ID' });
        return;
      }

      // Verify stage exists
      const stage = await storage.getPipelineStage(stageId);
      if (!stage) {
        res.status(404).json({ error: 'Stage not found' });
        return;
      }

      // Stages are global - all recruiters can delete (but check for applications first)

      // Check if stage has applications
      const appsInStage = await storage.getApplicationsInStage(stageId);
      if (appsInStage.length > 0) {
        res.status(400).json({
          error: 'Cannot delete stage with applications. Move applications first.',
          applicationCount: appsInStage.length
        });
        return;
      }

      await storage.deletePipelineStage(stageId);
      res.status(204).send();
      return;
    } catch (e) {
      next(e);
    }
  });

  // Move application to a new stage
  app.patch("/api/applications/:id/stage", csrfProtection, requireRole(['recruiter', 'super_admin']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing ID parameter' });
        return;
      }
      const appId = Number(idParam);
      if (!Number.isFinite(appId) || appId <= 0 || !Number.isInteger(appId)) {
        res.status(400).json({ error: 'Invalid ID parameter' });
        return;
      }

      const validation = updateStageSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: 'Validation error',
          details: validation.error.errors
        });
        return;
      }

      const { stageId, notes } = validation.data;

      const stages = await storage.getPipelineStages();
      const targetStage = stages.find(s => s.id === stageId);
      if (!targetStage) {
        res.status(400).json({ error: `Invalid stage ID: ${stageId}` });
        return;
      }

      await storage.updateApplicationStage(appId, stageId, req.user!.id, notes);

      // Fire-and-forget: automated status notification via email and WhatsApp (if enabled)
      const autoNotifications = process.env.EMAIL_AUTOMATION_ENABLED === 'true' || process.env.EMAIL_AUTOMATION_ENABLED === '1' || process.env.NOTIFICATION_AUTOMATION_ENABLED === 'true';
      if (autoNotifications && targetStage.name) {
        const stageName = targetStage.name.toLowerCase();
        if (stageName.includes('offer') || stageName.includes('hired')) {
          sendOfferNotification(appId).catch(err => console.error('Offer notification error:', err));
        } else if (stageName.includes('reject')) {
          sendRejectionNotification(appId).catch(err => console.error('Rejection notification error:', err));
        } else {
          sendStatusUpdateNotification(appId, targetStage.name).catch(err => console.error('Status notification error:', err));
        }
      }

      res.json({ success: true });
      return;
    } catch (e) { next(e); }
  });

  // Get application stage history
  app.get("/api/applications/:id/history", requireRole(['recruiter', 'super_admin']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing ID parameter' });
        return;
      }
      const appId = Number(idParam);
      if (!Number.isFinite(appId) || appId <= 0 || !Number.isInteger(appId)) {
        res.status(400).json({ error: 'Invalid ID parameter' });
        return;
      }
      const hist = await storage.getApplicationStageHistory(appId);
      res.json(hist);
      return;
    } catch (e) { next(e); }
  });

  // ============= INTERVIEW MANAGEMENT ROUTES =============

  // Download interview calendar invite (ICS file)
  app.get("/api/applications/:id/interview/ics", requireRole(['recruiter', 'super_admin']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing ID parameter' });
        return;
      }
      const appId = Number(idParam);
      if (!Number.isFinite(appId) || appId <= 0 || !Number.isInteger(appId)) {
        res.status(400).json({ error: 'Invalid ID parameter' });
        return;
      }

      const application = await storage.getApplication(appId);
      if (!application) {
        res.status(404).json({ error: 'Application not found' });
        return;
      }

      const job = await storage.getJob(application.jobId);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      if (!application.interviewDate || !application.interviewTime) {
        res.status(400).json({
          error: 'Interview not scheduled',
          message: 'Interview date and time must be set before generating calendar invite'
        });
        return;
      }

      const recruiter = req.user;
      const interviewDateString = new Date(application.interviewDate).toISOString().slice(0, 10);

      const interviewDetails: any = {
        candidateName: application.name,
        candidateEmail: application.email,
        jobTitle: job.title,
        interviewDate: interviewDateString,
        interviewTime: application.interviewTime,
        interviewLocation: application.interviewLocation || 'TBD',
      };

      if (recruiter?.firstName) {
        interviewDetails.recruiterName = `${recruiter.firstName} ${recruiter.lastName || ''}`.trim();
      }
      if (recruiter?.username) {
        interviewDetails.recruiterEmail = recruiter.username;
      }
      if (application.interviewNotes) {
        interviewDetails.notes = application.interviewNotes;
      }

      const icsContent = generateInterviewICS(interviewDetails);
      const filename = getICSFilename(job.title, application.name);

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(icsContent);
      return;
    } catch (error) {
      console.error('[ICS Download] Error:', error);
      next(error);
    }
  });

  // Schedule interview
  app.patch("/api/applications/:id/interview", csrfProtection, requireRole(['recruiter', 'super_admin']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing ID parameter' });
        return;
      }
      const appId = Number(idParam);
      if (!Number.isFinite(appId) || appId <= 0 || !Number.isInteger(appId)) {
        res.status(400).json({ error: 'Invalid ID parameter' });
        return;
      }

      const payload = {
        date: typeof req.body?.date === 'string' && req.body.date.trim() !== '' ? req.body.date.trim() : undefined,
        time: typeof req.body?.time === 'string' && req.body.time.trim() !== '' ? req.body.time.trim() : undefined,
        location: typeof req.body?.location === 'string' && req.body.location.trim() !== '' ? req.body.location.trim() : undefined,
        notes: typeof req.body?.notes === 'string' && req.body.notes.trim() !== '' ? req.body.notes.trim() : undefined,
      };

      const validation = scheduleInterviewSchema.safeParse(payload);
      if (!validation.success) {
        res.status(400).json({
          error: 'Validation error',
          details: validation.error.errors
        });
        return;
      }

      let { date, time, location, notes } = validation.data;
      let ts: Date | undefined = undefined;
      if (date) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          ts = new Date(`${date}T00:00:00Z`);
        } else {
          const parsed = new Date(date);
          if (!isNaN(parsed.getTime())) ts = parsed;
        }
      }
      const updated = await storage.scheduleInterview(appId, {
        ...(ts !== undefined && { date: ts }),
        ...(time !== undefined && { time }),
        ...(location !== undefined && { location }),
        ...(notes !== undefined && { notes })
      });

      const autoNotifications = process.env.EMAIL_AUTOMATION_ENABLED === 'true' || process.env.EMAIL_AUTOMATION_ENABLED === '1' || process.env.NOTIFICATION_AUTOMATION_ENABLED === 'true';
      if (autoNotifications && date && time && location) {
        sendInterviewInvitationNotification(appId, { date, time, location }).catch(err => console.error('Interview notification error:', err));
      }

      res.json(updated);
      return;
    } catch (e) { next(e); }
  });

  // ============= APPLICATION NOTES, RATING, EMAIL HISTORY =============

  // Get email history for an application
  app.get("/api/applications/:id/email-history", requireRole(['recruiter', 'super_admin']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing ID parameter' });
        return;
      }
      const applicationId = Number(idParam);
      if (!Number.isFinite(applicationId) || applicationId <= 0 || !Number.isInteger(applicationId)) {
        res.status(400).json({ error: 'Invalid ID parameter' });
        return;
      }

      const application = await storage.getApplication(applicationId);
      if (!application) {
        res.status(404).json({ error: 'Application not found' });
        return;
      }

      const emailHistory = await storage.getApplicationEmailHistory(applicationId);
      res.json(emailHistory);
      return;
    } catch (error) {
      next(error);
    }
  });

  // Add recruiter note
  app.post("/api/applications/:id/notes", csrfProtection, requireRole(['recruiter', 'super_admin']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing ID parameter' });
        return;
      }
      const appId = Number(idParam);
      if (!Number.isFinite(appId) || appId <= 0 || !Number.isInteger(appId)) {
        res.status(400).json({ error: 'Invalid ID parameter' });
        return;
      }
      const { note } = req.body;
      if (!note) {
        res.status(400).json({ error: 'note required' });
        return;
      }
      const updated = await storage.addRecruiterNote(appId, note);
      res.json(updated);
      return;
    } catch (e) { next(e); }
  });

  // Set rating
  app.patch("/api/applications/:id/rating", csrfProtection, requireRole(['recruiter', 'super_admin']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing ID parameter' });
        return;
      }
      const appId = Number(idParam);
      if (!Number.isFinite(appId) || appId <= 0 || !Number.isInteger(appId)) {
        res.status(400).json({ error: 'Invalid ID parameter' });
        return;
      }
      const { rating } = req.body;
      if (typeof rating !== 'number' || rating < 1 || rating > 5) {
        res.status(400).json({ error: 'rating 1-5' });
        return;
      }
      const updated = await storage.setApplicationRating(appId, rating);
      res.json(updated);
      return;
    } catch (e) { next(e); }
  });

  // ============= AI SUMMARY =============

  // Generate AI candidate summary
  app.post("/api/applications/:id/ai-summary", aiAnalysisRateLimit, requireRole(['recruiter', 'super_admin']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing ID parameter' });
        return;
      }
      const appId = Number(idParam);
      if (!Number.isFinite(appId) || appId <= 0 || !Number.isInteger(appId)) {
        res.status(400).json({ error: 'Invalid ID parameter' });
        return;
      }

      if (!isAIEnabled()) {
        res.status(503).json({
          error: 'AI features not available',
          message: 'AI summary generation is currently unavailable'
        });
        return;
      }

      const application = await storage.getApplication(appId);
      if (!application) {
        res.status(404).json({ error: 'Application not found' });
        return;
      }

      const job = await storage.getJob(application.jobId);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      let resumeText = '';

      if (application.resumeId) {
        const resumeData = await db.query.candidateResumes.findFirst({
          where: eq(candidateResumes.id, application.resumeId)
        });
        resumeText = resumeData?.extractedText || '';
      }

      if (!resumeText && application.resumeUrl && application.resumeUrl.startsWith('gs://')) {
        try {
          const buffer = await downloadFromGCS(application.resumeUrl);
          const extraction = await extractResumeText(buffer);
          if (extraction.success && validateResumeText(extraction.text)) {
            resumeText = extraction.text;
          }
        } catch (err) {
          console.error('[AI Summary] Resume download/extract failed:', err);
        }
      }

      // Prefer resume text, fall back to cover letter only (not job description - that's not candidate content)
      const effectiveText = resumeText || application.coverLetter || '';

      if (!effectiveText) {
        res.status(400).json({
          error: 'No candidate content available',
          message: 'We could not find any candidate text to summarize. Please ensure a resume or cover letter is available for this application.',
        });
        return;
      }

      const startTime = Date.now();
      const summaryResult = await generateCandidateSummary(
        effectiveText,
        job.title,
        job.description,
        application.name
      );
      const durationMs = Date.now() - startTime;

      const costUsd = calculateAiCost(summaryResult.tokensUsed.input, summaryResult.tokensUsed.output);

      await db
        .update(applications)
        .set({
          aiSummary: summaryResult.summary,
          aiSummaryVersion: 1,
          aiSuggestedAction: summaryResult.suggestedAction,
          aiSuggestedActionReason: summaryResult.suggestedActionReason,
          aiSummaryComputedAt: new Date(),
        })
        .where(eq(applications.id, appId));

      await db.insert(userAiUsage).values({
        userId: req.user!.id,
        kind: 'summary',
        tokensIn: summaryResult.tokensUsed.input,
        tokensOut: summaryResult.tokensUsed.output,
        costUsd,
        metadata: {
          applicationId: appId,
          durationMs,
          jobTitle: job.title,
          candidateName: application.name,
        },
      });

      res.json({
        message: 'AI summary generated successfully',
        summary: {
          text: summaryResult.summary,
          suggestedAction: summaryResult.suggestedAction,
          suggestedActionReason: summaryResult.suggestedActionReason,
          strengths: summaryResult.strengths,
          concerns: summaryResult.concerns,
          keyHighlights: summaryResult.keyHighlights,
          modelVersion: summaryResult.model_version,
          computedAt: new Date(),
          cost: parseFloat(costUsd),
          durationMs,
        }
      });
      return;
    } catch (error) {
      console.error('[AI Summary] Error:', error);
      if (error instanceof Error) {
        res.status(500).json({
          error: 'AI summary generation failed',
          message: error.message
        });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
      return;
    }
  });

  // ============= BULK AI SUMMARY GENERATION =============

  // Environment configuration for AI summary limits
  const AI_SUMMARY_DAILY_LIMIT = parseInt(process.env.AI_ANALYSIS_RATE_LIMIT || '20', 10);
  const AI_SUMMARY_BATCH_MAX = parseInt(process.env.AI_SUMMARY_BATCH_MAX || '50', 10);
  const AI_QUEUE_ENABLED = process.env.AI_QUEUE_ENABLED === 'true';

  /**
   * GET /api/ai/summary/limit-status
   * Returns the recruiter's daily AI summary usage limits
   */
  app.get(
    "/api/ai/summary/limit-status",
    requireAuth,
    requireRole(['recruiter', 'super_admin']),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user!.id;

        // Get start of current day (local time)
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);

        // Count AI summary usage today
        const dailyUsage = await db
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(userAiUsage)
          .where(
            and(
              eq(userAiUsage.userId, userId),
              eq(userAiUsage.kind, 'summary'),
              sql`${userAiUsage.computedAt} >= ${startOfDay}`,
              sql`${userAiUsage.computedAt} < ${endOfDay}`
            )
          );

        const dailyUsed = dailyUsage[0]?.count || 0;
        const dailyRemaining = Math.max(0, AI_SUMMARY_DAILY_LIMIT - dailyUsed);

        // Check circuit breaker status (includes AI enabled + budget check)
        const circuitBreaker = await checkCircuitBreaker();
        const budgetAllowed = isAIEnabled() && circuitBreaker.allowed;

        // Effective remaining is the minimum of daily remaining and budget
        const effectiveRemaining = budgetAllowed ? dailyRemaining : 0;

        res.json({
          dailyLimit: AI_SUMMARY_DAILY_LIMIT,
          dailyUsed,
          dailyRemaining,
          dailyResetAt: endOfDay.toISOString(),
          budgetAllowed,
          budgetSpent: circuitBreaker.dailySpent,
          budgetLimit: circuitBreaker.dailyBudget,
          effectiveRemaining,
          maxBatchSize: AI_SUMMARY_BATCH_MAX,
        });
      } catch (error) {
        console.error('[AI Summary Limit Status] Error:', error);
        next(error);
      }
    }
  );

  /**
   * POST /api/applications/bulk/ai-summary/queue
   * Queue bulk AI summary generation for selected applications
   */
  app.post(
    "/api/applications/bulk/ai-summary/queue",
    requireAuth,
    requireRole(['recruiter', 'super_admin']),
    csrfProtection,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user!.id;

        // Validate request body
        const bodySchema = z.object({
          applicationIds: z.array(z.number().int().positive()).min(1),
          regenerate: z.boolean().optional().default(false),
        });

        const validation = bodySchema.safeParse(req.body);
        if (!validation.success) {
          res.status(400).json({
            error: 'Validation error',
            details: validation.error.errors,
          });
          return;
        }

        let { applicationIds, regenerate } = validation.data;
        applicationIds = [...new Set(applicationIds)]; // Deduplicate

        // Check max batch size
        if (applicationIds.length > AI_SUMMARY_BATCH_MAX) {
          res.status(400).json({
            error: `Please select ${AI_SUMMARY_BATCH_MAX} or fewer candidates.`,
            errorCode: 'MAX_EXCEEDED',
            max: AI_SUMMARY_BATCH_MAX,
            selected: applicationIds.length,
          });
          return;
        }

        // Check if queue is available
        if (!AI_QUEUE_ENABLED || !isQueueAvailable()) {
          res.status(503).json({
            error: 'Queue service unavailable. Please try again later.',
            errorCode: 'QUEUE_UNAVAILABLE',
          });
          return;
        }

        // Check AI service availability and circuit breaker
        if (!isAIEnabled()) {
          res.status(503).json({
            error: 'AI service is temporarily unavailable.',
            errorCode: 'AI_UNAVAILABLE',
          });
          return;
        }

        // Check circuit breaker (budget check)
        const circuitBreaker = await checkCircuitBreaker();
        if (!circuitBreaker.allowed) {
          res.status(503).json({
            error: 'AI service budget exhausted. Please try again tomorrow.',
            errorCode: 'BUDGET_EXHAUSTED',
            budgetSpent: circuitBreaker.dailySpent,
            budgetLimit: circuitBreaker.dailyBudget,
          });
          return;
        }

        // Get daily usage to check rate limit (local day)
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);

        const dailyUsage = await db
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(userAiUsage)
          .where(
            and(
              eq(userAiUsage.userId, userId),
              eq(userAiUsage.kind, 'summary'),
              sql`${userAiUsage.computedAt} >= ${startOfDay}`,
              sql`${userAiUsage.computedAt} < ${endOfDay}`
            )
          );

        const dailyUsed = dailyUsage[0]?.count || 0;
        const dailyRemaining = Math.max(0, AI_SUMMARY_DAILY_LIMIT - dailyUsed);

        // Fetch applications and check ownership (recruiter must own the job)
        const apps = await db.query.applications.findMany({
          where: inArray(applications.id, applicationIds),
          with: { job: true },
        });

        // Filter to applications the recruiter has access to
        type AppWithJob = typeof apps[number];
        const accessibleApps: AppWithJob[] = [];
        for (const app of apps) {
          const hasAccess = await storage.isRecruiterOnJob(app.jobId, userId);
          if (hasAccess) {
            accessibleApps.push(app);
          }
        }

        if (accessibleApps.length === 0) {
          res.status(404).json({ error: 'No accessible applications found' });
          return;
        }

        // Filter to applications that need summaries (unless regenerate is true)
        const appsNeedingSummary = regenerate
          ? accessibleApps
          : accessibleApps.filter((app: AppWithJob) => !app.aiSummary);

        // If all already have summaries and regenerate is false
        if (appsNeedingSummary.length === 0) {
          res.status(200).json({
            cached: true,
            message: 'All selected candidates already have AI summaries.',
            totalCount: 0,
          });
          return;
        }

        // Check rate limit against applications needing summaries
        if (appsNeedingSummary.length > dailyRemaining) {
          res.status(403).json({
            error: `You have only ${dailyRemaining} analyses left today. Select fewer candidates.`,
            errorCode: 'RATE_LIMIT_EXCEEDED',
            remaining: dailyRemaining,
            requested: appsNeedingSummary.length,
          });
          return;
        }

        // Check for existing pending job
        const pendingJobs = await storage.getUserAiFitJobs(userId, ['pending', 'active']);
        const pendingSummaryJob = pendingJobs.find(j => j.queueName === QUEUES.BATCH && j.bullJobId.startsWith('summary-'));
        if (pendingSummaryJob) {
          res.status(429).json({
            error: 'You have a summary job in progress. Please wait for it to complete.',
            errorCode: 'PENDING_LIMIT',
            existingJobId: pendingSummaryJob.id,
          });
          return;
        }

        // Create DB job
        const appIdsToProcess = appsNeedingSummary.map(app => app.id);
        const dbJob = await storage.createAiFitJob({
          bullJobId: `pending-${randomUUID()}`,
          queueName: QUEUES.BATCH,
          userId,
          applicationIds: appIdsToProcess,
          totalCount: appIdsToProcess.length,
          result: {
            results: [],
            summary: {
              total: appIdsToProcess.length,
              succeeded: 0,
              skipped: accessibleApps.length - appsNeedingSummary.length,
              errors: 0,
            },
          },
        });

        // Enqueue the job
        try {
          const bullJobId = await enqueueSummaryBatch({
            applicationIds: appIdsToProcess,
            recruiterId: userId,
            dbJobId: dbJob.id,
            regenerate,
            jobType: 'summary',
          });
          await storage.updateAiFitJobBullId(dbJob.id, bullJobId);
        } catch (enqueueError) {
          // Mark job as failed if enqueue fails
          await storage.updateAiFitJobStatus(dbJob.id, 'failed', {
            completedAt: new Date(),
            error: enqueueError instanceof Error ? enqueueError.message : 'Enqueue failed',
            errorCode: 'ENQUEUE_FAILED',
          });
          throw enqueueError;
        }

        res.status(202).json({
          jobId: dbJob.id,
          statusUrl: `/api/ai/summary/jobs/${dbJob.id}`,
          totalCount: appIdsToProcess.length,
          skippedCount: accessibleApps.length - appsNeedingSummary.length,
        });
      } catch (error) {
        console.error('[AI Summary Queue] Error:', error);
        next(error);
      }
    }
  );

  /**
   * GET /api/ai/summary/jobs/:id
   * Get status of a summary batch job
   */
  app.get(
    "/api/ai/summary/jobs/:id",
    requireAuth,
    requireRole(['recruiter', 'super_admin']),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user!.id;
        const idParam = req.params.id;
        if (!idParam) {
          res.status(400).json({ error: 'Missing job ID' });
          return;
        }
        const jobId = parseInt(idParam, 10);

        if (isNaN(jobId)) {
          res.status(400).json({ error: 'Invalid job ID' });
          return;
        }

        const job = await storage.getAiFitJobForUser(jobId, userId);
        if (!job) {
          res.status(404).json({ error: 'Job not found' });
          return;
        }

        res.json({
          id: job.id,
          status: job.status,
          progress: job.progress,
          processedCount: job.processedCount,
          totalCount: job.totalCount,
          result: job.result,
          error: job.error,
          errorCode: job.errorCode,
          createdAt: job.createdAt,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
        });
      } catch (error) {
        console.error('[AI Summary Job Status] Error:', error);
        next(error);
      }
    }
  );

  /**
   * DELETE /api/ai/summary/jobs/:id
   * Cancel a pending/active summary batch job
   */
  app.delete(
    "/api/ai/summary/jobs/:id",
    requireAuth,
    requireRole(['recruiter', 'super_admin']),
    csrfProtection,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user!.id;
        const idParam = req.params.id;
        if (!idParam) {
          res.status(400).json({ error: 'Missing job ID' });
          return;
        }
        const jobId = parseInt(idParam, 10);

        if (isNaN(jobId)) {
          res.status(400).json({ error: 'Invalid job ID' });
          return;
        }

        const job = await storage.getAiFitJobForUser(jobId, userId);
        if (!job) {
          res.status(404).json({ error: 'Job not found' });
          return;
        }

        if (job.status !== 'pending' && job.status !== 'active') {
          res.status(400).json({ error: 'Job cannot be cancelled', status: job.status });
          return;
        }

        // Remove from BullMQ
        const queueName = job.queueName as typeof QUEUES[keyof typeof QUEUES];
        await removeJob(queueName, job.bullJobId);

        // Update DB status
        const cancelled = await storage.cancelAiFitJob(jobId, userId);
        if (!cancelled) {
          res.status(400).json({ error: 'Failed to cancel job' });
          return;
        }

        res.json({ cancelled: true });
      } catch (error) {
        console.error('[AI Summary Job Cancel] Error:', error);
        next(error);
      }
    }
  );

  // ============= APPLICATION FEEDBACK =============

  // Get feedback for an application
  app.get("/api/applications/:id/feedback", requireRole(['recruiter', 'super_admin', 'hiring_manager']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing ID parameter' });
        return;
      }
      const appId = Number(idParam);
      if (!Number.isFinite(appId) || appId <= 0 || !Number.isInteger(appId)) {
        res.status(400).json({ error: 'Invalid ID parameter' });
        return;
      }

      const feedback = await db
        .select({
          id: applicationFeedback.id,
          applicationId: applicationFeedback.applicationId,
          authorId: applicationFeedback.authorId,
          overallScore: applicationFeedback.overallScore,
          recommendation: applicationFeedback.recommendation,
          notes: applicationFeedback.notes,
          createdAt: applicationFeedback.createdAt,
          updatedAt: applicationFeedback.updatedAt,
        })
        .from(applicationFeedback)
        .where(eq(applicationFeedback.applicationId, appId))
        .orderBy(sql`${applicationFeedback.createdAt} DESC`);

      const feedbackWithAuthors = await Promise.all(
        feedback.map(async (fb: typeof feedback[0]) => {
          const author = await storage.getUser(fb.authorId);
          return {
            ...fb,
            author: author ? {
              id: author.id,
              firstName: author.firstName,
              lastName: author.lastName,
              role: author.role,
            } : null,
          };
        })
      );

      res.json(feedbackWithAuthors);
      return;
    } catch (error) {
      console.error('[Feedback Get] Error:', error);
      next(error);
    }
  });

  // Add feedback to an application
  app.post("/api/applications/:id/feedback", csrfProtection, requireRole(['recruiter', 'super_admin', 'hiring_manager']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing ID parameter' });
        return;
      }
      const appId = Number(idParam);
      if (!Number.isFinite(appId) || appId <= 0 || !Number.isInteger(appId)) {
        res.status(400).json({ error: 'Invalid ID parameter' });
        return;
      }

      const validation = insertApplicationFeedbackSchema.safeParse({
        ...req.body,
        applicationId: appId,
      });

      if (!validation.success) {
        res.status(400).json({
          error: 'Validation error',
          details: validation.error.errors,
        });
        return;
      }

      const [newFeedback] = await db
        .insert(applicationFeedback)
        .values({
          applicationId: appId,
          authorId: req.user!.id,
          overallScore: validation.data.overallScore,
          recommendation: validation.data.recommendation,
          notes: validation.data.notes || null,
        })
        .returning();

      const author = await storage.getUser(req.user!.id);

      res.status(201).json({
        message: 'Feedback added successfully',
        feedback: {
          ...newFeedback,
          author: author ? {
            id: author.id,
            firstName: author.firstName,
            lastName: author.lastName,
            role: author.role,
          } : null,
        },
      });
      return;
    } catch (error) {
      console.error('[Feedback Add] Error:', error);
      next(error);
    }
  });

  // ============= APPLICATION STATUS MANAGEMENT =============

  // Update single application status (recruiters/admins only)
  app.patch("/api/applications/:id/status", csrfProtection, requireRole(['recruiter', 'super_admin']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing ID parameter' });
        return;
      }
      const applicationId = Number(idParam);
      const { status, notes } = req.body;

      if (!Number.isFinite(applicationId) || applicationId <= 0 || !Number.isInteger(applicationId)) {
        res.status(400).json({ error: "Invalid ID parameter" });
        return;
      }

      if (!['submitted', 'reviewed', 'shortlisted', 'rejected', 'downloaded'].includes(status)) {
        res.status(400).json({
          error: "Invalid status. Must be one of: submitted, reviewed, shortlisted, rejected, downloaded"
        });
        return;
      }

      if (req.user!.role !== 'super_admin') {
        const application = await storage.getApplication(applicationId);
        if (!application) {
          res.status(404).json({ error: "Application not found" });
          return;
        }

        // Use isRecruiterOnJob to check access (includes co-recruiters)
        const hasAccess = await storage.isRecruiterOnJob(application.jobId, req.user!.id);
        if (!hasAccess) {
          res.status(403).json({ error: "Access denied" });
          return;
        }
      }

      const application = await storage.updateApplicationStatus(applicationId, status, notes);

      if (!application) {
        res.status(404).json({ error: "Application not found" });
        return;
      }

      res.json(application);
      return;
    } catch (error) {
      next(error);
    }
  });

  // Bulk update application statuses (recruiters/admins only)
  app.patch("/api/applications/bulk", csrfProtection, requireRole(['recruiter', 'super_admin']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { applicationIds, status, notes } = req.body;

      if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
        res.status(400).json({ error: "applicationIds must be a non-empty array" });
        return;
      }

      if (!['submitted', 'reviewed', 'shortlisted', 'rejected', 'downloaded'].includes(status)) {
        res.status(400).json({
          error: "Invalid status. Must be one of: submitted, reviewed, shortlisted, rejected, downloaded"
        });
        return;
      }

      if (req.user!.role !== 'super_admin') {
        const applicationsList = await Promise.all(
          applicationIds.map(id => storage.getApplication(parseInt(id)))
        );

        const jobIds = Array.from(new Set(
          applicationsList
            .filter(app => app)
            .map(app => app!.jobId)
        ));

        // Check access to each unique job (includes co-recruiters)
        const accessChecks = await Promise.all(
          jobIds.map(jobId => storage.isRecruiterOnJob(jobId, req.user!.id))
        );

        if (accessChecks.includes(false)) {
          res.status(403).json({ error: "Access denied to one or more applications" });
          return;
        }
      }

      const updatedCount = await storage.updateApplicationsStatus(
        applicationIds.map(id => parseInt(id)),
        status,
        notes
      );

      res.json({
        success: true,
        updatedCount,
        message: `${updatedCount} applications updated successfully`
      });
      return;
    } catch (error) {
      next(error);
    }
  });

  // Mark application as viewed (automatically updates status to 'reviewed')
  app.patch("/api/applications/:id/view", csrfProtection, requireRole(['recruiter', 'super_admin']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing ID parameter' });
        return;
      }
      const applicationId = Number(idParam);

      if (!Number.isFinite(applicationId) || applicationId <= 0 || !Number.isInteger(applicationId)) {
        res.status(400).json({ error: "Invalid application ID" });
        return;
      }

      if (req.user!.role !== 'super_admin') {
        const application = await storage.getApplication(applicationId);
        if (!application) {
          res.status(404).json({ error: "Application not found" });
          return;
        }

        // Use isRecruiterOnJob to check access (includes co-recruiters)
        const hasAccess = await storage.isRecruiterOnJob(application.jobId, req.user!.id);
        if (!hasAccess) {
          res.status(403).json({ error: "Access denied" });
          return;
        }
      }

      const application = await storage.markApplicationViewed(applicationId);

      if (!application) {
        res.status(404).json({ error: "Application not found" });
        return;
      }

      res.json(application);
      return;
    } catch (error) {
      next(error);
    }
  });

  // Mark application as downloaded (when resume is downloaded)
  app.patch("/api/applications/:id/download", csrfProtection, requireRole(['recruiter', 'super_admin']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing ID parameter' });
        return;
      }
      const applicationId = Number(idParam);

      if (!Number.isFinite(applicationId) || applicationId <= 0 || !Number.isInteger(applicationId)) {
        res.status(400).json({ error: "Invalid application ID" });
        return;
      }

      if (req.user!.role !== 'super_admin') {
        const application = await storage.getApplication(applicationId);
        if (!application) {
          res.status(404).json({ error: "Application not found" });
          return;
        }

        // Use isRecruiterOnJob to check access (includes co-recruiters)
        const hasAccess = await storage.isRecruiterOnJob(application.jobId, req.user!.id);
        if (!hasAccess) {
          res.status(403).json({ error: "Access denied" });
          return;
        }
      }

      const application = await storage.markApplicationDownloaded(applicationId);

      if (!application) {
        res.status(404).json({ error: "Application not found" });
        return;
      }

      res.json(application);
      return;
    } catch (error) {
      next(error);
    }
  });

  // ============= CANDIDATE DASHBOARD ROUTES =============
  // Note: Profile routes (GET/POST/PATCH /api/profile) are in profile.routes.ts

  // Get user's applications (bound to userId, with email fallback for unclaimed applications)
  app.get("/api/my-applications", requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Pass user's email to also find unclaimed applications that match by email
      const applicationsList = await storage.getApplicationsByUserId(req.user!.id, req.user!.username);

      // Claim-on-read: if any applications were found by email but not yet claimed, claim them now
      // This ensures subsequent actions (withdraw, etc.) work properly
      const unclaimedIds = applicationsList
        .filter(app => app.userId === null || app.userId === undefined)
        .map(app => app.id);

      if (unclaimedIds.length > 0) {
        await db
          .update(applications)
          .set({ userId: req.user!.id })
          .where(
            and(
              inArray(applications.id, unclaimedIds),
              sql`${applications.userId} IS NULL`
            )
          );
      }

      res.json(applicationsList);
      return;
    } catch (error) {
      next(error);
    }
  });

  // Get applications received for recruiter's jobs
  app.get("/api/my-applications-received", requireRole(['recruiter', 'super_admin']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const applicationsList = await storage.getRecruiterApplications(req.user!.id);
      res.json(applicationsList);
      return;
    } catch (error) {
      next(error);
    }
  });

  // Get global candidates view (aggregated by email)
  app.get("/api/candidates", requireRole(['recruiter', 'super_admin']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { q: search, minRating, tags } = req.query;

      const filters: {
        search?: string;
        minRating?: number;
        hasTags?: string[];
      } = {};

      if (search && typeof search === 'string') {
        filters.search = search;
      }

      if (minRating && typeof minRating === 'string') {
        const rating = parseInt(minRating, 10);
        if (!isNaN(rating) && rating >= 1 && rating <= 5) {
          filters.minRating = rating;
        }
      }

      if (tags && typeof tags === 'string') {
        filters.hasTags = tags.split(',').map(tag => tag.trim()).filter(Boolean);
      }

      const candidates = await storage.getCandidatesForRecruiter(req.user!.id, filters);
      res.json(candidates);
      return;
    } catch (error) {
      next(error);
    }
  });

  // Withdraw application
  app.delete("/api/applications/:id/withdraw", csrfProtection, requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing ID parameter' });
        return;
      }
      const applicationId = Number(idParam);

      if (!Number.isFinite(applicationId) || applicationId <= 0 || !Number.isInteger(applicationId)) {
        res.status(400).json({ error: "Invalid application ID" });
        return;
      }

      const success = await storage.withdrawApplication(applicationId, req.user!.id);

      if (!success) {
        res.status(404).json({ error: "Application not found or access denied" });
        return;
      }

      res.json({ success: true, message: "Application withdrawn successfully" });
      return;
    } catch (error) {
      next(error);
    }
  });

  console.log('✅ Applications routes registered');
}
