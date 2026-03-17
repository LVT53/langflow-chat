import { test, expect } from '@playwright/test';
import { login, createConversation } from './helpers';

test.describe('Conversation CRUD operations', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('creates a new conversation via sidebar button', async ({ page }) => {
    const convId = await createConversation(page);
    expect(convId).toBeTruthy();
    await expect(page).toHaveURL(new RegExp(`/chat/${convId}`));
  });

  test('new conversation appears in sidebar', async ({ page }) => {
    await createConversation(page);
    await expect(page.getByTestId('conversation-item').first()).toBeVisible({ timeout: 10000 });
  });

  test('renames a conversation', async ({ page }) => {
    await createConversation(page);
    await expect(page.getByTestId('conversation-item').first()).toBeVisible({ timeout: 10000 });

    const item = page.getByTestId('conversation-item').first();
    await item.hover();
    await item.getByRole('button', { name: 'Conversation options' }).click();
    await page.getByTestId('rename-option').click();

    const titleInput = page.getByTestId('title-input');
    await expect(titleInput).toBeVisible();
    await titleInput.fill('Renamed Conversation');
    await titleInput.press('Enter');

    await expect(page.getByTestId('conversation-item').first()).toContainText('Renamed Conversation', { timeout: 10000 });
  });

  test('cancels rename when pressing Escape', async ({ page }) => {
    await createConversation(page);
    await expect(page.getByTestId('conversation-item').first()).toBeVisible({ timeout: 10000 });

    const item = page.getByTestId('conversation-item').first();
    const originalTitle = await item.locator('.truncate').textContent() ?? '';

    await item.hover();
    await item.getByRole('button', { name: 'Conversation options' }).click();
    await page.getByTestId('rename-option').click();

    const titleInput = page.getByTestId('title-input');
    await titleInput.fill('This Should Not Save');
    await titleInput.press('Escape');

    await expect(page.getByTestId('title-input')).not.toBeVisible();
  });

  test('deletes a conversation with confirmation dialog', async ({ page }) => {
    await createConversation(page);
    await expect(page.getByTestId('conversation-item').first()).toBeVisible({ timeout: 10000 });

    const item = page.getByTestId('conversation-item').first();
    await item.hover();
    await item.getByRole('button', { name: 'Conversation options' }).click();
    await page.getByTestId('delete-option').click();

    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByTestId('confirm-delete').click();

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
  });

  test('cancels deletion from confirmation dialog', async ({ page }) => {
    await createConversation(page);
    await expect(page.getByTestId('conversation-item').first()).toBeVisible({ timeout: 10000 });

    const initialCount = await page.getByTestId('conversation-item').count();

    const item = page.getByTestId('conversation-item').first();
    await item.hover();
    await item.getByRole('button', { name: 'Conversation options' }).click();
    await page.getByTestId('delete-option').click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    await expect(page.getByTestId('conversation-item')).toHaveCount(initialCount);
  });
});