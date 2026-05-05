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

async function createApprovedResearchJob() {
	const { approveDeepResearchPlan, startDeepResearchJobShell } = await import(
		"./index"
	);
	const created = await startDeepResearchJobShell({
		userId: "user-1",
		conversationId: "conv-1",
		triggerMessageId: "user-msg-1",
		userRequest: "Compare EU and US AI copyright training data rules",
		depth: "focused",
		now: new Date("2026-05-05T10:01:00.000Z"),
	});
	const approved = await approveDeepResearchPlan({
		userId: "user-1",
		jobId: created.id,
		now: new Date("2026-05-05T10:06:00.000Z"),
	});
	if (!approved) throw new Error("Expected approval to return the job");
	return approved;
}

describe("real Deep Research workflow stepper", () => {
	beforeEach(async () => {
		dbPath = `/tmp/alfyai-deep-research-workflow-${randomUUID()}.db`;
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

	it("runs discovery for an approved job and persists source and timeline progress", async () => {
		const approved = await createApprovedResearchJob();
		const { saveDiscoveredResearchSource, listResearchSources } = await import(
			"./sources"
		);
		const { saveResearchTimelineEvent, listResearchTimelineEvents } =
			await import("./timeline");
		const { runDeepResearchWorkflowStep } = await import("./workflow");

		const result = await runDeepResearchWorkflowStep(
			{
				userId: "user-1",
				jobId: approved.id,
				now: new Date("2026-05-05T10:07:00.000Z"),
			},
			{
				discovery: {
					runPublicWebDiscoveryPass: async (input) => {
						const savedSource = await saveDiscoveredResearchSource({
							userId: input.userId,
							conversationId: input.conversationId,
							jobId: input.jobId,
							url: "https://agency.example.test/ai-copyright-training-data",
							title: "Agency AI copyright training data briefing",
							provider: "public_web",
							snippet: "Agency briefing on AI copyright training data rules.",
							discoveredAt: input.now,
						});
						await saveResearchTimelineEvent({
							jobId: input.jobId,
							conversationId: input.conversationId,
							userId: input.userId,
							taskId: null,
							stage: "source_discovery",
							kind: "stage_completed",
							occurredAt: input.now?.toISOString() ?? "",
							messageKey: "deepResearch.timeline.sourceDiscoveryCompleted",
							messageParams: { discovered: 1 },
							sourceCounts: {
								discovered: 1,
								reviewed: 0,
								cited: 0,
							},
							assumptions: [],
							warnings: [],
							summary: "Public web discovery found 1 candidate source.",
						});
						return {
							queries: [input.approvedPlan.goal],
							discoveredCount: 1,
							savedSources: [savedSource],
							warnings: [],
						};
					},
				},
			},
		);
		const sources = await listResearchSources({
			userId: "user-1",
			jobId: approved.id,
		});
		const timeline = await listResearchTimelineEvents({
			userId: "user-1",
			jobId: approved.id,
		});

		expect(result).toMatchObject({
			advanced: true,
			outcome: "discovery_completed",
			job: {
				id: approved.id,
				status: "running",
				stage: "source_review",
			},
		});
		expect(sources).toEqual([
			expect.objectContaining({
				jobId: approved.id,
				status: "discovered",
				url: "https://agency.example.test/ai-copyright-training-data",
			}),
		]);
		expect(timeline).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					jobId: approved.id,
					stage: "source_discovery",
					kind: "stage_completed",
					sourceCounts: {
						discovered: 1,
						reviewed: 0,
						cited: 0,
					},
				}),
			]),
		);
	});

	it("completes an audited report when reviewed coverage is sufficient", async () => {
		const approved = await createApprovedResearchJob();
		const { db } = await import("$lib/server/db");
		const {
			saveDiscoveredResearchSource,
			markResearchSourceReviewed,
			listResearchSources,
		} = await import("./sources");
		const { runDeepResearchWorkflowStep } = await import("./workflow");
		const { getArtifactForUser } = await import(
			"$lib/server/services/knowledge/store"
		);

		const discoveredSource = await saveDiscoveredResearchSource({
			userId: "user-1",
			conversationId: "conv-1",
			jobId: approved.id,
			url: "https://agency.example.test/ai-copyright-training-data",
			title: "Agency AI copyright training data briefing",
			provider: "public_web",
			snippet: "Agency briefing on AI copyright training data rules.",
			discoveredAt: new Date("2026-05-05T10:07:00.000Z"),
		});
		await markResearchSourceReviewed({
			userId: "user-1",
			sourceId: discoveredSource.id,
			reviewedAt: new Date("2026-05-05T10:08:00.000Z"),
			reviewedNote:
				"EU and US AI copyright training data rules require provenance records and rights-risk review.",
		});
		await db
			.update(schema.deepResearchJobs)
			.set({
				status: "running",
				stage: "source_review",
				updatedAt: new Date("2026-05-05T10:08:00.000Z"),
			})
			.where(eq(schema.deepResearchJobs.id, approved.id));

		const result = await runDeepResearchWorkflowStep({
			userId: "user-1",
			jobId: approved.id,
			now: new Date("2026-05-05T10:20:00.000Z"),
		});
		const completedReport = result?.job.reportArtifactId
			? await getArtifactForUser("user-1", result.job.reportArtifactId)
			: null;
		const [conversation] = await db
			.select({
				status: schema.conversations.status,
				sealedAt: schema.conversations.sealedAt,
			})
			.from(schema.conversations)
			.where(eq(schema.conversations.id, "conv-1"));
		const sources = await listResearchSources({
			userId: "user-1",
			jobId: approved.id,
		});

		expect(result).toMatchObject({
			advanced: true,
			outcome: "report_completed",
			job: {
				id: approved.id,
				status: "completed",
				stage: "report_ready",
				completedAt: new Date("2026-05-05T10:20:00.000Z").getTime(),
			},
		});
		expect(completedReport).toMatchObject({
			type: "generated_output",
			retrievalClass: "durable",
			metadata: {
				deepResearchReport: true,
				deepResearchReportKind: "audited",
				deepResearchJobId: approved.id,
			},
		});
		expect(completedReport?.contentText).toContain(
			"EU and US AI copyright training data rules require provenance records and rights-risk review.",
		);
		expect(conversation).toEqual({
			status: "sealed",
			sealedAt: new Date("2026-05-05T10:20:00.000Z"),
		});
		expect(sources).toEqual([
			expect.objectContaining({
				id: discoveredSource.id,
				status: "cited",
				reviewedAt: "2026-05-05T10:08:00.000Z",
				citedAt: "2026-05-05T10:20:00.000Z",
			}),
		]);
	});

	it("creates continuation tasks instead of a premature report when coverage has gaps and budget remains", async () => {
		const approved = await createApprovedResearchJob();
		const { db } = await import("$lib/server/db");
		const { runDeepResearchWorkflowStep } = await import("./workflow");
		const { listResearchTasks } = await import("./tasks");

		await db
			.update(schema.deepResearchJobs)
			.set({
				status: "running",
				stage: "source_review",
				updatedAt: new Date("2026-05-05T10:08:00.000Z"),
			})
			.where(eq(schema.deepResearchJobs.id, approved.id));

		const result = await runDeepResearchWorkflowStep({
			userId: "user-1",
			jobId: approved.id,
			now: new Date("2026-05-05T10:09:00.000Z"),
		});
		const tasks = await listResearchTasks({
			userId: "user-1",
			jobId: approved.id,
			passNumber: 1,
		});
		const [conversation] = await db
			.select({
				status: schema.conversations.status,
				sealedAt: schema.conversations.sealedAt,
			})
			.from(schema.conversations)
			.where(eq(schema.conversations.id, "conv-1"));

		expect(result).toMatchObject({
			advanced: true,
			outcome: "coverage_continuation_created",
			job: {
				id: approved.id,
				status: "running",
				stage: "research_tasks",
				reportArtifactId: null,
			},
		});
		expect(tasks).toEqual([
			expect.objectContaining({
				jobId: approved.id,
				status: "pending",
				assignmentType: "coverage_gap",
				keyQuestion: "What is the current state of the topic?",
			}),
			expect.objectContaining({
				jobId: approved.id,
				status: "pending",
				assignmentType: "coverage_gap",
				keyQuestion: "Which similarities and differences matter most?",
			}),
			expect.objectContaining({
				jobId: approved.id,
				status: "pending",
				assignmentType: "coverage_gap",
				keyQuestion: "What practical implications should the report call out?",
			}),
		]);
		expect(conversation).toEqual({
			status: "open",
			sealedAt: null,
		});
	});
});
