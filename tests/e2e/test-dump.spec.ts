import { test } from '@playwright/test';
test.use({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
test('dump', async ({ page }) => {
  page.on('request', request => console.log('>>', request.method(), request.url()));
  page.on('response', response => console.log('<<', response.status(), response.url()));
  await page.goto('/');
  if (page.url().includes('/login')) {
      await page.fill('input[name="email"]', 'admin@local');
      await page.fill('input[name="password"]', 'admin123');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/');
  }
  await page.click('button:has-text("New Conversation")');
  await page.waitForTimeout(1000);
});
