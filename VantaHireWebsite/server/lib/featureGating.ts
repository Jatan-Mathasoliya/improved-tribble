import { db } from "../db";
import {
  organizationSubscriptions,
  subscriptionPlans,
  organizationMembers,
  type SubscriptionPlan,
  type OrganizationSubscription,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getOrganizationSubscription } from "./subscriptionService";

// Environment variables for instance configuration
export const INSTANCE_TYPE = process.env.INSTANCE_TYPE || 'multi_tenant';
export const DISABLE_SUPER_ADMIN = process.env.DISABLE_SUPER_ADMIN === 'true';
export const DISABLE_MULTI_ORG_VIEW = process.env.DISABLE_MULTI_ORG_VIEW === 'true';
export const DISABLE_PLATFORM_ANALYTICS = process.env.DISABLE_PLATFORM_ANALYTICS === 'true';

function getEnvInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

const FREE_AI_CREDITS_PER_MONTH = getEnvInt('FREE_AI_CREDITS_PER_MONTH', 5);

// Feature names
export const FEATURES = {
  // Core ATS
  BASIC_ATS: 'basicAts',
  JOB_POSTING: 'jobPosting',
  APPLICATION_MANAGEMENT: 'applicationManagement',

  // AI Features
  AI_MATCHING: 'aiMatching',
  AI_CONTENT: 'aiContent',

  // Advanced Features
  ADVANCED_ANALYTICS: 'advancedAnalytics',
  CUSTOM_PIPELINE: 'customPipeline',
  TEAM_COLLABORATION: 'teamCollaboration',
  CLIENT_PORTAL: 'clientPortal',

  // Enterprise Features
  API_ACCESS: 'apiAccess',
  SSO: 'sso',
  CUSTOM_BRANDING: 'customBranding',
  DEDICATED_SUPPORT: 'dedicatedSupport',
  SLA: 'sla',
} as const;

export type FeatureName = typeof FEATURES[keyof typeof FEATURES];

// Feature metadata for admin UI
export const FEATURE_METADATA: Record<FeatureName, {
  name: string;
  description: string;
  category: 'core' | 'ai' | 'advanced' | 'enterprise';
}> = {
  // Core ATS
  basicAts: { name: "Basic ATS", description: "Core applicant tracking functionality", category: "core" },
  jobPosting: { name: "Job Posting", description: "Create and publish job listings", category: "core" },
  applicationManagement: { name: "Application Management", description: "Manage and review applications", category: "core" },

  // AI Features
  aiMatching: { name: "AI Matching", description: "AI-powered candidate matching and scoring", category: "ai" },
  aiContent: { name: "AI Content", description: "AI-generated job descriptions and summaries", category: "ai" },

  // Advanced Features
  advancedAnalytics: { name: "Advanced Analytics", description: "Detailed hiring metrics and reports", category: "advanced" },
  customPipeline: { name: "Custom Pipeline", description: "Customizable hiring stages and workflows", category: "advanced" },
  teamCollaboration: { name: "Team Collaboration", description: "Multi-user collaboration features", category: "advanced" },
  clientPortal: { name: "Client Portal", description: "Client shortlist sharing and feedback", category: "advanced" },

  // Enterprise Features
  apiAccess: { name: "API Access", description: "REST API access for integrations", category: "enterprise" },
  sso: { name: "Single Sign-On", description: "SSO authentication support", category: "enterprise" },
  customBranding: { name: "Custom Branding", description: "White-label branding options", category: "enterprise" },
  dedicatedSupport: { name: "Dedicated Support", description: "Priority support channel", category: "enterprise" },
  sla: { name: "SLA Guarantee", description: "Service level agreement with uptime guarantees", category: "enterprise" },
};

// Validate if a string is a valid feature key
export function isValidFeatureKey(key: string): key is FeatureName {
  return Object.values(FEATURES).includes(key as FeatureName);
}

