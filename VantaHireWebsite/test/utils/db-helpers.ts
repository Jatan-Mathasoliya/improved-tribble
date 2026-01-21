import { randomBytes, scryptSync } from 'crypto';
import { db } from '../../server/db';
import {
  users,
  subscriptionPlans,
  organizationMembers,
  type SubscriptionPlan,
} from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createOrganization } from '../../server/lib/organizationService';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hashed = scryptSync(password, salt, 64).toString('hex');
  return `${hashed}.${salt}`;
}

export async function createRecruiterUser(options: {
  username: string;
  password: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: 'recruiter' | 'candidate' | 'super_admin' | 'hiring_manager';
  emailVerified?: boolean;
}) {
  const [user] = await db.insert(users).values({
    username: options.username.toLowerCase(),
    password: hashPassword(options.password),
    role: options.role ?? 'recruiter',
    emailVerified: options.emailVerified ?? true,
    firstName: options.firstName ?? 'Test',
    lastName: options.lastName ?? 'User',
  }).returning();

  return user;
}

export async function ensurePlan(name: string, overrides?: Partial<SubscriptionPlan>) {
  const existing = await db.query.subscriptionPlans.findFirst({
    where: eq(subscriptionPlans.name, name),
  });

  if (existing) {
    return { plan: existing, created: false };
  }

  const [plan] = await db.insert(subscriptionPlans).values({
    name,
    displayName: overrides?.displayName ?? name.toUpperCase(),
    description: overrides?.description ?? `Test plan ${name}`,
    pricePerSeatMonthly: overrides?.pricePerSeatMonthly ?? 99900,
    pricePerSeatAnnual: overrides?.pricePerSeatAnnual ?? 99900 * 10,
    aiCreditsPerSeatMonthly: overrides?.aiCreditsPerSeatMonthly ?? 100,
    maxCreditRolloverMonths: overrides?.maxCreditRolloverMonths ?? 3,
    features: overrides?.features ?? { aiMatching: true },
    isActive: overrides?.isActive ?? true,
    sortOrder: overrides?.sortOrder ?? 0,
    createdAt: new Date(),
  }).returning();

  return { plan, created: true };
}

export async function createOrganizationWithOwner(options: {
  name: string;
  ownerId: number;
  billingContactEmail?: string | null;
  billingContactName?: string | null;
}) {
  return createOrganization({
    name: options.name,
    billingContactEmail: options.billingContactEmail ?? null,
    billingContactName: options.billingContactName ?? null,
  }, options.ownerId);
}

export async function addOrganizationMember(options: {
  organizationId: number;
  userId: number;
  role?: 'owner' | 'admin' | 'member';
  seatAssigned?: boolean;
}) {
  const [member] = await db.insert(organizationMembers).values({
    organizationId: options.organizationId,
    userId: options.userId,
    role: options.role ?? 'member',
    seatAssigned: options.seatAssigned ?? true,
    joinedAt: new Date(),
  }).returning();

  return member;
}
