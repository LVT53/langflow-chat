import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "$lib/server/db/schema";
import {
	countResearchSources,
	listResearchSources,
	markResearchSourceCited,
	markResearchSourceReviewed,
	saveDiscoveredResearchSource,
} from "./sources";

let dbPath: string;

async function seedDeepResearchJob() {
	const sqlite = new Database(dbPath);
	sqlite.pragma("foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: "./drizzle" });

	const now = new Date("2026-05-05T10:00:00.000Z");
	db.insert(schema.users)
		.values({
			id: "user-1",
			email: "user@example.com",
			passwordHash: "hash",
		})
		.run();
	db.insert(schema.conversations)
		.values({
			id: "conversation-1",
			userId: "user-1",
			title: "Research conversation",
			createdAt: now,
			updatedAt: now,
		})
		.run();
	db.insert(schema.messages)
		.values({
			id: "user-msg-1",
			conversationId: "conversation-1",
			role: "user",
			content: "Compare EU and US AI copyright training data rules",
			createdAt: now,
		})
		.run();
	db.insert(schema.deepResearchJobs)
		.values({
			id: "job-1",
			userId: "user-1",
			conversationId: "conversation-1",
			triggerMessageId: "user-msg-1",
			depth: "standard",
			status: "running",
			stage: "source_discovery",
			title: "Compare EU and US AI copyright training data rules",
			userRequest: "Compare EU and US AI copyright training data rules",
			createdAt: now,
			updatedAt: now,
		})
		.run();

	sqlite.close();
}

describe("deep research source ledger", () => {
	beforeEach(async () => {
		dbPath = `/tmp/alfyai-research-sources-${randomUUID()}.db`;
		process.env.DATABASE_PATH = dbPath;
		vi.resetModules();
		await seedDeepResearchJob();
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

	it("saves and lists Discovered Sources with job-scoped counts", async () => {
		const discovered = await saveDiscoveredResearchSource({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			url: "https://example.com/eu-ai-act",
			title: "EU AI Act overview",
			provider: "web_search",
			discoveredAt: new Date("2026-05-05T10:30:00.000Z"),
		});

		const sources = await listResearchSources({
			userId: "user-1",
			jobId: "job-1",
		});
		const counts = await countResearchSources({
			userId: "user-1",
			jobId: "job-1",
		});

		expect(discovered).toMatchObject({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			status: "discovered",
			url: "https://example.com/eu-ai-act",
			title: "EU AI Act overview",
			provider: "web_search",
			discoveredAt: "2026-05-05T10:30:00.000Z",
			reviewedAt: null,
			citedAt: null,
		});
		expect(discovered.id).toEqual(expect.any(String));
		expect(sources).toEqual([discovered]);
		expect(counts).toEqual({
			discovered: 1,
			reviewed: 0,
			cited: 0,
		});
	});

	it("does not allow a Discovered Source to become cited before review", async () => {
		const discovered = await saveDiscoveredResearchSource({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			url: "https://example.com/unreviewed-source",
			title: "Unreviewed source",
			provider: "web_search",
			discoveredAt: new Date("2026-05-05T10:30:00.000Z"),
		});

		await expect(
			markResearchSourceCited({
				userId: "user-1",
				sourceId: discovered.id,
				citedAt: new Date("2026-05-05T11:30:00.000Z"),
			}),
		).rejects.toThrow("Research source must be reviewed before citation");

		const counts = await countResearchSources({
			userId: "user-1",
			jobId: "job-1",
		});

		expect(counts).toEqual({
			discovered: 1,
			reviewed: 0,
			cited: 0,
		});
	});

	it("allows a Reviewed Source to later be marked cited", async () => {
		const discovered = await saveDiscoveredResearchSource({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			url: "https://example.com/reviewed-source",
			title: "Reviewed source",
			provider: "web_search",
			discoveredAt: new Date("2026-05-05T10:30:00.000Z"),
		});

		const reviewed = await markResearchSourceReviewed({
			userId: "user-1",
			sourceId: discovered.id,
			reviewedAt: new Date("2026-05-05T11:00:00.000Z"),
			reviewedNote: "Relevant authority for the report.",
		});
		const cited = await markResearchSourceCited({
			userId: "user-1",
			sourceId: reviewed.id,
			citedAt: new Date("2026-05-05T11:30:00.000Z"),
			citationNote: "Supports the comparison table.",
		});
		const sources = await listResearchSources({
			userId: "user-1",
			conversationId: "conversation-1",
		});
		const counts = await countResearchSources({
			userId: "user-1",
			conversationId: "conversation-1",
		});

		expect(reviewed).toMatchObject({
			id: discovered.id,
			status: "reviewed",
			reviewedAt: "2026-05-05T11:00:00.000Z",
			reviewedNote: "Relevant authority for the report.",
			citedAt: null,
		});
		expect(cited).toMatchObject({
			id: discovered.id,
			status: "cited",
			reviewedAt: "2026-05-05T11:00:00.000Z",
			citedAt: "2026-05-05T11:30:00.000Z",
			citationNote: "Supports the comparison table.",
		});
		expect(sources).toEqual([cited]);
		expect(counts).toEqual({
			discovered: 1,
			reviewed: 1,
			cited: 1,
		});
	});
});
