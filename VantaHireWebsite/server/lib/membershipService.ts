import { db } from "../db";
import {
  organizationMembers,
  organizations,
  jobs,
  users,
  type OrganizationMember,
  type OrganizationRole,
} from "@shared/schema";
import { eq, and, desc, sql, or, ne } from "drizzle-orm";

// Get all members of an organization
export async function getOrganizationMembers(orgId: number): Promise<(OrganizationMember & {
  user: {
    id: number;
    username: string;
    firstName: string | null;
    lastName: string | null;
  };
})[]> {
  const members = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.organizationId, orgId),
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
    orderBy: [
      // Owner first, then admin, then member
      sql`CASE WHEN ${organizationMembers.role} = 'owner' THEN 0 WHEN ${organizationMembers.role} = 'admin' THEN 1 ELSE 2 END`,
      desc(organizationMembers.joinedAt),
    ],
  });

  return members as (OrganizationMember & {
    user: {
      id: number;
      username: string;
      firstName: string | null;
      lastName: string | null;
    };
  })[];
}

// Get a specific member
export async function getOrganizationMember(
  orgId: number,
  userId: number
): Promise<OrganizationMember | undefined> {
  return db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, orgId),
      eq(organizationMembers.userId, userId)
    ),
  });
}

// Get member by ID
export async function getMemberById(memberId: number): Promise<OrganizationMember | undefined> {
  return db.query.organizationMembers.findFirst({
    where: eq(organizationMembers.id, memberId),
  });
}

// Update member role
export async function updateMemberRole(
  memberId: number,
  newRole: OrganizationRole
): Promise<OrganizationMember | undefined> {
  const member = await getMemberById(memberId);
  if (!member) {
    throw new Error('Member not found');
  }

  // Cannot demote the owner
  if (member.role === 'owner' && newRole !== 'owner') {
    throw new Error('Cannot demote the organization owner');
  }

  // Cannot promote to owner (owner transfer requires special flow)
  if (newRole === 'owner') {
    throw new Error('Cannot promote to owner. Use transfer ownership flow instead.');
  }

  const [updated] = await db.update(organizationMembers)
    .set({ role: newRole })
    .where(eq(organizationMembers.id, memberId))
    .returning();

  return updated;
}

// Remove member from organization
export async function removeMember(memberId: number): Promise<void> {
  const member = await getMemberById(memberId);
  if (!member) {
    throw new Error('Member not found');
  }

  if (member.role === 'owner') {
    throw new Error('Cannot remove the organization owner');
  }

  await db.delete(organizationMembers).where(eq(organizationMembers.id, memberId));
}

// Member leaves organization voluntarily
export async function leaveOrganization(userId: number): Promise<void> {
  const member = await db.query.organizationMembers.findFirst({
    where: eq(organizationMembers.userId, userId),
  });

  if (!member) {
    throw new Error('You are not a member of any organization');
  }

  if (member.role === 'owner') {
    throw new Error('Organization owner cannot leave. Transfer ownership first or delete the organization.');
  }

  await db.delete(organizationMembers).where(eq(organizationMembers.id, member.id));
}

// Update member activity (for last_activity tracking)
export async function updateMemberActivity(userId: number): Promise<void> {
  await db.update(organizationMembers)
    .set({ lastActivityAt: new Date() })
    .where(eq(organizationMembers.userId, userId));
}

// Get seated members count
export async function getSeatedMembersCount(orgId: number): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(organizationMembers)
    .where(and(
      eq(organizationMembers.organizationId, orgId),
      eq(organizationMembers.seatAssigned, true)
    ));

  return Number(result[0]?.count || 0);
}

// Get all seated members (for seat reduction UI)
export async function getSeatedMembers(orgId: number): Promise<(OrganizationMember & {
  user: {
    id: number;
    username: string;
    firstName: string | null;
    lastName: string | null;
  };
})[]> {
  const members = await db.query.organizationMembers.findMany({
    where: and(
      eq(organizationMembers.organizationId, orgId),
      eq(organizationMembers.seatAssigned, true)
    ),
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
    orderBy: [
      // Owner first, then by last activity
      sql`CASE WHEN ${organizationMembers.role} = 'owner' THEN 0 ELSE 1 END`,
      desc(organizationMembers.lastActivityAt),
    ],
  });

  return members as (OrganizationMember & {
    user: {
      id: number;
      username: string;
      firstName: string | null;
      lastName: string | null;
    };
  })[];
}

// Transfer ownership
export async function transferOwnership(
  orgId: number,
  currentOwnerId: number,
  newOwnerId: number
): Promise<void> {
  // Verify current owner
  const currentOwner = await getOrganizationMember(orgId, currentOwnerId);
  if (!currentOwner || currentOwner.role !== 'owner') {
    throw new Error('Only the current owner can transfer ownership');
  }

  // Verify new owner is a member
  const newOwner = await getOrganizationMember(orgId, newOwnerId);
  if (!newOwner) {
    throw new Error('New owner must be a member of the organization');
  }

  // Update roles in a transaction
  await db.transaction(async (tx: typeof db) => {
    // Demote current owner to admin
    await tx.update(organizationMembers)
      .set({ role: 'admin' })
      .where(and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.userId, currentOwnerId)
      ));

    // Promote new owner
    await tx.update(organizationMembers)
      .set({ role: 'owner' })
      .where(and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.userId, newOwnerId)
      ));
  });
}

// Get organization owner
export async function getOrganizationOwner(orgId: number): Promise<OrganizationMember | undefined> {
  return db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, orgId),
      eq(organizationMembers.role, 'owner')
    ),
  });
}

// Check if user has specific role or higher
export function hasRoleOrHigher(userRole: OrganizationRole, requiredRole: OrganizationRole): boolean {
  const roleHierarchy: Record<OrganizationRole, number> = {
    owner: 3,
    admin: 2,
    member: 1,
  };
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

// Check if user can manage members (owner or admin)
export function canManageMembers(role: OrganizationRole): boolean {
  return role === 'owner' || role === 'admin';
}

// Check if user can manage billing (owner only)
export function canManageBilling(role: OrganizationRole): boolean {
  return role === 'owner';
}

// Get jobs owned by a user (for content reassignment)
export async function getUserJobsInOrg(userId: number, orgId: number): Promise<number[]> {
  const userJobs = await db.select({ id: jobs.id })
    .from(jobs)
    .where(and(
      eq(jobs.postedBy, userId),
      eq(jobs.organizationId, orgId)
    ));

  return userJobs.map((j: { id: number }) => j.id);
}

// Reassign jobs from one user to another
export async function reassignJobs(
  fromUserId: number,
  toUserId: number,
  orgId: number
): Promise<number> {
  const result = await db.update(jobs)
    .set({ postedBy: toUserId })
    .where(and(
      eq(jobs.postedBy, fromUserId),
      eq(jobs.organizationId, orgId)
    ))
    .returning({ id: jobs.id });

  return result.length;
}

// Get members sorted by activity (for auto-downgrade)
export async function getMembersByActivity(orgId: number): Promise<OrganizationMember[]> {
  return db.query.organizationMembers.findMany({
    where: eq(organizationMembers.organizationId, orgId),
    orderBy: [
      // Owner always first
      sql`CASE WHEN ${organizationMembers.role} = 'owner' THEN 0 ELSE 1 END`,
      // Then by most recent activity
      desc(organizationMembers.lastActivityAt),
      // Then by join date (longer tenure = higher priority)
      organizationMembers.joinedAt,
    ],
  });
}
