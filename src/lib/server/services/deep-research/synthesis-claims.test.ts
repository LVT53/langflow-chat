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
			stage: "synthesis",
			title: "Compare EU and US AI copyright training data rules",
			userRequest: "Compare EU and US AI copyright training data rules",
			createdAt: now,
			updatedAt: now,
		})
		.run();

	sqlite.close();
}

describe("deep research Synthesis Claims", () => {
	beforeEach(async () => {
		dbPath = `/tmp/alfyai-research-synthesis-claims-${randomUUID()}.db`;
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

	it("persists a rejected claim when linked Evidence Notes do not support it", async () => {
		const { upsertResearchPassCheckpoint } = await import("./pass-state");
		const { saveDeepResearchEvidenceNotes } = await import("./evidence-notes");
		const { saveDeepResearchSynthesisClaims } = await import(
			"./synthesis-claims"
		);

		const checkpoint = await upsertResearchPassCheckpoint({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passNumber: 1,
			searchIntent: "Initial approved-plan source review",
			now: new Date("2026-05-05T10:10:00.000Z"),
		});
		const [evidenceNote] = await saveDeepResearchEvidenceNotes({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passCheckpointId: checkpoint.id,
			notes: [
				{
					findingText:
						"EU text-and-data mining exceptions require rights-reservation checks.",
					supportedKeyQuestion: "How does EU law treat AI training data?",
					comparedEntity: "European Union",
					comparisonAxis: "copyright exception",
				},
			],
			now: new Date("2026-05-05T10:11:00.000Z"),
		});

		const [savedClaim] = await saveDeepResearchSynthesisClaims({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passCheckpointId: checkpoint.id,
			synthesisPass: "synthesis-pass-1",
			claims: [
				{
					statement:
						"US courts have already settled every major AI training-data copyright lawsuit.",
					planQuestion: "Which US litigation is still unresolved?",
					reportSection: "United States litigation status",
					status: "accepted",
					evidenceLinks: [
						{
							evidenceNoteId: evidenceNote.id,
							relation: "support",
						},
					],
				},
			],
			now: new Date("2026-05-05T10:12:00.000Z"),
		});

		expect(savedClaim).toEqual(
			expect.objectContaining({
				jobId: "job-1",
				conversationId: "conversation-1",
				userId: "user-1",
				passCheckpointId: checkpoint.id,
				synthesisPass: "synthesis-pass-1",
				planQuestion: "Which US litigation is still unresolved?",
				reportSection: "United States litigation status",
				statement:
					"US courts have already settled every major AI training-data copyright lawsuit.",
				status: "rejected",
				statusReason: expect.stringContaining("do not support"),
				evidenceLinks: [
					expect.objectContaining({
						evidenceNoteId: evidenceNote.id,
						relation: "support",
					}),
				],
			}),
		);

		vi.resetModules();
		const { listDeepResearchSynthesisClaims: reloadSynthesisClaims } =
			await import("./synthesis-claims");
		const rehydrated = await reloadSynthesisClaims({
			userId: "user-1",
			jobId: "job-1",
		});

		expect(rehydrated).toEqual([savedClaim]);
	});

	it("creates Competing Synthesis Claims for material contradictory evidence", async () => {
		const { upsertResearchPassCheckpoint } = await import("./pass-state");
		const { saveDeepResearchEvidenceNotes } = await import("./evidence-notes");
		const { saveDeepResearchSynthesisClaims } = await import(
			"./synthesis-claims"
		);

		const checkpoint = await upsertResearchPassCheckpoint({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passNumber: 1,
			searchIntent: "Compare market cost direction",
			now: new Date("2026-05-05T10:10:00.000Z"),
		});
		const [costsDown, costsUp] = await saveDeepResearchEvidenceNotes({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passCheckpointId: checkpoint.id,
			notes: [
				{
					findingText: "Battery costs decreased in 2025.",
					supportedKeyQuestion: "How did battery costs change in 2025?",
					comparisonAxis: "cost direction",
				},
				{
					findingText: "Battery costs increased in 2025.",
					supportedKeyQuestion: "How did battery costs change in 2025?",
					comparisonAxis: "cost direction",
				},
			],
			now: new Date("2026-05-05T10:11:00.000Z"),
		});

		const claims = await saveDeepResearchSynthesisClaims({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passCheckpointId: checkpoint.id,
			synthesisPass: "synthesis-pass-1",
			claims: [
				{
					statement: "Battery costs decreased in 2025.",
					planQuestion: "How did battery costs change in 2025?",
					reportSection: "Battery cost direction",
					status: "accepted",
					evidenceLinks: [
						{
							evidenceNoteId: costsDown.id,
							relation: "support",
						},
						{
							evidenceNoteId: costsUp.id,
							relation: "contradiction",
							material: true,
						},
					],
				},
			],
			now: new Date("2026-05-05T10:12:00.000Z"),
		});

		expect(claims).toHaveLength(2);
		expect(
			new Set(claims.map((claim) => claim.competingClaimGroupId)).size,
		).toBe(1);
		expect(claims).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					statement: "Battery costs decreased in 2025.",
					status: "needs-repair",
					statusReason: expect.stringContaining(
						"Material contradictory evidence",
					),
					evidenceLinks: expect.arrayContaining([
						expect.objectContaining({
							evidenceNoteId: costsDown.id,
							relation: "support",
						}),
						expect.objectContaining({
							evidenceNoteId: costsUp.id,
							relation: "contradiction",
							material: true,
						}),
					]),
				}),
				expect.objectContaining({
					statement: "Battery costs increased in 2025.",
					status: "needs-repair",
					evidenceLinks: [
						expect.objectContaining({
							evidenceNoteId: costsUp.id,
							relation: "support",
						}),
					],
				}),
			]),
		);
	});

	it("updates claim status without deleting the original evidence-linked row", async () => {
		const { upsertResearchPassCheckpoint } = await import("./pass-state");
		const { saveDeepResearchEvidenceNotes } = await import("./evidence-notes");
		const {
			listDeepResearchSynthesisClaims,
			saveDeepResearchSynthesisClaims,
			updateDeepResearchSynthesisClaimStatus,
		} = await import("./synthesis-claims");

		const checkpoint = await upsertResearchPassCheckpoint({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passNumber: 1,
			searchIntent: "Initial approved-plan source review",
			now: new Date("2026-05-05T10:10:00.000Z"),
		});
		const [evidenceNote] = await saveDeepResearchEvidenceNotes({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passCheckpointId: checkpoint.id,
			notes: [
				{
					findingText:
						"US litigation remains unsettled across several AI training-data copyright cases.",
					supportedKeyQuestion: "Which US litigation is still unresolved?",
					comparedEntity: "United States",
					comparisonAxis: "litigation status",
				},
			],
			now: new Date("2026-05-05T10:11:00.000Z"),
		});
		const [acceptedClaim] = await saveDeepResearchSynthesisClaims({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passCheckpointId: checkpoint.id,
			synthesisPass: "synthesis-pass-1",
			claims: [
				{
					statement:
						"US litigation remains unsettled across several AI training-data copyright cases.",
					planQuestion: "Which US litigation is still unresolved?",
					reportSection: "United States litigation status",
					status: "accepted",
					evidenceLinks: [
						{
							evidenceNoteId: evidenceNote.id,
							relation: "support",
						},
					],
				},
			],
			now: new Date("2026-05-05T10:12:00.000Z"),
		});

		expect(acceptedClaim.status).toBe("accepted");

		const limitedClaim = await updateDeepResearchSynthesisClaimStatus({
			userId: "user-1",
			claimId: acceptedClaim.id,
			status: "limited",
			statusReason:
				"Current evidence supports litigation status, not likely outcome.",
			now: new Date("2026-05-05T10:13:00.000Z"),
		});

		expect(limitedClaim).toEqual(
			expect.objectContaining({
				id: acceptedClaim.id,
				status: "limited",
				statusReason:
					"Current evidence supports litigation status, not likely outcome.",
				evidenceLinks: [
					expect.objectContaining({
						evidenceNoteId: evidenceNote.id,
						relation: "support",
					}),
				],
			}),
		);
		const claims = await listDeepResearchSynthesisClaims({
			userId: "user-1",
			jobId: "job-1",
		});
		expect(claims).toHaveLength(1);
		expect(claims[0]?.id).toBe(acceptedClaim.id);
	});

	it("persists claim type and centrality from Synthesis Notes", async () => {
		const { upsertResearchPassCheckpoint } = await import("./pass-state");
		const { saveDeepResearchEvidenceNotes } = await import("./evidence-notes");
		const { saveDeepResearchSynthesisClaimsFromNotes } = await import(
			"./synthesis-claims"
		);

		const checkpoint = await upsertResearchPassCheckpoint({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passNumber: 1,
			searchIntent: "Initial approved-plan source review",
			now: new Date("2026-05-05T10:10:00.000Z"),
		});
		const [evidenceNote] = await saveDeepResearchEvidenceNotes({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passCheckpointId: checkpoint.id,
			notes: [
				{
					findingText:
						"Model X officially includes 16 GB memory and 1 TB storage.",
					supportedKeyQuestion: "What are Model X official specifications?",
					sourceSupport: { sourceIds: ["reviewed-specs"] },
				},
			],
			now: new Date("2026-05-05T10:11:00.000Z"),
		});

		const [claim] = await saveDeepResearchSynthesisClaimsFromNotes({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passCheckpointId: checkpoint.id,
			synthesisPass: "synthesis-pass-claim-types",
			evidenceNotes: [evidenceNote],
			synthesisNotes: {
				jobId: "job-1",
				findings: [],
				supportedFindings: [
					{
						kind: "supported",
						statement:
							"Model X officially includes 16 GB memory and 1 TB storage.",
						sourceRefs: [
							{
								reviewedSourceId: "reviewed-specs",
								discoveredSourceId: "source-specs",
								canonicalUrl: "https://vendor.example.com/model-x/specs",
								title: "Model X official specifications",
							},
						],
						claimType: "official_specification",
						central: true,
					},
				],
				conflicts: [],
				assumptions: [],
				reportLimitations: [],
			},
			now: new Date("2026-05-05T10:12:00.000Z"),
		});

		expect(claim).toEqual(
			expect.objectContaining({
				statement: "Model X officially includes 16 GB memory and 1 TB storage.",
				claimType: "official_specification",
				central: true,
				evidenceLinks: [
					expect.objectContaining({
						evidenceNoteId: evidenceNote.id,
						relation: "support",
					}),
				],
			}),
		);
	});
});
