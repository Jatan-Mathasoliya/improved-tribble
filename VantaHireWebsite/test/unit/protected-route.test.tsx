import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProtectedRoute } from '@/lib/protected-route';

const authState = {
  user: null as null | { role: string },
  isLoading: false,
};

const onboardingState = {
  status: undefined as any,
  isLoading: false,
  error: null as any,
};

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/use-onboarding-status', () => ({
  useOnboardingStatus: () => onboardingState,
}));

vi.mock('wouter', () => ({
  Route: ({ children }: { children: React.ReactNode }) => <div data-testid="route">{children}</div>,
  Redirect: ({ to }: { to: string }) => <div data-testid="redirect" data-to={to} />,
}));

const ProtectedContent = () => <div data-testid="protected-content">Protected</div>;

describe('ProtectedRoute onboarding gate', () => {
  beforeEach(() => {
    authState.user = null;
    authState.isLoading = false;
    onboardingState.status = undefined;
    onboardingState.isLoading = false;
    onboardingState.error = null;
  });

  it('redirects unauthenticated users to /auth', () => {
    render(
      <ProtectedRoute
        path="/recruiter-dashboard"
        component={ProtectedContent}
        requiredRole={['recruiter']}
      />
    );

    const redirect = screen.getByTestId('redirect');
    expect(redirect.getAttribute('data-to')).toBe('/auth');
  });

  it('redirects recruiters who need onboarding to the current step', () => {
    authState.user = { role: 'recruiter' };
    onboardingState.status = { needsOnboarding: true, currentStep: 'profile' };

    render(
      <ProtectedRoute
        path="/recruiter-dashboard"
        component={ProtectedContent}
        requiredRole={['recruiter']}
      />
    );

    const redirect = screen.getByTestId('redirect');
    expect(redirect.getAttribute('data-to')).toBe('/onboarding?step=profile');
  });

  it('fails closed when onboarding status check errors', () => {
    authState.user = { role: 'recruiter' };
    onboardingState.error = new Error('status failed');

    render(
      <ProtectedRoute
        path="/recruiter-dashboard"
        component={ProtectedContent}
        requiredRole={['recruiter']}
      />
    );

    const redirect = screen.getByTestId('redirect');
    expect(redirect.getAttribute('data-to')).toBe('/onboarding');
  });

  it('renders the protected component when onboarding is complete', () => {
    authState.user = { role: 'recruiter' };
    onboardingState.status = { needsOnboarding: false, currentStep: 'complete' };

    render(
      <ProtectedRoute
        path="/recruiter-dashboard"
        component={ProtectedContent}
        requiredRole={['recruiter']}
      />
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });

  it('allows exempt onboarding path without redirect', () => {
    authState.user = { role: 'recruiter' };
    onboardingState.status = { needsOnboarding: true, currentStep: 'org' };

    render(
      <ProtectedRoute
        path="/onboarding"
        component={ProtectedContent}
        requiredRole={['recruiter']}
      />
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });

  it('allows blocked path without redirect', () => {
    authState.user = { role: 'recruiter' };
    onboardingState.status = { needsOnboarding: true, currentStep: 'org' };

    render(
      <ProtectedRoute
        path="/blocked/seat-removed"
        component={ProtectedContent}
        requiredRole={['recruiter']}
      />
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });

  it('shows access denied for role mismatch', () => {
    authState.user = { role: 'candidate' };

    render(
      <ProtectedRoute
        path="/recruiter-dashboard"
        component={ProtectedContent}
        requiredRole={['recruiter']}
      />
    );

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });
});
