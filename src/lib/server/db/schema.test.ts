import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const TEST_DB_PATH = './test-data/schema-test.db';

describe('schema core tables', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(() => {
    const dbDir = dirname(TEST_DB_PATH);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    sqlite = new Database(TEST_DB_PATH);
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema });

    migrate(db, { migrationsFolder: './drizzle' });
  });

  afterAll(() => {
    sqlite?.close();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe('users table', () => {
    it('can insert user and query by id', () => {
      const userId = 'test-user-1';
      db.insert(schema.users).values({
        id: userId,
        email: 'test@example.com',
        passwordHash: 'hash123',
        name: 'Test User',
      }).run();

      const user = db.select().from(schema.users)
        .where(eq(schema.users.id, userId))
        .get();

      expect(user).toBeTruthy();
      expect(user?.id).toBe(userId);
      expect(user?.email).toBe('test@example.com');
      expect(user?.name).toBe('Test User');
      expect(user?.honchoPeerVersion).toBe(0);
    });
  });

  describe('artifacts table', () => {
    it('can insert artifact without vaultId', () => {
      const userId = 'test-user-artifact';
      db.insert(schema.users).values({
        id: userId,
        email: 'artifact@example.com',
        passwordHash: 'hash456',
        name: 'Artifact Test User',
      }).run();

      const artifactId = 'artifact-no-vault';
      db.insert(schema.artifacts).values({
        id: artifactId,
        userId: userId,
        type: 'source_document',
        name: 'Test Document.pdf',
      }).run();

      const artifact = db.select().from(schema.artifacts)
        .where(eq(schema.artifacts.id, artifactId))
        .get();

      expect(artifact).toBeTruthy();
      expect(artifact?.id).toBe(artifactId);
      expect(artifact?.vaultId).toBeNull();
    });

    it('artifact vaultId column exists but is nullable', () => {
      const columns = sqlite
        .prepare("PRAGMA table_info(artifacts)")
        .all() as { name: string }[];

      const columnNames = columns.map(c => c.name);
      expect(columnNames).toContain('vault_id');
    });
  });
});
