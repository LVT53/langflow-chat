import { type Page } from '@playwright/test';

const TEST_EMAIL = process.env.E2E_EMAIL || 'admin@local';
const TEST_PASSWORD = process.env.E2E_PASSWORD || 'admin123';

export async function login(page: Page, email = TEST_EMAIL, password = TEST_PASSWORD) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('input[name="email"]', { state: 'visible' });
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/', { timeout: 15000 });
}

export async function logout(page: Page) {
  const logoutBtn = page.getByRole('button', { name: 'Logout' });
  if (await logoutBtn.isVisible()) {
    await logoutBtn.click();
    await page.waitForURL('/login', { timeout: 10000 });
  }
}

export async function createConversation(page: Page): Promise<string> {
  await page.click('[data-testid="new-conversation"]');
  await page.waitForURL(/\/chat\//, { timeout: 10000 });
  const url = page.url();
  const match = url.match(/\/chat\/([^/?#]+)/);
  return match ? match[1] : '';
}

export async function sendMessage(page: Page, text: string) {
  const input = page.getByTestId('message-input');
  await input.waitFor({ state: 'visible' });
  await input.fill(text);
  await page.click('[data-testid="send-button"]');
}

export async function waitForAssistantResponse(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => {
      const msgs = document.querySelectorAll('[data-testid="assistant-message"]');
      for (const msg of msgs) {
        if (msg.textContent && msg.textContent.trim().length > 0) {
          return true;
        }
      }
      return false;
    },
    { timeout }
  );
}

export { TEST_EMAIL, TEST_PASSWORD };
