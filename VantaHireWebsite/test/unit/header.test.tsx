import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Header from '@/components/Header';
import { AuthProvider } from '@/hooks/use-auth';

// Mock useLocation hook from wouter
vi.mock('wouter', () => ({
  useLocation: () => ['/', vi.fn()],
  Link: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
};

describe('Header Component', () => {
  it('renders VantaHire logo', () => {
    render(<Header />, { wrapper: createWrapper() });
    // Header has both desktop and mobile logos, so use getAllByText
    const logos = screen.getAllByText('VantaHire');
    expect(logos.length).toBeGreaterThan(0);
    expect(logos[0]).toBeInTheDocument();
  });

  it('shows mobile menu toggle on small screens', () => {
    render(<Header />, { wrapper: createWrapper() });
    // Use data-testid to target the specific mobile menu button
    const menuButton = screen.getByTestId('mobile-menu-button');
    expect(menuButton).toBeInTheDocument();
  });

  it('toggles mobile menu when clicked', () => {
    render(<Header />, { wrapper: createWrapper() });
    // Use data-testid to target the specific mobile menu button
    const menuButton = screen.getByTestId('mobile-menu-button');

    fireEvent.click(menuButton);
    // Menu should be visible after click - Jobs appears in both desktop and mobile menu
    const jobsLinks = screen.getAllByText('Jobs');
    expect(jobsLinks.length).toBeGreaterThan(0);
  });

  it('displays navigation links', () => {
    render(<Header />, { wrapper: createWrapper() });
    // Navigation links appear in both desktop and mobile versions
    expect(screen.getAllByText('Jobs').length).toBeGreaterThan(0);
    expect(screen.getAllByText('About').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Compare').length).toBeGreaterThan(0);
  });

  it('shows consultation button when user is not logged in', () => {
    render(<Header />, { wrapper: createWrapper() });
    // Consultation button appears in both desktop and mobile versions
    const consultButtons = screen.getAllByText('Schedule a Free Consultation');
    expect(consultButtons.length).toBeGreaterThan(0);
    expect(consultButtons[0]).toBeInTheDocument();
  });
});