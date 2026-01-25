import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface OnboardingStatus {
  needsOnboarding: boolean;
  currentStep: 'org' | 'profile' | 'plan' | 'complete';
  hasOrganization: boolean;
  profileComplete: boolean;
  creditsLazyInit?: boolean;
}

/**
 * Hook for managing recruiter onboarding status
 */
export function useOnboardingStatus() {
  const queryClient = useQueryClient();

  // Fetch onboarding status
  const {
    data: status,
    isLoading,
    error,
    refetch,
  } = useQuery<OnboardingStatus>({
    queryKey: ["/api/onboarding-status"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/onboarding-status");
      if (!res.ok) {
        throw new Error("Failed to fetch onboarding status");
      }
      return await res.json();
    },
    staleTime: 30_000, // Cache for 30 seconds
  });

  // Mark onboarding as complete
  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/onboarding/complete");
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to complete onboarding");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.setQueryData<OnboardingStatus>(["/api/onboarding-status"], (old) => {
        if (!old) return old;
        return {
          ...old,
          needsOnboarding: false,
          currentStep: 'complete',
        };
      });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding-status"] });
    },
  });

  // Skip profile step (user acknowledged warning)
  const skipProfileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/onboarding/skip-profile");
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to skip profile step");
      }
      return await res.json();
    },
  });

  return {
    // Data
    status,
    isLoading,
    error,

    // Computed
    needsOnboarding: status?.needsOnboarding ?? false,
    currentStep: status?.currentStep ?? 'complete',
    hasOrganization: status?.hasOrganization ?? false,
    profileComplete: status?.profileComplete ?? false,
    creditsLazyInit: status?.creditsLazyInit ?? false,

    // Actions (fire-and-forget)
    completeOnboarding: completeMutation.mutate,
    skipProfile: skipProfileMutation.mutate,
    refetch,

    // Async actions (return promises)
    completeOnboardingAsync: completeMutation.mutateAsync,
    skipProfileAsync: skipProfileMutation.mutateAsync,

    // Loading states
    isCompleting: completeMutation.isPending,
    isSkippingProfile: skipProfileMutation.isPending,
  };
}
