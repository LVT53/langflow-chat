import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
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

async function seedAdditionalConversation(input: {
	userId: string;
	conversationId: string;
	messageId: string;
	email?: string;
	createUser?: boolean;
}) {
	const sqlite = new Database(dbPath);
	sqlite.pragma("foreign_keys = ON");
	const db = drizzle(sqlite, { schema });

	const now = new Date("2026-05-05T10:00:00.000Z");
	if (input.createUser) {
		db.insert(schema.users)
			.values({
				id: input.userId,
				email: input.email ?? `${input.userId}@example.com`,
				passwordHash: "hash",
			})
			.run();
	}
	db.insert(schema.conversations)
		.values({
			id: input.conversationId,
			userId: input.userId,
			title: "Research conversation",
			createdAt: now,
			updatedAt: now,
		})
		.run();
	db.insert(schema.messages)
		.values({
			id: input.messageId,
			conversationId: input.conversationId,
			role: "user",
			content: "Compare EU and US AI copyright training data rules",
			createdAt: now,
		})
		.run();

	sqlite.close();
}

async function createApprovedResearchJob(
	input: {
		userId?: string;
		conversationId?: string;
		triggerMessageId?: string;
		userRequest?: string;
		depth?: "focused" | "standard" | "max";
		createdAt?: Date;
		approvedAt?: Date;
	} = {},
) {
	const { approveDeepResearchPlan, startDeepResearchJobShell } = await import(
		"./index"
	);
	const created = await startDeepResearchJobShell({
		userId: input.userId ?? "user-1",
		conversationId: input.conversationId ?? "conv-1",
		triggerMessageId: input.triggerMessageId ?? "user-msg-1",
		userRequest:
			input.userRequest ?? "Compare EU and US AI copyright training data rules",
		depth: input.depth ?? "standard",
		now: input.createdAt ?? new Date("2026-05-05T10:01:00.000Z"),
	});

	const approved = await approveDeepResearchPlan({
		userId: input.userId ?? "user-1",
		jobId: created.id,
		now: input.approvedAt ?? new Date("2026-05-05T10:06:00.000Z"),
	});
	if (!approved)
		throw new Error("Expected Research Plan approval to return the job");
	return approved;
}

async function setResearchJobState(input: {
	jobId: string;
	status: string;
	stage: string;
	updatedAt?: Date;
}) {
	const { db } = await import("$lib/server/db");
	await db
		.update(schema.deepResearchJobs)
		.set({
			status: input.status,
			stage: input.stage,
			updatedAt: input.updatedAt ?? new Date("2026-05-05T10:20:00.000Z"),
		})
		.where(eq(schema.deepResearchJobs.id, input.jobId));
}

