import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

// Use process.env directly for database path
const sqlite = new Database(process.env.DATABASE_PATH ?? './data/chat.db');

// Inline schema migrations — safe to re-run: each ALTER TABLE is caught if
// the column already exists (SQLite throws on duplicate column additions).
const migrations: string[] = [
	`ALTER TABLE messages ADD COLUMN tool_calls TEXT`,
	`ALTER TABLE conversations ADD COLUMN project_id TEXT`,
	`CREATE TABLE IF NOT EXISTS projects (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		color TEXT,
		sort_order INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL DEFAULT (unixepoch()),
		updated_at INTEGER NOT NULL DEFAULT (unixepoch())
	)`,
];
for (const sql of migrations) {
	try { sqlite.exec(sql); } catch { /* column already exists — ignore */ }
}

export const db = drizzle(sqlite, { schema });
export type DatabaseInstance = typeof db;