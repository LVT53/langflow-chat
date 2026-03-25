import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

// Use process.env directly for database path
const sqlite = new Database(process.env.DATABASE_PATH ?? './data/chat.db');
sqlite.pragma('foreign_keys = ON');

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
		binary_hash TEXT,
		storage_path TEXT,
		content_text TEXT,
		summary TEXT,
		metadata_json TEXT,
		created_at INTEGER NOT NULL DEFAULT (unixepoch()),
		updated_at INTEGER NOT NULL DEFAULT (unixepoch())
	)`,
	`ALTER TABLE artifacts ADD COLUMN binary_hash TEXT`,
	`CREATE INDEX IF NOT EXISTS artifacts_user_binary_hash_idx ON artifacts(user_id, binary_hash)`,
	`CREATE INDEX IF NOT EXISTS artifacts_user_size_idx ON artifacts(user_id, size_bytes)`,
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
	`CREATE TABLE IF NOT EXISTS artifact_chunks (
		id TEXT PRIMARY KEY,
		artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
		chunk_index INTEGER NOT NULL,
		content_text TEXT NOT NULL,
		token_estimate INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL DEFAULT (unixepoch()),
		updated_at INTEGER NOT NULL DEFAULT (unixepoch())
	)`,
	`CREATE INDEX IF NOT EXISTS artifact_chunks_artifact_idx ON artifact_chunks(artifact_id, chunk_index)`,
	`CREATE INDEX IF NOT EXISTS artifact_chunks_user_conversation_idx ON artifact_chunks(user_id, conversation_id)`,
	`CREATE TABLE IF NOT EXISTS conversation_context_status (
		conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		estimated_tokens INTEGER NOT NULL DEFAULT 0,
		max_context_tokens INTEGER NOT NULL DEFAULT 262144,
		threshold_tokens INTEGER NOT NULL DEFAULT 209715,
		target_tokens INTEGER NOT NULL DEFAULT 157286,
		compaction_applied INTEGER NOT NULL DEFAULT 0,
		compaction_mode TEXT NOT NULL DEFAULT 'none',
		layers_used_json TEXT,
		working_set_count INTEGER NOT NULL DEFAULT 0,
		working_set_artifact_ids_json TEXT,
		working_set_applied INTEGER NOT NULL DEFAULT 0,
		task_state_applied INTEGER NOT NULL DEFAULT 0,
		prompt_artifact_count INTEGER NOT NULL DEFAULT 0,
		recent_turn_count INTEGER NOT NULL DEFAULT 0,
		summary TEXT,
		updated_at INTEGER NOT NULL DEFAULT (unixepoch())
	)`,
	`ALTER TABLE conversation_context_status ADD COLUMN compaction_mode TEXT NOT NULL DEFAULT 'none'`,
	`ALTER TABLE conversation_context_status ADD COLUMN working_set_count INTEGER NOT NULL DEFAULT 0`,
	`ALTER TABLE conversation_context_status ADD COLUMN working_set_artifact_ids_json TEXT`,
	`ALTER TABLE conversation_context_status ADD COLUMN working_set_applied INTEGER NOT NULL DEFAULT 0`,
	`ALTER TABLE conversation_context_status ADD COLUMN task_state_applied INTEGER NOT NULL DEFAULT 0`,
	`ALTER TABLE conversation_context_status ADD COLUMN prompt_artifact_count INTEGER NOT NULL DEFAULT 0`,
	`ALTER TABLE conversation_context_status ADD COLUMN recent_turn_count INTEGER NOT NULL DEFAULT 0`,
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
	`CREATE TABLE IF NOT EXISTS conversation_task_states (
		task_id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
		status TEXT NOT NULL DEFAULT 'active',
		objective TEXT NOT NULL,
		constraints_json TEXT,
		facts_to_preserve_json TEXT,
		decisions_json TEXT,
		open_questions_json TEXT,
		active_artifact_ids_json TEXT,
		next_steps_json TEXT,
		last_checkpoint_at INTEGER,
		created_at INTEGER NOT NULL DEFAULT (unixepoch()),
		updated_at INTEGER NOT NULL DEFAULT (unixepoch())
	)`,
	`CREATE INDEX IF NOT EXISTS conversation_task_states_conversation_idx ON conversation_task_states(conversation_id, updated_at)`,
];
for (const sql of migrations) {
	try { sqlite.exec(sql); } catch { /* column already exists — ignore */ }
}

export const db = drizzle(sqlite, { schema });
export type DatabaseInstance = typeof db;
