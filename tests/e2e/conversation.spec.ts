import { test, expect } from '@playwright/test';
import {
  login,
  createConversation,
  ensureSidebarExpanded,
  openConversationComposer,
} from './helpers';

test.describe('Conversation CRUD operations', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.route('**/api/chat/stream', async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: 'event: token\ndata: {"text":"ok"}\n\nevent: end\ndata: {}\n\n',
      });
    });
  });

  test('sidebar new chat button opens the home composer', async ({ page }) => {
    await openConversationComposer(page);
    await expect(page.getByTestId('message-input')).toBeVisible();
    await expect(page).toHaveURL('/');
  });

  test('conversation appears in sidebar after the first send', async ({ page }) => {
    await createConversation(page);
    await ensureSidebarExpanded(page);
    await expect(page.getByTestId('conversation-item').first()).toBeVisible({ timeout: 10000 });
  });

  test('renames a conversation', async ({ page }) => {
    await createConversation(page);
    await ensureSidebarExpanded(page);
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
    await ensureSidebarExpanded(page);
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
    await ensureSidebarExpanded(page);
    await expect(page.getByTestId('conversation-item').first()).toBeVisible({ timeout: 10000 });

    const item = page.getByTestId('conversation-item').first();
    await item.hover();
    await item.getByRole('button', { name: 'Conversation options' }).click();
    await page.getByTestId('delete-option').click();

    const deleteDialog = page.getByRole('dialog', { name: 'Delete this conversation?' });
    await expect(deleteDialog).toBeVisible();

    await page.getByTestId('confirm-delete').click();

    await expect(deleteDialog).not.toBeVisible({ timeout: 5000 });
  });

  test('cancels deletion from confirmation dialog', async ({ page }) => {
    await createConversation(page);
    await ensureSidebarExpanded(page);
    await expect(page.getByTestId('conversation-item').first()).toBeVisible({ timeout: 10000 });

    const initialCount = await page.getByTestId('conversation-item').count();

    const item = page.getByTestId('conversation-item').first();
    await item.hover();
    await item.getByRole('button', { name: 'Conversation options' }).click();
    await page.getByTestId('delete-option').click();

    const deleteDialog = page.getByRole('dialog', { name: 'Delete this conversation?' });
    await expect(deleteDialog).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(deleteDialog).not.toBeVisible();

    await expect(page.getByTestId('conversation-item')).toHaveCount(initialCount);
  });

  test('drags a conversation into a project folder', async ({ page }) => {
    await createConversation(page, 'Project drag conversation');
    await ensureSidebarExpanded(page);

    const createProjectButton = page.getByRole('button', { name: 'Create new project' }).first();
    await createProjectButton.click();

    const projectName = 'Project Drag Target';
    const projectInput = page.getByPlaceholder('Project name');
    await expect(projectInput).toBeVisible();
    await projectInput.fill(projectName);
    await projectInput.press('Enter');

    const conversationItem = page.getByTestId('conversation-item').first();
    const projectTarget = page.getByTestId('project-drop-target').filter({ hasText: projectName }).first();

    await expect(projectTarget).toBeVisible({ timeout: 10000 });

    const conversationId = await conversationItem.getAttribute('data-conversation-id');
    const projectId = await projectTarget.getAttribute('data-project-id');

    expect(conversationId).toBeTruthy();
    expect(projectId).toBeTruthy();

    const moveRequestPromise = page.waitForRequest((request) => {
      return (
        request.method() === 'PATCH' &&
        request.url().includes(`/api/conversations/${conversationId}`)
      );
    });

    const dataTransfer = await page.evaluateHandle(({ targetConversationId }) => {
      const transfer = new DataTransfer();
      transfer.setData('application/x-alfyai-conversation', targetConversationId);
      transfer.setData('text/plain', targetConversationId);
      return transfer;
    }, { targetConversationId: conversationId });
    await projectTarget.dispatchEvent('dragover', { dataTransfer });
    await projectTarget.dispatchEvent('drop', { dataTransfer });

    const moveRequest = await moveRequestPromise;
    expect(moveRequest.postDataJSON()).toEqual({ projectId });
  });

  test('keeps only one sidebar options menu open at a time', async ({ page }) => {
    await createConversation(page, 'Single menu conversation');
    await ensureSidebarExpanded(page);

    const createProjectButton = page.getByRole('button', { name: 'Create new project' }).first();
    await createProjectButton.click();

    const projectName = 'Single Menu Project';
    const projectInput = page.getByPlaceholder('Project name');
    await expect(projectInput).toBeVisible();
    await projectInput.fill(projectName);
    await projectInput.press('Enter');

    const conversationItem = page.getByTestId('conversation-item').first();
    const projectTarget = page
      .getByTestId('project-drop-target')
      .filter({ hasText: projectName })
      .first();
    await conversationItem.hover();
    await conversationItem.getByRole('button', { name: 'Conversation options' }).dispatchEvent('click');

    const conversationMenu = page.locator('.conversation-menu').first();
    const projectMenu = page.locator('.project-menu').first();

    await expect(conversationMenu).toBeVisible();
    await expect(projectMenu).not.toBeVisible();

    await projectTarget.hover();
    await projectTarget.getByRole('button', { name: 'Project options' }).click();

    await expect(projectMenu).toBeVisible();
    await expect(conversationMenu).not.toBeVisible();

    await conversationItem.getByRole('button', { name: 'Conversation options' }).click();

    await expect(conversationMenu).toBeVisible();
    await expect(projectMenu).not.toBeVisible();
  });
});
