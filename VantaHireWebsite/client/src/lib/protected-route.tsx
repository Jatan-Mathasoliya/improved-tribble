import { useAuth } from "@/hooks/use-auth";
import { useOnboardingStatus } from "@/hooks/use-onboarding-status";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";
import { ComponentType, LazyExoticComponent } from "react";

type LazyComponent = LazyExoticComponent<ComponentType<object>>;

// Paths that don't require onboarding completion for recruiters
const ONBOARDING_EXEMPT_PATHS = [
  '/onboarding',
  '/org/choice',
  '/blocked/',
];

function isOnboardingExempt(path: string): boolean {
  return ONBOARDING_EXEMPT_PATHS.some(exempt => path.startsWith(exempt));
}

export function ProtectedRoute({
  path,
  component: Component,
  requiredRole,
}: {
  path: string;
  component: ComponentType<object> | LazyComponent;
  requiredRole?: string[];
}) {
  const { user, isLoading } = useAuth();

  // Only check onboarding for recruiters on non-exempt paths
  const shouldCheckOnboarding =
    user?.role === 'recruiter' &&
    !isOnboardingExempt(path);

  // Pass enabled to avoid unnecessary API calls for non-recruiters
  const {
    status: onboardingStatus,
    isLoading: onboardingLoading,
    error: onboardingError,
  } = useOnboardingStatus({ enabled: shouldCheckOnboarding });

  // Combined loading state
  const isFullyLoading = isLoading || (shouldCheckOnboarding && onboardingLoading);

  if (isFullyLoading) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      </Route>
    );
  }

  if (!user) {
    // Redirect to appropriate auth page based on required role
    const authPath = requiredRole?.includes('candidate') ? '/candidate-auth' : '/auth';
    return (
      <Route path={path}>
        <Redirect to={authPath} />
      </Route>
    );
  }

  if (requiredRole && !requiredRole.includes(user.role)) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to access this page.</p>
          </div>
        </div>
      </Route>
    );
  }

  // Fail-closed: if onboarding check was required but failed/errored, redirect to onboarding
  // The onboarding page will re-check status and redirect if already complete
  if (shouldCheckOnboarding && (onboardingError || !onboardingStatus)) {
    return (
      <Route path={path}>
        <Redirect to="/onboarding" />
      </Route>
    );
  }

  // Onboarding gate for recruiters: redirect to onboarding if needed
  if (shouldCheckOnboarding && onboardingStatus?.needsOnboarding) {
    const step = onboardingStatus.currentStep || 'org';
    return (
      <Route path={path}>
        <Redirect to={`/onboarding?step=${step}`} />
      </Route>
    );
  }

  return <Route path={path}><Component /></Route>;
}