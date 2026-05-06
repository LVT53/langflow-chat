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

async function seedCompletedMeaningfulPass(jobId: string, passNumber = 1) {
	const { upsertResearchPassCheckpoint, completeResearchPassCheckpoint } =
		await import("./pass-state");
	const checkpoint = await upsertResearchPassCheckpoint({
		userId: "user-1",
		jobId,
		conversationId: "conv-1",
		passNumber,
		searchIntent: "Initial approved-plan source review",
		reviewedSourceIds: [],
		now: new Date("2026-05-05T10:08:30.000Z"),
	});
	await completeResearchPassCheckpoint({
		userId: "user-1",
		checkpointId: checkpoint.id,
		nextDecision: "continue_research",
		decisionSummary: "Continue with targeted follow-up work.",
		now: new Date("2026-05-05T10:08:45.000Z"),
	});
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

	it("continues research instead of publishing when the minimum pass floor is unmet", async () => {
		const approved = await createApprovedResearchJob();
		const { db } = await import("$lib/server/db");
		const {
			saveDiscoveredResearchSource,
			markResearchSourceReviewed,
			listResearchSources,
		} = await import("./sources");
		const { listResearchTasks } = await import("./tasks");
		const { runDeepResearchWorkflowStep } = await import("./workflow");

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
		const followUpTasks = await listResearchTasks({
			userId: "user-1",
			jobId: approved.id,
			passNumber: 2,
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
		expect(conversation).toEqual({
			status: "open",
			sealedAt: null,
		});
		expect(sources).toEqual([
			expect.objectContaining({
				id: discoveredSource.id,
				status: "reviewed",
				reviewedAt: "2026-05-05T10:08:00.000Z",
				citedAt: null,
			}),
		]);
		expect(followUpTasks.length).toBeGreaterThan(0);
	});

	it("creates repair work instead of a normal report when reviewed sources lack supported Synthesis Claims", async () => {
		const approved = await createApprovedResearchJob();
		const approvedPlan = approved.currentPlan?.rawPlan;
		if (!approvedPlan) throw new Error("Expected approved plan");
		const { db } = await import("$lib/server/db");
		const singlePassPlan = {
			...approvedPlan,
			researchBudget: {
				...approvedPlan.researchBudget,
				meaningfulPassFloor: 1,
				synthesisPassCeiling: 1,
			},
		};
		await db
			.update(schema.deepResearchPlanVersions)
			.set({
				rawPlanJson: JSON.stringify(singlePassPlan),
			})
			.where(eq(schema.deepResearchPlanVersions.jobId, approved.id));
		const primaryQuestion = singlePassPlan.keyQuestions[0];
		const { saveDiscoveredResearchSource, markResearchSourceReviewed } =
			await import("./sources");
		const {
			upsertResearchPassCheckpoint,
			completeResearchPassCheckpoint,
			listResearchCoverageGaps,
			listResearchPassCheckpoints,
		} = await import("./pass-state");
		const { saveDeepResearchEvidenceNotes } = await import("./evidence-notes");
		const { completeResearchTask, listResearchTasks } = await import("./tasks");
		const { runDeepResearchWorkflowStep } = await import("./workflow");
		const completeDeepResearchJobWithAuditedReport = vi.fn(async () => ({
			...approved,
			status: "completed",
			stage: "report_ready",
		}));

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
			supportedKeyQuestions: singlePassPlan.keyQuestions,
			extractedClaims: [
				"EU and US AI copyright training data rules require provenance records and rights-risk review.",
			],
		});
		const checkpoint = await upsertResearchPassCheckpoint({
			userId: "user-1",
			jobId: approved.id,
			conversationId: "conv-1",
			passNumber: 1,
			searchIntent: "Initial approved-plan source review",
			reviewedSourceIds: [source.id],
			now: new Date("2026-05-05T10:09:00.000Z"),
		});
		await completeResearchPassCheckpoint({
			userId: "user-1",
			checkpointId: checkpoint.id,
			nextDecision: "synthesize",
			decisionSummary: "Reviewed evidence is ready for synthesis.",
			now: new Date("2026-05-05T10:09:30.000Z"),
		});
		await saveDeepResearchEvidenceNotes({
			userId: "user-1",
			jobId: approved.id,
			conversationId: "conv-1",
			passCheckpointId: checkpoint.id,
			notes: singlePassPlan.keyQuestions.map((keyQuestion) => ({
				sourceId: source.id,
				supportedKeyQuestion: keyQuestion,
				findingText:
					"EU and US AI copyright training data rules require provenance records and rights-risk review.",
				sourceSupport: {
					sourceId: source.id,
				},
			})),
			now: new Date("2026-05-05T10:10:00.000Z"),
		});
		await db
			.update(schema.deepResearchJobs)
			.set({
				status: "running",
				stage: "synthesis",
				updatedAt: new Date("2026-05-05T10:11:00.000Z"),
			})
			.where(eq(schema.deepResearchJobs.id, approved.id));

		const result = await runDeepResearchWorkflowStep(
			{
				userId: "user-1",
				jobId: approved.id,
				now: new Date("2026-05-05T10:20:00.000Z"),
			},
			{
				synthesis: {
					buildSynthesisNotes: async () => ({
						jobId: approved.id,
						findings: [],
						supportedFindings: [],
						conflicts: [],
						assumptions: [],
						reportLimitations: [],
					}),
				},
				reportCompletion: {
					completeDeepResearchJobWithAuditedReport,
				},
			},
		);
		const gaps = await listResearchCoverageGaps({
			userId: "user-1",
			jobId: approved.id,
		});
		const tasks = await listResearchTasks({
			userId: "user-1",
			jobId: approved.id,
			passNumber: 2,
		});
		const checkpoints = await listResearchPassCheckpoints({
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
		expect(completeDeepResearchJobWithAuditedReport).not.toHaveBeenCalled();
		expect(gaps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					keyQuestion: primaryQuestion,
					reason: "insufficient_supported_claims",
					lifecycleState: "open",
				}),
			]),
		);
		expect(tasks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					assignmentType: "coverage_gap",
					keyQuestion: primaryQuestion,
					status: "pending",
				}),
			]),
		);
		expect(checkpoints).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					passNumber: 2,
					searchIntent:
						"Report eligibility repair for pass 1 Claim Readiness gaps",
					terminalDecision: false,
				}),
			]),
		);

		for (const task of tasks) {
			await completeResearchTask({
				userId: "user-1",
				taskId: task.id,
				output: {
					summary:
						"EU and US AI copyright training data rules require provenance records and rights-risk review.",
					findings: [
						"EU and US AI copyright training data rules require provenance records and rights-risk review.",
					],
					sourceIds: [source.id],
				},
				now: new Date("2026-05-05T10:23:00.000Z"),
			});
		}
		await db
			.update(schema.deepResearchJobs)
			.set({
				status: "running",
				stage: "research_tasks",
				updatedAt: new Date("2026-05-05T10:24:00.000Z"),
			})
			.where(eq(schema.deepResearchJobs.id, approved.id));
		const repairResult = await runDeepResearchWorkflowStep(
			{
				userId: "user-1",
				jobId: approved.id,
				now: new Date("2026-05-05T10:25:00.000Z"),
			},
			{
				synthesis: {
					buildSynthesisNotes: async () => ({
						jobId: approved.id,
						findings: [],
						supportedFindings: [
							{
								kind: "supported",
								statement:
									"EU and US AI copyright training data rules require provenance records and rights-risk review.",
								sourceRefs: [
									{
										reviewedSourceId: source.id,
										discoveredSourceId: source.id,
										canonicalUrl: source.url,
										title: source.title ?? source.url,
									},
								],
								central: true,
								claimType: "general",
							},
						],
						conflicts: [],
						assumptions: [],
						reportLimitations: [],
					}),
				},
				reportCompletion: {
					completeDeepResearchJobWithAuditedReport,
				},
			},
		);
		const repairedCheckpoints = await listResearchPassCheckpoints({
			userId: "user-1",
			jobId: approved.id,
		});

		expect(repairResult).toMatchObject({
			advanced: true,
		});
		expect(repairedCheckpoints).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					passNumber: 2,
					searchIntent:
						"Report eligibility repair for pass 1 Claim Readiness gaps",
					terminalDecision: true,
				}),
			]),
		);
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
			outcome: "coverage_continuation_created",
			job: {
				status: "running",
				stage: "research_tasks",
			},
		});
		expect(sources).toEqual([
			expect.objectContaining({
				id: discoveredSource.id,
				status: "reviewed",
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
				status: "reviewed",
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
			passNumber: 2,
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
		const { listResearchPassCheckpoints, listResearchCoverageGaps } =
			await import("./pass-state");
		const { listResearchTimelineEvents } = await import("./timeline");

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
			passNumber: 2,
		});
		const checkpoints = await listResearchPassCheckpoints({
			userId: "user-1",
			jobId: approved.id,
		});
		const gaps = await listResearchCoverageGaps({
			userId: "user-1",
			jobId: approved.id,
		});
		const timeline = await listResearchTimelineEvents({
			userId: "user-1",
			jobId: approved.id,
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
		expect(tasks).toEqual(
			approved.currentPlan?.rawPlan?.keyQuestions.map((keyQuestion) =>
				expect.objectContaining({
					jobId: approved.id,
					passNumber: 2,
					status: "pending",
					assignmentType: "coverage_gap",
					keyQuestion,
				}),
			),
		);
		expect(conversation).toEqual({
			status: "open",
			sealedAt: null,
		});
		expect(checkpoints).toEqual([
			expect.objectContaining({
				passNumber: 1,
				searchIntent: "Initial approved-plan source review",
				nextDecision: "continue_research",
				terminalDecision: true,
				coverageGapIds: expect.arrayContaining(gaps.map((gap) => gap.id)),
			}),
			expect.objectContaining({
				passNumber: 2,
				searchIntent: "Targeted follow-up for pass 1 Coverage Gaps",
				terminalDecision: false,
			}),
		]);
		expect(gaps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					lifecycleState: "open",
					severity: "critical",
					recommendedNextAction: expect.stringContaining(
						"Review additional sources",
					),
				}),
			]),
		);
		expect(tasks.map((task) => task.coverageGapId)).toEqual(
			expect.arrayContaining(gaps.map((gap) => gap.id)),
		);
		expect(timeline).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					stage: "coverage_assessment",
					kind: "pass_decision",
					messageKey: "deepResearch.timeline.passDecision",
					messageParams: expect.objectContaining({
						passNumber: 1,
						nextDecision: "continue_research",
					}),
				}),
			]),
		);
	});

	it("resumes a completed source-review pass without duplicating continuation work", async () => {
		const approved = await createApprovedResearchJob();
		const { db } = await import("$lib/server/db");
		const { runDeepResearchWorkflowStep } = await import("./workflow");
		const { listResearchTasks } = await import("./tasks");
		const { listResearchPassCheckpoints, listResearchCoverageGaps } =
			await import("./pass-state");
		const { listResearchTimelineEvents } = await import("./timeline");
		const { listResearchResumePoints } = await import("./resume-points");

		await db
			.update(schema.deepResearchJobs)
			.set({
				status: "running",
				stage: "source_review",
				updatedAt: new Date("2026-05-05T10:08:00.000Z"),
			})
			.where(eq(schema.deepResearchJobs.id, approved.id));

		const firstResult = await runDeepResearchWorkflowStep({
			userId: "user-1",
			jobId: approved.id,
			now: new Date("2026-05-05T10:09:00.000Z"),
		});

		await db
			.update(schema.deepResearchJobs)
			.set({
				status: "running",
				stage: "source_review",
				updatedAt: new Date("2026-05-05T10:09:30.000Z"),
			})
			.where(eq(schema.deepResearchJobs.id, approved.id));

		const retryResult = await runDeepResearchWorkflowStep({
			userId: "user-1",
			jobId: approved.id,
			now: new Date("2026-05-05T10:10:00.000Z"),
		});
		const tasks = await listResearchTasks({
			userId: "user-1",
			jobId: approved.id,
			passNumber: 2,
		});
		const checkpoints = await listResearchPassCheckpoints({
			userId: "user-1",
			jobId: approved.id,
		});
		const gaps = await listResearchCoverageGaps({
			userId: "user-1",
			jobId: approved.id,
		});
		const timeline = await listResearchTimelineEvents({
			userId: "user-1",
			jobId: approved.id,
		});
		const resumePoints = await listResearchResumePoints({
			userId: "user-1",
			jobId: approved.id,
		});

		expect(firstResult).toMatchObject({
			advanced: true,
			outcome: "coverage_continuation_created",
		});
		expect(retryResult).toMatchObject({
			advanced: true,
			outcome: "coverage_continuation_created",
			job: {
				status: "running",
				stage: "research_tasks",
			},
		});
		const expectedGapCount =
			approved.currentPlan?.rawPlan?.keyQuestions.length ?? 0;
		expect(tasks).toHaveLength(expectedGapCount);
		expect(new Set(tasks.map((task) => task.coverageGapId)).size).toBe(
			expectedGapCount,
		);
		expect(gaps).toHaveLength(expectedGapCount);
		expect(checkpoints).toHaveLength(2);
		expect(
			timeline.filter(
				(event) =>
					event.stage === "coverage_assessment" &&
					event.kind === "pass_decision",
			),
		).toHaveLength(1);
		expect(resumePoints).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					boundary: "running_pass",
					resumeKey: `pass:${approved.id}:1:source_review`,
					status: "completed",
				}),
			]),
		);
	});

	it("does not complete a report from high-confidence off-topic reviewed sources", async () => {
		const approved = await createApprovedResearchJob();
		const { db } = await import("$lib/server/db");
		const { saveDiscoveredResearchSource, listResearchSources } = await import(
			"./sources"
		);
		const { runDeepResearchWorkflowStep } = await import("./workflow");

		await saveDiscoveredResearchSource({
			userId: "user-1",
			conversationId: "conv-1",
			jobId: approved.id,
			url: "https://cars.example.test/volkswagen-ev-prices-hungary",
			title: "Volkswagen electric car prices in Hungary",
			provider: "public_web",
			snippet:
				"Dealer discounts and battery trim changes for Volkswagen electric cars.",
			sourceText:
				"Volkswagen ID electric car prices, dealer discounts, Hungarian EV market changes, and battery trim details.",
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
					reviewer: {
						reviewSource: async (source) => ({
							summary: `Reviewed ${source.title}`,
							keyFindings: [
								"The source appears to answer every approved question.",
							],
							extractedText: source.sourceText,
							relevanceScore: 95,
							supportedKeyQuestions:
								approved.currentPlan?.rawPlan?.keyQuestions ?? [],
							extractedClaims: [
								"Volkswagen EV prices dropped sharply in Hungary.",
							],
						}),
					},
				},
			},
		);
		const [source] = await listResearchSources({
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
				reportArtifactId: null,
			},
		});
		expect(source).toMatchObject({
			status: "reviewed",
			relevanceScore: 95,
			topicRelevant: false,
			rejectedReason:
				"Rejected because the source is off-topic for the approved Research Plan.",
			reviewedAt: "2026-05-05T10:09:00.000Z",
		});
	});

	it("completes with report limitations when source review budget is exhausted after reviewed evidence", async () => {
		const approved = await createApprovedResearchJob();
		const { db } = await import("$lib/server/db");
		const { saveDiscoveredResearchSource, markResearchSourceReviewed } =
			await import("./sources");
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
				stage: "evidence_limitation_memo_ready",
			},
		});
		expect(reportArtifact?.contentText).not.toContain("# Research Report:");
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

	it("completes with an Evidence Limitation Memo when source review budget is exhausted without reviewed evidence", async () => {
		const approved = await createApprovedResearchJob();
		const { db } = await import("$lib/server/db");
		const { listResearchTimelineEvents } = await import("./timeline");
		const { runDeepResearchWorkflowStep } = await import("./workflow");
		const { getArtifactForUser } = await import(
			"$lib/server/services/knowledge/store"
		);

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
		const memoArtifact = result?.job.reportArtifactId
			? await getArtifactForUser("user-1", result.job.reportArtifactId)
			: null;

		expect(result).toMatchObject({
			advanced: true,
			outcome: "report_completed",
			job: {
				id: approved.id,
				status: "completed",
				stage: "evidence_limitation_memo_ready",
				reportArtifactId: expect.any(String),
			},
		});
		expect(memoArtifact?.metadata).toMatchObject({
			deepResearchEvidenceLimitationMemo: true,
			deepResearchReport: false,
			documentRole: "evidence_limitation_memo",
		});
		expect(memoArtifact?.contentText).toContain("# Evidence Limitation Memo:");
		expect(memoArtifact?.contentText).toContain("## Reviewed Scope");
		expect(memoArtifact?.contentText).toContain("| Scope item | Count |");
		expect(memoArtifact?.contentText).toContain("| Reviewed sources | 0 |");
		expect(memoArtifact?.contentText).toContain("## Recovery Actions");
		expect(memoArtifact?.contentText).toContain(
			"## Appendix: Source Ledger Detail",
		);
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
		await seedCompletedMeaningfulPass(approved.id, 1);
		const { db } = await import("$lib/server/db");
		const { saveDiscoveredResearchSource, markResearchSourceReviewed } =
			await import("./sources");
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
			passNumber: 2,
			gaps: [
				{
					id: "gap-practical-implications",
					keyQuestion:
						"What practical implications should the report call out?",
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
			passNumber: 2,
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

	it("claims no more Research Tasks than the task-stage runtime cap", async () => {
		const approved = await createApprovedResearchJob();
		const { db } = await import("$lib/server/db");
		const { createResearchTasksFromCoverageGaps, listResearchTasks } =
			await import("./tasks");
		const { runDeepResearchWorkflowStep } = await import("./workflow");
		await createResearchTasksFromCoverageGaps({
			userId: "user-1",
			jobId: approved.id,
			conversationId: "conv-1",
			passNumber: 1,
			gaps: [
				{
					id: "gap-1",
					keyQuestion: "Question one",
					summary: "Resolve question one.",
					severity: "major",
				},
				{
					id: "gap-2",
					keyQuestion: "Question two",
					summary: "Resolve question two.",
					severity: "major",
				},
				{
					id: "gap-3",
					keyQuestion: "Question three",
					summary: "Resolve question three.",
					severity: "major",
				},
				{
					id: "gap-4",
					keyQuestion: "Question four",
					summary: "Resolve question four.",
					severity: "major",
				},
				{
					id: "gap-5",
					keyQuestion: "Question five",
					summary: "Resolve question five.",
					severity: "major",
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
				now: new Date("2026-05-05T10:11:00.000Z"),
			},
			{
				tasks: {
					executor: async ({ task }) => ({
						summary: `Completed ${task.assignment}`,
						findings: [`Finding for ${task.assignment}`],
					}),
				},
			},
		);
		const tasks = await listResearchTasks({
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
			},
		});
		expect(tasks.map((task) => task.status)).toEqual([
			"completed",
			"completed",
			"completed",
			"completed",
			"pending",
		]);
	});

	it("completes with an Evidence Limitation Memo at a safe boundary when job runtime is exhausted", async () => {
		const previousRuntimeLimit = process.env.DEEP_RESEARCH_JOB_RUNTIME_LIMIT_MS;
		process.env.DEEP_RESEARCH_JOB_RUNTIME_LIMIT_MS = "60000";
		vi.resetModules();
		const approved = await createApprovedResearchJob();
		const { db } = await import("$lib/server/db");
		const { runDeepResearchWorkflowStep } = await import("./workflow");
		const createResearchTasksFromCoverageGaps = vi.fn(async () => []);
		const completeDeepResearchJobWithEvidenceLimitationMemo = vi.fn(
			async () => ({
				...approved,
				status: "completed" as const,
				stage: "evidence_limitation_memo_completed",
			}),
		);
		await db
			.update(schema.deepResearchJobs)
			.set({
				status: "running",
				stage: "source_review",
				updatedAt: new Date("2026-05-05T10:02:00.000Z"),
			})
			.where(eq(schema.deepResearchJobs.id, approved.id));

		try {
			const result = await runDeepResearchWorkflowStep(
				{
					userId: "user-1",
					jobId: approved.id,
					now: new Date("2026-05-05T10:04:00.000Z"),
				},
				{
					coverage: {
						assessResearchCoverage: () => ({
							jobId: approved.id,
							status: "insufficient",
							canContinue: true,
							coverageGaps: [
								{
									keyQuestion: "What source is missing?",
									reason: "No reviewed sources yet.",
									reviewedSourceCount: 0,
									recommendedNextAction: "Add authoritative sources.",
								},
							],
							reportLimitations: [
								{
									limitation:
										"Runtime expired before enough evidence was reviewed.",
									severity: "major",
								},
							],
							timelineSummary: {
								stage: "coverage_assessment",
								kind: "warning",
								messageKey: "deepResearch.timeline.coverageFailed",
								messageParams: {},
								sourceCounts: { discovered: 0, reviewed: 0, cited: 0 },
								assumptions: [],
								warnings: [
									"Runtime expired before enough evidence was reviewed.",
								],
								summary: "Runtime expired before enough evidence was reviewed.",
							},
						}),
					},
					tasks: {
						createResearchTasksFromCoverageGaps,
					},
					reportCompletion: {
						completeDeepResearchJobWithAuditedReport: vi.fn(),
						completeDeepResearchJobWithEvidenceLimitationMemo,
					},
				},
			);

			expect(result).toMatchObject({
				advanced: true,
				outcome: "report_completed",
				job: {
					id: approved.id,
					status: "completed",
					stage: "evidence_limitation_memo_completed",
				},
			});
			expect(createResearchTasksFromCoverageGaps).not.toHaveBeenCalled();
			expect(
				completeDeepResearchJobWithEvidenceLimitationMemo,
			).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: "user-1",
					jobId: approved.id,
					limitations: ["Runtime expired before enough evidence was reviewed."],
				}),
			);
		} finally {
			if (previousRuntimeLimit === undefined) {
				delete process.env.DEEP_RESEARCH_JOB_RUNTIME_LIMIT_MS;
			} else {
				process.env.DEEP_RESEARCH_JOB_RUNTIME_LIMIT_MS = previousRuntimeLimit;
			}
		}
	});

	it("resumes a workflow-owned running Research Task after a crash at claim time", async () => {
		const approved = await createApprovedResearchJob();
		await seedCompletedMeaningfulPass(approved.id, 1);
		const { db } = await import("$lib/server/db");
		const { saveDiscoveredResearchSource, markResearchSourceReviewed } =
			await import("./sources");
		const {
			claimResearchTasks,
			createResearchTasksFromCoverageGaps,
			listResearchTasks,
		} = await import("./tasks");
		const { listResearchResumePoints } = await import("./resume-points");
		const { runDeepResearchWorkflowStep } = await import("./workflow");

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
		const [task] = await createResearchTasksFromCoverageGaps({
			userId: "user-1",
			jobId: approved.id,
			conversationId: "conv-1",
			passNumber: 2,
			gaps: [
				{
					id: "gap-task-claim-crash",
					keyQuestion: "What practical implication should the report call out?",
					summary:
						"Explain operational implications of provenance requirements.",
					severity: "critical",
				},
			],
			now: new Date("2026-05-05T10:09:00.000Z"),
		});
		await claimResearchTasks({
			userId: "user-1",
			jobId: approved.id,
			passNumber: 2,
			limit: 1,
			claimToken: `workflow:${approved.id}:2`,
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
		const tasks = await listResearchTasks({
			userId: "user-1",
			jobId: approved.id,
			passNumber: 2,
		});
		const resumePoints = await listResearchResumePoints({
			userId: "user-1",
			jobId: approved.id,
		});

		expect(result).toMatchObject({
			advanced: true,
			outcome: "report_completed",
			job: {
				status: "completed",
				stage: "report_ready",
			},
		});
		expect(tasks).toEqual([
			expect.objectContaining({
				id: task.id,
				status: "completed",
				output: expect.objectContaining({
					sourceIds: [source.id],
				}),
			}),
		]);
		expect(resumePoints).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					boundary: "research_task",
					taskId: task.id,
					status: "completed",
				}),
			]),
		);
	});

	it("reattaches an assembled report artifact on retry without creating duplicates", async () => {
		const approved = await createApprovedResearchJob();
		await seedCompletedMeaningfulPass(approved.id, 1);
		await seedCompletedMeaningfulPass(approved.id, 2);
		const { db } = await import("$lib/server/db");
		const { saveDiscoveredResearchSource, markResearchSourceReviewed } =
			await import("./sources");
		const { runDeepResearchWorkflowStep } = await import("./workflow");

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
		await db
			.update(schema.deepResearchJobs)
			.set({
				status: "running",
				stage: "synthesis",
				updatedAt: new Date("2026-05-05T10:10:00.000Z"),
			})
			.where(eq(schema.deepResearchJobs.id, approved.id));

		const firstResult = await runDeepResearchWorkflowStep({
			userId: "user-1",
			jobId: approved.id,
			now: new Date("2026-05-05T10:20:00.000Z"),
		});
		await db
			.update(schema.deepResearchJobs)
			.set({
				status: "running",
				stage: "report_assembly",
				reportArtifactId: null,
				completedAt: null,
				updatedAt: new Date("2026-05-05T10:20:30.000Z"),
			})
			.where(eq(schema.deepResearchJobs.id, approved.id));

		const retryResult = await runDeepResearchWorkflowStep({
			userId: "user-1",
			jobId: approved.id,
			now: new Date("2026-05-05T10:21:00.000Z"),
		});
		const reportArtifacts = await db
			.select()
			.from(schema.artifacts)
			.where(eq(schema.artifacts.id, `deep-research-report-${approved.id}`));

		expect(firstResult).toMatchObject({
			advanced: true,
			outcome: "report_completed",
			job: {
				reportArtifactId: `deep-research-report-${approved.id}`,
			},
		});
		expect(retryResult).toMatchObject({
			advanced: true,
			outcome: "report_completed",
			job: {
				status: "completed",
				stage: "report_ready",
				reportArtifactId: `deep-research-report-${approved.id}`,
			},
		});
		expect(reportArtifacts).toHaveLength(1);
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

	it("claims focused Research Task work above the plan model-concurrency floor", async () => {
		const approved = await createApprovedResearchJob();
		const { db } = await import("$lib/server/db");
		const { createResearchTasksFromCoverageGaps } = await import("./tasks");
		const { runDeepResearchWorkflowStep } = await import("./workflow");
		const claimResearchTasks = vi.fn(async () => []);

		await createResearchTasksFromCoverageGaps({
			userId: "user-1",
			jobId: approved.id,
			conversationId: "conv-1",
			passNumber: 1,
			gaps: Array.from({ length: 6 }, (_, index) => ({
				id: `gap-${index + 1}`,
				keyQuestion: `Which source fills gap ${index + 1}?`,
				summary: `Required source work ${index + 1} needs a worker claim.`,
				severity: "critical" as const,
			})),
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

		await runDeepResearchWorkflowStep(
			{
				userId: "user-1",
				jobId: approved.id,
				now: new Date("2026-05-05T10:20:00.000Z"),
			},
			{
				tasks: {
					claimResearchTasks,
				},
			},
		);

		expect(claimResearchTasks).toHaveBeenCalledWith(
			expect.objectContaining({
				limit: 4,
			}),
		);
	});

	it("stops a Research Task pass cleanly when its conversation is deleted mid-flight", async () => {
		const approved = await createApprovedResearchJob();
		const { db } = await import("$lib/server/db");
		const { createResearchTasksFromCoverageGaps } = await import("./tasks");
		const { runDeepResearchWorkflowStep } = await import("./workflow");

		await createResearchTasksFromCoverageGaps({
			userId: "user-1",
			jobId: approved.id,
			conversationId: "conv-1",
			passNumber: 1,
			gaps: [
				{
					id: "gap-deleted-conversation",
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
					executor: async () => {
						await db
							.delete(schema.conversations)
							.where(eq(schema.conversations.id, "conv-1"));
						return {
							summary: "Completed after deletion.",
							findings: ["Finding after deletion."],
						};
					},
				},
			},
		);

		expect(result).toBeNull();
	});

	it("turns non-critical failed Research Tasks into audited report limitations", async () => {
		const approved = await createApprovedResearchJob();
		await seedCompletedMeaningfulPass(approved.id, 1);
		const { db } = await import("$lib/server/db");
		const { saveDiscoveredResearchSource, markResearchSourceReviewed } =
			await import("./sources");
		const { createResearchTasksFromCoverageGaps, recordResearchTaskFailure } =
			await import("./tasks");
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
			passNumber: 2,
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
