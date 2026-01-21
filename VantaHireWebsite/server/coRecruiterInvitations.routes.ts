/**
 * Co-Recruiter Invitations Routes
 *
 * Endpoints for inviting co-recruiters to collaborate on jobs:
 * - POST /api/jobs/:jobId/co-recruiters/invite - Invite co-recruiter by email
 * - GET /api/jobs/:jobId/co-recruiters - List recruiters and pending invitations for a job
 * - DELETE /api/jobs/:jobId/co-recruiters/:recruiterId - Remove co-recruiter from job
 * - DELETE /api/co-recruiter-invitations/:id - Cancel pending invitation
 * - GET /api/co-recruiter-invitations/validate/:token - Validate token (public)
 * - POST /api/co-recruiter-invitations/:token/accept - Accept invitation (authenticated recruiters)
 */

import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { randomBytes, createHash } from 'crypto';
import { storage } from './storage';
import { requireAuth, requireRole, requireSeat } from './auth';
import { getUserOrganization } from './lib/organizationService';
import {
  sendCoRecruiterInvitationEmail,
  sendCoRecruiterAddedEmail,
} from './emailTemplateService';
import { getEmailService } from './simpleEmailService';
import type { CsrfMiddleware } from './types/routes';
import rateLimit from 'express-rate-limit';

