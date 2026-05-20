import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "$lib/server/db/schema";

let dbPath: string;

function seedConversation() {
	const sqlite = new Database(dbPath);
	sqlite.pragma("foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: "./drizzle" });

	db.insert(schema.users)
		.values({ id: "user-1", email: "user-1@example.com", passwordHash: "hash" })
		.run();
	db.insert(schema.conversations)
		.values({ id: "conv-1", userId: "user-1", title: "Draft test" })
		.run();

	sqlite.close();
}

describe("conversation drafts", () => {
	beforeEach(() => {
		dbPath = `/tmp/alfyai-conversation-drafts-${randomUUID()}.db`;
		process.env.DATABASE_PATH = dbPath;
		vi.resetModules();
	});

	afterEach(async () => {
		try {
			const { sqlite } = await import("$lib/server/db");
			sqlite.close();
		} catch {
			// The DB module may not have been imported if a test failed early.
		}
		try {
			unlinkSync(dbPath);
		} catch {
			// Temporary DB cleanup is best-effort.
		}
	});

	it("round-trips full pending skill selection metadata", async () => {
		seedConversation();
		const { getConversationDraft, upsertConversationDraft } = await import(
			"./conversation-drafts"
		);

		await upsertConversationDraft({
			userId: "user-1",
			conversationId: "conv-1",
			draftText: "Use this variant later",
			selectedAttachmentIds: [],
			selectedLinkedSources: [],
			pendingSkill: {
				id: "variant-1",
				ownership: "user",
				skillKind: "skill_variant",
				displayName: "Daily workbook variant",
				baseSkillId: "system:spreadsheet-builder",
				baseSkillDisplayName: "Spreadsheet Builder",
				unavailable: true,
			},
		});

		await expect(
			getConversationDraft("user-1", "conv-1"),
		).resolves.toMatchObject({
			pendingSkill: {
				id: "variant-1",
				ownership: "user",
				skillKind: "skill_variant",
				displayName: "Daily workbook variant",
				baseSkillId: "system:spreadsheet-builder",
				baseSkillDisplayName: "Spreadsheet Builder",
				unavailable: true,
			},
		});
	});
});
