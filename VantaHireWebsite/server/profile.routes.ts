/**
 * Profile Routes Module
 *
 * User profile management and public recruiter profiles:
 * - GET /api/profile - Get current user's profile
 * - PATCH /api/profile - Update current user's profile
 * - GET /api/recruiters/:id - Get public recruiter profile
 * - GET /api/recruiters/:id/jobs - Get recruiter's active jobs
 */

import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { storage } from './storage';
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, requireRole } from './auth';
import type { CsrfMiddleware } from './types/routes';
import { syncProfileCompletionStatus } from './lib/profileCompletion';
import { generatePublicId, isValidPublicId, isNumericId } from './lib/publicId';
import { getEmailService } from './simpleEmailService';
import crypto from 'crypto';

// Validation schema for profile updates
const updateProfileSchema = z.object({
  displayName: z.string().max(100).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  skills: z.array(z.string()).max(20).optional().nullable(),
  linkedin: z.string().url().max(500).optional().nullable().or(z.literal('')),
  location: z.string().max(200).optional().nullable(),
  isPublic: z.boolean().optional(),
});

// Validation schema for email change request
const emailChangeRequestSchema = z.object({
  newEmail: z.string().email().max(255),
  password: z.string().min(1), // Current password for verification
});

// Validation schema for email change verification
const emailChangeVerifySchema = z.object({
  token: z.string().min(1),
});

// In-memory store for email change tokens (in production, use Redis or database)
const emailChangeTokens = new Map<string, { userId: number; newEmail: string; expiresAt: Date }>();

// Clean up expired tokens periodically
setInterval(() => {
  const now = new Date();
  for (const [token, data] of emailChangeTokens.entries()) {
    if (data.expiresAt < now) {
      emailChangeTokens.delete(token);
    }
  }
}, 60000); // Every minute

/**
 * Register all profile-related routes
 */
