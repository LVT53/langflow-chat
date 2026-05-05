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

	it("reviews discovered sources during the source review step and records timeline progress", async () => {
		const approved = await createApprovedResearchJob();
		const { db } = await import("$lib/server/db");
		const { saveDiscoveredResearchSource, listResearchSources } = await import(
			"./sources"
		);
		const { listResearchTimelineEvents } = await import("./timeline");
		const { runDeepResearchWorkflowStep } = await import("./workflow");

		const discoveredSource = await saveDiscoveredResearchSource({
			userId: "user-1",
			conversationId: "conv-1",
			jobId: approved.id,
			url: "https://agency.example.test/ai-copyright-training-data",
			title: "Agency AI copyright training data briefing",
			provider: "public_web",
			snippet:
				"EU and US AI copyright training data rules require provenance records and rights-risk review.",
			discoveredAt: new Date("2026-05-05T10:07:00.000Z"),
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
			now: new Date("2026-05-05T10:09:00.000Z"),
		});
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
			outcome: "report_completed",
		});
		expect(sources).toEqual([
			expect.objectContaining({
				id: discoveredSource.id,
				status: "cited",
				reviewedAt: "2026-05-05T10:09:00.000Z",
				reviewedNote:
					"EU and US AI copyright training data rules require provenance records and rights-risk review.",
			}),
		]);
		expect(timeline).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					jobId: approved.id,
					stage: "source_review",
					kind: "stage_completed",
					sourceCounts: {
						discovered: 1,
						reviewed: 1,
						cited: 0,
					},
				}),
			]),
		);
	});

	it("does not let duplicate or low-quality discovered sources inflate reviewed count", async () => {
		const approved = await createApprovedResearchJob();
		const { db } = await import("$lib/server/db");
		const { saveDiscoveredResearchSource, listResearchSources } = await import(
			"./sources"
		);
		const { listResearchTimelineEvents } = await import("./timeline");
		const { runDeepResearchWorkflowStep } = await import("./workflow");

		const primarySource = await saveDiscoveredResearchSource({
			userId: "user-1",
			conversationId: "conv-1",
			jobId: approved.id,
			url: "https://agency.gov/ai-copyright-training-data?utm_source=search",
			title: "Agency AI copyright training data methodology",
			provider: "public_web",
			snippet:
				"Methodology and data on AI copyright training data rules in the EU and US.",
			discoveredAt: new Date("2026-05-05T10:07:00.000Z"),
		});
		await saveDiscoveredResearchSource({
			userId: "user-1",
			conversationId: "conv-1",
			jobId: approved.id,
			url: "https://agency.gov/ai-copyright-training-data/#summary",
			title: "Duplicate agency page",
			provider: "public_web",
			snippet: "Duplicate copy of the agency briefing.",
			discoveredAt: new Date("2026-05-05T10:07:30.000Z"),
		});
		await saveDiscoveredResearchSource({
			userId: "user-1",
			conversationId: "conv-1",
			jobId: approved.id,
			url: "https://random-blog.example.test/shocking-ai-listicle",
			title: "Shocking unsourced AI copyright listicle",
			provider: "public_web",
			snippet: "Unsourced listicle with no citations or methodology.",
			discoveredAt: new Date("2026-05-05T10:08:00.000Z"),
		});
		await db
			.update(schema.deepResearchJobs)
			.set({
				status: "running",
				stage: "source_review",
				updatedAt: new Date("2026-05-05T10:08:00.000Z"),
			})
			.where(eq(schema.deepResearchJobs.id, approved.id));

		await runDeepResearchWorkflowStep({
			userId: "user-1",
			jobId: approved.id,
			now: new Date("2026-05-05T10:09:00.000Z"),
		});
		const sources = await listResearchSources({
			userId: "user-1",
			jobId: approved.id,
		});
		const timeline = await listResearchTimelineEvents({
			userId: "user-1",
			jobId: approved.id,
		});

		expect(sources.filter((source) => source.reviewedAt)).toEqual([
			expect.objectContaining({
				id: primarySource.id,
				status: "cited",
			}),
		]);
		expect(timeline).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					stage: "source_review",
					kind: "stage_completed",
					sourceCounts: {
						discovered: 3,
						reviewed: 1,
						cited: 0,
					},
				}),
			]),
		);
	});

	it("records a source review warning and continues to coverage handoff when review fails", async () => {
		const approved = await createApprovedResearchJob();
		const { db } = await import("$lib/server/db");
		const { saveDiscoveredResearchSource } = await import("./sources");
		const { triageAndReviewSources } = await import("./source-review");
		const { listResearchTasks } = await import("./tasks");
		const { listResearchTimelineEvents } = await import("./timeline");
		const { runDeepResearchWorkflowStep } = await import("./workflow");

		await saveDiscoveredResearchSource({
			userId: "user-1",
			conversationId: "conv-1",
			jobId: approved.id,
			url: "https://agency.gov/ai-copyright-training-data",
			title: "Agency AI copyright training data methodology",
			provider: "public_web",
			snippet:
				"Methodology and data on AI copyright training data rules in the EU and US.",
			discoveredAt: new Date("2026-05-05T10:07:00.000Z"),
		});
		await db
			.update(schema.deepResearchJobs)
			.set({
				status: "running",
				stage: "source_review",
				updatedAt: new Date("2026-05-05T10:08:00.000Z"),
			})
			.where(eq(schema.deepResearchJobs.id, approved.id));

		const result = await runDeepResearchWorkflowStep(
			{
				userId: "user-1",
				jobId: approved.id,
				now: new Date("2026-05-05T10:09:00.000Z"),
			},
			{
				sourceReview: {
					triageAndReviewSources,
					reviewer: {
						reviewSource: async () => {
							throw new Error("provider timeout");
						},
					},
				},
			},
		);
		const tasks = await listResearchTasks({
			userId: "user-1",
			jobId: approved.id,
			passNumber: 1,
		});
		const timeline = await listResearchTimelineEvents({
			userId: "user-1",
			jobId: approved.id,
		});

		expect(result).toMatchObject({
			advanced: true,
			outcome: "coverage_continuation_created",
			job: {
				id: approved.id,
				status: "running",
				stage: "research_tasks",
			},
		});
		expect(tasks.length).toBeGreaterThan(0);
		expect(timeline).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					stage: "source_review",
					kind: "warning",
					warnings: ["Source review could not complete: provider timeout"],
					sourceCounts: {
						discovered: 1,
						reviewed: 0,
						cited: 0,
					},
				}),
			]),
		);
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

	it("completes with report limitations when source review budget is exhausted after reviewed evidence", async () => {
		const approved = await createApprovedResearchJob();
		const { db } = await import("$lib/server/db");
		const {
			saveDiscoveredResearchSource,
			markResearchSourceReviewed,
		} = await import("./sources");
		const { listResearchTimelineEvents } = await import("./timeline");
		const { runDeepResearchWorkflowStep } = await import("./workflow");
		const { getArtifactForUser } = await import(
			"$lib/server/services/knowledge/store"
		);

		const source = await saveDiscoveredResearchSource({
			userId: "user-1",
			conversationId: "conv-1",
			jobId: approved.id,
			url: "https://agency.example.test/limited-ai-copyright-training-data",
			title: "Limited agency AI copyright training data briefing",
			provider: "public_web",
			snippet: "Agency briefing on AI copyright training data rules.",
			discoveredAt: new Date("2026-05-05T10:07:00.000Z"),
		});
		await markResearchSourceReviewed({
			userId: "user-1",
			sourceId: source.id,
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

		const result = await runDeepResearchWorkflowStep(
			{
				userId: "user-1",
				jobId: approved.id,
				now: new Date("2026-05-05T10:20:00.000Z"),
			},
			{
				coverage: {
					assessResearchCoverage: () => ({
						jobId: approved.id,
						conversationId: "conv-1",
						status: "insufficient",
						canContinue: false,
						continuationRecommendation: null,
						coverageGaps: [],
						reportLimitations: [
							{
								keyQuestion: "Which differences matter most?",
								limitation:
									"Depth budget is exhausted before enough independent reviewed evidence could support this key question.",
								reviewedSourceCount: 1,
							},
						],
						budget: {
							selectedDepth: "focused",
							sourceReviewCeiling: 1,
							reviewedSourceCount: 1,
							remainingSourceReviews: 0,
							synthesisPassCeiling: 0,
							remainingSynthesisPasses: 0,
							exhausted: true,
						},
						remainingBudget: {
							sourceReviews: 0,
							synthesisPasses: 0,
						},
						timelineSummary: {
							stage: "coverage_assessment",
							kind: "coverage_assessed",
							messageKey: "deepResearch.timeline.coverageLimited",
							messageParams: {
								reviewedSources: 1,
								coverageGaps: 0,
								reportLimitations: 1,
							},
							sourceCounts: {
								discovered: 1,
								reviewed: 1,
								cited: 0,
							},
							assumptions: [],
							warnings: [
								"Depth budget exhausted; unresolved coverage gaps must be disclosed as report limitations.",
							],
							summary:
								"Depth budget is exhausted; incomplete coverage will be disclosed as report limitations.",
						},
					}),
				},
			},
		);
		const reportArtifact = result?.job.reportArtifactId
			? await getArtifactForUser("user-1", result.job.reportArtifactId)
			: null;
		const timeline = await listResearchTimelineEvents({
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
			},
		});
		expect(reportArtifact?.contentText).toContain("## Report Limitations");
		expect(reportArtifact?.contentText).toContain(
			"Depth budget is exhausted before enough independent reviewed evidence could support this key question.",
		);
		expect(timeline).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					stage: "coverage_assessment",
					kind: "coverage_assessed",
					warnings: [
						"Depth budget exhausted; unresolved coverage gaps must be disclosed as report limitations.",
					],
				}),
			]),
		);
	});

	it("fails terminally when source review budget is exhausted without reviewed evidence", async () => {
		const approved = await createApprovedResearchJob();
		const { db } = await import("$lib/server/db");
		const { listResearchTimelineEvents } = await import("./timeline");
		const { runDeepResearchWorkflowStep } = await import("./workflow");

		await db
			.update(schema.deepResearchJobs)
			.set({
				status: "running",
				stage: "source_review",
				updatedAt: new Date("2026-05-05T10:08:00.000Z"),
			})
			.where(eq(schema.deepResearchJobs.id, approved.id));

		const result = await runDeepResearchWorkflowStep(
			{
				userId: "user-1",
				jobId: approved.id,
				now: new Date("2026-05-05T10:20:00.000Z"),
			},
			{
				coverage: {
					assessResearchCoverage: () => ({
						jobId: approved.id,
						conversationId: "conv-1",
						status: "insufficient",
						canContinue: false,
						continuationRecommendation: null,
						coverageGaps: [],
						reportLimitations: [
							{
								keyQuestion: "What is the current state of the topic?",
								limitation:
									"Depth budget is exhausted before enough reviewed evidence could support this key question.",
								reviewedSourceCount: 0,
							},
						],
						budget: {
							selectedDepth: "focused",
							sourceReviewCeiling: 0,
							reviewedSourceCount: 0,
							remainingSourceReviews: 0,
							synthesisPassCeiling: 0,
							remainingSynthesisPasses: 0,
							exhausted: true,
						},
						remainingBudget: {
							sourceReviews: 0,
							synthesisPasses: 0,
						},
						timelineSummary: {
							stage: "coverage_assessment",
							kind: "coverage_assessed",
							messageKey: "deepResearch.timeline.coverageLimited",
							messageParams: {
								reviewedSources: 0,
								coverageGaps: 0,
								reportLimitations: 1,
							},
							sourceCounts: {
								discovered: 0,
								reviewed: 0,
								cited: 0,
							},
							assumptions: [],
							warnings: [
								"Depth budget exhausted; unresolved coverage gaps must be disclosed as report limitations.",
							],
							summary:
								"Depth budget is exhausted; incomplete coverage will be disclosed as report limitations.",
						},
					}),
				},
			},
		);
		const timeline = await listResearchTimelineEvents({
			userId: "user-1",
			jobId: approved.id,
		});

		expect(result).toMatchObject({
			advanced: true,
			outcome: "coverage_failed",
			job: {
				id: approved.id,
				status: "failed",
				stage: "coverage_exhausted_failed",
				reportArtifactId: null,
			},
		});
		expect(timeline).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					stage: "coverage_assessment",
					kind: "warning",
					warnings: [
						"Depth budget exhausted before any reviewed evidence was available; no useful Research Report can be produced.",
					],
				}),
			]),
		);
	});

	it("completes pending Research Tasks and finishes an audited report from the task pass", async () => {
		const approved = await createApprovedResearchJob();
		const { db } = await import("$lib/server/db");
		const {
			saveDiscoveredResearchSource,
			markResearchSourceReviewed,
		} = await import("./sources");
		const { createResearchTasksFromCoverageGaps, listResearchTasks } =
			await import("./tasks");
		const { listResearchTimelineEvents } = await import("./timeline");
		const { runDeepResearchWorkflowStep } = await import("./workflow");
		const { getArtifactForUser } = await import(
			"$lib/server/services/knowledge/store"
		);

		const source = await saveDiscoveredResearchSource({
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
			sourceId: source.id,
			reviewedAt: new Date("2026-05-05T10:08:00.000Z"),
			reviewedNote:
				"EU and US rules both make source provenance central to AI training data risk review.",
		});
		await createResearchTasksFromCoverageGaps({
			userId: "user-1",
			jobId: approved.id,
			conversationId: "conv-1",
			passNumber: 1,
			gaps: [
				{
					id: "gap-practical-implications",
					keyQuestion: "What practical implications should the report call out?",
					summary:
						"Explain the operational implication of source provenance requirements.",
					severity: "critical",
				},
			],
			now: new Date("2026-05-05T10:09:00.000Z"),
		});
		await db
			.update(schema.deepResearchJobs)
			.set({
				status: "running",
				stage: "research_tasks",
				updatedAt: new Date("2026-05-05T10:09:00.000Z"),
			})
			.where(eq(schema.deepResearchJobs.id, approved.id));

		const result = await runDeepResearchWorkflowStep({
			userId: "user-1",
			jobId: approved.id,
			now: new Date("2026-05-05T10:20:00.000Z"),
		});
		const tasks = await listResearchTasks({
			userId: "user-1",
			jobId: approved.id,
			passNumber: 1,
		});
		const timeline = await listResearchTimelineEvents({
			userId: "user-1",
			jobId: approved.id,
		});
		const reportArtifact = result?.job.reportArtifactId
			? await getArtifactForUser("user-1", result.job.reportArtifactId)
			: null;

		expect(result).toMatchObject({
			advanced: true,
			outcome: "report_completed",
			job: {
				id: approved.id,
				status: "completed",
				stage: "report_ready",
			},
		});
		expect(tasks).toEqual([
			expect.objectContaining({
				status: "completed",
				output: expect.objectContaining({
					sourceIds: [source.id],
				}),
			}),
		]);
		expect(reportArtifact?.contentText).toContain(
			"Explain the operational implication of source provenance requirements.",
		);
		expect(timeline).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					stage: "research_tasks",
					kind: "stage_completed",
					sourceCounts: {
						discovered: 1,
						reviewed: 1,
						cited: 0,
					},
				}),
			]),
		);
	});

	it("does not complete a Research Task pass while required work is running or critically failed", async () => {
		const approved = await createApprovedResearchJob();
		const { db } = await import("$lib/server/db");
		const {
			claimResearchTasks,
			createResearchTasksFromCoverageGaps,
			listResearchTasks,
		} = await import("./tasks");
		const { runDeepResearchWorkflowStep } = await import("./workflow");

		const tasks = await createResearchTasksFromCoverageGaps({
			userId: "user-1",
			jobId: approved.id,
			conversationId: "conv-1",
			passNumber: 1,
			gaps: [
				{
					id: "gap-running",
					keyQuestion: "Which regulator source is authoritative?",
					summary: "Resolve regulator authority before synthesis.",
					severity: "critical",
				},
				{
					id: "gap-critical-failure",
					keyQuestion: "Which litigation source is current?",
					summary: "Resolve current litigation status before synthesis.",
					severity: "critical",
				},
			],
			now: new Date("2026-05-05T10:09:00.000Z"),
		});
		await claimResearchTasks({
			userId: "user-1",
			jobId: approved.id,
			passNumber: 1,
			limit: 1,
			claimToken: "external-worker",
			now: new Date("2026-05-05T10:10:00.000Z"),
		});
		await db
			.update(schema.deepResearchJobs)
			.set({
				status: "running",
				stage: "research_tasks",
				updatedAt: new Date("2026-05-05T10:10:00.000Z"),
			})
			.where(eq(schema.deepResearchJobs.id, approved.id));

		const result = await runDeepResearchWorkflowStep(
			{
				userId: "user-1",
				jobId: approved.id,
				now: new Date("2026-05-05T10:20:00.000Z"),
			},
			{
				tasks: {
					executor: async () => {
						throw new Error("regulator source unavailable");
					},
				},
			},
		);
		const reloadedTasks = await listResearchTasks({
			userId: "user-1",
			jobId: approved.id,
			passNumber: 1,
		});

		expect(result).toMatchObject({
			advanced: false,
			outcome: "not_eligible",
			job: {
				id: approved.id,
				status: "running",
				stage: "research_tasks",
				reportArtifactId: null,
			},
		});
		expect(reloadedTasks).toEqual([
			expect.objectContaining({
				id: tasks[0].id,
				status: "running",
			}),
			expect.objectContaining({
				id: tasks[1].id,
				status: "failed",
				failureReason: "regulator source unavailable",
			}),
		]);
	});

	it("does not complete a Research Task pass when required tasks remain pending", async () => {
		const approved = await createApprovedResearchJob();
		const { db } = await import("$lib/server/db");
		const { createResearchTasksFromCoverageGaps, listResearchTasks } =
			await import("./tasks");
		const { runDeepResearchWorkflowStep } = await import("./workflow");

		const [task] = await createResearchTasksFromCoverageGaps({
			userId: "user-1",
			jobId: approved.id,
			conversationId: "conv-1",
			passNumber: 1,
			gaps: [
				{
					id: "gap-pending",
					keyQuestion: "Which source is still missing?",
					summary: "Required source work still needs a worker claim.",
					severity: "critical",
				},
			],
			now: new Date("2026-05-05T10:09:00.000Z"),
		});
		await db
			.update(schema.deepResearchJobs)
			.set({
				status: "running",
				stage: "research_tasks",
				updatedAt: new Date("2026-05-05T10:10:00.000Z"),
			})
			.where(eq(schema.deepResearchJobs.id, approved.id));

		const result = await runDeepResearchWorkflowStep(
			{
				userId: "user-1",
				jobId: approved.id,
				now: new Date("2026-05-05T10:20:00.000Z"),
			},
			{
				tasks: {
					claimResearchTasks: async () => [],
				},
			},
		);
		const [reloadedTask] = await listResearchTasks({
			userId: "user-1",
			jobId: approved.id,
			passNumber: 1,
		});

		expect(result).toMatchObject({
			advanced: false,
			outcome: "not_eligible",
			job: {
				id: approved.id,
				status: "running",
				stage: "research_tasks",
				reportArtifactId: null,
			},
		});
		expect(reloadedTask).toMatchObject({
			id: task.id,
			status: "pending",
		});
	});

	it("turns non-critical failed Research Tasks into audited report limitations", async () => {
		const approved = await createApprovedResearchJob();
		const { db } = await import("$lib/server/db");
		const {
			saveDiscoveredResearchSource,
			markResearchSourceReviewed,
		} = await import("./sources");
		const {
			createResearchTasksFromCoverageGaps,
			recordResearchTaskFailure,
		} = await import("./tasks");
		const { runDeepResearchWorkflowStep } = await import("./workflow");
		const { getArtifactForUser } = await import(
			"$lib/server/services/knowledge/store"
		);

		const source = await saveDiscoveredResearchSource({
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
			sourceId: source.id,
			reviewedAt: new Date("2026-05-05T10:08:00.000Z"),
			reviewedNote:
				"EU and US AI copyright training data rules require provenance records and rights-risk review.",
		});
		const [task] = await createResearchTasksFromCoverageGaps({
			userId: "user-1",
			jobId: approved.id,
			conversationId: "conv-1",
			passNumber: 1,
			gaps: [
				{
					id: "gap-market-commentary",
					keyQuestion: "What market commentary exists?",
					summary: "Optional market commentary gap.",
					severity: "important",
				},
			],
			now: new Date("2026-05-05T10:09:00.000Z"),
		});
		await recordResearchTaskFailure({
			userId: "user-1",
			taskId: task.id,
			failureKind: "permanent",
			failureReason: "Low-quality duplicate sources only.",
			now: new Date("2026-05-05T10:10:00.000Z"),
		});
		await db
			.update(schema.deepResearchJobs)
			.set({
				status: "running",
				stage: "research_tasks",
				updatedAt: new Date("2026-05-05T10:10:00.000Z"),
			})
			.where(eq(schema.deepResearchJobs.id, approved.id));

		const result = await runDeepResearchWorkflowStep({
			userId: "user-1",
			jobId: approved.id,
			now: new Date("2026-05-05T10:20:00.000Z"),
		});
		const reportArtifact = result?.job.reportArtifactId
			? await getArtifactForUser("user-1", result.job.reportArtifactId)
			: null;

		expect(result).toMatchObject({
			advanced: true,
			outcome: "report_completed",
			job: {
				id: approved.id,
				status: "completed",
				stage: "report_ready",
			},
		});
		expect(reportArtifact?.contentText).toContain("## Report Limitations");
		expect(reportArtifact?.contentText).toContain(
			"Research Task failed: What market commentary exists? (Low-quality duplicate sources only.)",
		);
	});
});
