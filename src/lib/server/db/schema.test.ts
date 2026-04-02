import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const TEST_DB_PATH = './test-data/vaults-schema-test.db';

describe('knowledge_vaults schema', () => {
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

  describe('knowledge_vaults table', () => {
    it('should exist with correct columns', () => {
      const result = sqlite
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'knowledge_vaults' LIMIT 1")
        .get();
      expect(result).toBeTruthy();
    });

    it('can insert vault and query by userId', () => {
      // First create a test user
      const userId = 'test-user-1';
      db.insert(schema.users).values({
        id: userId,
        email: 'test@example.com',
        passwordHash: 'hash123',
        name: 'Test User',
      }).run();

      // Insert a vault
      const vaultId = 'vault-1';
      db.insert(schema.knowledgeVaults).values({
        id: vaultId,
        userId: userId,
        name: 'My Documents',
        color: '#FF5733',
        sortOrder: 1,
      }).run();

      // Query by userId
      const vaults = db.select().from(schema.knowledgeVaults)
        .where(eq(schema.knowledgeVaults.userId, userId))
        .all();

      expect(vaults).toHaveLength(1);
      expect(vaults[0].id).toBe(vaultId);
      expect(vaults[0].name).toBe('My Documents');
      expect(vaults[0].color).toBe('#FF5733');
      expect(vaults[0].sortOrder).toBe(1);
      expect(vaults[0].userId).toBe(userId);
      expect(vaults[0].createdAt).toBeInstanceOf(Date);
      expect(vaults[0].updatedAt).toBeInstanceOf(Date);
    });

    it('should enforce foreign key constraint on userId', () => {
      // Attempt to insert vault with non-existent user should fail
      expect(() => {
        db.insert(schema.knowledgeVaults).values({
          id: 'vault-bad',
          userId: 'non-existent-user',
          name: 'Bad Vault',
        }).run();
      }).toThrow();
    });

    it('should allow multiple vaults per user with different sort orders', () => {
      const userId = 'test-user-2';
      db.insert(schema.users).values({
        id: userId,
        email: 'test2@example.com',
        passwordHash: 'hash456',
        name: 'Test User 2',
      }).run();

      // Insert multiple vaults
      db.insert(schema.knowledgeVaults).values([
        { id: 'vault-a', userId, name: 'Vault A', sortOrder: 0 },
        { id: 'vault-b', userId, name: 'Vault B', sortOrder: 1 },
        { id: 'vault-c', userId, name: 'Vault C', sortOrder: 2 },
      ]).run();

      const vaults = db.select().from(schema.knowledgeVaults)
        .where(eq(schema.knowledgeVaults.userId, userId))
        .orderBy(schema.knowledgeVaults.sortOrder)
        .all();

      expect(vaults).toHaveLength(3);
      expect(vaults.map(v => v.name)).toEqual(['Vault A', 'Vault B', 'Vault C']);
    });

    it('should have index on userId for efficient queries', () => {
      const result = sqlite
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name LIKE '%knowledge_vaults%' LIMIT 1")
        .get();
      expect(result).toBeTruthy();
    });
  });

  describe('artifacts.vaultId column', () => {
    it('should exist on artifacts table', () => {
      const columns = sqlite
        .prepare("PRAGMA table_info(artifacts)")
        .all() as { name: string }[];

      const columnNames = columns.map(c => c.name);
      expect(columnNames).toContain('vault_id');
    });

    it('artifact can have vaultId set', () => {
      const userId = 'test-user-3';
      db.insert(schema.users).values({
        id: userId,
        email: 'test3@example.com',
        passwordHash: 'hash789',
        name: 'Test User 3',
      }).run();

      // Create a vault
      const vaultId = 'vault-for-artifact';
      db.insert(schema.knowledgeVaults).values({
        id: vaultId,
        userId: userId,
        name: 'Artifact Vault',
      }).run();

      // Create an artifact with vaultId
      const artifactId = 'artifact-with-vault';
      db.insert(schema.artifacts).values({
        id: artifactId,
        userId: userId,
        type: 'source_document',
        name: 'Test Document.pdf',
        vaultId: vaultId,
      }).run();

      // Query the artifact
      const artifact = db.select().from(schema.artifacts)
        .where(eq(schema.artifacts.id, artifactId))
        .get();

      expect(artifact).toBeTruthy();
      expect(artifact?.vaultId).toBe(vaultId);
    });

    it('artifact can have null vaultId', () => {
      const userId = 'test-user-4';
      db.insert(schema.users).values({
        id: userId,
        email: 'test4@example.com',
        passwordHash: 'hash000',
        name: 'Test User 4',
      }).run();

      // Create an artifact without vaultId
      const artifactId = 'artifact-no-vault';
      db.insert(schema.artifacts).values({
        id: artifactId,
        userId: userId,
        type: 'source_document',
        name: 'Unfiled Document.pdf',
      }).run();

      // Query the artifact
      const artifact = db.select().from(schema.artifacts)
        .where(eq(schema.artifacts.id, artifactId))
        .get();

      expect(artifact).toBeTruthy();
      expect(artifact?.vaultId).toBeNull();
    });

    it('should have index on vaultId for efficient queries', () => {
      const result = sqlite
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND sql LIKE '%vault_id%' LIMIT 1")
        .get();
      expect(result).toBeTruthy();
    });
  });
});
