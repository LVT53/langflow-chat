import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
dotenv.config();

const E2E_HOST = '127.0.0.1';
const E2E_PORT = Number(process.env.E2E_PORT || 5175);
const E2E_BASE_URL = `http://${E2E_HOST}:${E2E_PORT}`;
const E2E_DATABASE_PATH =
  process.env.E2E_DATABASE_PATH || `${process.cwd()}/data/playwright-e2e-chat.db`;
const E2E_SESSION_SECRET =
  process.env.SESSION_SECRET || 'e2e-test-session-secret-long-enough-1234567890';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  timeout: 60000,
  webServer: {
    command:
      `dotenv_config_path=.env node -r dotenv/config ./node_modules/vite/bin/vite.js dev --host ${E2E_HOST} --port ${E2E_PORT}`,
    url: E2E_BASE_URL,
    timeout: 120 * 1000,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === 'true',
    env: {
      ...(process.env as Record<string, string>),
      PLAYWRIGHT_TEST: '1',
      DATABASE_PATH: E2E_DATABASE_PATH,
      E2E_DATABASE_PATH,
      SESSION_SECRET: E2E_SESSION_SECRET,
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  globalSetup: './tests/e2e/global-setup.ts',
});
