import { sqlite } from './index';

type TableInfoRow = {
	name: string;
};

let ensureRuntimeSchemaCompatibilityPromise: Promise<void> | null = null;
let runtimeSchemaCompatibilityEnsured = false;

function hasTable(tableName: string): boolean {
	return Boolean(
		sqlite
			.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
			.get(tableName)
	);
}

function hasColumn(tableName: string, columnName: string): boolean {
	return sqlite
		.prepare(`PRAGMA table_info(${JSON.stringify(tableName)})`)
		.all()
		.some((row) => String((row as TableInfoRow).name) === columnName);
}

function ensureUsersHonchoPeerVersionColumn(): void {
	if (!hasTable('users') || hasColumn('users', 'honcho_peer_version')) {
		return;
	}

	sqlite.exec('ALTER TABLE users ADD COLUMN honcho_peer_version integer DEFAULT 0 NOT NULL');
	console.warn('[DB_COMPAT] Added missing users.honcho_peer_version column at runtime');
}

export async function ensureRuntimeSchemaCompatibility(): Promise<void> {
	if (runtimeSchemaCompatibilityEnsured) {
		return;
	}

	if (!ensureRuntimeSchemaCompatibilityPromise) {
		ensureRuntimeSchemaCompatibilityPromise = Promise.resolve().then(() => {
			ensureUsersHonchoPeerVersionColumn();
			runtimeSchemaCompatibilityEnsured = true;
		});
	}

	try {
		await ensureRuntimeSchemaCompatibilityPromise;
	} catch (error) {
		ensureRuntimeSchemaCompatibilityPromise = null;
		throw error;
	}
}
