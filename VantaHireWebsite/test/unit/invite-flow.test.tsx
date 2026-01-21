import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderWithProviders } from '../utils/test-helpers';
import { screen, waitFor } from '@testing-library/react';
import RecruiterAuth from '@/pages/recruiter-auth';
import OrgChoicePage from '@/pages/org-choice-page';

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
});
