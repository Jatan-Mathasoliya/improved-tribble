import { z } from "zod";
import type { Express } from "express";
import { requireAuth } from "./auth";
import { db } from "./db";
import {
  organizations,
  organizationSubscriptions,
  subscriptionPlans,
  organizationMembers,
  domainClaimRequests,
  subscriptionAuditLog,
} from "@shared/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";
import {
  getPendingDomainClaimRequests,
  respondToDomainClaim,
  getOrganization,
} from "./lib/organizationService";
import {
  getOrganizationSubscription,
  getPlanById,
  adminOverrideSubscription,
  createPaidSubscription,
  getSubscriptionAuditLog,
} from "./lib/subscriptionService";
import { calculateMRR } from "./lib/invoiceService";
import {
  FEATURES,
  FEATURE_METADATA,
  getFeatureDefaultsByPlan,
  getOrganizationFeatures,
  getSubscriptionLimits,
  isValidFeatureKey,
} from "./lib/featureGating";
import { requireSuperAdmin } from "./lib/adminAuth";
import { getEmailService } from "./simpleEmailService";
import { users } from "@shared/schema";

// Input schemas
const grantSubscriptionSchema = z.object({
  planId: z.number().int().positive(),
  seats: z.number().int().min(1).max(1000),
  billingCycle: z.enum(['monthly', 'annual']),
  reason: z.string().min(1).max(500),
});

const extendSubscriptionSchema = z.object({
  days: z.number().int().min(1).max(365),
  reason: z.string().min(1).max(500),
});

const respondDomainClaimSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  rejectionReason: z.string().max(500).optional(),
});

const overrideSubscriptionSchema = z.object({
  planId: z.number().int().positive().optional(),
  seats: z.number().int().min(1).max(1000).optional(),
  status: z.enum(['active', 'past_due', 'cancelled', 'trialing']).optional(),
  extendDays: z.number().int().min(1).max(365).optional(),
  featureOverrides: z.record(z.any()).optional(),
  reason: z.string().min(1).max(500),
});

// Feature overrides schema with key validation
const featureOverridesSchema = z.record(z.boolean().nullable()).refine(
  (obj) => Object.keys(obj).every(isValidFeatureKey),
  { message: "Invalid feature key" }
);

const updateFeaturesSchema = z.object({
  overrides: featureOverridesSchema,
  reason: z.string().min(1).max(500),
});

