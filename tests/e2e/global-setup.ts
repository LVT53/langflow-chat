import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export default async function globalSetup() {
  const dbDir = join(process.cwd(), 'data');
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = process.env.DATABASE_PATH || join(process.cwd(), 'data', 'chat.db');

  try {
    execSync(
      `npx drizzle-kit push --config=drizzle.config.ts`,
      {
        stdio: 'pipe',
        env: {
          ...process.env,
          DATABASE_PATH: dbPath,
          SESSION_SECRET: process.env.SESSION_SECRET || 'e2e-test-session-secret-long-enough-1234567890',
          LANGFLOW_API_KEY: process.env.LANGFLOW_API_KEY || 'test-key',
          LANGFLOW_API_URL: process.env.LANGFLOW_API_URL || 'http://localhost:7860',
          LANGFLOW_FLOW_ID: process.env.LANGFLOW_FLOW_ID || 'test-flow-id',
        }
      }
    );
  } catch (err) {
    console.warn('[globalSetup] drizzle-kit push failed (may already be up to date):', (err as Error).message?.slice(0, 200));
  }

  try {
    execSync(
      `npx tsx scripts/seed-user.ts --email=admin@local --password=admin123 --name="Admin User"`,
      {
        stdio: 'pipe',
        env: {
          ...process.env,
          DATABASE_PATH: dbPath,
          SESSION_SECRET: process.env.SESSION_SECRET || 'e2e-test-session-secret-long-enough-1234567890',
          LANGFLOW_API_KEY: process.env.LANGFLOW_API_KEY || 'test-key',
          LANGFLOW_API_URL: process.env.LANGFLOW_API_URL || 'http://localhost:7860',
          LANGFLOW_FLOW_ID: process.env.LANGFLOW_FLOW_ID || 'test-flow-id',
        }
      }
    );
    console.log('[globalSetup] Test user seeded: admin@local');
  } catch (err) {
    console.warn('[globalSetup] Seed user failed (may already exist):', (err as Error).message?.slice(0, 200));
  }
}
