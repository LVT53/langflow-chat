import { expect, test, type Page } from '@playwright/test';

import { normalizeSystemPromptReference } from '../../src/lib/server/prompts';
import { login } from './helpers';

type AdminConfigPayload = {
  currentValues: Record<string, string>;
  overrides: Record<string, string>;
  envDefaults: Record<string, string>;
};

async function fetchAdminConfig(page: Page): Promise<AdminConfigPayload> {
  const payload = await page.evaluate(async () => {
    const response = await fetch('/api/admin/config');
    return {
      ok: response.ok,
      status: response.status,
      body: (await response.json()) as AdminConfigPayload,
    };
  });

  expect(payload.ok, `admin config fetch failed with status ${payload.status}`).toBe(true);
  return payload.body;
}

async function setPromptOverrideViaApi(page: Page, value: string) {
  const result = await page.evaluate(async ({ nextValue }) => {
    const response = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ MODEL_1_SYSTEM_PROMPT: nextValue }),
    });

    return {
      ok: response.ok,
      status: response.status,
    };
  }, { nextValue: value });

  expect(result.ok, `admin config save failed with status ${result.status}`).toBe(true);
}

async function openAdministrationTab(page: Page) {
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Administration' }).click();
  await expect(page.locator('#MODEL_1_SYSTEM_PROMPT')).toBeVisible();
}

async function savePromptFromUi(page: Page, value: string) {
  const field = page.locator('#MODEL_1_SYSTEM_PROMPT');
  await field.fill(value);

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/admin/config') &&
        response.request().method() === 'PUT' &&
        response.status() === 200
    ),
    page.getByRole('button', { name: 'Save Configuration' }).click(),
  ]);

  await expect(page.getByText('Configuration saved.')).toBeVisible();
}

async function reloadAdministrationTab(page: Page) {
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Administration' }).click();
  await expect(page.locator('#MODEL_1_SYSTEM_PROMPT')).toBeVisible();
}

test.describe('Admin prompt settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await setPromptOverrideViaApi(page, '');
    await openAdministrationTab(page);
  });

  test.afterEach(async ({ page }) => {
    await setPromptOverrideViaApi(page, '');
  });

  test('saving the built-in prompt stores the canonical prompt reference', async ({ page }) => {
    const initialConfig = await fetchAdminConfig(page);
    const builtInPrompt = await page.locator('#MODEL_1_SYSTEM_PROMPT').inputValue();
    const expectedReference =
      normalizeSystemPromptReference(initialConfig.envDefaults.MODEL_1_SYSTEM_PROMPT) ??
      initialConfig.envDefaults.MODEL_1_SYSTEM_PROMPT;

    await savePromptFromUi(page, builtInPrompt);

    const savedConfig = await fetchAdminConfig(page);
    expect(savedConfig.overrides.MODEL_1_SYSTEM_PROMPT).toBe(expectedReference);

    await reloadAdministrationTab(page);
    await expect(page.locator('#MODEL_1_SYSTEM_PROMPT')).toHaveValue(builtInPrompt);
  });

  test('saving a custom prompt keeps the custom text', async ({ page }) => {
    const customPrompt =
      'You are a custom assistant.\nAnswer with compact bullet points and no preamble.';

    await savePromptFromUi(page, customPrompt);

    const savedConfig = await fetchAdminConfig(page);
    expect(savedConfig.overrides.MODEL_1_SYSTEM_PROMPT).toBe(customPrompt);

    await reloadAdministrationTab(page);
    await expect(page.locator('#MODEL_1_SYSTEM_PROMPT')).toHaveValue(customPrompt);
  });

  test('clearing the prompt resets the UI back to the default prompt', async ({ page }) => {
    const builtInPrompt = await page.locator('#MODEL_1_SYSTEM_PROMPT').inputValue();
    const customPrompt = 'Temporary custom prompt for reset coverage.';

    await savePromptFromUi(page, customPrompt);
    await savePromptFromUi(page, '');

    const savedConfig = await fetchAdminConfig(page);
    expect(savedConfig.overrides.MODEL_1_SYSTEM_PROMPT).toBeUndefined();

    await reloadAdministrationTab(page);
    await expect(page.locator('#MODEL_1_SYSTEM_PROMPT')).toHaveValue(builtInPrompt);
  });
});
