import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "$lib/server/db/schema";
import {
	createPlanGenerationTimelineEvent,
	listResearchTimelineEvents,
	saveResearchTimelineEvent,
} from "./timeline";

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
			status: "awaiting_approval",
			stage: "plan_drafted",
			title: "Compare EU and US AI copyright training data rules",
			userRequest: "Compare EU and US AI copyright training data rules",
			createdAt: now,
			updatedAt: now,
		})
		.run();

	sqlite.close();
}

describe("createPlanGenerationTimelineEvent", () => {
	it("records a plan-generation timeline event without exposing private reasoning", () => {
		const event = createPlanGenerationTimelineEvent({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			stage: "plan_generation",
			researchLanguage: "en",
			occurredAt: new Date("2026-05-05T10:15:00.000Z"),
			sourceCounts: {
				discovered: 0,
				reviewed: 0,
				cited: 0,
			},
			assumptions: [
				"Current chat and library summaries are planning context only.",
			],
			warnings: ["No source-heavy research has started before approval."],
			privateReasoning:
				"The planner internally compared alternative source strategies.",
		});

		expect(event).toEqual({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			taskId: null,
			stage: "plan_generation",
			kind: "plan_generated",
			occurredAt: "2026-05-05T10:15:00.000Z",
			messageKey: "deepResearch.timeline.planGenerated",
			messageParams: {
				discoveredSources: 0,
				reviewedSources: 0,
				citedSources: 0,
			},
			sourceCounts: {
				discovered: 0,
				reviewed: 0,
				cited: 0,
			},
			assumptions: [
				"Current chat and library summaries are planning context only.",
			],
			warnings: ["No source-heavy research has started before approval."],
			summary: "Research Plan drafted for approval.",
		});
		expect(JSON.stringify(event)).not.toContain("private");
		expect(JSON.stringify(event)).not.toContain(
			"alternative source strategies",
		);
	});

	it("renders Hungarian user-facing plan-generation timeline summary", () => {
		const event = createPlanGenerationTimelineEvent({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			stage: "plan_generation",
			researchLanguage: "hu",
			occurredAt: new Date("2026-05-05T10:15:00.000Z"),
		});

		expect(event.messageKey).toBe("deepResearch.timeline.planGenerated");
		expect(event.summary).toBe("A kutatási terv elkészült jóváhagyásra.");
	});
});

describe("research timeline persistence", () => {
	beforeEach(async () => {
		dbPath = `/tmp/alfyai-research-timeline-${randomUUID()}.db`;
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

	it("saves and lists a plan-generation timeline event for a Deep Research Job", async () => {
		const event = createPlanGenerationTimelineEvent({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			stage: "plan_generation",
			researchLanguage: "en",
			occurredAt: new Date("2026-05-05T10:15:00.000Z"),
			assumptions: ["Library summaries are planning context only."],
			warnings: ["No source-heavy research has started before approval."],
		});

		const saved = await saveResearchTimelineEvent(event);
		const events = await listResearchTimelineEvents({
			userId: "user-1",
			jobId: "job-1",
		});

		expect(saved).toMatchObject(event);
		expect(saved.id).toEqual(expect.any(String));
		expect(events).toEqual([saved]);
	});
});
