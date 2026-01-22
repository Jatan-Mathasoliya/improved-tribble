import { test, expect, type Page } from '@playwright/test';
import { TEST_USERS } from './helpers';

/**
 * E2E Tests: Recruiter Onboarding Flow
 *
 * Tests the onboarding wizard for recruiters without route mocking.
 * These tests are state-aware and skip when the recruiter is already onboarded.
 */

const ONBOARDING_STEPS = ['org', 'profile', 'plan'] as const;
type OnboardingStep = typeof ONBOARDING_STEPS[number];
const RUN_UI_TESTS = process.env.PW_UI_TESTS === 'true';

async function loginRecruiter(page: Page): Promise<boolean> {
  const recruiter = TEST_USERS.recruiter;
  if (!recruiter) return false;

  const response = await page.request.post('/api/login', {
    data: {
      username: recruiter.username,
      password: recruiter.password,
    },
  });

  return response.ok();
}

async function getOnboardingStatus(page: Page) {
  const response = await page.request.get('/api/onboarding-status');
  if (!response.ok()) {
    throw new Error(`Unexpected onboarding status response: ${response.status()}`);
  }
  return response.json();
}

test.describe('Recruiter Onboarding Flow', () => {
  test.describe.configure({ mode: 'serial' });

  test.describe('Onboarding Status API', () => {
    test('GET /api/onboarding-status returns 401 for unauthenticated requests', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      const response = await page.request.get('/api/onboarding-status');
      expect(response.status()).toBe(401);

      await context.close();
    });

    test('GET /api/onboarding-status returns valid status for authenticated recruiter', async ({ page }) => {
      if (!(await loginRecruiter(page))) {
        test.skip(true, 'Test recruiter user not available or not verified');
        return;
      }

      const status = await getOnboardingStatus(page);
      expect(status).toHaveProperty('needsOnboarding');
      expect(status).toHaveProperty('currentStep');
      expect(status).toHaveProperty('hasOrganization');
      expect(status).toHaveProperty('profileComplete');
    });
  });

  test.describe('Onboarding UI', () => {
    test.skip(!RUN_UI_TESTS, 'UI tests disabled; set PW_UI_TESTS=true to enable.');

    test('recruiter can access onboarding page', async ({ page }) => {
      if (!(await loginRecruiter(page))) {
        test.skip(true, 'Test recruiter user not available or not verified');
        return;
      }

      await page.goto('/onboarding');
      await page.waitForLoadState('networkidle');

      const url = page.url();
      const isOnOnboarding = url.includes('onboarding');
      const isOnDashboard = url.includes('recruiter-dashboard');
      expect(isOnOnboarding || isOnDashboard).toBeTruthy();
    });

    test('onboarding page renders core UI when onboarding is needed', async ({ page }) => {
      if (!(await loginRecruiter(page))) {
        test.skip(true, 'Test recruiter user not available or not verified');
        return;
      }

      const status = await getOnboardingStatus(page);
      if (!status.needsOnboarding) {
        test.skip(true, 'Recruiter has already completed onboarding');
        return;
      }

      await page.goto('/onboarding');
      await page.waitForLoadState('networkidle');

      if (page.url().includes('recruiter-dashboard')) {
        test.skip(true, 'Recruiter redirected to dashboard');
        return;
      }

      const hasWelcomeHeading = await page.getByRole('heading', { name: /welcome to vantahire/i })
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      const hasProgressLabels =
        await page.getByText('Organization').isVisible({ timeout: 3000 }).catch(() => false) &&
        await page.getByText('Profile').isVisible({ timeout: 3000 }).catch(() => false) &&
        await page.getByText('Plan').isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasWelcomeHeading || hasProgressLabels).toBeTruthy();
    });
  });

  test.describe('URL Step Protection', () => {
    test.skip(!RUN_UI_TESTS, 'UI tests disabled; set PW_UI_TESTS=true to enable.');

    test('URL step parameter does not allow skipping ahead', async ({ page }) => {
      if (!(await loginRecruiter(page))) {
        test.skip(true, 'Test recruiter user not available or not verified');
        return;
      }

      const status = await getOnboardingStatus(page);
      if (!status.needsOnboarding) {
        test.skip(true, 'Recruiter has already completed onboarding');
        return;
      }

      const serverStep = status.currentStep as OnboardingStep;
      const serverIndex = ONBOARDING_STEPS.indexOf(serverStep);
      if (serverIndex < 0 || serverIndex >= ONBOARDING_STEPS.length - 1) {
        test.skip(true, 'No later step to test against');
        return;
      }

      const bypassStep = ONBOARDING_STEPS[serverIndex + 1];
      await page.goto(`/onboarding?step=${bypassStep}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      const url = page.url();
      expect(url.includes(`step=${serverStep}`) || url.includes('recruiter-dashboard')).toBeTruthy();
    });
  });

  test.describe('Skip Profile Flow', () => {
    test.skip(!RUN_UI_TESTS, 'UI tests disabled; set PW_UI_TESTS=true to enable.');

    test('skipping profile advances to plan and persists state', async ({ page }) => {
      if (!(await loginRecruiter(page))) {
        test.skip(true, 'Test recruiter user not available or not verified');
        return;
      }

      const status = await getOnboardingStatus(page);
      if (!status.needsOnboarding || status.currentStep !== 'profile') {
        test.skip(true, 'Recruiter is not on profile step');
        return;
      }

      await page.goto('/onboarding?step=profile');
      await page.waitForLoadState('networkidle');

      const skipButton = page.getByRole('button', { name: /skip for now/i });
      await skipButton.waitFor({ state: 'visible', timeout: 5000 });
      await skipButton.click();

      const warningDialog = page.locator('[role="dialog"]');
      await warningDialog.waitFor({ state: 'visible', timeout: 3000 });

      const confirmButton = page.getByRole('button', { name: /skip for now/i }).last();
      const skipResponsePromise = page.waitForResponse((resp) =>
        resp.url().includes('/api/onboarding/skip-profile') && resp.status() === 200
      );
      await confirmButton.click();
      await skipResponsePromise;

      const updatedStatus = await getOnboardingStatus(page);
      expect(['plan', 'complete']).toContain(updatedStatus.currentStep);

      const url = page.url();
      expect(url.includes('step=plan') || url.includes('recruiter-dashboard')).toBeTruthy();
    });
  });

  test.describe('Endpoint Authentication', () => {
    test('POST /api/onboarding/complete rejects unauthenticated requests', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      const response = await page.request.post('/api/onboarding/complete');
      // 401 (auth) or 403 (CSRF) - both indicate rejection
      expect([401, 403]).toContain(response.status());

      await context.close();
    });

    test('POST /api/onboarding/skip-profile rejects unauthenticated requests', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      const response = await page.request.post('/api/onboarding/skip-profile');
      // 401 (auth) or 403 (CSRF) - both indicate rejection
      expect([401, 403]).toContain(response.status());

      await context.close();
    });
  });
});
