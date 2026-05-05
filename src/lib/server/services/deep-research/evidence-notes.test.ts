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
	db.insert(schema.deepResearchJobs)
		.values({
			id: "job-1",
			userId: "user-1",
			conversationId: "conversation-1",
			depth: "standard",
			status: "running",
			stage: "research_tasks",
			title: "Compare EU and US AI copyright training data rules",
			userRequest: "Compare EU and US AI copyright training data rules",
			createdAt: now,
			updatedAt: now,
		})
		.run();
	db.insert(schema.deepResearchSources)
		.values({
			id: "source-eu",
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			status: "reviewed",
			url: "https://commission.europa.example/ai-training-data",
			title: "EU AI training data guidance",
			provider: "web",
			snippet: "EU guidance on copyright exceptions for AI training data.",
			reviewedNote: "EU text-and-data mining exceptions require rights-reservation checks.",
			relevanceScore: 90,
			topicRelevant: true,
			supportedKeyQuestionsJson: JSON.stringify([
				"How does EU law treat AI training data?",
			]),
			extractedClaimsJson: JSON.stringify([
				"EU text-and-data mining exceptions require rights-reservation checks.",
			]),
			discoveredAt: now,
			reviewedAt: now,
			createdAt: now,
			updatedAt: now,
		})
		.run();

	sqlite.close();
}

