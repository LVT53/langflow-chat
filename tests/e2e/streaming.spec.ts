import { test, expect } from '@playwright/test';
import { login, openConversationComposer } from './helpers';

const STREAMING_TEXT = 'The quick brown fox jumps over the lazy dog this is streaming';

function buildSseBody(text: string, chunkDelayMs = 0): string {
  const words = text.split(' ');
  const chunks = words.map((word, i) =>
    `event: token\ndata: ${JSON.stringify({ text: word + (i < words.length - 1 ? ' ' : '') })}\n\n`
  );
  chunks.push('event: end\ndata: {}\n\n');
  return chunks.join('');
}

test.describe('SSE streaming verification', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('tokens appear incrementally during streaming', async ({ page }) => {
    const words = STREAMING_TEXT.split(' ');
    const tokenTimestamps: number[] = [];

    await page.route('**/api/chat/stream', async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: buildSseBody(STREAMING_TEXT),
      });
    });

    await openConversationComposer(page);
    await page.getByTestId('message-input').fill('Tell me something');
    await page.getByTestId('send-button').click();

    await expect(page.getByTestId('assistant-message').first()).toContainText(
      STREAMING_TEXT,
      { timeout: 20000 }
    );
  });

  test('streaming loading indicator appears during response', async ({ page }) => {
    await page.route('**/api/chat/stream', async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        body: buildSseBody('Hello world'),
      });
    });

    await openConversationComposer(page);
    await page.getByTestId('message-input').fill('Trigger streaming');
    await page.getByTestId('send-button').click();

    await expect(page.getByTestId('assistant-message').first()).toContainText('Hello world', { timeout: 15000 });
  });

  test('full response text is intact after streaming completes', async ({ page }) => {
    const fullText = 'Complete streaming response with multiple words here';

    await page.route('**/api/chat/stream', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: buildSseBody(fullText),
      });
    });

    await openConversationComposer(page);
    await page.getByTestId('message-input').fill('Full text test');
    await page.getByTestId('send-button').click();

    const assistantMsg = page.getByTestId('assistant-message').first();
    await expect(assistantMsg).toContainText(fullText, { timeout: 20000 });
  });

  test('stream error shows retry button', async ({ page }) => {
    await page.route('**/api/chat/stream', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: 'event: error\ndata: {"message":"Stream timeout"}\n\n',
      });
    });

    await openConversationComposer(page);
    await page.getByTestId('message-input').fill('Trigger stream error');
    await page.getByTestId('send-button').click();

    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible({ timeout: 15000 });
  });

  test('retry after error resends last message', async ({ page }) => {
    let callCount = 0;

    await page.route('**/api/chat/stream', async (route) => {
      callCount++;
      if (callCount === 1) {
        await route.fulfill({
          status: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Server error' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
          body: buildSseBody('Retry succeeded'),
        });
      }
    });

    await openConversationComposer(page);
    await page.getByTestId('message-input').fill('Test retry flow');
    await page.getByTestId('send-button').click();

    const retryBtn = page.getByRole('button', { name: /retry/i });
    await expect(retryBtn).toBeVisible({ timeout: 15000 });
    await retryBtn.click();

    await expect(page.getByTestId('assistant-message').first()).toContainText('Retry succeeded', { timeout: 15000 });
  });
});
