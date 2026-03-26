import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import HiringManagerDashboard from '@/pages/hiring-manager-dashboard';
import { renderWithProviders } from '../utils/test-helpers';

const authState = {
  user: {
    id: 4544,
    role: 'hiring_manager',
    username: 'hm-user',
    firstName: 'Hannah',
  } as any,
};

const setLocationMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => authState,
}));

vi.mock('wouter', () => ({
  Redirect: ({ to }: { to: string }) => <div data-testid="redirect" data-to={to} />,
  useLocation: () => ['/hiring-manager', setLocationMock],
}));

vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));

vi.mock('@/components/ProfileCompletionBanner', () => ({
  ProfileCompletionBanner: () => <div data-testid="profile-banner" />,
}));

describe('HiringManagerDashboard review routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = {
      id: 4544,
      role: 'hiring_manager',
      username: 'hm-user',
      firstName: 'Hannah',
    } as any;

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/hiring-manager/jobs') {
        return {
          ok: true,
          json: async () => [
            {
              id: 77,
              title: 'Senior Backend Engineer',
              location: 'Remote',
              type: 'full-time',
              hiringManagerId: 4544,
              isActive: true,
            },
            {
              id: 88,
              title: 'Other Team Role',
              location: 'Bengaluru',
              type: 'contract',
              hiringManagerId: 9999,
              isActive: true,
            },
          ],
        };
      }

      if (url === '/api/hiring-manager/jobs/77/applications') {
        return {
          ok: true,
          json: async () => [
            {
              id: 501,
              name: 'Neha Gupta',
              email: 'neha@example.com',
              appliedAt: '2026-03-25T10:00:00.000Z',
              currentStage: 3,
              jobId: 77,
              hmFeedbackCount: 0,
            },
          ],
        };
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);
  });

  it('routes both dashboard review actions to the dedicated hiring manager review page', async () => {
    const user = userEvent.setup();

    renderWithProviders(<HiringManagerDashboard />);

    await screen.findByText('Senior Backend Engineer');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/hiring-manager/jobs');
      expect(fetchMock).toHaveBeenCalledWith('/api/hiring-manager/jobs/77/applications');
    });

    await user.click(screen.getByRole('button', { name: /view candidates/i }));
    expect(setLocationMock).toHaveBeenCalledWith('/hiring-manager/jobs/77/review');

    await user.click(screen.getByRole('button', { name: /^review$/i }));
    expect(setLocationMock).toHaveBeenLastCalledWith('/hiring-manager/jobs/77/review');
  });
});
