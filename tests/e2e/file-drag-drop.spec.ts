import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('File Drag and Drop', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('drop zone overlay appears when dragging files onto landing page', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 10000 });

		await page.locator('.chat-page').dispatchEvent('dragenter', {
			dataTransfer: { types: ['Files'], dropEffect: 'copy' },
		});

		await expect(page.getByTestId('drop-zone-overlay')).toBeVisible();
		await expect(page.getByTestId('drop-zone-overlay')).toContainText('Drop files to attach');

		await page.locator('.chat-page').dispatchEvent('dragleave', {
			dataTransfer: { types: ['Files'] },
		});

		await expect(page.getByTestId('drop-zone-overlay')).not.toBeVisible();
	});

	test('drop zone overlay appears when dragging files onto chat page', async ({ page }) => {
		await page.getByTestId('new-conversation').click();
		await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 10000 });

		await page.getByTestId('message-input').fill('Hello');
		await page.getByTestId('send-button').click();
		await page.waitForURL(/\/chat\//, { timeout: 15000 });

		await page.locator('.chat-page').dispatchEvent('dragenter', {
			dataTransfer: { types: ['Files'], dropEffect: 'copy' },
		});

		await expect(page.getByTestId('drop-zone-overlay')).toBeVisible();
		await expect(page.getByTestId('drop-zone-overlay')).toContainText('Drop files to attach');
	});

	test('internal conversation drag does not trigger drop zone overlay', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 10000 });

		// Internal conversation DnD uses application/x-alfyai-conversation, not Files
		await page.locator('.chat-page').dispatchEvent('dragenter', {
			dataTransfer: { types: ['application/x-alfyai-conversation', 'text/plain'], dropEffect: 'move' },
		});

		await expect(page.getByTestId('drop-zone-overlay')).not.toBeVisible();
	});

	test('drop zone is rejected when streaming is active', async ({ page }) => {
		await page.route('**/api/chat/stream', async (route) => {
			await route.fulfill({
				status: 200,
				headers: {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
					Connection: 'keep-alive',
				},
				body: 'data: {"type":"token","content":"Hello"}\n\n',
			});
		});

		await page.getByTestId('new-conversation').click();
		await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 10000 });

		await page.getByTestId('message-input').fill('Test');
		await page.getByTestId('send-button').click();
		await page.waitForURL(/\/chat\//, { timeout: 15000 });
		await page.waitForTimeout(500);

		await page.locator('.chat-page').dispatchEvent('dragenter', {
			dataTransfer: { types: ['Files'], dropEffect: 'copy' },
		});

		await expect(page.getByTestId('drop-zone-overlay')).toBeVisible();
		await expect(page.getByTestId('drop-zone-overlay')).toContainText('Cannot upload while generating');
	});

	test('drag without Files dataTransfer type is ignored', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 10000 });

		// Text selection drag has no Files type — should not trigger overlay
		await page.locator('.chat-page').dispatchEvent('dragenter', {
			dataTransfer: { types: ['text/plain'], dropEffect: 'copy' },
		});

		await expect(page.getByTestId('drop-zone-overlay')).not.toBeVisible();
	});
});