// Get feature defaults by plan (computed from DB, not hardcoded)
export async function getFeatureDefaultsByPlan(): Promise<Record<string, Record<FeatureName, boolean>>> {
  const plans = await db.query.subscriptionPlans.findMany();
  const result: Record<string, Record<FeatureName, boolean>> = {};

  for (const plan of plans) {
    const planFeatures = (plan.features || {}) as Record<string, boolean>;
    const planResult = {} as Record<FeatureName, boolean>;

    for (const featureKey of Object.values(FEATURES)) {
      // Match existing fallback logic: aiContent defaults true unless explicitly false
      if (featureKey === FEATURES.AI_CONTENT) {
        planResult[featureKey] = planFeatures[featureKey] !== false;
      } else {
        planResult[featureKey] = planFeatures[featureKey] === true;
      }
    }
    result[plan.name] = planResult;
  }

  // Add implicit "free" tier only if no free plan was found in DB
  if (!result['free']) {
    const implicitFree = {} as Record<FeatureName, boolean>;
    for (const featureKey of Object.values(FEATURES)) {
      implicitFree[featureKey] =
        featureKey === FEATURES.BASIC_ATS ||
        featureKey === FEATURES.JOB_POSTING ||
        featureKey === FEATURES.APPLICATION_MANAGEMENT ||
        featureKey === FEATURES.AI_CONTENT;
    }
    result['free'] = implicitFree;
  }

  return result;
}

// Check if a specific feature is enabled for an organization
export async function isFeatureEnabled(
  orgId: number,
  featureName: FeatureName
): Promise<boolean> {
  const subscription = await getOrganizationSubscription(orgId);

  if (!subscription) {
    // No subscription = free tier, only basic features
    return featureName === FEATURES.BASIC_ATS ||
           featureName === FEATURES.JOB_POSTING ||
           featureName === FEATURES.APPLICATION_MANAGEMENT ||
           featureName === FEATURES.AI_CONTENT;
  }

  // Check for feature overrides first
  if (subscription.featureOverrides) {
    const overrides = subscription.featureOverrides as Record<string, boolean>;
    if (featureName in overrides) {
      return overrides[featureName] ?? false;
    }
  }

  // Check plan features
  const planFeatures = subscription.plan.features as Record<string, boolean>;
  if (featureName in planFeatures) {
    return planFeatures?.[featureName] === true;
  }

  // Fallback: allow AI content unless explicitly disabled in plan features.
  if (featureName === FEATURES.AI_CONTENT) {
    return true;
  }

  return false;
}

// Check if user can access a feature (combines org feature check with user status)
export async function canAccessFeature(
  userId: number,
  featureName: FeatureName
): Promise<{ allowed: boolean; reason?: string }> {
  // Get user's organization membership
  const membership = await db.query.organizationMembers.findFirst({
    where: eq(organizationMembers.userId, userId),
  });

  if (!membership) {
    return {
      allowed: false,
      reason: 'Not a member of any organization',
    };
  }

  // Check if user has an assigned seat
  if (!membership.seatAssigned) {
    return {
      allowed: false,
      reason: 'Your seat has been removed. Contact your organization admin.',
    };
  }

  // Check if feature is enabled for the organization
  const featureEnabled = await isFeatureEnabled(membership.organizationId, featureName);

  if (!featureEnabled) {
    return {
      allowed: false,
      reason: 'This feature is not available on your current plan. Please upgrade.',
    };
  }

  return { allowed: true };
}

// Get all features for an organization
export async function getOrganizationFeatures(orgId: number): Promise<Record<FeatureName, boolean>> {
  const subscription = await getOrganizationSubscription(orgId);

  const result: Partial<Record<FeatureName, boolean>> = {};

  for (const featureName of Object.values(FEATURES)) {
    result[featureName] = await isFeatureEnabled(orgId, featureName);
  }

  return result as Record<FeatureName, boolean>;
}

// Check if instance allows super admin features
export function isSuperAdminEnabled(): boolean {
  return INSTANCE_TYPE === 'multi_tenant' && !DISABLE_SUPER_ADMIN;
}

