import { sqlite } from "$lib/server/db";

const DEEP_RESEARCH_FOREIGN_KEY_TABLES = [
	"deep_research_usage_records",
	"deep_research_resume_points",
	"deep_research_timeline_events",
	"deep_research_evidence_notes",
	"deep_research_tasks",
	"deep_research_jobs",
];

export type DeepResearchForeignKeyDiagnostics = {
	foreignKeyViolations: Record<string, unknown>[];
	tableForeignKeys: Record<string, Record<string, unknown>[]>;
};

export function buildDeepResearchForeignKeyDiagnostics(): DeepResearchForeignKeyDiagnostics {
	return {
		foreignKeyViolations: sqlite
			.prepare("PRAGMA foreign_key_check")
			.all() as Record<string, unknown>[],
		tableForeignKeys: Object.fromEntries(
			DEEP_RESEARCH_FOREIGN_KEY_TABLES.map((table) => [
				table,
				sqlite.prepare(`PRAGMA foreign_key_list(${table})`).all() as Record<
					string,
					unknown
				>[],
			]),
		),
	};
}

export function formatDeepResearchDiagnosticsJson(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

export function isSqliteForeignKeyConstraintError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const code = "code" in error ? (error as { code?: unknown }).code : undefined;
	return (
		code === "SQLITE_CONSTRAINT_FOREIGNKEY" ||
		(error instanceof Error &&
			error.message.includes("FOREIGN KEY constraint failed"))
	);
}
