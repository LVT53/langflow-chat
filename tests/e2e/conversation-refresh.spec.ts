import { test, expect, type Page } from '@playwright/test';
import { login, createConversation, ensureSidebarExpanded } from './helpers';

/**
 * Trigger visibilitychange event to simulate tab becoming visible
 */
async function triggerVisibilityChange(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/**
 * Trigger window focus event
 */
async function triggerWindowFocus(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
  });
}

/**
 * Get the count of conversations in the sidebar
 */
async function getConversationCount(page: Page): Promise<number> {
  return page.getByTestId('conversation-item').count();
}

test.describe('Conversation list refresh on tab/window focus', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('refreshes conversation list when tab becomes visible', async ({ page, context }) => {
    // Create initial conversation
    const conversationId = await createConversation(page, 'Initial conversation for refresh test');
    await ensureSidebarExpanded(page);

    // Get initial count
    const initialCount = await getConversationCount(page);
    expect(initialCount).toBeGreaterThanOrEqual(1);

    // Create a second conversation in a different browser context
    const page2 = await context.newPage();
    await login(page2);
    await createConversation(page2, 'Second conversation from another context');

    // Trigger visibility change on first page
    await triggerVisibilityChange(page);

    // Wait for refresh (debounce is 2 seconds, but we wait a bit more for the API)
    await page.waitForTimeout(2500);

    // Verify conversation count increased
    const newCount = await getConversationCount(page);
    expect(newCount).toBeGreaterThan(initialCount);

    await page2.close();
  });

  test('refreshes conversation list on window focus', async ({ page, context }) => {
    // Create initial conversation
    const conversationId = await createConversation(page, 'Initial conversation for focus test');
    await ensureSidebarExpanded(page);

    // Get initial count
    const initialCount = await getConversationCount(page);
    expect(initialCount).toBeGreaterThanOrEqual(1);

    // Create a second conversation in a different browser context
    const page2 = await context.newPage();
    await login(page2);
    await createConversation(page2, 'Second conversation from focus context');

    // Trigger window focus on first page
    await triggerWindowFocus(page);

    // Wait for refresh
    await page.waitForTimeout(2500);

    // Verify conversation count increased
    const newCount = await getConversationCount(page);
    expect(newCount).toBeGreaterThan(initialCount);

    await page2.close();
  });

  test('debounce prevents refresh more than once per 2 seconds', async ({ page }) => {
    // Create initial conversation
    await createConversation(page, 'Debounce test conversation');
    await ensureSidebarExpanded(page);

    // Track API calls
    let apiCallCount = 0;
    await page.route('**/api/conversations', async (route) => {
      apiCallCount++;
      await route.continue();
    });

    // Trigger multiple visibility changes rapidly
    await triggerVisibilityChange(page);
    await triggerVisibilityChange(page);
    await triggerVisibilityChange(page);

    // Wait a bit
    await page.waitForTimeout(500);

    // Should only have made 1 API call due to debounce
    expect(apiCallCount).toBeLessThanOrEqual(1);
  });

  test('preserves existing list on fetch failure', async ({ page }) => {
    // Create initial conversation
    await createConversation(page, 'Failure preservation test');
    await ensureSidebarExpanded(page);

    // Get initial count and conversation titles
    const initialCount = await getConversationCount(page);
    expect(initialCount).toBeGreaterThanOrEqual(1);

    // Intercept API to return error
    await page.route('**/api/conversations', async (route) => {
      await route.fulfill({
        status: 500,
        body: 'Internal Server Error',
      });
    });

    // Trigger refresh
    await triggerVisibilityChange(page);
    await page.waitForTimeout(1000);

    // Verify conversation count is preserved (not cleared)
    const countAfterError = await getConversationCount(page);
    expect(countAfterError).toBe(initialCount);
  });

  test('redirects to landing when current conversation is deleted from another device', async ({ page, context }) => {
    // Create a conversation
    const conversationId = await createConversation(page, 'Conversation to be deleted');
    await ensureSidebarExpanded(page);

    // Verify we're on the chat page
    await expect(page).toHaveURL(/\/chat\//);

    // Delete the conversation from another context
    const page2 = await context.newPage();
    await login(page2);
    await page2.goto('/');
    await ensureSidebarExpanded(page2);

    // Find and delete the conversation
    const conversationItem = page2.locator(`[data-conversation-id="${conversationId}"]`);
    if (await conversationItem.isVisible().catch(() => false)) {
      await conversationItem.hover();
      await conversationItem.getByRole('button', { name: 'Conversation options' }).click();
      await page2.getByTestId('delete-option').click();
      await page2.getByTestId('confirm-delete').click();
    }

    // Trigger refresh on first page
    await triggerVisibilityChange(page);
    await page.waitForTimeout(2500);

    // Verify redirected to landing page
    await expect(page).toHaveURL('/', { timeout: 10000 });

    await page2.close();
  });

  test('preserves sidebar scroll position during refresh', async ({ page }) => {
    // Create multiple conversations to ensure scrollable sidebar
    for (let i = 0; i < 5; i++) {
      await createConversation(page, `Scroll test conversation ${i}`);
    }
    await ensureSidebarExpanded(page);

    // Get the sidebar scroll container
    const sidebar = page.locator('.sidebar-scroll-container, [data-testid="sidebar"] .overflow-y-auto').first();

    // Scroll down
    await sidebar.evaluate((el) => {
      el.scrollTop = 100;
      return el.scrollTop;
    });

    const scrollPositionBefore = await sidebar.evaluate((el) => el.scrollTop);
    expect(scrollPositionBefore).toBe(100);

    // Trigger refresh
    await triggerVisibilityChange(page);
    await page.waitForTimeout(2500);

    // Verify scroll position is preserved
    const scrollPositionAfter = await sidebar.evaluate((el) => el.scrollTop);
    expect(scrollPositionAfter).toBe(scrollPositionBefore);
  });
});
