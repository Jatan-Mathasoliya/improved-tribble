import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProtectedRoute } from '@/lib/protected-route';

const authState = {
  user: null as null | { role: string },
  isLoading: false,
};

let currentLocation = '/recruiter-dashboard';

const onboardingState = {
  status: undefined as any,
  isLoading: false,
  error: null as any,
};

const organizationState = {
  data: undefined as any,
  isLoading: false,
};

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/use-onboarding-status', () => ({
  useOnboardingStatus: () => onboardingState,
}));

vi.mock('@/hooks/use-organization', () => ({
  useOrganization: () => organizationState,
}));

vi.mock('wouter', () => ({
  Route: ({ children }: { children: React.ReactNode }) => <div data-testid="route">{children}</div>,
  Redirect: ({ to }: { to: string }) => <div data-testid="redirect" data-to={to} />,
  useLocation: () => [currentLocation, vi.fn()],
}));

const ProtectedContent = () => <div data-testid="protected-content">Protected</div>;

describe('ProtectedRoute onboarding gate', () => {
  beforeEach(() => {
    authState.user = null;
    authState.isLoading = false;
    currentLocation = '/recruiter-dashboard';
    onboardingState.status = undefined;
    onboardingState.isLoading = false;
    onboardingState.error = null;
    organizationState.data = undefined;
    organizationState.isLoading = false;
  });

  it('redirects unauthenticated recruiter users to /auth with the original destination', () => {
    render(
      <ProtectedRoute
        path="/recruiter-dashboard"
        component={ProtectedContent}
        requiredRole={['recruiter']}
      />
    );

    const redirect = screen.getByTestId('redirect');
    expect(redirect.getAttribute('data-to')).toBe('/auth?redirect=%2Frecruiter-dashboard');
  });

  it('redirects unauthenticated candidate users to /candidate-auth with the original destination', () => {
    currentLocation = '/my-dashboard';

    render(
      <ProtectedRoute
        path="/my-dashboard"
        component={ProtectedContent}
        requiredRole={['candidate']}
      />
    );

    const redirect = screen.getByTestId('redirect');
    expect(redirect.getAttribute('data-to')).toBe('/candidate-auth?redirect=%2Fmy-dashboard');
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

  it('redirects unauthenticated hiring managers to /auth with the review destination preserved', () => {
    currentLocation = '/hiring-manager/jobs/12/review';

    render(
      <ProtectedRoute
        path="/hiring-manager/jobs/:id/review"
        component={ProtectedContent}
        requiredRole={['hiring_manager']}
      />
    );

    const redirect = screen.getByTestId('redirect');
    expect(redirect.getAttribute('data-to')).toBe('/auth?redirect=%2Fhiring-manager%2Fjobs%2F12%2Freview');
  });

  it('renders the hiring manager review route for hiring managers', () => {
    authState.user = { role: 'hiring_manager' };
    currentLocation = '/hiring-manager/jobs/12/review';

    render(
      <ProtectedRoute
        path="/hiring-manager/jobs/:id/review"
        component={ProtectedContent}
        requiredRole={['hiring_manager']}
      />
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });

  it('denies recruiters access to the hiring manager review route', () => {
    authState.user = { role: 'recruiter' };
    currentLocation = '/hiring-manager/jobs/12/review';

    render(
      <ProtectedRoute
        path="/hiring-manager/jobs/:id/review"
        component={ProtectedContent}
        requiredRole={['hiring_manager']}
      />
    );

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });
});
