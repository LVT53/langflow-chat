#!/usr/bin/env tsx

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

if (!process.env.DATABASE_PATH) {
	process.env.DATABASE_PATH = './data/chat.db';
}

import { existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname } from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';

const databasePath = process.env.DATABASE_PATH;
const dbDir = dirname(databasePath);

if (!existsSync(dbDir)) {
	mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(databasePath);
sqlite.pragma('foreign_keys = ON');

const requiredExistingTables = [
	'projects',
	'artifacts',
	'artifact_links',
	'artifact_chunks',
	'conversation_context_status',
	'conversation_task_states',
	'task_state_evidence_links',
	'task_checkpoints',
	'memory_projects',
	'memory_project_task_links',
	'persona_memory_attributions',
	'persona_memory_clusters',
	'persona_memory_cluster_members',
	'conversation_drafts',
];

const requiredExistingColumns = [
	['conversations', 'project_id'],
	['messages', 'thinking'],
	['messages', 'tool_calls'],
	['messages', 'metadata_json'],
	['users', 'role'],
	['users', 'preferred_model'],
	['users', 'translation_enabled'],
	['users', 'theme'],
	['users', 'title_language'],
	['users', 'avatar_id'],
	['users', 'profile_picture'],
	['users', 'honcho_peer_version'],
];

// Columns that should be auto-created if missing (safe defaults, no data loss)
const autoCreateColumns: Array<[string, string, string]> = [
	['users', 'title_language', "TEXT NOT NULL DEFAULT 'auto'"],
];

const ADOPTION_BASELINE_TAG = '0005_flaky_famine';
const HONCHO_PEER_VERSION_MIGRATION_TAG = '1775416800000_users_honcho_peer_version';
const TITLE_LANGUAGE_MIGRATION_TAG = '1777140000003_users_title_language';
const INFERENCE_PROVIDERS_CREATION_TAG = '1777140000000_inference_providers';

function hasTable(tableName: string): boolean {
	return Boolean(
		sqlite
			.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
			.get(tableName)
	);
}

function listColumns(tableName: string): string[] {
	return sqlite
		.prepare(`PRAGMA table_info(${JSON.stringify(tableName)})`)
		.all()
		.map((row) => String((row as { name: unknown }).name));
}

function hasColumn(tableName: string, columnName: string): boolean {
	if (!hasTable(tableName)) return false;
	return listColumns(tableName).includes(columnName);
}

function autoCreateMissingColumns(): number {
	let created = 0;
	for (const [table, column, definition] of autoCreateColumns) {
		if (!hasTable(table)) continue;
		if (hasColumn(table, column)) continue;
		sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
		created += 1;
		console.log(`[prepare-db] Added missing column: ${table}.${column}`);
	}
	return created;
}

function countMigrationRows(): number {
	if (!hasTable('__drizzle_migrations')) return 0;
	const row = sqlite
		.prepare('SELECT COUNT(*) as count FROM __drizzle_migrations')
		.get() as { count: number };
	return row.count;
}

function listMigrationHashes(): Set<string> {
	if (!hasTable('__drizzle_migrations')) return new Set();
	const rows = sqlite
		.prepare('SELECT hash FROM __drizzle_migrations')
		.all() as { hash: string }[];
	return new Set(rows.map((row) => row.hash));
}

function hasApplicationTables(): boolean {
	const row = sqlite
		.prepare(
			"SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' LIMIT 1"
		)
		.get();
	return Boolean(row);
}

function validateExistingRuntimeSchema(): string[] {
	const problems: string[] = [];

	for (const tableName of requiredExistingTables) {
		if (!hasTable(tableName)) {
			problems.push(`missing table ${tableName}`);
		}
	}

	for (const [tableName, columnName] of requiredExistingColumns) {
		if (!hasTable(tableName)) {
			problems.push(`missing table ${tableName} for column ${columnName}`);
			continue;
		}
		if (!listColumns(tableName).includes(columnName)) {
			problems.push(`missing column ${tableName}.${columnName}`);
		}
	}

	return problems;
}

function ensureMigrationJournal(): void {
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
			id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			hash text NOT NULL,
			created_at numeric
		)
	`);
}

function readMigrationJournalEntries(): {
	entries: Array<{
		idx: number;
		when: number;
		tag: string;
		breakpoints: boolean;
	}>;
} {
	return JSON.parse(readFileSync('./drizzle/meta/_journal.json', 'utf8')) as {
		entries: Array<{
			idx: number;
			when: number;
			tag: string;
			breakpoints: boolean;
		}>;
	};
}

function syncMigrationJournalToBaselineSchema(): number {
	const problems = validateExistingRuntimeSchema();
	if (problems.length > 0) {
		throw new Error(
			`Cannot adopt existing database into Drizzle migrations: ${problems.join(', ')}`
		);
	}

	ensureMigrationJournal();
	const journal = readMigrationJournalEntries();
	const baselineIndex = journal.entries.findIndex((entry) => entry.tag === ADOPTION_BASELINE_TAG);
	if (baselineIndex === -1) {
		throw new Error(`Cannot find baseline migration tag ${ADOPTION_BASELINE_TAG} in drizzle/meta/_journal.json`);
	}

	const migrations = readMigrationFiles({ migrationsFolder: './drizzle' }).slice(0, baselineIndex + 1);
	const existingHashes = listMigrationHashes();
	const insertMigration = sqlite.prepare(
		'INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)'
	);
	let insertedCount = 0;

	sqlite.transaction(() => {
		for (const migrationMeta of migrations) {
			if (existingHashes.has(migrationMeta.hash)) {
				continue;
			}
			insertMigration.run(migrationMeta.hash, String(migrationMeta.folderMillis));
			insertedCount += 1;
		}
	})();

	return insertedCount;
}

function backfillTableMigrationIfNeeded(tag: string): { backfill: number; repair: boolean } {
	const journal = readMigrationJournalEntries();
	const migrationIndex = journal.entries.findIndex((entry) => entry.tag === tag);
	if (migrationIndex === -1) {
		throw new Error(`Cannot find migration tag ${tag} in drizzle/meta/_journal.json`);
	}

	const migrations = readMigrationFiles({ migrationsFolder: './drizzle' });
	const migrationMeta = migrations[migrationIndex];
	if (!migrationMeta) {
		throw new Error(`Cannot resolve migration metadata for tag ${tag}`);
	}

	const existingHashes = listMigrationHashes();
	if (existingHashes.has(migrationMeta.hash)) {
		return { backfill: 0, repair: false };
	}

	ensureMigrationJournal();

	if (!hasTable('inference_providers')) {
		const laterEntries = journal.entries.slice(migrationIndex + 1);
		if (laterEntries.length > 0) {
			const laterHashes: string[] = [];
			for (const entry of laterEntries) {
				const idx = journal.entries.findIndex((e) => e.tag === entry.tag);
				if (idx >= 0 && migrations[idx]) {
					laterHashes.push(migrations[idx].hash);
				}
			}
			if (laterHashes.length > 0) {
				const placeholders = laterHashes.map(() => '?').join(', ');
				sqlite
					.prepare(`DELETE FROM __drizzle_migrations WHERE hash IN (${placeholders})`)
					.run(...laterHashes);
			}
		}
		sqlite
			.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
			.run(migrationMeta.hash, String(migrationMeta.folderMillis));
		return { backfill: 1, repair: true };
	}

	sqlite
		.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
		.run(migrationMeta.hash, String(migrationMeta.folderMillis));

	return { backfill: 1, repair: false };
}

function backfillColumnMigrationIfNeeded(params: {
	table: string;
	column: string;
	tag: string;
}): number {
	if (!hasTable(params.table) || !hasColumn(params.table, params.column)) {
		return 0;
	}

	const journal = readMigrationJournalEntries();
	const migrationIndex = journal.entries.findIndex((entry) => entry.tag === params.tag);
	if (migrationIndex === -1) {
		throw new Error(
			`Cannot find migration tag ${params.tag} in drizzle/meta/_journal.json`
		);
	}

	const migrations = readMigrationFiles({ migrationsFolder: './drizzle' });
	const migrationMeta = migrations[migrationIndex];
	if (!migrationMeta) {
		throw new Error(
			`Cannot resolve migration metadata for tag ${params.tag}`
		);
	}

	const existingHashes = listMigrationHashes();
	if (existingHashes.has(migrationMeta.hash)) {
		return 0;
	}

	ensureMigrationJournal();
	sqlite
		.prepare('INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)')
		.run(migrationMeta.hash, String(migrationMeta.folderMillis));

	return 1;
}

try {
	if (hasApplicationTables()) {
		autoCreateMissingColumns();

		const schemaProblems = validateExistingRuntimeSchema();
		const existingMigrationCount = countMigrationRows();
		if (schemaProblems.length > 0 && existingMigrationCount > 0) {
			throw new Error(
				`Database ${databasePath} has migration records but is missing schema pieces: ${schemaProblems.join(', ')}`
			);
		}

		if (schemaProblems.length > 0) {
			throw new Error(
				`Database ${databasePath} is missing required schema pieces: ${schemaProblems.join(', ')}`
			);
		}

		if (existingMigrationCount === 0) {
			const insertedCount = syncMigrationJournalToBaselineSchema();
			if (insertedCount > 0) {
				console.log(
					`Backfilled ${insertedCount} baseline Drizzle migration record(s) for ${databasePath}.`
				);
			}
		}

		const adoptedHonchoMigrationCount = backfillColumnMigrationIfNeeded({
			table: 'users',
			column: 'honcho_peer_version',
			tag: HONCHO_PEER_VERSION_MIGRATION_TAG,
		});
		if (adoptedHonchoMigrationCount > 0) {
			console.log(
				`Backfilled ${adoptedHonchoMigrationCount} Drizzle migration record for existing users.honcho_peer_version column in ${databasePath}.`
			);
		}

		const adoptedTitleLanguageMigrationCount = backfillColumnMigrationIfNeeded({
			table: 'users',
			column: 'title_language',
			tag: TITLE_LANGUAGE_MIGRATION_TAG,
		});
		if (adoptedTitleLanguageMigrationCount > 0) {
			console.log(
				`Backfilled ${adoptedTitleLanguageMigrationCount} Drizzle migration record for existing users.title_language column in ${databasePath}.`
			);
		}

const { backfill: adoptedInferenceProvidersMigrationCount, repair: needsRepair } =
			backfillTableMigrationIfNeeded(INFERENCE_PROVIDERS_CREATION_TAG);
		if (adoptedInferenceProvidersMigrationCount > 0) {
			if (needsRepair) {
				console.log(
					`Repaired inference_providers migration state in ${databasePath}: removed recorded column migrations, Drizzle will re-run the full chain.`
				);
			} else {
				console.log(
					`Backfilled ${adoptedInferenceProvidersMigrationCount} Drizzle migration record for existing inference_providers table in ${databasePath}.`
				);
			}
		}

		const db = drizzle(sqlite);
		migrate(db, { migrationsFolder: './drizzle' });
		console.log(`Database migrations are up to date for ${databasePath}.`);
		process.exit(0);
	}

	const db = drizzle(sqlite);
	migrate(db, { migrationsFolder: './drizzle' });
	console.log(`Database migrations are up to date for ${databasePath}.`);
} finally {
	sqlite.close();
}
