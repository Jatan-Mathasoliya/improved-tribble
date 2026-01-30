import { useOrganization } from "./use-organization";

export interface SeatStatus {
  isSeated: boolean;
  isInOrg: boolean;
  role: 'owner' | 'admin' | 'member' | null;
  organizationName: string | null;
}

/**
 * Hook to check if the current user has an assigned seat in their organization.
 * Used to gate access to app features for unseated members.
 */
export function useSeatStatus(): SeatStatus & { isLoading: boolean; error: Error | null } {
  const { data, isLoading, error } = useOrganization();

  if (isLoading) {
    return {
      isSeated: false,
      isInOrg: false,
      role: null,
      organizationName: null,
      isLoading: true,
      error: null,
    };
  }

  if (error) {
    return {
      isSeated: false,
      isInOrg: false,
      role: null,
      organizationName: null,
      isLoading: false,
      error: error as Error,
    };
  }

  if (!data) {
    // User is not in any organization
    return {
      isSeated: false,
      isInOrg: false,
      role: null,
      organizationName: null,
      isLoading: false,
      error: null,
    };
  }

  return {
    isSeated: data.membership.seatAssigned,
    isInOrg: true,
    role: data.membership.role,
    organizationName: data.organization.name,
    isLoading: false,
    error: null,
  };
}

/**
 * Returns true if the user should be blocked from the app (in org but no seat)
 */
export function useIsBlocked(): boolean {
  const { isInOrg, isSeated, isLoading } = useSeatStatus();

  if (isLoading) return false;

  // Blocked if in org but seat not assigned
  return isInOrg && !isSeated;
}
