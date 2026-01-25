import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderWithProviders } from '../utils/test-helpers';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import RecruiterAuth from '@/pages/recruiter-auth';
import OrgChoicePage from '@/pages/org-choice-page';
import VerifyEmailPage from '@/pages/verify-email-page';

const authState = {
  user: null as null | { role: string },
};

const orgState = {
  data: null as any,
  isLoading: false,
};

const createOrgState = {
  mutateAsync: async () => ({}),
  isPending: false,
};

const toastState = {
  toast: () => undefined,
};

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: authState.user,
    loginMutation: { mutateAsync: async () => ({}) },
    registerMutation: { mutateAsync: async () => ({}) },
  }),
}));

vi.mock('@/hooks/use-organization', () => ({
  useOrganization: () => orgState,
  useCreateOrganization: () => createOrgState,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => toastState,
}));

vi.mock('@/components/Header', () => ({
  default: () => <div data-testid="header" />,
}));

vi.mock('@/components/Footer', () => ({
  default: () => <div data-testid="footer" />,
}));

vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Invite flow redirects', () => {
  beforeEach(() => {
    authState.user = null;
    orgState.data = null;
    orgState.isLoading = false;
  });

  it('redirects recruiter with invite token to org choice', async () => {
    authState.user = { role: 'recruiter' };
    const location = memoryLocation({
      path: '/recruiter-auth',
      searchPath: 'invite=testtoken123',
      record: true,
    });

    renderWithProviders(
      <Router hook={location.hook} searchHook={location.searchHook}>
        <RecruiterAuth />
      </Router>
    );

    await waitFor(() => {
      const last = location.history?.[location.history.length - 1];
      expect(last).toBe('/org/choice?invite=testtoken123');
    });
  });

  it('prefills invite code on org choice page', async () => {
    const location = memoryLocation({
      path: '/org/choice',
      searchPath: 'invite=prefilltoken',
      record: true,
    });

    renderWithProviders(
      <Router hook={location.hook} searchHook={location.searchHook}>
        <OrgChoicePage />
      </Router>
    );

    const input = await screen.findByLabelText(/Invite Code/i);
    expect((input as HTMLInputElement).value).toBe('prefilltoken');
  });

  it('disables join when invite code is not 64 characters', async () => {
    const location = memoryLocation({
      path: '/org/choice',
      record: true,
    });

    renderWithProviders(
      <Router hook={location.hook} searchHook={location.searchHook}>
        <OrgChoicePage />
      </Router>
    );

    fireEvent.click(screen.getByText('Join Organization'));

    const input = await screen.findByLabelText(/Invite Code/i);
    fireEvent.change(input, { target: { value: 'short-token' } });

    const joinButton = await screen.findByRole('button', { name: 'Join Organization' });
    expect(joinButton).toBeDisabled();
    expect(screen.getByText(/\/64 characters/)).toBeInTheDocument();
  });

  it('enables join when preview fails and user chooses try anyway', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Invalid invite' }),
    }));

    const location = memoryLocation({
      path: '/org/choice',
      record: true,
    });

    renderWithProviders(
      <Router hook={location.hook} searchHook={location.searchHook}>
        <OrgChoicePage />
      </Router>
    );

    fireEvent.click(screen.getByText('Join Organization'));

    const input = await screen.findByLabelText(/Invite Code/i);
    fireEvent.change(input, { target: { value: 'a'.repeat(64) } });

    await screen.findByText(/Invalid invite/i);

    const joinButton = await screen.findByRole('button', { name: 'Join Organization' });
    expect(joinButton).toBeDisabled();

    fireEvent.click(screen.getByText(/Try anyway/i));
    expect(joinButton).toBeEnabled();
  });
});

describe('Verification invite token preservation', () => {
  it('includes invite param in verify-email redirect link', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ verified: true, message: 'ok' }),
    }));

    const location = memoryLocation({
      path: '/verify-email/test-token',
      searchPath: 'invite=invitetoken123',
      record: true,
    });

    renderWithProviders(
      <Router hook={location.hook} searchHook={location.searchHook}>
        <VerifyEmailPage />
      </Router>
    );

    const link = await screen.findByRole('link', { name: /Continue to Login/i });
    expect(link.getAttribute('href')).toBe('/recruiter-auth?invite=invitetoken123');
  });
});