// Rate limiting for invitation creation (20 per hour per user)
const invitationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { error: 'Too many invitations sent. Please try again later.' },
  keyGenerator: (req: Request) => `co-recruit-invite-${req.user?.id || req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
});

// Constants
const INVITATION_EXPIRY_DAYS = 7;
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

// Hash token for storage (SHA256)
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Generate secure random token
function generateToken(): string {
  return randomBytes(32).toString('hex');
}

// Validation schema for invitation
const inviteCoRecruiterSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  name: z.string().optional(),
});

/**
 * Register co-recruiter invitation routes
 */
export function registerCoRecruiterInvitationRoutes(
  app: Express,
  csrfProtection: CsrfMiddleware
): void {
  // ============= INVITE CO-RECRUITER =============
  app.post(
    "/api/jobs/:jobId/co-recruiters/invite",
    csrfProtection,
    invitationRateLimit,
    requireRole(['recruiter', 'super_admin']),
    requireSeat(),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const jobIdParam = req.params.jobId;
        if (!jobIdParam) {
          res.status(400).json({ error: 'Job ID required' });
          return;
        }
        const jobId = parseInt(jobIdParam, 10);
        if (isNaN(jobId) || jobId <= 0) {
          res.status(400).json({ error: 'Invalid job ID' });
          return;
        }

        // Get user's organization for access control
        const orgResult = await getUserOrganization(req.user!.id);
        const userOrgId = orgResult?.organization.id;

        // Verify job exists and user has access
        const job = await storage.getJob(jobId);
        if (!job) {
          res.status(404).json({ error: 'Job not found' });
          return;
        }

        const hasAccess = await storage.isRecruiterOnJob(jobId, req.user!.id, userOrgId);
        if (!hasAccess) {
          res.status(403).json({ error: 'Access denied' });
          return;
        }

        // Validate request body
        const body = inviteCoRecruiterSchema.parse(req.body);
        const email = body.email.toLowerCase();

        // Check if user with this email already exists
        const existingUser = await storage.getUserByUsername(email);

        if (existingUser) {
          // User exists - check their role
          if (existingUser.role === 'recruiter' || existingUser.role === 'super_admin') {
            // Already a recruiter - check if already on this job
            const alreadyOnJob = await storage.isRecruiterOnJob(jobId, existingUser.id);
            if (alreadyOnJob) {
              res.status(409).json({ error: 'This recruiter is already collaborating on this job' });
              return;
            }

            // Add them directly to the job
            await storage.addJobRecruiter(jobId, existingUser.id, req.user!.id, job.organizationId ?? undefined);

            // Send notification email using template
            const inviter = await storage.getUser(req.user!.id);
            const inviterName = inviter
              ? `${inviter.firstName || ''} ${inviter.lastName || ''}`.trim() || inviter.username
              : 'A recruiter';

            sendCoRecruiterAddedEmail(email, {
              inviterName,
              recruiterFirstName: existingUser.firstName,
              jobTitle: job.title,
              dashboardUrl: `${BASE_URL}/recruiter-dashboard`,
              organizationId: job.organizationId ?? undefined,
            }).catch(err => console.error('Failed to send co-recruiter added email:', err));

            console.log(`Co-recruiter ${existingUser.id} added directly to job ${jobId} by user ${req.user!.id}`);

            res.status(200).json({
              success: true,
              message: 'Recruiter added successfully.',
              addedDirectly: true,
              recruiter: {
                id: existingUser.id,
                email: existingUser.username,
                firstName: existingUser.firstName,
                lastName: existingUser.lastName,
              },
            });
            return;
          } else {
            // User exists but is not a recruiter (candidate, hiring_manager, etc.)
            // Send email explaining they need a recruiter account
            const emailService = await getEmailService();
            if (emailService) {
              await emailService.sendEmail({
                to: email,
                subject: 'VantaHire - Co-Recruiter Invitation',
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #7B38FB;">Co-Recruiter Invitation</h2>
                    <p>Hi,</p>
                    <p>Someone tried to invite you to collaborate as a co-recruiter on VantaHire.</p>
                    <p>However, your current account is registered as a <strong>${existingUser.role}</strong>, not as a recruiter.</p>
                    <p>To collaborate on job postings, you'll need to register a separate recruiter account using a different email address, or contact support to upgrade your account.</p>
                    <p style="color: #666; font-size: 14px; margin-top: 24px;">
                      If you didn't expect this email, you can safely ignore it.
                    </p>
                  </div>
                `,
                text: `Someone tried to invite you to VantaHire as a co-recruiter, but your account is registered as a ${existingUser.role}. To collaborate, you'll need a recruiter account.`,
              });
            }

            // Return success to prevent email enumeration
            res.json({
              success: true,
              message: 'If this email is eligible, an invitation will be sent.',
            });
            return;
          }
        }

        // User doesn't exist - create invitation for new registration
        // Check for existing pending invitation for this job+email
        const existingInvitation = await storage.getCoRecruiterInvitationByEmail(email, jobId);
        if (existingInvitation && existingInvitation.status === 'pending') {
          // Invalidate old invitation and create new one (resend flow)
          await storage.updateCoRecruiterInvitationStatus(existingInvitation.id, 'expired');
        }

        // Generate token
        const token = generateToken();
        const tokenHash = hashToken(token);

        // Get inviter details
        const inviter = await storage.getUser(req.user!.id);
        const inviterName = inviter
          ? `${inviter.firstName || ''} ${inviter.lastName || ''}`.trim() || inviter.username
          : 'A recruiter';

        // Calculate expiry
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

        // Create invitation
        const invitation = await storage.createCoRecruiterInvitation({
          jobId,
          email,
          tokenHash,
          invitedBy: req.user!.id,
          inviterName,
          jobTitle: job.title,
          expiresAt,
          ...(job.organizationId != null && { organizationId: job.organizationId }),
        });

        // Send invitation email using template
        const acceptUrl = `${BASE_URL}/register-co-recruiter/${token}`;
        const emailOpts: Parameters<typeof sendCoRecruiterInvitationEmail>[1] = {
          inviterName,
          jobTitle: job.title,
          acceptUrl,
          expiryDays: INVITATION_EXPIRY_DAYS,
          organizationId: job.organizationId ?? undefined,
        };
        if (body.name) {
          emailOpts.inviteeName = body.name;
        }
        sendCoRecruiterInvitationEmail(email, emailOpts)
          .catch(err => console.error('Failed to send co-recruiter invitation email:', err));

        console.log(`Co-recruiter invitation sent to ${email} for job ${jobId} by user ${req.user!.id}`);

        res.status(201).json({
          success: true,
          message: 'Invitation sent successfully.',
          invitation: {
            id: invitation.id,
            email: invitation.email,
            jobId: invitation.jobId,
            status: invitation.status,
            expiresAt: invitation.expiresAt,
            createdAt: invitation.createdAt,
          },
        });
        return;
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: 'Validation error',
            details: error.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          });
          return;
        }
        next(error);
      }
    }
  );

  // ============= LIST CO-RECRUITERS AND INVITATIONS =============
  app.get(
    "/api/jobs/:jobId/co-recruiters",
    requireRole(['recruiter', 'super_admin']),
    requireSeat(),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const jobIdParam = req.params.jobId;
        if (!jobIdParam) {
          res.status(400).json({ error: 'Job ID required' });
          return;
        }
        const jobId = parseInt(jobIdParam, 10);
        if (isNaN(jobId) || jobId <= 0) {
          res.status(400).json({ error: 'Invalid job ID' });
          return;
        }

        // Get user's organization for access control
        const orgResult = await getUserOrganization(req.user!.id);
        const userOrgId = orgResult?.organization.id;

        // Verify job exists and user has access
        const job = await storage.getJob(jobId);
        if (!job) {
          res.status(404).json({ error: 'Job not found' });
          return;
        }

        const hasAccess = await storage.isRecruiterOnJob(jobId, req.user!.id, userOrgId);
        if (!hasAccess) {
          res.status(403).json({ error: 'Access denied' });
          return;
        }

        // Get all recruiters on this job
        const recruiters = await storage.getJobRecruiters(jobId);

        // Get pending invitations
        const invitations = await storage.getPendingCoRecruiterInvitations(jobId);

        res.json({
          primaryRecruiterId: job.postedBy,
          recruiters: recruiters.map(r => ({
            id: r.id,
            email: r.username,
            firstName: r.firstName,
            lastName: r.lastName,
            isPrimary: r.id === job.postedBy,
          })),
          pendingInvitations: invitations.map(inv => ({
            id: inv.id,
            email: inv.email,
            status: inv.status,
            expiresAt: inv.expiresAt,
            createdAt: inv.createdAt,
          })),
        });
        return;
      } catch (error) {
        next(error);
      }
    }
  );

  // ============= REMOVE CO-RECRUITER =============
  app.delete(
    "/api/jobs/:jobId/co-recruiters/:recruiterId",
    csrfProtection,
    requireRole(['recruiter', 'super_admin']),
    requireSeat(),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const jobIdParam = req.params.jobId;
        const recruiterIdParam = req.params.recruiterId;

        if (!jobIdParam || !recruiterIdParam) {
          res.status(400).json({ error: 'Job ID and Recruiter ID required' });
          return;
        }

        const jobId = parseInt(jobIdParam, 10);
        const recruiterId = parseInt(recruiterIdParam, 10);

        if (isNaN(jobId) || jobId <= 0 || isNaN(recruiterId) || recruiterId <= 0) {
          res.status(400).json({ error: 'Invalid ID parameters' });
          return;
        }

        // Get user's organization for access control
        const orgResult = await getUserOrganization(req.user!.id);
        const userOrgId = orgResult?.organization.id;

        // Verify job exists and user has access
        const job = await storage.getJob(jobId);
        if (!job) {
          res.status(404).json({ error: 'Job not found' });
          return;
        }

        const hasAccess = await storage.isRecruiterOnJob(jobId, req.user!.id, userOrgId);
        if (!hasAccess) {
          res.status(403).json({ error: 'Access denied' });
          return;
        }

        // Cannot remove primary recruiter
        if (recruiterId === job.postedBy) {
          res.status(400).json({ error: 'Cannot remove the primary recruiter from a job' });
          return;
        }

        const removed = await storage.removeJobRecruiter(jobId, recruiterId);
        if (!removed) {
          res.status(404).json({ error: 'Recruiter not found on this job' });
          return;
        }

        console.log(`Co-recruiter ${recruiterId} removed from job ${jobId} by user ${req.user!.id}`);

        res.json({ success: true, message: 'Co-recruiter removed successfully' });
        return;
      } catch (error) {
        next(error);
      }
    }
  );

  // ============= CANCEL INVITATION =============
  app.delete(
    "/api/co-recruiter-invitations/:id",
    csrfProtection,
    requireRole(['recruiter', 'super_admin']),
    requireSeat(),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const idParam = req.params.id;
        if (!idParam) {
          res.status(400).json({ error: 'Invitation ID required' });
          return;
        }
        const id = parseInt(idParam, 10);
        if (isNaN(id)) {
          res.status(400).json({ error: 'Invalid invitation ID' });
          return;
        }

        // Get user's organization for access control
        const orgResult = await getUserOrganization(req.user!.id);
        const userOrgId = orgResult?.organization.id;

        // Get invitation to check access
        const invitation = await storage.getCoRecruiterInvitation(id);
        if (!invitation) {
          res.status(404).json({ error: 'Invitation not found' });
          return;
        }

        // Verify user has access to the job
        const hasAccess = await storage.isRecruiterOnJob(invitation.jobId, req.user!.id, userOrgId);
        if (!hasAccess) {
          res.status(403).json({ error: 'Access denied' });
          return;
        }

        await storage.updateCoRecruiterInvitationStatus(id, 'expired');

        res.json({ success: true, message: 'Invitation cancelled' });
        return;
      } catch (error) {
        next(error);
      }
    }
  );

  // ============= VALIDATE TOKEN (PUBLIC) =============
  app.get(
    "/api/co-recruiter-invitations/validate/:token",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { token } = req.params;
        if (!token || token.length !== 64) {
          res.status(400).json({ valid: false, error: 'Invalid token format' });
          return;
        }

        const tokenHash = hashToken(token);
        const invitation = await storage.getCoRecruiterInvitationByToken(tokenHash);

        if (!invitation) {
          res.status(404).json({ valid: false, error: 'Invitation not found' });
          return;
        }

        // Check if expired
        if (new Date() > new Date(invitation.expiresAt)) {
          await storage.updateCoRecruiterInvitationStatus(invitation.id, 'expired');
          res.status(410).json({ valid: false, error: 'Invitation has expired' });
          return;
        }

        // Check if already accepted
        if (invitation.status === 'accepted') {
          res.status(410).json({ valid: false, error: 'Invitation has already been used' });
          return;
        }

        // Check if explicitly expired/cancelled
        if (invitation.status === 'expired') {
          res.status(410).json({ valid: false, error: 'Invitation is no longer valid' });
          return;
        }

        res.json({
          valid: true,
          email: invitation.email,
          jobId: invitation.jobId,
          jobTitle: invitation.jobTitle,
          inviterName: invitation.inviterName,
        });
        return;
      } catch (error) {
        next(error);
      }
    }
  );

  // ============= ACCEPT INVITATION (AUTHENTICATED RECRUITERS) =============
  app.post(
    "/api/co-recruiter-invitations/:token/accept",
    csrfProtection,
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { token } = req.params;
        if (!token || token.length !== 64) {
          res.status(400).json({ error: 'Invalid token format' });
          return;
        }

        // User must be a recruiter
        if (req.user!.role !== 'recruiter' && req.user!.role !== 'super_admin') {
          res.status(403).json({ error: 'Only recruiters can accept co-recruiter invitations' });
          return;
        }

        const tokenHash = hashToken(token);
        const invitation = await storage.getCoRecruiterInvitationByToken(tokenHash);

        if (!invitation) {
          res.status(404).json({ error: 'Invitation not found' });
          return;
        }

        // Check if expired
        if (new Date() > new Date(invitation.expiresAt)) {
          await storage.updateCoRecruiterInvitationStatus(invitation.id, 'expired');
          res.status(410).json({ error: 'Invitation has expired' });
          return;
        }

        // Check if already accepted
        if (invitation.status !== 'pending') {
          res.status(410).json({ error: 'Invitation is no longer valid' });
          return;
        }

        // Verify email matches
        if (req.user!.username.toLowerCase() !== invitation.email.toLowerCase()) {
          res.status(403).json({ error: 'This invitation was sent to a different email address' });
          return;
        }

        // Add user to job
        await storage.addJobRecruiter(invitation.jobId, req.user!.id, invitation.invitedBy, invitation.organizationId ?? undefined);

        // Mark invitation as accepted
        await storage.updateCoRecruiterInvitationStatus(invitation.id, 'accepted');

        console.log(`Co-recruiter invitation accepted by user ${req.user!.id} for job ${invitation.jobId}`);

        res.json({
          success: true,
          message: 'You are now a co-recruiter on this job',
          jobId: invitation.jobId,
          jobTitle: invitation.jobTitle,
        });
        return;
      } catch (error) {
        next(error);
      }
    }
  );
}
