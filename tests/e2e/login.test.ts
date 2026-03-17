import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page before each test and wait for Svelte hydration
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('input[name="email"]', { state: 'visible' });
  });

  test('page loads with email and password fields', async ({ page }) => {
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('Sign In');
  });

  test('submitting valid credentials redirects to main app', async ({ page }) => {
    // Fill in valid credentials
    await page.fill('input[name="email"]', 'admin@local');
    await page.fill('input[type="password"]', 'admin123');
    
    // Submit the form
    await page.click('button[type="submit"]');
    
    // Wait for navigation and check URL
    await expect(page).toHaveURL('/', { timeout: 15000 });
  });

  test('submitting invalid credentials shows error message', async ({ page }) => {
    // Fill in invalid credentials
    await page.fill('input[name="email"]', 'admin@local');
    await page.fill('input[type="password"]', 'wrongpassword');
    
    // Submit the form
    await page.click('button[type="submit"]');
    
    // Check for error message
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[role="alert"]')).toContainText('Invalid email or password');
  });

  test('error message disappears when user starts typing again', async ({ page }) => {
    // Fill in invalid credentials and submit
    await page.fill('input[name="email"]', 'admin@local');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    // Verify error is shown
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10000 });
    
    // Start typing in email field - error should disappear
    await page.fill('input[name="email"]', 'a');
    // Wait for error to disappear
    await expect(page.locator('[role="alert"]')).not.toBeVisible({ timeout: 10000 });
  });
});
