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
	`CREATE TABLE IF NOT EXISTS artifacts (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
		type TEXT NOT NULL,
		name TEXT NOT NULL,
		mime_type TEXT,
		extension TEXT,
		size_bytes INTEGER,
		storage_path TEXT,
		content_text TEXT,
		summary TEXT,
		metadata_json TEXT,
		created_at INTEGER NOT NULL DEFAULT (unixepoch()),
		updated_at INTEGER NOT NULL DEFAULT (unixepoch())
	)`,
	`CREATE TABLE IF NOT EXISTS artifact_links (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
		related_artifact_id TEXT REFERENCES artifacts(id) ON DELETE CASCADE,
		conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
		message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
		link_type TEXT NOT NULL,
		created_at INTEGER NOT NULL DEFAULT (unixepoch())
	)`,
	`CREATE TABLE IF NOT EXISTS conversation_context_status (
		conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		estimated_tokens INTEGER NOT NULL DEFAULT 0,
		max_context_tokens INTEGER NOT NULL DEFAULT 262144,
		threshold_tokens INTEGER NOT NULL DEFAULT 209715,
		target_tokens INTEGER NOT NULL DEFAULT 157286,
		compaction_applied INTEGER NOT NULL DEFAULT 0,
		layers_used_json TEXT,
		working_set_count INTEGER NOT NULL DEFAULT 0,
		working_set_artifact_ids_json TEXT,
		working_set_applied INTEGER NOT NULL DEFAULT 0,
		summary TEXT,
		updated_at INTEGER NOT NULL DEFAULT (unixepoch())
	)`,
	`ALTER TABLE conversation_context_status ADD COLUMN working_set_count INTEGER NOT NULL DEFAULT 0`,
	`ALTER TABLE conversation_context_status ADD COLUMN working_set_artifact_ids_json TEXT`,
	`ALTER TABLE conversation_context_status ADD COLUMN working_set_applied INTEGER NOT NULL DEFAULT 0`,
	`CREATE TABLE IF NOT EXISTS conversation_working_set_items (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
		artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
		artifact_type TEXT NOT NULL,
		score INTEGER NOT NULL DEFAULT 0,
		state TEXT NOT NULL DEFAULT 'cooling',
		reason_codes_json TEXT,
		last_activated_at INTEGER,
		last_used_at INTEGER,
		created_at INTEGER NOT NULL DEFAULT (unixepoch()),
		updated_at INTEGER NOT NULL DEFAULT (unixepoch())
	)`,
];
for (const sql of migrations) {
	try { sqlite.exec(sql); } catch { /* column already exists — ignore */ }
}

export const db = drizzle(sqlite, { schema });
export type DatabaseInstance = typeof db;