describe("deep research Evidence Notes", () => {
	beforeEach(async () => {
		dbPath = `/tmp/alfyai-research-evidence-notes-${randomUUID()}.db`;
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

	it("rehydrates durable Evidence Notes across multiple Iterative Research Passes", async () => {
		const {
			completeResearchPassCheckpoint,
			upsertResearchPassCheckpoint,
		} = await import("./pass-state");
		const { completeResearchTask, createResearchTasksFromCoverageGaps } =
			await import("./tasks");
		const {
			listDeepResearchEvidenceNotes,
			saveDeepResearchEvidenceNotes,
		} = await import("./evidence-notes");

		const passOne = await upsertResearchPassCheckpoint({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passNumber: 1,
			searchIntent: "Initial approved-plan source review",
			reviewedSourceIds: ["source-eu"],
			now: new Date("2026-05-05T10:10:00.000Z"),
		});
		await saveDeepResearchEvidenceNotes({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passCheckpointId: passOne.id,
			sourceId: "source-eu",
			notes: [
				{
					findingText:
						"  EU text-and-data mining exceptions require rights-reservation checks.  ",
					supportedKeyQuestion: "How does EU law treat AI training data?",
					comparedEntity: "European Union",
					comparisonAxis: "copyright exception",
					sourceSupport: {
						url: "https://commission.europa.example/ai-training-data",
						title: "EU AI training data guidance",
						excerpt:
							"EU guidance on copyright exceptions for AI training data.",
					},
				},
			],
			now: new Date("2026-05-05T10:11:00.000Z"),
		});
		await completeResearchPassCheckpoint({
			userId: "user-1",
			checkpointId: passOne.id,
			nextDecision: "continue_research",
			decisionSummary: "Continue with targeted US litigation follow-up.",
			now: new Date("2026-05-05T10:12:00.000Z"),
		});

		const passTwo = await upsertResearchPassCheckpoint({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passNumber: 2,
			searchIntent: "Targeted follow-up for pass 1 Coverage Gaps",
			reviewedSourceIds: ["source-eu"],
			now: new Date("2026-05-05T10:20:00.000Z"),
		});
		const [task] = await createResearchTasksFromCoverageGaps({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passNumber: 2,
			gaps: [
				{
					id: "gap-us-litigation",
					keyQuestion: "Which US litigation is still unresolved?",
					summary: "Need current US litigation status.",
					severity: "important",
				},
			],
			now: new Date("2026-05-05T10:21:00.000Z"),
		});
		await completeResearchTask({
			userId: "user-1",
			taskId: task.id,
			output: {
				summary: "US litigation remains unsettled across several cases.",
				findings: ["Several US copyright training-data cases remain unresolved."],
				sourceIds: ["source-eu"],
				comparedEntity: "United States",
				comparisonAxis: "litigation status",
			},
			now: new Date("2026-05-05T10:22:00.000Z"),
		});
		await completeResearchPassCheckpoint({
			userId: "user-1",
			checkpointId: passTwo.id,
			nextDecision: "synthesize_report",
			decisionSummary: "Synthesize report from completed task evidence.",
			now: new Date("2026-05-05T10:23:00.000Z"),
		});

		vi.resetModules();
		const { listDeepResearchEvidenceNotes: reloadEvidenceNotes } = await import(
			"./evidence-notes"
		);
		const rehydrated = await reloadEvidenceNotes({
			userId: "user-1",
			jobId: "job-1",
		});

		expect(rehydrated[0]).toEqual(
			expect.objectContaining({
				jobId: "job-1",
				conversationId: "conversation-1",
				userId: "user-1",
				passCheckpointId: passOne.id,
				passNumber: 1,
				sourceId: "source-eu",
				taskId: null,
				supportedKeyQuestion: "How does EU law treat AI training data?",
				comparedEntity: "European Union",
				comparisonAxis: "copyright exception",
				findingText:
					"EU text-and-data mining exceptions require rights-reservation checks.",
				sourceSupport: expect.objectContaining({
					url: "https://commission.europa.example/ai-training-data",
					title: "EU AI training data guidance",
				}),
			}),
		);
		expect(rehydrated).toEqual(
			expect.arrayContaining([
			expect.objectContaining({
				jobId: "job-1",
				conversationId: "conversation-1",
				userId: "user-1",
				passCheckpointId: passTwo.id,
				passNumber: 2,
				sourceId: "source-eu",
				taskId: task.id,
				supportedKeyQuestion: "Which US litigation is still unresolved?",
				comparedEntity: "United States",
				comparisonAxis: "litigation status",
				findingText: "US litigation remains unsettled across several cases.",
				sourceSupport: expect.objectContaining({
					sourceIds: ["source-eu"],
				}),
			}),
			expect.objectContaining({
				passCheckpointId: passTwo.id,
				passNumber: 2,
				taskId: task.id,
				findingText:
					"Several US copyright training-data cases remain unresolved.",
			}),
			]),
		);
		expect(new Set(rehydrated.map((note) => note.id)).size).toBe(3);
	});

	it("allows the same source to have different Source Quality Signals per Evidence Note", async () => {
		const { upsertResearchPassCheckpoint } = await import("./pass-state");
		const {
			listDeepResearchEvidenceNotes,
			saveDeepResearchEvidenceNotes,
		} = await import("./evidence-notes");

		const checkpoint = await upsertResearchPassCheckpoint({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passNumber: 1,
			searchIntent: "Evaluate vendor page for specs and reliability",
			reviewedSourceIds: ["source-eu"],
			now: new Date("2026-05-05T10:10:00.000Z"),
		});

		await saveDeepResearchEvidenceNotes({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passCheckpointId: checkpoint.id,
			sourceId: "source-eu",
			notes: [
				{
					findingText: "The vendor page directly states the official memory specification.",
					supportedKeyQuestion: "What are the official specifications?",
					sourceQualitySignals: {
						sourceType: "official_vendor",
						independence: "affiliated",
						freshness: "undated",
						directness: "direct",
						extractionConfidence: "high",
						claimFit: "strong",
					},
				},
				{
					findingText: "The vendor page does not independently prove long-term reliability.",
					supportedKeyQuestion: "Is the product independently reliable?",
					sourceQualitySignals: {
						sourceType: "official_vendor",
						independence: "affiliated",
						freshness: "undated",
						directness: "indirect",
						extractionConfidence: "medium",
						claimFit: "weak",
					},
				},
			],
			now: new Date("2026-05-05T10:11:00.000Z"),
		});

		const notes = await listDeepResearchEvidenceNotes({
			userId: "user-1",
			jobId: "job-1",
		});

		expect(notes).toHaveLength(2);
		expect(notes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					sourceId: "source-eu",
					supportedKeyQuestion: "What are the official specifications?",
					sourceQualitySignals: expect.objectContaining({
						directness: "direct",
						claimFit: "strong",
					}),
					sourceAuthoritySummary: expect.objectContaining({
						label: "Strong for official details",
					}),
				}),
				expect.objectContaining({
					sourceId: "source-eu",
					supportedKeyQuestion: "Is the product independently reliable?",
					sourceQualitySignals: expect.objectContaining({
						directness: "indirect",
						claimFit: "weak",
					}),
					sourceAuthoritySummary: expect.objectContaining({
						label: "Weak source fit",
					}),
				}),
			]),
		);
	});

	it("writes durable Evidence Notes from source review outputs", async () => {
		const { db } = await import("$lib/server/db");
		const { listConversationDeepResearchJobs } = await import("./index");
		const { runDeepResearchWorkflowStep } = await import("./workflow");
		const { listDeepResearchEvidenceNotes } = await import("./evidence-notes");

		const rawPlan = {
			goal: "Compare EU and US AI copyright training data rules",
			depth: "standard",
			reportIntent: "comparison",
			researchBudget: {
				sourceReviewCeiling: 3,
				synthesisPassCeiling: 1,
			},
			keyQuestions: ["How does EU law treat AI training data?"],
			sourceScope: {
				includePublicWeb: true,
				planningContextDisclosure: null,
			},
			reportShape: ["Comparison table"],
			constraints: [],
			deliverables: ["Research report"],
		};
		const now = new Date("2026-05-05T11:00:00.000Z");
		await db.insert(schema.deepResearchPlanVersions).values({
			id: "plan-1",
			jobId: "job-1",
			version: 1,
			status: "approved",
			rawPlanJson: JSON.stringify(rawPlan),
			renderedPlan: "Compare EU and US AI copyright training data rules",
			effortEstimateJson: JSON.stringify({
				selectedDepth: "standard",
				expectedTimeBand: "10 minutes",
				sourceReviewCeiling: 3,
				relativeCostWarning: "Standard",
			}),
			createdAt: now,
			updatedAt: now,
		});
		await db
			.update(schema.deepResearchJobs)
			.set({
				status: "running",
				stage: "source_review",
				updatedAt: now,
			})
			.run();
		await db
			.update(schema.deepResearchSources)
			.set({
				status: "discovered",
				reviewedNote: null,
				reviewedAt: null,
				supportedKeyQuestionsJson: null,
				extractedClaimsJson: null,
				updatedAt: now,
			})
			.run();

		await runDeepResearchWorkflowStep(
			{
				userId: "user-1",
				jobId: "job-1",
				now,
			},
			{
				sourceReview: {
					reviewer: {
						reviewSource: async () => ({
							summary:
								"Reviewed EU guidance on copyright exceptions for AI training data.",
							keyFindings: [
								"EU text-and-data mining exceptions require rights-reservation checks.",
							],
							extractedText:
								"EU guidance says rights reservations affect text-and-data mining exceptions.",
							relevanceScore: 95,
							supportedKeyQuestions: [
								"How does EU law treat AI training data?",
							],
							comparedEntity: "European Union",
							comparisonAxis: "copyright exception",
						}),
					},
				},
				coverage: {
					assessResearchCoverage: () => ({
						jobId: "job-1",
						conversationId: "conversation-1",
						status: "sufficient",
						canContinue: false,
						coverageGaps: [],
						reportLimitations: [],
						timelineSummary: {
							stage: "coverage_assessment",
							kind: "stage_completed",
							messageKey: "deepResearch.timeline.coverageSufficient",
							messageParams: {},
							sourceCounts: { discovered: 1, reviewed: 1, cited: 0 },
							assumptions: [],
							warnings: [],
							summary: "Reviewed evidence covers the approved Research Plan.",
						},
					}),
				},
				synthesis: {
					buildSynthesisNotes: async () => ({
						jobId: "job-1",
						findings: [],
						supportedFindings: [],
						conflicts: [],
						assumptions: [],
						reportLimitations: [],
					}),
				},
				reportCompletion: {
					completeDeepResearchJobWithAuditedReport: async () =>
						({
							id: "job-1",
							conversationId: "conversation-1",
							triggerMessageId: null,
							depth: "standard",
							status: "completed",
							stage: "completed",
							title: "Compare EU and US AI copyright training data rules",
							createdAt: now.getTime(),
							updatedAt: now.getTime(),
						}) as never,
				},
			},
		);

		const notes = await listDeepResearchEvidenceNotes({
			userId: "user-1",
			jobId: "job-1",
		});

		expect(notes).toEqual([
			expect.objectContaining({
				passNumber: 1,
				sourceId: "source-eu",
				taskId: null,
				supportedKeyQuestion: "How does EU law treat AI training data?",
				comparedEntity: "European Union",
				comparisonAxis: "copyright exception",
				findingText:
					"EU text-and-data mining exceptions require rights-reservation checks.",
				sourceSupport: expect.objectContaining({
					sourceId: "source-eu",
					url: "https://commission.europa.example/ai-training-data",
					title: "EU AI training data guidance",
				}),
			}),
		]);

		const [job] = await listConversationDeepResearchJobs(
			"user-1",
			"conversation-1",
		);
		expect(job.evidenceNotes).toEqual(notes);
	});
});
