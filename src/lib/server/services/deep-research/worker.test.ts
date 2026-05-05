import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "$lib/server/db/schema";

let dbPath: string;

async function seedConversation() {
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
			id: "conv-1",
			userId: "user-1",
			title: "Research conversation",
			createdAt: now,
			updatedAt: now,
		})
		.run();
	db.insert(schema.messages)
		.values({
			id: "user-msg-1",
			conversationId: "conv-1",
			role: "user",
			content: "Compare EU and US AI copyright training data rules",
			createdAt: now,
		})
		.run();

	sqlite.close();
}

async function createApprovedResearchJob() {
	const { approveDeepResearchPlan, startDeepResearchJobShell } = await import(
		"./index"
	);
	const created = await startDeepResearchJobShell({
		userId: "user-1",
		conversationId: "conv-1",
		triggerMessageId: "user-msg-1",
		userRequest: "Compare EU and US AI copyright training data rules",
		depth: "standard",
		now: new Date("2026-05-05T10:01:00.000Z"),
	});

	const approved = await approveDeepResearchPlan({
		userId: "user-1",
		jobId: created.id,
		now: new Date("2026-05-05T10:06:00.000Z"),
	});
	if (!approved)
		throw new Error("Expected Research Plan approval to return the job");
	return approved;
}

describe("mock Deep Research worker", () => {
	beforeEach(async () => {
		dbPath = `/tmp/alfyai-deep-research-worker-${randomUUID()}.db`;
		process.env.DATABASE_PATH = dbPath;
		vi.resetModules();
		await seedConversation();
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

	it("advances an approved job into the first persisted mock research stage", async () => {
		const approved = await createApprovedResearchJob();
		const { runNextMockDeepResearchWorkerStep } = await import("./worker");
		const { listConversationDeepResearchJobs } = await import("./index");
		const { listResearchTimelineEvents } = await import("./timeline");

		const result = await runNextMockDeepResearchWorkerStep({
			now: new Date("2026-05-05T10:07:00.000Z"),
		});
		const [reloaded] = await listConversationDeepResearchJobs(
			"user-1",
			"conv-1",
		);
		const timeline = await listResearchTimelineEvents({
			userId: "user-1",
			jobId: approved.id,
		});

		expect(result).toMatchObject({
			job: {
				id: approved.id,
				status: "running",
				stage: "source_discovery",
				updatedAt: new Date("2026-05-05T10:07:00.000Z").getTime(),
			},
			advanced: true,
		});
		expect(reloaded).toMatchObject({
			id: approved.id,
			status: "running",
			stage: "source_discovery",
		});
		expect(timeline).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					jobId: approved.id,
					stage: "source_discovery",
					kind: "stage_started",
					occurredAt: "2026-05-05T10:07:00.000Z",
					messageKey: "deepResearch.timeline.sourceDiscoveryStarted",
					summary: "Mock source discovery started.",
				}),
			]),
		);
	});

	it("advances the persisted mock stage sequence into a report-ready handoff state", async () => {
		const approved = await createApprovedResearchJob();
		const { runNextMockDeepResearchWorkerStep } = await import("./worker");
		const { listConversationDeepResearchJobs } = await import("./index");
		const { listResearchTimelineEvents } = await import("./timeline");

		await runNextMockDeepResearchWorkerStep({
			now: new Date("2026-05-05T10:07:00.000Z"),
		});
		await runNextMockDeepResearchWorkerStep({
			now: new Date("2026-05-05T10:08:00.000Z"),
		});
		await runNextMockDeepResearchWorkerStep({
			now: new Date("2026-05-05T10:09:00.000Z"),
		});
		const result = await runNextMockDeepResearchWorkerStep({
			now: new Date("2026-05-05T10:10:00.000Z"),
		});
		const [reloaded] = await listConversationDeepResearchJobs(
			"user-1",
			"conv-1",
		);
		const timeline = await listResearchTimelineEvents({
			userId: "user-1",
			jobId: approved.id,
		});

		expect(result).toMatchObject({
			job: {
				id: approved.id,
				status: "running",
				stage: "report_ready",
				completedAt: null,
				updatedAt: new Date("2026-05-05T10:10:00.000Z").getTime(),
			},
			advanced: true,
		});
		expect(reloaded).toEqual(result?.job);
		expect(
			timeline
				.filter(
					(event) =>
						event.kind === "stage_started" || event.kind === "stage_completed",
				)
				.map((event) => [event.stage, event.summary]),
		).toEqual([
			["source_discovery", "Mock source discovery started."],
			["source_review", "Mock source review completed."],
			["synthesis", "Mock synthesis completed."],
			["report_completion", "Mock research is ready for report generation."],
		]);
	});
});
