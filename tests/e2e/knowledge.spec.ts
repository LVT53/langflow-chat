import { expect, test } from '@playwright/test';

import { login } from './helpers';

test.describe('Knowledge page', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
		await page.goto('/knowledge');
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { name: 'Knowledge Base' })).toBeVisible();
	});

	test('library cards open and close their managers', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Manage documents' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Manage results' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Manage workflows' })).toBeVisible();

		await page.getByRole('button', { name: 'Manage documents' }).click();
		const libraryDialog = page.getByRole('dialog');
		await expect(libraryDialog).toBeVisible();
		await expect(libraryDialog.getByRole('heading', { name: 'Manage documents' })).toBeVisible();
		await page.getByRole('button', { name: 'Close library manager' }).click();
		await expect(libraryDialog).not.toBeVisible();
	});

	test('memory profile opens focus continuity manager', async ({ page }) => {
		await page.getByRole('button', { name: 'Memory Profile' }).click();
		await expect(page.getByRole('button', { name: 'Manage focus continuity' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Memory Overview' })).toBeVisible();

		await page.getByRole('button', { name: 'Manage focus continuity' }).click();
		const memoryDialog = page.getByRole('dialog');
		await expect(memoryDialog).toBeVisible();
		await expect(memoryDialog.getByRole('heading', { name: 'Manage focus continuity' })).toBeVisible();
		await page.getByRole('button', { name: 'Close memory manager' }).click();
		await expect(memoryDialog).not.toBeVisible();
	});
});