export function registerAdminSubscriptionRoutes(
  app: Express,
  csrfProtection: any
) {
  // ===== Organizations =====

  // List all organizations
  app.get("/api/admin/organizations", requireAuth, requireSuperAdmin(), async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = (page - 1) * limit;

      const orgs = await db.query.organizations.findMany({
        with: {
          subscription: {
            with: {
              plan: true,
            },
          },
          members: {
            columns: {
              id: true,
            },
          },
        },
        orderBy: desc(organizations.createdAt),
        limit,
        offset,
      });

      const totalResult = await db.select({ count: count() }).from(organizations);
      const total = Number(totalResult[0]?.count || 0);

      res.json({
        organizations: orgs.map((org: typeof orgs[number]) => ({
          id: org.id,
          name: org.name,
          slug: org.slug,
          domain: org.domain,
          domainVerified: org.domainVerified,
          isActive: org.isActive,
          createdAt: org.createdAt,
          memberCount: org.members.length,
          subscription: org.subscription ? {
            planName: org.subscription.plan.displayName,
            seats: org.subscription.seats,
            status: org.subscription.status,
            currentPeriodEnd: org.subscription.currentPeriodEnd,
          } : {
            planName: 'Free',
            seats: 1,
            status: 'active',
            currentPeriodEnd: null,
          },
        })),
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error: any) {
      console.error("Error listing organizations:", error);
      res.status(500).json({ error: "Failed to list organizations" });
    }
  });

  // Get organization details
  app.get("/api/admin/organizations/:id", requireAuth, requireSuperAdmin(), async (req, res) => {
    try {
      const orgId = parseInt(req.params.id ?? '0');

      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        with: {
          subscription: {
            with: {
              plan: true,
            },
          },
          members: {
            with: {
              user: {
                columns: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      });

      if (!org) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      // Get jobs and applications count for this organization
      const statsResult = await db.execute(sql`
        SELECT
          (SELECT COUNT(*) FROM jobs WHERE organization_id = ${orgId}) as jobs_count,
          (SELECT COUNT(*) FROM jobs WHERE organization_id = ${orgId} AND status = 'open') as active_jobs_count,
          (SELECT COUNT(*) FROM applications a
           INNER JOIN jobs j ON a.job_id = j.id
           WHERE j.organization_id = ${orgId}) as applications_count,
          (SELECT COUNT(DISTINCT a.email) FROM applications a
           INNER JOIN jobs j ON a.job_id = j.id
           WHERE j.organization_id = ${orgId}) as candidates_count
      `);

      const stats = statsResult.rows[0] || {};

      res.json({
        ...org,
        stats: {
          jobsCount: Number(stats.jobs_count || 0),
          activeJobsCount: Number(stats.active_jobs_count || 0),
          applicationsCount: Number(stats.applications_count || 0),
          candidatesCount: Number(stats.candidates_count || 0),
        },
      });
    } catch (error: any) {
      console.error("Error getting organization:", error);
      res.status(500).json({ error: "Failed to get organization" });
    }
  });

  // ===== Domain Claims =====

  // List pending domain claims
  app.get("/api/admin/domain-claims", requireAuth, requireSuperAdmin(), async (req, res) => {
    try {
      const claims = await getPendingDomainClaimRequests();

      res.json(claims);
    } catch (error: any) {
      console.error("Error listing domain claims:", error);
      res.status(500).json({ error: "Failed to list domain claims" });
    }
  });

  // Respond to domain claim
  app.post("/api/admin/domain-claims/:id/respond", requireAuth, requireSuperAdmin(), csrfProtection, async (req, res) => {
    try {
      const user = req.user!;
      const claimId = parseInt(req.params.id ?? '0');
      const { status, rejectionReason } = respondDomainClaimSchema.parse(req.body);

      // Get claim details before processing
      const claim = await db.query.domainClaimRequests.findFirst({
        where: eq(domainClaimRequests.id, claimId),
        with: {
          organization: {
            columns: { id: true, name: true },
          },
        },
      });

      if (!claim) {
        res.status(404).json({ error: "Domain claim not found" });
        return;
      }

      // Get requestor info
      const requestor = await db.query.users.findFirst({
        where: eq(users.id, claim.requestedBy),
        columns: { username: true, firstName: true },
      });

      await respondToDomainClaim(claimId, status, user.id, rejectionReason);

      // Send notification email to requestor
      if (requestor) {
        const emailService = await getEmailService();
        if (emailService) {
          const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
          const name = requestor.firstName || 'there';
          const orgName = claim.organization?.name || 'your organization';

          if (status === 'approved') {
            await emailService.sendEmail({
              to: requestor.username,
              subject: `Domain claim approved for ${orgName}`,
              html: `
                <h2>Domain Claim Approved</h2>
                <p>Hi ${name},</p>
                <p>Great news! Your domain claim for <strong>${claim.domain}</strong> has been approved.</p>
                <p>Users with @${claim.domain} email addresses can now request to join ${orgName} on VantaHire.</p>
                <p><a href="${baseUrl}/org/settings">Manage your organization settings</a></p>
              `,
              text: `Hi ${name},\n\nYour domain claim for ${claim.domain} has been approved. Users with @${claim.domain} emails can now request to join ${orgName}.\n\nManage settings: ${baseUrl}/org/settings`,
            });
          } else {
            await emailService.sendEmail({
              to: requestor.username,
              subject: `Domain claim rejected for ${orgName}`,
              html: `
                <h2>Domain Claim Rejected</h2>
                <p>Hi ${name},</p>
                <p>Unfortunately, your domain claim for <strong>${claim.domain}</strong> has been rejected.</p>
                ${rejectionReason ? `<p><strong>Reason:</strong> ${rejectionReason}</p>` : ''}
                <p>If you believe this is a mistake, please contact support.</p>
                <p><a href="${baseUrl}/org/settings">Return to organization settings</a></p>
              `,
              text: `Hi ${name},\n\nYour domain claim for ${claim.domain} has been rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}\n\nIf you believe this is a mistake, please contact support.\n\nSettings: ${baseUrl}/org/settings`,
            });
          }
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error responding to domain claim:", error);
      if (error.name === "ZodError") {
        res.status(400).json({ error: "Invalid input", details: error.errors });
        return;
      }
      res.status(500).json({ error: error.message || "Failed to respond to domain claim" });
    }
  });

  // ===== Subscriptions =====

  // List all subscriptions
  app.get("/api/admin/subscriptions", requireAuth, requireSuperAdmin(), async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = (page - 1) * limit;
      const status = req.query.status as string;

      let whereClause = undefined;
      if (status) {
        whereClause = eq(organizationSubscriptions.status, status);
      }

      const subscriptions = await db.query.organizationSubscriptions.findMany({
        where: whereClause,
        with: {
          organization: {
            columns: {
              id: true,
              name: true,
              slug: true,
            },
          },
          plan: true,
        },
        orderBy: desc(organizationSubscriptions.createdAt),
        limit,
        offset,
      });

      const totalResult = await db.select({ count: count() }).from(organizationSubscriptions);
      const total = Number(totalResult[0]?.count || 0);

      res.json({
        subscriptions,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error: any) {
      console.error("Error listing subscriptions:", error);
      res.status(500).json({ error: "Failed to list subscriptions" });
    }
  });

  // Grant subscription to organization
  app.post("/api/admin/subscriptions/:orgId/grant", requireAuth, requireSuperAdmin(), csrfProtection, async (req, res) => {
    try {
      const user = req.user!;
      const orgId = parseInt(req.params.orgId ?? '0');
      const { planId, seats, billingCycle, reason } = grantSubscriptionSchema.parse(req.body);

      const org = await getOrganization(orgId);
      if (!org) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      const plan = await getPlanById(planId);
      if (!plan) {
        res.status(400).json({ error: "Invalid plan" });
        return;
      }

      // Create subscription with admin override flag
      const subscription = await createPaidSubscription(
        orgId,
        planId,
        seats,
        billingCycle
      );

      // Mark as admin override
      await adminOverrideSubscription(subscription.id, {}, user.id, reason);

      res.json({
        success: true,
        subscription,
      });
    } catch (error: any) {
      console.error("Error granting subscription:", error);
      if (error.name === "ZodError") {
        res.status(400).json({ error: "Invalid input", details: error.errors });
        return;
      }
      res.status(500).json({ error: error.message || "Failed to grant subscription" });
    }
  });

  // Extend subscription
  app.post("/api/admin/subscriptions/:id/extend", requireAuth, requireSuperAdmin(), csrfProtection, async (req, res) => {
    try {
      const user = req.user!;
      const subscriptionId = parseInt(req.params.id ?? '0');
      const { days, reason } = extendSubscriptionSchema.parse(req.body);

      const subscription = await db.query.organizationSubscriptions.findFirst({
        where: eq(organizationSubscriptions.id, subscriptionId),
      });

      if (!subscription) {
        res.status(404).json({ error: "Subscription not found" });
        return;
      }

      const newPeriodEnd = new Date(subscription.currentPeriodEnd);
      newPeriodEnd.setDate(newPeriodEnd.getDate() + days);

      await adminOverrideSubscription(subscriptionId, {
        currentPeriodEnd: newPeriodEnd,
      }, user.id, reason);

      res.json({
        success: true,
        newPeriodEnd,
      });
    } catch (error: any) {
      console.error("Error extending subscription:", error);
      if (error.name === "ZodError") {
        res.status(400).json({ error: "Invalid input", details: error.errors });
        return;
      }
      res.status(500).json({ error: error.message || "Failed to extend subscription" });
    }
  });

  // Override subscription settings
  app.post("/api/admin/subscriptions/:id/override", requireAuth, requireSuperAdmin(), csrfProtection, async (req, res) => {
    try {
      const user = req.user!;
      const subscriptionId = parseInt(req.params.id ?? '0');
      const data = overrideSubscriptionSchema.parse(req.body);

      const updates: any = {};

      if (data.planId) updates.planId = data.planId;
      if (data.seats) updates.seats = data.seats;
      if (data.status) updates.status = data.status;
      if (data.featureOverrides) updates.featureOverrides = data.featureOverrides;

      if (data.extendDays) {
        const subscription = await db.query.organizationSubscriptions.findFirst({
          where: eq(organizationSubscriptions.id, subscriptionId),
        });
        if (subscription) {
          const newPeriodEnd = new Date(subscription.currentPeriodEnd);
          newPeriodEnd.setDate(newPeriodEnd.getDate() + data.extendDays);
          updates.currentPeriodEnd = newPeriodEnd;
        }
      }

      const updated = await adminOverrideSubscription(subscriptionId, updates, user.id, data.reason);

      res.json({
        success: true,
        subscription: updated,
      });
    } catch (error: any) {
      console.error("Error overriding subscription:", error);
      if (error.name === "ZodError") {
        res.status(400).json({ error: "Invalid input", details: error.errors });
        return;
      }
      res.status(500).json({ error: error.message || "Failed to override subscription" });
    }
  });

  // ===== Analytics =====

  // Subscription analytics (MRR, etc.)
  app.get("/api/admin/analytics/subscriptions", requireAuth, requireSuperAdmin(), async (req, res) => {
    try {
      const mrr = await calculateMRR();

      // Get plan distribution
      const planDistribution = await db
        .select({
          planName: subscriptionPlans.displayName,
          count: count(),
        })
        .from(organizationSubscriptions)
        .innerJoin(subscriptionPlans, eq(organizationSubscriptions.planId, subscriptionPlans.id))
        .where(eq(organizationSubscriptions.status, 'active'))
        .groupBy(subscriptionPlans.displayName);

      // Get status distribution
      const statusDistribution = await db
        .select({
          status: organizationSubscriptions.status,
          count: count(),
        })
        .from(organizationSubscriptions)
        .groupBy(organizationSubscriptions.status);

      // Get recent subscriptions
      const recentSubscriptions = await db.query.organizationSubscriptions.findMany({
        with: {
          organization: {
            columns: {
              name: true,
            },
          },
          plan: {
            columns: {
              displayName: true,
            },
          },
        },
        orderBy: desc(organizationSubscriptions.createdAt),
        limit: 10,
      });

      res.json({
        mrr: mrr.mrr,
        activeSubscriptions: mrr.activeSubscriptions,
        totalSeats: mrr.totalSeats,
        planDistribution,
        statusDistribution,
        recentSubscriptions,
      });
    } catch (error: any) {
      console.error("Error getting subscription analytics:", error);
      res.status(500).json({ error: "Failed to get subscription analytics" });
    }
  });

  // AI usage analytics
  app.get("/api/admin/analytics/ai-usage", requireAuth, requireSuperAdmin(), async (req, res) => {
    try {
      // Get total credits used across all orgs
      const creditsResult = await db
        .select({
          totalAllocated: sql<number>`sum(${organizationMembers.creditsAllocated})`,
          totalUsed: sql<number>`sum(${organizationMembers.creditsUsed})`,
        })
        .from(organizationMembers)
        .where(eq(organizationMembers.seatAssigned, true));

      const credits = creditsResult[0] || { totalAllocated: 0, totalUsed: 0 };

      // Get top organizations by usage
      const topOrgs = await db
        .select({
          orgId: organizations.id,
          orgName: organizations.name,
          totalUsed: sql<number>`sum(${organizationMembers.creditsUsed})`,
        })
        .from(organizationMembers)
        .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
        .groupBy(organizations.id, organizations.name)
        .orderBy(desc(sql`sum(${organizationMembers.creditsUsed})`))
        .limit(10);

      res.json({
        totalAllocated: Number(credits.totalAllocated || 0),
        totalUsed: Number(credits.totalUsed || 0),
        utilizationRate: credits.totalAllocated
          ? ((credits.totalUsed / credits.totalAllocated) * 100).toFixed(2)
          : '0.00',
        topOrganizations: topOrgs,
      });
    } catch (error: any) {
      console.error("Error getting AI usage analytics:", error);
      res.status(500).json({ error: "Failed to get AI usage analytics" });
    }
  });

  // ===== Feature Management =====

  // List all features with metadata and DB-computed defaults
  app.get("/api/admin/features", requireAuth, requireSuperAdmin(), async (req, res) => {
    try {
      const defaultsByPlan = await getFeatureDefaultsByPlan();

      const features = Object.entries(FEATURE_METADATA).map(([key, meta]) => ({
        key,
        ...meta,
        defaultByPlan: Object.fromEntries(
          Object.entries(defaultsByPlan).map(([plan, planFeatures]) => [
            plan,
            planFeatures[key as keyof typeof planFeatures],
          ])
        ),
      }));

      res.json({ features });
    } catch (error: any) {
      console.error("Error listing features:", error);
      res.status(500).json({ error: "Failed to list features" });
    }
  });

  // Get organization's resolved features
  app.get("/api/admin/organizations/:id/features", requireAuth, requireSuperAdmin(), async (req, res) => {
    try {
      const orgId = parseInt(req.params.id ?? '0');

      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: { id: true, name: true },
      });

      if (!org) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      const subscription = await getOrganizationSubscription(orgId);
      const resolvedFeatures = await getOrganizationFeatures(orgId);
      const limits = await getSubscriptionLimits(orgId);
      const overrides = (subscription?.featureOverrides || {}) as Record<string, boolean>;

      // Build response with source tracking
      const features: Record<string, { enabled: boolean; source: 'plan' | 'override' }> = {};
      for (const [key, enabled] of Object.entries(resolvedFeatures)) {
        features[key] = {
          enabled,
          source: key in overrides ? 'override' : 'plan',
        };
      }

      res.json({
        organizationId: orgId,
        organizationName: org.name,
        planName: subscription?.plan.name || 'free',
        planDisplayName: subscription?.plan.displayName || 'Free',
        features,
        overrides,
        limits: {
          maxSeats: limits.maxSeats,
          maxJobsActive: limits.maxJobsActive,
          maxApplicationsPerJob: limits.maxApplicationsPerJob,
          maxAiCreditsPerMonth: limits.maxAiCreditsPerMonth,
        },
      });
    } catch (error: any) {
      console.error("Error getting organization features:", error);
      res.status(500).json({ error: "Failed to get organization features" });
    }
  });

  // Update organization's feature overrides
  app.post("/api/admin/organizations/:id/features", requireAuth, requireSuperAdmin(), csrfProtection, async (req, res) => {
    try {
      const user = req.user!;
      const orgId = parseInt(req.params.id ?? '0');

      const { overrides, reason } = updateFeaturesSchema.parse(req.body);

      const subscription = await getOrganizationSubscription(orgId);
      if (!subscription) {
        res.status(400).json({ error: "Organization has no subscription to override. Create a subscription first." });
        return;
      }

      // Merge with existing overrides
      const currentOverrides = (subscription.featureOverrides || {}) as Record<string, any>;
      const newOverrides = { ...currentOverrides };

      // Apply new overrides, remove nulls to clear
      for (const [key, value] of Object.entries(overrides)) {
        if (value === null) {
          delete newOverrides[key];
        } else {
          newOverrides[key] = value;
        }
      }

      await adminOverrideSubscription(
        subscription.id,
        { featureOverrides: Object.keys(newOverrides).length > 0 ? newOverrides : {} },
        user.id,
        `Feature override: ${reason}`
      );

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating organization features:", error);
      if (error.name === "ZodError") {
        res.status(400).json({ error: "Invalid input", details: error.errors });
        return;
      }
      res.status(500).json({ error: error.message || "Failed to update organization features" });
    }
  });

  // Get feature audit log (org-scoped or global recent)
  app.get("/api/admin/features/audit-log", requireAuth, requireSuperAdmin(), async (req, res) => {
    try {
      const orgId = req.query.orgId ? parseInt(req.query.orgId as string) : undefined;

      if (orgId) {
        // Reuse existing org-scoped function
        const logs = await getSubscriptionAuditLog(orgId);
        // Filter to feature-related changes
        const featureLogs = logs.filter((log: any) =>
          log.action === 'admin_override' &&
          (log.newValue?.featureOverrides || log.previousValue?.featureOverrides)
        );
        res.json(featureLogs);
        return;
      }

      // Global: get recent admin_override actions with org info via join
      const logs = await db
        .select({
          id: subscriptionAuditLog.id,
          organizationId: subscriptionAuditLog.organizationId,
          subscriptionId: subscriptionAuditLog.subscriptionId,
          action: subscriptionAuditLog.action,
          previousValue: subscriptionAuditLog.previousValue,
          newValue: subscriptionAuditLog.newValue,
          performedBy: subscriptionAuditLog.performedBy,
          performedAt: subscriptionAuditLog.performedAt,
          reason: subscriptionAuditLog.reason,
          orgName: organizations.name,
        })
        .from(subscriptionAuditLog)
        .innerJoin(organizations, eq(subscriptionAuditLog.organizationId, organizations.id))
        .where(eq(subscriptionAuditLog.action, 'admin_override'))
        .orderBy(desc(subscriptionAuditLog.performedAt))
        .limit(50);

      res.json(logs);
    } catch (error: any) {
      console.error("Error getting feature audit log:", error);
      res.status(500).json({ error: "Failed to get feature audit log" });
    }
  });
}
