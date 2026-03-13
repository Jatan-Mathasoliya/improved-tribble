import { renderToString } from 'react-dom/server';
import { Router, Switch, Route } from 'wouter';
import { HelmetProvider } from 'react-helmet-async';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { AuthContext } from './hooks/use-auth';
import { TooltipProvider } from '@/components/ui/tooltip';

// Eagerly import public page components (no lazy() for SSR)
import Home from './pages/Home';
import ProductPage from './pages/product-page';
import FeaturesPage from './pages/features-page';
import PricingPage from './pages/pricing-page';
import ComparePage from './pages/compare-page';
import UseCasesPage from './pages/use-cases-page';
import AboutPage from './pages/about-page';
import JobsPage from './pages/jobs-page';
import JobDetailsPage from './pages/job-details-page';
import RecruitersDirectoryPage from './pages/recruiters-directory-page';
import RecruiterProfilePage from './pages/recruiter-profile-page';

// Null auth context for SSR — public pages always render unauthenticated view
const nullAuthContext = {
  user: null,
  isLoading: false,
  error: null,
  loginMutation: {} as any,
  logoutMutation: {} as any,
  registerMutation: {} as any,
};

/**
 * Server-side render a public page.
 *
 * @param url     The request path (e.g. "/product", "/jobs/senior-engineer")
 * @param initialData  Optional pre-fetched data keyed by JSON-stringified query keys.
 *                     Example: { '[\"/api/jobs\",\"senior-engineer\"]': jobObject }
 * @returns { html, helmetContext } — rendered HTML string and helmet metadata
 */
export function render(
  url: string,
  initialData?: Record<string, unknown>,
): { html: string; helmetContext: { helmet?: any } } {
  const helmetContext: { helmet?: any } = {};

  // Fresh QueryClient per request to avoid cross-request data leaks
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
      },
    },
  });

  // Pre-populate query cache with server-fetched data
  if (initialData) {
    for (const [key, data] of Object.entries(initialData)) {
      queryClient.setQueryData(JSON.parse(key), data);
    }
  }

  try {
    const html = renderToString(
      <HelmetProvider context={helmetContext}>
        <QueryClientProvider client={queryClient}>
          <AuthContext.Provider value={nullAuthContext}>
            <TooltipProvider>
              <Router ssrPath={url}>
                <Switch>
                  <Route path="/" component={Home} />
                  <Route path="/product" component={ProductPage} />
                  <Route path="/features" component={FeaturesPage} />
                  <Route path="/pricing" component={PricingPage} />
                  <Route path="/compare" component={ComparePage} />
                  <Route path="/use-cases" component={UseCasesPage} />
                  <Route path="/about" component={AboutPage} />
                  <Route path="/jobs" component={JobsPage} />
                  <Route path="/jobs/:id" component={JobDetailsPage} />
                  <Route path="/recruiters" component={RecruitersDirectoryPage} />
                  <Route path="/recruiters/:id" component={RecruiterProfilePage} />
                </Switch>
              </Router>
            </TooltipProvider>
          </AuthContext.Provider>
        </QueryClientProvider>
      </HelmetProvider>,
    );

    return { html, helmetContext };
  } catch (error) {
    console.error('[SSR] Render error for', url, ':', error);
    return { html: '', helmetContext: {} };
  }
}
