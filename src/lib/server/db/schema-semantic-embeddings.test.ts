import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { dirname } from 'path';

const TEST_DB_PATH = './test-data/semantic-embeddings-schema-test.db';

describe('semantic_embeddings schema', () => {
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

  it('creates the semantic_embeddings table and indexes', () => {
    const table = sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'semantic_embeddings' LIMIT 1")
      .get();
    const index = sqlite
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'semantic_embeddings_subject_unique_idx' LIMIT 1"
      )
      .get();

    expect(table).toBeTruthy();
    expect(index).toBeTruthy();
  });

  it('stores a semantic embedding row keyed by user, subject, and model', () => {
    db.insert(schema.users)
      .values({
        id: 'semantic-user-1',
        email: 'semantic@example.com',
        passwordHash: 'hash123',
        name: 'Semantic User',
      })
      .run();

    db.insert(schema.semanticEmbeddings)
      .values({
        id: 'embedding-1',
        userId: 'semantic-user-1',
        subjectType: 'artifact',
        subjectId: 'artifact-1',
        modelName: 'bge-m3',
        sourceTextHash: 'hash-a',
        dimensions: 3,
        embeddingJson: JSON.stringify([0.1, 0.2, 0.3]),
      })
      .run();

    const row = db.select().from(schema.semanticEmbeddings).where(eq(schema.semanticEmbeddings.id, 'embedding-1')).get();
    expect(row).toBeTruthy();
    expect(row?.subjectType).toBe('artifact');
    expect(row?.modelName).toBe('bge-m3');
    expect(row?.dimensions).toBe(3);
  });
});