export function registerProfileRoutes(
  app: Express,
  csrfProtection: CsrfMiddleware
): void {
  // ============= CURRENT USER PROFILE =============

  /**
   * GET /api/profile
   * Get the current authenticated user's profile
   */
  app.get("/api/profile", requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const user = req.user!;

      // Get user profile (may not exist yet)
      let profile = await storage.getUserProfile(userId);

      // If no profile exists, create a default one
      if (!profile) {
        profile = await storage.createUserProfile({
          userId,
          displayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
        });
      }

      res.json({
        user: {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          emailVerified: user.emailVerified,
        },
        profile: {
          displayName: profile.displayName,
          company: profile.company,
          phone: profile.phone,
          photoUrl: profile.photoUrl,
          bio: profile.bio,
          skills: profile.skills,
          linkedin: profile.linkedin,
          location: profile.location,
          isPublic: profile.isPublic,
          publicId: profile.publicId,
        },
      });
      return;
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/profile
   * Update the current user's profile
   */
  app.patch("/api/profile", csrfProtection, requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;

      // Validate input
      const parseResult = updateProfileSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: 'Validation error',
          details: parseResult.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const updates = parseResult.data;

      // Convert empty string linkedin to undefined
      if (updates.linkedin === '') {
        updates.linkedin = undefined;
      }

      // Convert null values to undefined for type compatibility
      const sanitizedUpdates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updates)) {
        sanitizedUpdates[key] = value === null ? undefined : value;
      }

      // Ensure profile exists
      let profile = await storage.getUserProfile(userId);
      if (!profile) {
        profile = await storage.createUserProfile({ userId });
      }

      // Generate publicId when making profile public for the first time
      if (updates.isPublic === true && !profile.publicId) {
        sanitizedUpdates.publicId = generatePublicId();
      }

      // Update profile
      const updatedProfile = await storage.updateUserProfile(userId, sanitizedUpdates);
      if (!updatedProfile) {
        res.status(500).json({ error: 'Failed to update profile' });
        return;
      }

      await syncProfileCompletionStatus(req.user!, { profile: updatedProfile });

      res.json({
        message: 'Profile updated successfully',
        profile: {
          displayName: updatedProfile.displayName,
          company: updatedProfile.company,
          phone: updatedProfile.phone,
          photoUrl: updatedProfile.photoUrl,
          bio: updatedProfile.bio,
          skills: updatedProfile.skills,
          linkedin: updatedProfile.linkedin,
          location: updatedProfile.location,
          isPublic: updatedProfile.isPublic,
          publicId: updatedProfile.publicId,
        },
      });
      return;
    } catch (error) {
      next(error);
    }
  });

  // ============= PUBLIC RECRUITER PROFILES =============

  /**
   * GET /api/recruiters/:id
   * Get a public recruiter profile
   * Supports both numeric IDs (legacy) and publicId (preferred)
   * Returns 404 if profile is not public
   */
  app.get("/api/recruiters/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing ID parameter' });
        return;
      }

      let recruiter: { id: number; firstName: string | null; lastName: string | null; role: string } | undefined;
      let profile: Awaited<ReturnType<typeof storage.getUserProfile>> | undefined;

      // Try publicId lookup first, then fall back to numeric ID for backwards compatibility
      if (isValidPublicId(idParam)) {
        const result = await storage.getUserProfileByPublicId(idParam);
        if (result) {
          profile = result;
          recruiter = result.user;
        }
      } else if (isNumericId(idParam)) {
        const recruiterId = Number(idParam);
        if (!Number.isFinite(recruiterId) || recruiterId <= 0) {
          res.status(400).json({ error: 'Invalid ID parameter' });
          return;
        }
        const user = await storage.getUser(recruiterId);
        if (user) {
          recruiter = user;
          profile = await storage.getUserProfile(recruiterId);
        }
      } else {
        res.status(400).json({ error: 'Invalid ID parameter' });
        return;
      }

      if (!recruiter || (recruiter.role !== 'recruiter' && recruiter.role !== 'super_admin')) {
        res.status(404).json({ error: 'Recruiter not found', code: 'NOT_FOUND' });
        return;
      }

      if (!profile || !profile.isPublic) {
        res.status(403).json({
          error: 'This recruiter has not made their profile public',
          code: 'PROFILE_PRIVATE'
        });
        return;
      }

      // Return public profile info only (use publicId in response, not numeric ID)
      res.json({
        id: profile.publicId || recruiter.id, // Prefer publicId, fall back to numeric for legacy
        publicId: profile.publicId,
        displayName: profile.displayName || [recruiter.firstName, recruiter.lastName].filter(Boolean).join(' ') || 'Recruiter',
        company: profile.company,
        photoUrl: profile.photoUrl,
        bio: profile.bio,
        skills: profile.skills,
        linkedin: profile.linkedin,
        location: profile.location,
      });
      return;
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/recruiters/:id/jobs
   * Get a recruiter's active jobs (only if profile is public)
   * Supports both numeric IDs (legacy) and publicId (preferred)
   */
  app.get("/api/recruiters/:id/jobs", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'Missing ID parameter' });
        return;
      }

      let recruiterId: number | undefined;
      let profile: Awaited<ReturnType<typeof storage.getUserProfile>> | undefined;

      // Try publicId lookup first, then fall back to numeric ID
      if (isValidPublicId(idParam)) {
        const result = await storage.getUserProfileByPublicId(idParam);
        if (result && result.isPublic) {
          recruiterId = result.userId;
          profile = result;
        }
      } else if (isNumericId(idParam)) {
        recruiterId = Number(idParam);
        if (!Number.isFinite(recruiterId) || recruiterId <= 0) {
          res.status(400).json({ error: 'Invalid ID parameter' });
          return;
        }
        profile = await storage.getUserProfile(recruiterId);
      } else {
        res.status(400).json({ error: 'Invalid ID parameter' });
        return;
      }

      if (!recruiterId || !profile || !profile.isPublic) {
        res.status(404).json({ error: 'Profile not found or is private' });
        return;
      }

      // Get recruiter's active, approved jobs
      const jobs = await storage.getPublicJobsByRecruiter(recruiterId);

      res.json({
        jobs: jobs.map(job => ({
          id: job.id,
          slug: job.slug,
          title: job.title,
          location: job.location,
          type: job.type,
          createdAt: job.createdAt,
        })),
      });
      return;
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/recruiters
   * List all public recruiter profiles
   */
  app.get("/api/recruiters", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const publicRecruiters = await storage.getPublicRecruiters();
      res.json({ recruiters: publicRecruiters });
      return;
    } catch (error) {
      next(error);
    }
  });

  // ============= EMAIL CHANGE =============

  /**
   * POST /api/profile/email/change
   * Request an email change - sends verification to new email
   */
  app.post("/api/profile/email/change", csrfProtection, requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;

      // Validate input
      const parseResult = emailChangeRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: 'Validation error',
          details: parseResult.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { newEmail, password } = parseResult.data;
      const normalizedEmail = newEmail.toLowerCase().trim();

      // Verify current password
      const user = await storage.getUser(userId);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const { comparePasswords } = await import('./auth');
      const isValidPassword = await comparePasswords(password, user.password);
      if (!isValidPassword) {
        res.status(401).json({ error: 'Invalid password' });
        return;
      }

      // Check if new email is already taken
      const existingUser = await storage.getUserByUsername(normalizedEmail);
      if (existingUser && existingUser.id !== userId) {
        res.status(409).json({ error: 'Email already in use' });
        return;
      }

      // Check if new email is same as current
      if (user.username === normalizedEmail) {
        res.status(400).json({ error: 'New email must be different from current email' });
        return;
      }

      // Generate verification token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Store token (invalidate any existing tokens for this user)
      for (const [existingToken, data] of emailChangeTokens.entries()) {
        if (data.userId === userId) {
          emailChangeTokens.delete(existingToken);
        }
      }
      emailChangeTokens.set(token, { userId, newEmail: normalizedEmail, expiresAt });

      // Send verification email
      const emailService = await getEmailService();
      if (!emailService) {
        res.status(500).json({ error: 'Email service not configured' });
        return;
      }

      const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
      const verifyUrl = `${baseUrl}/verify-email-change?token=${token}`;

      await emailService.sendEmail({
        to: normalizedEmail,
        subject: 'Verify your new email address - VantaHire',
        html: `
          <h2>Email Change Request</h2>
          <p>Hello ${user.firstName || user.username},</p>
          <p>You requested to change your email address to <strong>${normalizedEmail}</strong>.</p>
          <p>Click the link below to verify this email address:</p>
          <p><a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px;">Verify Email</a></p>
          <p>Or copy and paste this link: <br/>${verifyUrl}</p>
          <p>This link expires in 24 hours.</p>
          <p>If you didn't request this change, you can ignore this email.</p>
        `
      });

      res.json({
        message: 'Verification email sent to the new address',
        newEmail: normalizedEmail,
      });
      return;
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/profile/email/verify
   * Verify and complete the email change
   */
  app.post("/api/profile/email/verify", csrfProtection, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate input
      const parseResult = emailChangeVerifySchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: 'Validation error',
          details: parseResult.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { token } = parseResult.data;

      // Look up token
      const tokenData = emailChangeTokens.get(token);
      if (!tokenData) {
        res.status(400).json({ error: 'Invalid or expired token' });
        return;
      }

      // Check expiration
      if (tokenData.expiresAt < new Date()) {
        emailChangeTokens.delete(token);
        res.status(400).json({ error: 'Token has expired' });
        return;
      }

      // Final check that new email isn't taken (could have been registered while waiting)
      const existingUser = await storage.getUserByUsername(tokenData.newEmail);
      if (existingUser && existingUser.id !== tokenData.userId) {
        emailChangeTokens.delete(token);
        res.status(409).json({ error: 'Email is already in use' });
        return;
      }

      // Update user's email
      await db
        .update(users)
        .set({
          username: tokenData.newEmail,
          emailVerified: true, // Mark as verified since they clicked the link
        })
        .where(eq(users.id, tokenData.userId));

      // Remove used token
      emailChangeTokens.delete(token);

      // Send confirmation to old email
      const user = await storage.getUser(tokenData.userId);
      const emailService = await getEmailService();
      if (user && emailService) {
        // We don't have the old email anymore, but we can still notify the user
        console.log(`Email changed for user ${tokenData.userId} to ${tokenData.newEmail}`);
      }

      res.json({
        message: 'Email address changed successfully',
        newEmail: tokenData.newEmail,
      });
      return;
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/profile/email/pending
   * Check if there's a pending email change for the current user
   */
  app.get("/api/profile/email/pending", requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;

      // Find pending token for this user
      for (const [token, data] of emailChangeTokens.entries()) {
        if (data.userId === userId && data.expiresAt > new Date()) {
          res.json({
            hasPending: true,
            newEmail: data.newEmail,
            expiresAt: data.expiresAt,
          });
          return;
        }
      }

      res.json({ hasPending: false });
      return;
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/profile/email/pending
   * Cancel a pending email change request
   */
  app.delete("/api/profile/email/pending", csrfProtection, requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;

      // Remove any pending tokens for this user
      for (const [token, data] of emailChangeTokens.entries()) {
        if (data.userId === userId) {
          emailChangeTokens.delete(token);
        }
      }

      res.json({ message: 'Pending email change cancelled' });
      return;
    } catch (error) {
      next(error);
    }
  });

  console.log('✅ Profile routes registered');
}
