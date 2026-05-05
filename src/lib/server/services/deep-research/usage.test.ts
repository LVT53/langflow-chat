import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "$lib/server/db/schema";
import {
	buildPlanGenerationResearchUsageRecord,
	listResearchUsageRecords,
	saveResearchUsageRecord,
} from "./usage";

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

describe("buildPlanGenerationResearchUsageRecord", () => {
	it("maps provider usage to research-specific usage without requiring a fake message id", () => {
		const usage = buildPlanGenerationResearchUsageRecord({
			jobId: "job-1",
			taskId: null,
			conversationId: "conversation-1",
			userId: "user-1",
			modelId: "provider:openrouter",
			modelDisplayName: "Research Planner",
			providerId: "openrouter",
			providerDisplayName: "OpenRouter",
			occurredAt: new Date("2026-05-05T10:20:00.000Z"),
			runtimeMs: 1234,
			providerUsage: {
				promptTokens: 1200,
				cachedInputTokens: 200,
				cacheHitTokens: 150,
				cacheMissTokens: 50,
				completionTokens: 300,
				reasoningTokens: 80,
				source: "provider",
			},
			costUsdMicros: 42,
		});

		expect(usage).toEqual({
			jobId: "job-1",
			taskId: null,
			conversationId: "conversation-1",
			userId: "user-1",
			stage: "plan_generation",
			operation: "plan_generation",
			modelId: "provider:openrouter",
			modelDisplayName: "Research Planner",
			providerId: "openrouter",
			providerDisplayName: "OpenRouter",
			billingMonth: "2026-05",
			occurredAt: "2026-05-05T10:20:00.000Z",
			promptTokens: 1200,
			cachedInputTokens: 200,
			cacheHitTokens: 150,
			cacheMissTokens: 50,
			completionTokens: 300,
			reasoningTokens: 80,
			totalTokens: 1580,
			usageSource: "provider",
			runtimeMs: 1234,
			costUsdMicros: 42,
		});
		expect("messageId" in usage).toBe(false);
	});
});

describe("research usage persistence", () => {
	beforeEach(async () => {
		dbPath = `/tmp/alfyai-research-usage-${randomUUID()}.db`;
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

	it("saves and lists research usage without requiring a message id", async () => {
		const usage = buildPlanGenerationResearchUsageRecord({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			modelId: "research-planner",
			modelDisplayName: "Research Planner",
			providerId: "internal",
			providerDisplayName: "Internal",
			occurredAt: new Date("2026-05-05T10:20:00.000Z"),
			runtimeMs: 1234,
			providerUsage: {
				promptTokens: 1200,
				completionTokens: 300,
				reasoningTokens: 80,
				source: "provider",
			},
			costUsdMicros: 42,
		});

		const saved = await saveResearchUsageRecord(usage);
		const records = await listResearchUsageRecords({
			userId: "user-1",
			jobId: "job-1",
		});

		expect(saved).toMatchObject(usage);
		expect(saved.id).toEqual(expect.any(String));
		expect("messageId" in saved).toBe(false);
		expect(records).toEqual([saved]);
	});
});