describe("Deep Research worker tick and scheduler", () => {
	afterEach(async () => {
		const { stopDeepResearchWorkerScheduler } = await import("./worker");
		stopDeepResearchWorkerScheduler();
		vi.restoreAllMocks();
		vi.useRealTimers();
		vi.resetModules();
	});

	it("does nothing when the real workflow worker tick is disabled", async () => {
		const recoverStaleJobs = vi.fn();
		const advanceWorkflowStep = vi.fn();
		const { runDeepResearchWorkerTick } = await import("./worker");

		const result = await runDeepResearchWorkerTick({
			enabled: false,
			intervalMs: 5_000,
			staleTimeoutMs: 30_000,
			now: new Date("2026-05-05T10:00:00.000Z"),
			recoverStaleJobs,
			advanceWorkflowStep,
		});

		expect(result).toEqual({
			enabled: false,
			recoveredJobs: [],
			recoveredCount: 0,
			workerStep: null,
			advanced: false,
		});
		expect(recoverStaleJobs).not.toHaveBeenCalled();
		expect(advanceWorkflowStep).not.toHaveBeenCalled();
	});

	it("recovers stale jobs before advancing at most one real workflow step", async () => {
		const now = new Date("2026-05-05T10:00:00.000Z");
		const recoveredJob = { id: "recovered-job" };
		const advancedJob = { id: "advanced-job" };
		const recoverStaleJobs = vi.fn(async () => ({
			recoveredJobs: [recoveredJob],
		}));
		const advanceWorkflowStep = vi.fn(async () => ({
			job: advancedJob,
			advanced: true,
		}));
		const { runDeepResearchWorkerTick } = await import("./worker");

		const result = await runDeepResearchWorkerTick({
			enabled: true,
			intervalMs: 5_000,
			staleTimeoutMs: 30_000,
			controls: {
				globalConcurrencyLimit: 2,
				userConcurrencyLimit: 1,
			},
			now,
			recoverStaleJobs,
			advanceWorkflowStep,
		});

		expect(recoverStaleJobs).toHaveBeenCalledWith({
			now,
			timeoutMs: 30_000,
		});
		expect(advanceWorkflowStep).toHaveBeenCalledWith({
			now,
			controls: {
				globalConcurrencyLimit: 2,
				userConcurrencyLimit: 1,
			},
		});
		expect(recoverStaleJobs.mock.invocationCallOrder[0]).toBeLessThan(
			advanceWorkflowStep.mock.invocationCallOrder[0],
		);
		expect(result).toEqual({
			enabled: true,
			recoveredJobs: [recoveredJob],
			recoveredCount: 1,
			workerStep: {
				job: advancedJob,
				advanced: true,
			},
			advanced: true,
		});
	});

	it("starts one idempotent scheduler, unrefs its timer, and can stop it", async () => {
		const intervalCallbacks: Array<() => void> = [];
		const timer = { unref: vi.fn() };
		const setIntervalSpy = vi
			.spyOn(global, "setInterval")
			.mockImplementation((callback: TimerHandler, _intervalMs?: number) => {
				intervalCallbacks.push(callback as () => void);
				return timer as ReturnType<typeof setInterval>;
			});
		const clearIntervalSpy = vi
			.spyOn(global, "clearInterval")
			.mockImplementation(() => undefined);
		const recoverStaleJobs = vi.fn(async () => ({ recoveredJobs: [] }));
		const advanceWorkflowStep = vi.fn(async () => null);
		const { ensureDeepResearchWorkerScheduler, stopDeepResearchWorkerScheduler } =
			await import("./worker");

		ensureDeepResearchWorkerScheduler(() => ({
			enabled: true,
			intervalMs: 5_000,
			staleTimeoutMs: 30_000,
			now: new Date("2026-05-05T10:00:00.000Z"),
			recoverStaleJobs,
			advanceWorkflowStep,
		}));
		ensureDeepResearchWorkerScheduler(() => ({
			enabled: true,
			intervalMs: 10_000,
			staleTimeoutMs: 60_000,
			recoverStaleJobs,
			advanceWorkflowStep,
		}));

		expect(setIntervalSpy).toHaveBeenCalledOnce();
		expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5_000);
		expect(timer.unref).toHaveBeenCalledOnce();

		intervalCallbacks[0]?.();
		await Promise.resolve();

		expect(recoverStaleJobs).toHaveBeenCalledOnce();
		expect(advanceWorkflowStep).toHaveBeenCalledOnce();

		stopDeepResearchWorkerScheduler();

		expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
	});

	it("does not start a timer when the scheduler options are disabled", async () => {
		const setIntervalSpy = vi.spyOn(global, "setInterval");
		const { ensureDeepResearchWorkerScheduler } = await import("./worker");

		ensureDeepResearchWorkerScheduler(() => ({
			enabled: false,
			intervalMs: 5_000,
			staleTimeoutMs: 30_000,
		}));

		expect(setIntervalSpy).not.toHaveBeenCalled();
	});
});

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

	it("advances an approved job by explicit trigger without an open chat stream", async () => {
		const approved = await createApprovedResearchJob();
		const { triggerMockDeepResearchWorkerForJob } = await import("./worker");
		const { listConversationDeepResearchJobs } = await import("./index");

		const result = await triggerMockDeepResearchWorkerForJob({
			userId: "user-1",
			jobId: approved.id,
			now: new Date("2026-05-05T10:07:00.000Z"),
		});
		const [reloaded] = await listConversationDeepResearchJobs(
			"user-1",
			"conv-1",
		);

		expect(result).toMatchObject({
			job: {
				id: approved.id,
				status: "running",
				stage: "source_discovery",
				updatedAt: new Date("2026-05-05T10:07:00.000Z").getTime(),
			},
			advanced: true,
		});
		expect(reloaded).toEqual(result?.job);
	});

	it("honors configured global and user concurrency limits before starting approved work", async () => {
		await seedAdditionalConversation({
			userId: "user-1",
			conversationId: "conv-2",
			messageId: "user-msg-2",
		});
		await seedAdditionalConversation({
			userId: "user-2",
			conversationId: "conv-3",
			messageId: "user-msg-3",
			email: "second-user@example.com",
			createUser: true,
		});

		const firstUserRunning = await createApprovedResearchJob({
			createdAt: new Date("2026-05-05T10:01:00.000Z"),
			approvedAt: new Date("2026-05-05T10:06:00.000Z"),
		});
		const sameUserApproved = await createApprovedResearchJob({
			conversationId: "conv-2",
			triggerMessageId: "user-msg-2",
			userRequest: "Research the same issue for product teams",
			createdAt: new Date("2026-05-05T10:02:00.000Z"),
			approvedAt: new Date("2026-05-05T10:07:00.000Z"),
		});
		const otherUserApproved = await createApprovedResearchJob({
			userId: "user-2",
			conversationId: "conv-3",
			triggerMessageId: "user-msg-3",
			userRequest: "Research the same issue for counsel",
			createdAt: new Date("2026-05-05T10:03:00.000Z"),
			approvedAt: new Date("2026-05-05T10:08:00.000Z"),
		});
		const { triggerMockDeepResearchWorkerForJob } = await import("./worker");
		const { listConversationDeepResearchJobs } = await import("./index");

		await expect(
			triggerMockDeepResearchWorkerForJob({
				userId: "user-1",
				jobId: firstUserRunning.id,
				now: new Date("2026-05-05T10:09:00.000Z"),
			}),
		).resolves.toMatchObject({
			job: {
				id: firstUserRunning.id,
				status: "running",
				stage: "source_discovery",
			},
			advanced: true,
		});

		await expect(
			triggerMockDeepResearchWorkerForJob({
				userId: "user-1",
				jobId: sameUserApproved.id,
				now: new Date("2026-05-05T10:10:00.000Z"),
				controls: {
					globalConcurrencyLimit: 10,
					userConcurrencyLimit: 1,
				},
			}),
		).resolves.toMatchObject({
			job: {
				id: sameUserApproved.id,
				status: "approved",
				stage: "plan_approved",
			},
			advanced: false,
		});

		await expect(
			triggerMockDeepResearchWorkerForJob({
				userId: "user-2",
				jobId: otherUserApproved.id,
				now: new Date("2026-05-05T10:11:00.000Z"),
				controls: {
					globalConcurrencyLimit: 10,
					userConcurrencyLimit: 1,
				},
			}),
		).resolves.toMatchObject({
			job: {
				id: otherUserApproved.id,
				status: "running",
				stage: "source_discovery",
			},
			advanced: true,
		});

		await expect(
			triggerMockDeepResearchWorkerForJob({
				userId: "user-1",
				jobId: sameUserApproved.id,
				now: new Date("2026-05-05T10:12:00.000Z"),
				controls: {
					globalConcurrencyLimit: 2,
				},
			}),
		).resolves.toMatchObject({
			job: {
				id: sameUserApproved.id,
				status: "approved",
				stage: "plan_approved",
			},
			advanced: false,
		});

		const [sameUserReloaded] = await listConversationDeepResearchJobs(
			"user-1",
			"conv-2",
		);
		expect(sameUserReloaded).toMatchObject({
			id: sameUserApproved.id,
			status: "approved",
			stage: "plan_approved",
		});
	});

	it("does not advance non-approved, cancelled, or failed jobs by explicit trigger", async () => {
		const { startDeepResearchJobShell, cancelPrePlanDeepResearchJob } =
			await import("./index");
		const { triggerMockDeepResearchWorkerForJob } = await import("./worker");
		const { db } = await import("$lib/server/db");

		const awaitingApproval = await startDeepResearchJobShell({
			userId: "user-1",
			conversationId: "conv-1",
			triggerMessageId: "user-msg-1",
			userRequest: "Compare EU and US AI copyright training data rules",
			depth: "standard",
			now: new Date("2026-05-05T10:01:00.000Z"),
		});

		await expect(
			triggerMockDeepResearchWorkerForJob({
				userId: "user-1",
				jobId: awaitingApproval.id,
				now: new Date("2026-05-05T10:07:00.000Z"),
			}),
		).resolves.toMatchObject({
			job: {
				id: awaitingApproval.id,
				status: "awaiting_approval",
				stage: "plan_drafted",
			},
			advanced: false,
		});

		const cancelled = await cancelPrePlanDeepResearchJob({
			userId: "user-1",
			jobId: awaitingApproval.id,
			now: new Date("2026-05-05T10:08:00.000Z"),
		});

		await expect(
			triggerMockDeepResearchWorkerForJob({
				userId: "user-1",
				jobId: cancelled?.id ?? awaitingApproval.id,
				now: new Date("2026-05-05T10:09:00.000Z"),
			}),
		).resolves.toMatchObject({
			job: {
				id: awaitingApproval.id,
				status: "cancelled",
				stage: "cancelled_before_approval",
			},
			advanced: false,
		});

		const failedJob = await startDeepResearchJobShell({
			userId: "user-1",
			conversationId: "conv-1",
			triggerMessageId: "user-msg-1",
			userRequest: "Compare EU and US AI copyright training data rules again",
			depth: "focused",
			now: new Date("2026-05-05T10:10:00.000Z"),
		});
		await db
			.update(schema.deepResearchJobs)
			.set({
				status: "failed",
				stage: "mock_failed",
				updatedAt: new Date("2026-05-05T10:11:00.000Z"),
			})
			.where(eq(schema.deepResearchJobs.id, failedJob.id));

		await expect(
			triggerMockDeepResearchWorkerForJob({
				userId: "user-1",
				jobId: failedJob.id,
				now: new Date("2026-05-05T10:12:00.000Z"),
			}),
		).resolves.toMatchObject({
			job: {
				id: failedJob.id,
				status: "failed",
				stage: "mock_failed",
			},
			advanced: false,
		});
	});

	it("marks stale running and report-ready jobs failed after the configured timeout", async () => {
		await seedAdditionalConversation({
			userId: "user-1",
			conversationId: "conv-2",
			messageId: "user-msg-2",
		});
		const runningJob = await createApprovedResearchJob({
			createdAt: new Date("2026-05-05T10:01:00.000Z"),
			approvedAt: new Date("2026-05-05T10:02:00.000Z"),
		});
		const reportReadyJob = await createApprovedResearchJob({
			conversationId: "conv-2",
			triggerMessageId: "user-msg-2",
			userRequest: "Research stale report ready recovery",
			createdAt: new Date("2026-05-05T10:03:00.000Z"),
			approvedAt: new Date("2026-05-05T10:04:00.000Z"),
		});
		const { db } = await import("$lib/server/db");
		await db
			.update(schema.deepResearchJobs)
			.set({
				status: "running",
				stage: "source_review",
				updatedAt: new Date("2026-05-05T09:00:00.000Z"),
			})
			.where(eq(schema.deepResearchJobs.id, runningJob.id));
		await db
			.update(schema.deepResearchJobs)
			.set({
				status: "running",
				stage: "report_ready",
				updatedAt: new Date("2026-05-05T09:10:00.000Z"),
			})
			.where(eq(schema.deepResearchJobs.id, reportReadyJob.id));
		const { recoverStaleDeepResearchJobs } = await import("./worker");
		const { listResearchTimelineEvents } = await import("./timeline");

		const result = await recoverStaleDeepResearchJobs({
			now: new Date("2026-05-05T11:00:00.000Z"),
			timeoutMs: 30 * 60 * 1000,
		});
		const runningTimeline = await listResearchTimelineEvents({
			userId: "user-1",
			jobId: runningJob.id,
		});
		const reportReadyTimeline = await listResearchTimelineEvents({
			userId: "user-1",
			jobId: reportReadyJob.id,
		});

		expect(
			result.recoveredJobs.map((job) => [job.id, job.status, job.stage]),
		).toEqual([
			[runningJob.id, "failed", "stale_recovered_failed"],
			[reportReadyJob.id, "failed", "stale_recovered_failed"],
		]);
		expect(
			runningTimeline.map((event) => ({
				stage: event.stage,
				kind: event.kind,
				summary: event.summary,
				warnings: event.warnings,
			})),
		).toContainEqual({
			stage: "report_completion",
			kind: "warning",
			summary:
				"Deep Research job marked failed after exceeding the stale worker timeout.",
			warnings: ["Worker timeout exceeded for stage source_review."],
		});
		expect(
			reportReadyTimeline.map((event) => ({
				stage: event.stage,
				kind: event.kind,
				summary: event.summary,
				warnings: event.warnings,
			})),
		).toContainEqual({
			stage: "report_completion",
			kind: "warning",
			summary:
				"Deep Research job marked failed after exceeding the stale worker timeout.",
			warnings: ["Worker timeout exceeded for stage report_ready."],
		});
	});

	it("cancels running mock work before further advancement and records a diagnostic timeline summary", async () => {
		const approved = await createApprovedResearchJob();
		const {
			requestDeepResearchWorkerCancellation,
			triggerMockDeepResearchWorkerForJob,
		} = await import("./worker");
		const { listResearchTimelineEvents } = await import("./timeline");

		await triggerMockDeepResearchWorkerForJob({
			userId: "user-1",
			jobId: approved.id,
			now: new Date("2026-05-05T10:07:00.000Z"),
		});
		const cancelled = await requestDeepResearchWorkerCancellation({
			userId: "user-1",
			jobId: approved.id,
			now: new Date("2026-05-05T10:08:00.000Z"),
		});
		const laterTrigger = await triggerMockDeepResearchWorkerForJob({
			userId: "user-1",
			jobId: approved.id,
			now: new Date("2026-05-05T10:09:00.000Z"),
		});
		const timeline = await listResearchTimelineEvents({
			userId: "user-1",
			jobId: approved.id,
		});

		expect(cancelled).toMatchObject({
			id: approved.id,
			status: "cancelled",
			stage: "cancelled_by_request",
			cancelledAt: new Date("2026-05-05T10:08:00.000Z").getTime(),
		});
		expect(laterTrigger).toMatchObject({
			job: {
				id: approved.id,
				status: "cancelled",
				stage: "cancelled_by_request",
			},
			advanced: false,
		});
		expect(
			timeline.map((event) => ({
				stage: event.stage,
				kind: event.kind,
				messageKey: event.messageKey,
				summary: event.summary,
				warnings: event.warnings,
			})),
		).toContainEqual({
			stage: "report_completion",
			kind: "warning",
			messageKey: "deepResearch.timeline.workerCancelled",
			summary: "Deep Research job cancelled before further worker advancement.",
			warnings: [
				"Cancellation requested while job was at stage source_discovery.",
			],
		});
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

describe("real Deep Research workflow worker", () => {
	beforeEach(async () => {
		dbPath = `/tmp/alfyai-deep-research-workflow-worker-${randomUUID()}.db`;
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

	it("runs one workflow step for the oldest eligible real workflow job", async () => {
		await seedAdditionalConversation({
			userId: "user-1",
			conversationId: "conv-2",
			messageId: "user-msg-2",
		});
		const older = await createApprovedResearchJob({
			createdAt: new Date("2026-05-05T10:01:00.000Z"),
			approvedAt: new Date("2026-05-05T10:06:00.000Z"),
		});
		const newer = await createApprovedResearchJob({
			conversationId: "conv-2",
			triggerMessageId: "user-msg-2",
			userRequest: "Research newer eligible work",
			createdAt: new Date("2026-05-05T10:02:00.000Z"),
			approvedAt: new Date("2026-05-05T10:07:00.000Z"),
		});
		const workflowStep = vi.fn(async (input: { userId: string; jobId: string }) => {
			const { listConversationDeepResearchJobs } = await import("./index");
			const conversationId = input.jobId === older.id ? "conv-1" : "conv-2";
			const jobs = await listConversationDeepResearchJobs(
				input.userId,
				conversationId,
			);
			return {
				job: jobs.find((job) => job.id === input.jobId) ?? older,
				advanced: true,
				outcome: "discovery_completed" as const,
			};
		});
		const { runNextDeepResearchWorkflowWorkerStep } = await import("./worker");

		const result = await runNextDeepResearchWorkflowWorkerStep({
			now: new Date("2026-05-05T10:08:00.000Z"),
			workflowStep,
		});

		expect(workflowStep).toHaveBeenCalledTimes(1);
		expect(workflowStep).toHaveBeenCalledWith({
			userId: "user-1",
			jobId: older.id,
			now: new Date("2026-05-05T10:08:00.000Z"),
		});
		expect(result).toMatchObject({
			job: {
				id: older.id,
			},
			advanced: true,
		});
		expect(result?.job.id).not.toBe(newer.id);
	});

	it("advances only a user-owned job by explicit workflow trigger", async () => {
		await seedAdditionalConversation({
			userId: "user-2",
			conversationId: "conv-2",
			messageId: "user-msg-2",
			email: "second-user@example.com",
			createUser: true,
		});
		const otherUserJob = await createApprovedResearchJob({
			userId: "user-2",
			conversationId: "conv-2",
			triggerMessageId: "user-msg-2",
			createdAt: new Date("2026-05-05T10:01:00.000Z"),
			approvedAt: new Date("2026-05-05T10:06:00.000Z"),
		});
		const workflowStep = vi.fn(async () => ({
			job: otherUserJob,
			advanced: true,
			outcome: "discovery_completed" as const,
		}));
		const { triggerDeepResearchWorkflowWorkerForJob } = await import(
			"./worker"
		);

		await expect(
			triggerDeepResearchWorkflowWorkerForJob({
				userId: "user-1",
				jobId: otherUserJob.id,
				now: new Date("2026-05-05T10:07:00.000Z"),
				workflowStep,
			}),
		).resolves.toBeNull();

		const result = await triggerDeepResearchWorkflowWorkerForJob({
			userId: "user-2",
			jobId: otherUserJob.id,
			now: new Date("2026-05-05T10:08:00.000Z"),
			workflowStep,
		});

		expect(workflowStep).toHaveBeenCalledTimes(1);
		expect(workflowStep).toHaveBeenCalledWith({
			userId: "user-2",
			jobId: otherUserJob.id,
			now: new Date("2026-05-05T10:08:00.000Z"),
		});
		expect(result).toMatchObject({
			job: {
				id: otherUserJob.id,
			},
			advanced: true,
		});
	});

	it("enforces concurrency only before starting approved workflow jobs", async () => {
		await seedAdditionalConversation({
			userId: "user-1",
			conversationId: "conv-2",
			messageId: "user-msg-2",
		});
		const running = await createApprovedResearchJob({
			createdAt: new Date("2026-05-05T10:01:00.000Z"),
			approvedAt: new Date("2026-05-05T10:06:00.000Z"),
		});
		await setResearchJobState({
			jobId: running.id,
			status: "running",
			stage: "source_review",
		});
		const approved = await createApprovedResearchJob({
			conversationId: "conv-2",
			triggerMessageId: "user-msg-2",
			userRequest: "Research queued approved work",
			createdAt: new Date("2026-05-05T10:02:00.000Z"),
			approvedAt: new Date("2026-05-05T10:07:00.000Z"),
		});
		const workflowStep = vi.fn(async (input: { userId: string; jobId: string }) => {
			const { listConversationDeepResearchJobs } = await import("./index");
			const conversationId = input.jobId === running.id ? "conv-1" : "conv-2";
			const jobs = await listConversationDeepResearchJobs(
				input.userId,
				conversationId,
			);
			const job = jobs.find((candidate) => candidate.id === input.jobId);
			if (!job) throw new Error("Expected job to reload");
			return {
				job,
				advanced: true,
				outcome: "report_completed" as const,
			};
		});
		const {
			triggerDeepResearchWorkflowWorkerForJob,
			runNextDeepResearchWorkflowWorkerStep,
		} = await import("./worker");

		await expect(
			triggerDeepResearchWorkflowWorkerForJob({
				userId: "user-1",
				jobId: approved.id,
				controls: {
					userConcurrencyLimit: 1,
				},
				workflowStep,
			}),
		).resolves.toMatchObject({
			job: {
				id: approved.id,
				status: "approved",
				stage: "plan_approved",
			},
			advanced: false,
		});
		expect(workflowStep).not.toHaveBeenCalled();

		await expect(
			triggerDeepResearchWorkflowWorkerForJob({
				userId: "user-1",
				jobId: running.id,
				controls: {
					globalConcurrencyLimit: 0,
					userConcurrencyLimit: 0,
				},
				workflowStep,
			}),
		).resolves.toMatchObject({
			job: {
				id: running.id,
				status: "running",
				stage: "source_review",
			},
			advanced: true,
		});

		const nextResult = await runNextDeepResearchWorkflowWorkerStep({
			controls: {
				userConcurrencyLimit: 1,
			},
			workflowStep,
		});

		expect(nextResult).toMatchObject({
			job: {
				id: running.id,
			},
			advanced: true,
		});
		expect(workflowStep).toHaveBeenCalledTimes(2);
	});

	it("returns terminal workflow jobs without advancing them", async () => {
		const approved = await createApprovedResearchJob();
		await setResearchJobState({
			jobId: approved.id,
			status: "completed",
			stage: "report_completed",
		});
		const workflowStep = vi.fn();
		const { triggerDeepResearchWorkflowWorkerForJob } = await import(
			"./worker"
		);

		const result = await triggerDeepResearchWorkflowWorkerForJob({
			userId: "user-1",
			jobId: approved.id,
			now: new Date("2026-05-05T10:08:00.000Z"),
			workflowStep,
		});

		expect(workflowStep).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			job: {
				id: approved.id,
				status: "completed",
				stage: "report_completed",
			},
			advanced: false,
		});
	});
});
