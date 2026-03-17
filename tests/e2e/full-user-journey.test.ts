import { test, expect } from '@playwright/test';
import { login, createConversation } from './helpers';

const MOCK_RESPONSE = 'This is a mock response from the AI.';

function mockStreamRoute(page: import('@playwright/test').Page) {
  return page.route('**/api/chat/stream', async (route) => {
    const words = MOCK_RESPONSE.split(' ');
    const chunks = words.map((w, i) =>
      `event: token\ndata: ${JSON.stringify({ text: w + (i < words.length - 1 ? ' ' : '') })}\n\n`
    );
    chunks.push('event: end\ndata: {}\n\n');
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: chunks.join(''),
    });
  });
}

test.describe('Full User Journey', () => {
  test('user can login with valid credentials', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('new-conversation')).toBeVisible({ timeout: 10000 });
  });

  test('user can create a new conversation', async ({ page }) => {
    await login(page);
    await createConversation(page);
    await expect(page).toHaveURL(/\/chat\//);
    await expect(page.getByTestId('message-input')).toBeVisible();
  });

  test('user can send a message and receive a response', async ({ page }) => {
    await login(page);
    await mockStreamRoute(page);
    await createConversation(page);
    await page.getByTestId('message-input').fill('Hello AI!');
    await page.getByTestId('send-button').click();
    await expect(page.getByTestId('user-message').first()).toContainText('Hello AI!', { timeout: 10000 });
    await expect(page.getByTestId('assistant-message').first()).toContainText(MOCK_RESPONSE, { timeout: 15000 });
  });

  test('user can logout', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});
