import { expect, test } from '@playwright/test';

import { login } from './helpers';

test.describe('Knowledge page', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
		await page.goto('/knowledge', { waitUntil: 'domcontentloaded' });
		await expect(page.getByRole('heading', { name: 'Knowledge Base' })).toBeVisible();
	});

	test('documents section is visible with filter controls', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
		await expect(page.getByText('Browse and manage your uploaded and generated documents')).toBeVisible();

		await expect(page.getByRole('radiogroup', { name: 'Document filter' })).toBeVisible();
		await expect(page.getByLabel('Document filter').getByText('All')).toBeVisible();
		await expect(page.getByLabel('Document filter').getByText('Uploaded')).toBeVisible();
		await expect(page.getByLabel('Document filter').getByText('Generated')).toBeVisible();
	});

	test('memory profile section is visible', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Memory Overview' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Manage focus continuity' })).toBeVisible();
	});

	test('memory management entrypoints are visible', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Manage focus continuity' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Manage focus continuity' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Manage persona memory' })).toBeVisible();
	});

	test('document filter control renders all options', async ({ page }) => {
		const filterGroup = page.getByRole('radiogroup', { name: 'Document filter' });
		await expect(filterGroup).toBeVisible();
		await expect(filterGroup.getByText('All')).toBeVisible();
		await expect(filterGroup.getByText('Uploaded')).toBeVisible();
		await expect(filterGroup.getByText('Generated')).toBeVisible();
	});

	test('opening a knowledge document does not trigger runtime page errors', async ({ page }) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (error) => {
			pageErrors.push(error.message);
		});

		const firstDocumentRow = page.locator('tbody tr').first();
		await expect(firstDocumentRow).toBeVisible();
		await firstDocumentRow.click();
		await page.waitForTimeout(400);

		expect(pageErrors).toEqual([]);
	});
});
