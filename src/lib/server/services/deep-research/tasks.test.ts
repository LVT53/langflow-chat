import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "$lib/server/db/schema";

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
			stage: "source_review",
			title: "Compare EU and US AI copyright training data rules",
			userRequest: "Compare EU and US AI copyright training data rules",
			createdAt: now,
			updatedAt: now,
		})
		.run();

	sqlite.close();
}

describe("deep research tasks", () => {
	beforeEach(async () => {
		dbPath = `/tmp/alfyai-research-tasks-${randomUUID()}.db`;
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

	it("creates targeted Research Tasks from Coverage Gaps for a job pass", async () => {
		const { createResearchTasksFromCoverageGaps, listResearchTasks } =
			await import("./tasks");

		const tasks = await createResearchTasksFromCoverageGaps({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passNumber: 2,
			gaps: [
				{
					id: "gap-eu-training-data",
					keyQuestion: "How does EU law treat AI training data?",
					summary: "Reviewed sources do not yet cover EU copyright exceptions.",
					severity: "critical",
				},
				{
					id: "gap-us-litigation",
					keyQuestion: "Which US litigation is still unresolved?",
					summary: "Need fresher source coverage for pending US cases.",
					severity: "important",
				},
			],
			now: new Date("2026-05-05T12:00:00.000Z"),
		});
		const reloaded = await listResearchTasks({
			userId: "user-1",
			jobId: "job-1",
			passNumber: 2,
		});

		expect(tasks).toHaveLength(2);
		expect(tasks[0]).toMatchObject({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			passNumber: 2,
			status: "pending",
			assignmentType: "coverage_gap",
			coverageGapId: "gap-eu-training-data",
			keyQuestion: "How does EU law treat AI training data?",
			assignment: "Reviewed sources do not yet cover EU copyright exceptions.",
			required: true,
			critical: true,
			createdAt: "2026-05-05T12:00:00.000Z",
		});
		expect(tasks[1]).toMatchObject({
			coverageGapId: "gap-us-litigation",
			required: true,
			critical: false,
		});
		expect(reloaded).toEqual(tasks);
	});

	it("blocks a Pass Barrier while required tasks are running and opens after allowed terminal states", async () => {
		const {
			claimResearchTasks,
			completeResearchTask,
			createResearchTasksFromCoverageGaps,
			evaluateResearchPassBarrier,
			recordResearchTaskFailure,
			skipResearchTask,
		} = await import("./tasks");

		const tasks = await createResearchTasksFromCoverageGaps({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passNumber: 3,
			gaps: [
				{
					id: "gap-critical",
					keyQuestion: "What is the primary legal difference?",
					summary: "Critical comparison gap.",
					severity: "critical",
				},
				{
					id: "gap-skip",
					keyQuestion: "Which secondary cases matter?",
					summary: "Secondary source group gap.",
					severity: "minor",
				},
				{
					id: "gap-noncritical-failure",
					keyQuestion: "What market commentary exists?",
					summary: "Optional market commentary gap.",
					severity: "important",
				},
			],
			now: new Date("2026-05-05T12:00:00.000Z"),
		});

		const claimed = await claimResearchTasks({
			userId: "user-1",
			jobId: "job-1",
			passNumber: 3,
			limit: 2,
			claimToken: "worker-pass-3",
			now: new Date("2026-05-05T12:05:00.000Z"),
		});
		const blocked = await evaluateResearchPassBarrier({
			userId: "user-1",
			jobId: "job-1",
			passNumber: 3,
		});

		expect(claimed.map((task) => task.id)).toEqual([tasks[0].id, tasks[1].id]);
		expect(claimed).toEqual([
			expect.objectContaining({ status: "running" }),
			expect.objectContaining({ status: "running" }),
		]);
		expect(blocked).toMatchObject({
			open: false,
			requiredTaskCount: 3,
			runningTaskIds: [tasks[0].id, tasks[1].id],
			pendingTaskIds: [tasks[2].id],
			blockedByTaskIds: [tasks[0].id, tasks[1].id, tasks[2].id],
		});

		await completeResearchTask({
			userId: "user-1",
			taskId: tasks[0].id,
			output: {
				summary: "Critical gap answered with reviewed sources.",
				findings: ["EU exceptions are narrower than US fair-use arguments."],
				sourceIds: ["source-1"],
			},
			now: new Date("2026-05-05T12:10:00.000Z"),
		});
		await skipResearchTask({
			userId: "user-1",
			taskId: tasks[1].id,
			reason: "Covered by another required task.",
			now: new Date("2026-05-05T12:11:00.000Z"),
		});
		await recordResearchTaskFailure({
			userId: "user-1",
			taskId: tasks[2].id,
			failureKind: "permanent",
			failureReason: "Low-quality duplicate sources only.",
			now: new Date("2026-05-05T12:12:00.000Z"),
		});

		const open = await evaluateResearchPassBarrier({
			userId: "user-1",
			jobId: "job-1",
			passNumber: 3,
		});

		expect(open).toMatchObject({
			open: true,
			blockedByTaskIds: [],
			completedTaskIds: [tasks[0].id],
			skippedTaskIds: [tasks[1].id],
			nonCriticalFailedTaskIds: [tasks[2].id],
			criticalFailedTaskIds: [],
		});
	});

	it("converts transient Research Task failures back into Coverage Gap-like output", async () => {
		const {
			createResearchTasksFromCoverageGaps,
			listCoverageGapsFromFailedResearchTasks,
			recordResearchTaskFailure,
		} = await import("./tasks");

		const [task] = await createResearchTasksFromCoverageGaps({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passNumber: 4,
			gaps: [
				{
					id: "gap-source-timeout",
					keyQuestion: "What did regulators publish in 2026?",
					summary: "Need fresh regulator source coverage.",
					severity: "critical",
				},
			],
			now: new Date("2026-05-05T13:00:00.000Z"),
		});
		await recordResearchTaskFailure({
			userId: "user-1",
			taskId: task.id,
			failureKind: "transient",
			failureReason:
				"Search provider timed out while retrieving regulator pages.",
			now: new Date("2026-05-05T13:05:00.000Z"),
		});

		const gaps = await listCoverageGapsFromFailedResearchTasks({
			userId: "user-1",
			jobId: "job-1",
			passNumber: 4,
		});

		expect(gaps).toEqual([
			{
				id: `failed-task-${task.id}`,
				sourceTaskId: task.id,
				keyQuestion: "What did regulators publish in 2026?",
				summary:
					"Research Task failed transiently: Search provider timed out while retrieving regulator pages.",
				severity: "critical",
				failureKind: "transient",
				failureReason:
					"Search provider timed out while retrieving regulator pages.",
			},
		]);
	});
});
