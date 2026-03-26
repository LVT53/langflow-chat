import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
dotenv.config();

const E2E_HOST = '127.0.0.1';
const E2E_PORT = 5173;
const E2E_BASE_URL = `http://${E2E_HOST}:${E2E_PORT}`;

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
      'dotenv_config_path=.env node -r dotenv/config ./node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 5173',
    url: E2E_BASE_URL,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
    env: {
      ...(process.env as Record<string, string>),
      PLAYWRIGHT_TEST: '1',
      DATABASE_PATH: process.cwd() + '/data/chat.db',
      SESSION_SECRET: process.env.SESSION_SECRET || 'e2e-test-session-secret-long-enough-1234567890',
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
