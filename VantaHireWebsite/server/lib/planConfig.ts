import type { SubscriptionPlan } from "@shared/schema";

function getEnvInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

export const PLAN_FREE = "free" as const;
export const PLAN_PRO = "pro" as const;
export const PLAN_BUSINESS = "business" as const;

export const PLAN_FREE_DISPLAY_NAME = "Free";
export const PLAN_PRO_DISPLAY_NAME = "Growth";
export const PLAN_BUSINESS_DISPLAY_NAME = "Enterprise";

export const FREE_CREDITS_PER_MONTH = getEnvInt("FREE_AI_CREDITS_PER_MONTH", 300);
export const FREE_CREDITS_ROLLOVER_MONTHS = getEnvInt("FREE_AI_CREDITS_ROLLOVER_MONTHS", 3);
export const FREE_CREDITS_CAP = getEnvInt(
  "FREE_AI_CREDITS_CAP",
  FREE_CREDITS_PER_MONTH * FREE_CREDITS_ROLLOVER_MONTHS,
);
export const FREE_DAILY_RATE_LIMIT = getEnvInt("FREE_AI_DAILY_RATE_LIMIT", 20);

export const PRO_CREDITS_PER_SEAT_PER_MONTH = getEnvInt("PRO_AI_CREDITS_PER_MONTH", 600);
export const PRO_CREDITS_ROLLOVER_MONTHS = getEnvInt("PRO_AI_CREDITS_ROLLOVER_MONTHS", 3);
export const PRO_CREDITS_CAP = getEnvInt(
  "PRO_AI_CREDITS_CAP",
  PRO_CREDITS_PER_SEAT_PER_MONTH * PRO_CREDITS_ROLLOVER_MONTHS,
);
export const PRO_DAILY_RATE_LIMIT = getEnvInt("PRO_AI_DAILY_RATE_LIMIT", 100);

export const BUSINESS_CREDITS_PER_SEAT_PER_MONTH = getEnvInt("BUSINESS_AI_CREDITS_PER_MONTH", 1000);
export const BUSINESS_CREDITS_ROLLOVER_MONTHS = getEnvInt("BUSINESS_AI_CREDITS_ROLLOVER_MONTHS", 3);
export const BUSINESS_CREDITS_CAP = getEnvInt(
  "BUSINESS_AI_CREDITS_CAP",
  BUSINESS_CREDITS_PER_SEAT_PER_MONTH * BUSINESS_CREDITS_ROLLOVER_MONTHS,
);
export const BUSINESS_DAILY_RATE_LIMIT = getEnvInt(
  "BUSINESS_AI_DAILY_RATE_LIMIT",
  PRO_DAILY_RATE_LIMIT,
);

type PlanLike = Pick<SubscriptionPlan, "name" | "aiCreditsPerSeatMonthly" | "maxCreditRolloverMonths" | "features" | "displayName">;

export interface PlanCreditSettings {
  creditsPerSeat: number;
  maxRolloverMonths: number;
  cap: number;
  dailyRateLimit: number;
}

function getNamedPlanCreditSettings(planName: string): PlanCreditSettings | null {
  if (planName === PLAN_FREE) {
    return {
      creditsPerSeat: FREE_CREDITS_PER_MONTH,
      maxRolloverMonths: FREE_CREDITS_ROLLOVER_MONTHS,
      cap: FREE_CREDITS_CAP,
      dailyRateLimit: FREE_DAILY_RATE_LIMIT,
    };
  }

  if (planName === PLAN_PRO) {
    return {
      creditsPerSeat: PRO_CREDITS_PER_SEAT_PER_MONTH,
      maxRolloverMonths: PRO_CREDITS_ROLLOVER_MONTHS,
      cap: PRO_CREDITS_CAP,
      dailyRateLimit: PRO_DAILY_RATE_LIMIT,
    };
  }

  if (planName === PLAN_BUSINESS) {
    return {
      creditsPerSeat: BUSINESS_CREDITS_PER_SEAT_PER_MONTH,
      maxRolloverMonths: BUSINESS_CREDITS_ROLLOVER_MONTHS,
      cap: BUSINESS_CREDITS_CAP,
      dailyRateLimit: BUSINESS_DAILY_RATE_LIMIT,
    };
  }

  return null;
}

export function getPlanCreditSettings(plan: Pick<SubscriptionPlan, "name" | "aiCreditsPerSeatMonthly" | "maxCreditRolloverMonths">): PlanCreditSettings {
  const namedSettings = getNamedPlanCreditSettings(plan.name);
  if (namedSettings) {
    return namedSettings;
  }

  const maxRolloverMonths = plan.maxCreditRolloverMonths || 3;
  const creditsPerSeat = plan.aiCreditsPerSeatMonthly;
  return {
    creditsPerSeat,
    maxRolloverMonths,
    cap: creditsPerSeat * maxRolloverMonths,
    dailyRateLimit: BUSINESS_DAILY_RATE_LIMIT,
  };
}

function getCanonicalDisplayName(plan: Pick<SubscriptionPlan, "name" | "displayName">): string {
  if (plan.name === PLAN_FREE) return PLAN_FREE_DISPLAY_NAME;
  if (plan.name === PLAN_PRO) return PLAN_PRO_DISPLAY_NAME;
  if (plan.name === PLAN_BUSINESS) return PLAN_BUSINESS_DISPLAY_NAME;
  return plan.displayName;
}

function normalizePlanFeatures(plan: PlanLike): SubscriptionPlan["features"] {
  const features = (plan.features || {}) as Record<string, unknown>;

  if (plan.name === PLAN_FREE) {
    return {
      ...features,
      basicAts: true,
      jobPosting: true,
      applicationManagement: true,
      aiMatching: true,
      aiContent: true,
    };
  }

  return features;
}

export function normalizePlan(plan: SubscriptionPlan): SubscriptionPlan {
  const settings = getPlanCreditSettings(plan);

  return {
    ...plan,
    displayName: getCanonicalDisplayName(plan),
    aiCreditsPerSeatMonthly: settings.creditsPerSeat,
    maxCreditRolloverMonths: settings.maxRolloverMonths,
    features: normalizePlanFeatures(plan),
  };
}

export interface PlanRateLimitInfo {
  planName: string;
  dailyRateLimit: number;
  monthlyCredits: number;
  rolloverMonths: number;
  maxCredits: number;
}

export function getPlanRateLimitInfo(
  planOrName: string | Pick<SubscriptionPlan, "name" | "aiCreditsPerSeatMonthly" | "maxCreditRolloverMonths">
): PlanRateLimitInfo {
  if (typeof planOrName === "string") {
    const settings = getNamedPlanCreditSettings(planOrName);
    if (settings) {
      return {
        planName: planOrName,
        dailyRateLimit: settings.dailyRateLimit,
        monthlyCredits: settings.creditsPerSeat,
        rolloverMonths: settings.maxRolloverMonths,
        maxCredits: settings.cap,
      };
    }

    return {
      planName: planOrName,
      dailyRateLimit: BUSINESS_DAILY_RATE_LIMIT,
      monthlyCredits: 0,
      rolloverMonths: 3,
      maxCredits: 0,
    };
  }

  const settings = getPlanCreditSettings(planOrName);
  return {
    planName: planOrName.name,
    dailyRateLimit: settings.dailyRateLimit,
    monthlyCredits: settings.creditsPerSeat,
    rolloverMonths: settings.maxRolloverMonths,
    maxCredits: settings.cap,
  };
}
