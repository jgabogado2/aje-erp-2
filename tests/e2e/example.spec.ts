import { test, expect } from '@playwright/test';

// Smoke test — no auth required. Confirms the app boots and the unauthenticated
// experience redirects to sign-in. This is the seed for the five real flows
// described in tests/e2e/README.md (5a.3); it runs only when a server is
// available at PLAYWRIGHT_BASE_URL.
test('unauthenticated visit redirects to /signin', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/signin/);
});