// Check if instance allows multi-org view
export function isMultiOrgViewEnabled(): boolean {
  return INSTANCE_TYPE === 'multi_tenant' && !DISABLE_MULTI_ORG_VIEW;
}

// Check if instance allows platform analytics
export function isPlatformAnalyticsEnabled(): boolean {
  return INSTANCE_TYPE === 'multi_tenant' && !DISABLE_PLATFORM_ANALYTICS;
}

// Check if current instance is single tenant (Business plan)
export function isSingleTenant(): boolean {
  return INSTANCE_TYPE === 'single_tenant';
}

// Middleware helper: require feature access
export function requireFeatureAccess(featureName: FeatureName) {
  return async (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const access = await canAccessFeature(req.user.id, featureName);

    if (!access.allowed) {
      return res.status(403).json({
        error: 'Feature not available',
        reason: access.reason,
      });
    }

    next();
  };
}

// Get subscription limits for an organization
export async function getSubscriptionLimits(orgId: number): Promise<{
  maxSeats: number | null; // null = unlimited
  maxJobsActive: number | null;
  maxApplicationsPerJob: number | null;
  maxAiCreditsPerMonth: number;
}> {
  const subscription = await getOrganizationSubscription(orgId);

  if (!subscription) {
    // Free tier limits
    return {
      maxSeats: 1,
      maxJobsActive: 5,
      maxApplicationsPerJob: 100,
      maxAiCreditsPerMonth: FREE_AI_CREDITS_PER_MONTH,
    };
  }

  const plan = subscription.plan;
  const planName = plan.name;

  if (planName === 'free') {
    return {
      maxSeats: 1,
      maxJobsActive: 5,
      maxApplicationsPerJob: 100,
      maxAiCreditsPerMonth: FREE_AI_CREDITS_PER_MONTH,
    };
  }

  if (planName === 'pro') {
    return {
      maxSeats: null, // Pay per seat
      maxJobsActive: null, // Unlimited
      maxApplicationsPerJob: null, // Unlimited
      maxAiCreditsPerMonth: plan.aiCreditsPerSeatMonthly * subscription.seats,
    };
  }

  // Business plan - custom/unlimited
  const overrides = subscription.featureOverrides as Record<string, number | undefined> | null;
  return {
    maxSeats: null,
    maxJobsActive: null,
    maxApplicationsPerJob: null,
    maxAiCreditsPerMonth: overrides?.aiCredits ?? 10000,
  };
}

// Check if organization is within its limits
export async function isWithinLimits(
  orgId: number,
  limitType: 'jobs' | 'applications' | 'seats'
): Promise<{ within: boolean; current: number; max: number | null }> {
  const limits = await getSubscriptionLimits(orgId);

  // Implementation would check actual counts against limits
  // For now, returning true - actual implementation depends on query needs
  return {
    within: true,
    current: 0,
    max: limitType === 'jobs' ? limits.maxJobsActive :
         limitType === 'seats' ? limits.maxSeats :
         limits.maxApplicationsPerJob,
  };
}

// Feature flag check for UI rendering
export async function getFeatureFlagsForUser(userId: number): Promise<{
  features: Record<FeatureName, boolean>;
  plan: {
    name: string;
    displayName: string;
  } | null;
  isSeated: boolean;
  instanceType: string;
}> {
  const membership = await db.query.organizationMembers.findFirst({
    where: eq(organizationMembers.userId, userId),
  });

  if (!membership) {
    return {
      features: Object.fromEntries(
        Object.values(FEATURES).map(f => [f, false])
      ) as Record<FeatureName, boolean>,
      plan: null,
      isSeated: false,
      instanceType: INSTANCE_TYPE,
    };
  }

  const subscription = await getOrganizationSubscription(membership.organizationId);
  const features = await getOrganizationFeatures(membership.organizationId);

  return {
    features,
    plan: subscription ? {
      name: subscription.plan.name,
      displayName: subscription.plan.displayName,
    } : {
      name: 'free',
      displayName: 'Free',
    },
    isSeated: membership.seatAssigned,
    instanceType: INSTANCE_TYPE,
  };
}
