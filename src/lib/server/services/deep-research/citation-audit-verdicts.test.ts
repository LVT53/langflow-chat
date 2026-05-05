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
			stage: "citation_audit",
			title: "Model X official specification check",
			userRequest: "Check Model X official specifications",
			createdAt: now,
			updatedAt: now,
		})
		.run();

	sqlite.close();
}

describe("Deep Research Citation Audit Verdicts", () => {
	beforeEach(async () => {
		dbPath = `/tmp/alfyai-research-citation-audit-${randomUUID()}.db`;
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

	it("persists a needs-repair verdict when a Central Claim Support Gate failed", async () => {
		const { upsertResearchPassCheckpoint } = await import("./pass-state");
		const { saveDeepResearchEvidenceNotes } = await import("./evidence-notes");
		const { saveDeepResearchSynthesisClaims } = await import(
			"./synthesis-claims"
		);
		const {
			auditAndPersistDeepResearchClaimGraph,
			listDeepResearchCitationAuditVerdicts,
		} = await import("./citation-audit");

		const checkpoint = await upsertResearchPassCheckpoint({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passNumber: 1,
			searchIntent: "Initial official specification review",
			now: new Date("2026-05-05T10:10:00.000Z"),
		});
		const [evidenceNote] = await saveDeepResearchEvidenceNotes({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passCheckpointId: checkpoint.id,
			notes: [
				{
					findingText: "Model X officially includes 16 GB memory.",
					supportedKeyQuestion: "What are Model X official specs?",
					sourceQualitySignals: {
						sourceType: "official_vendor",
						independence: "primary",
						freshness: "current",
						directness: "direct",
						extractionConfidence: "high",
						claimFit: "strong",
					},
				},
			],
			now: new Date("2026-05-05T10:11:00.000Z"),
		});
		const [claim] = await saveDeepResearchSynthesisClaims({
			userId: "user-1",
			jobId: "job-1",
			conversationId: "conversation-1",
			passCheckpointId: checkpoint.id,
			synthesisPass: "synthesis-pass-1",
			claims: [
				{
					statement: "Model X officially includes 16 GB memory.",
					claimType: "official_specification",
					central: true,
					status: "needs-repair",
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

		const result = await auditAndPersistDeepResearchClaimGraph({
			userId: "user-1",
			jobId: "job-1",
			now: new Date("2026-05-05T10:13:00.000Z"),
		});
		const verdicts = await listDeepResearchCitationAuditVerdicts({
			userId: "user-1",
			jobId: "job-1",
		});

		expect(result?.canRenderMarkdown).toBe(false);
		expect(verdicts).toEqual([
			expect.objectContaining({
				jobId: "job-1",
				conversationId: "conversation-1",
				userId: "user-1",
				claimId: claim.id,
				verdict: "needs_repair",
				evidenceNoteIds: [evidenceNote.id],
				reason: expect.stringContaining("Claim Support Gate failed"),
			}),
		]);
	});
});
