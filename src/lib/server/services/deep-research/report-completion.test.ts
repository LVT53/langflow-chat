import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "$lib/server/db/schema";
import type { SynthesisNotes } from "./synthesis";

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

describe("audited Deep Research report completion", () => {
	beforeEach(async () => {
		dbPath = `/tmp/alfyai-deep-research-report-completion-${randomUUID()}.db`;
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

	it("writes an audited Research Report artifact from supported findings and seals the conversation", async () => {
		const { db } = await import("$lib/server/db");
		const {
			approveDeepResearchPlan,
			completeDeepResearchJobWithAuditedReport,
			startDeepResearchJobShell,
		} = await import("./index");
		const {
			listResearchSources,
			markResearchSourceReviewed,
			saveDiscoveredResearchSource,
		} = await import("./sources");
		const { getArtifactForUser } = await import(
			"$lib/server/services/knowledge/store"
		);

		const created = await startDeepResearchJobShell({
			userId: "user-1",
			conversationId: "conv-1",
			triggerMessageId: "user-msg-1",
			userRequest: "Compare EU and US AI copyright training data rules",
			depth: "standard",
			now: new Date("2026-05-05T10:01:00.000Z"),
		});
		await approveDeepResearchPlan({
			userId: "user-1",
			jobId: created.id,
			now: new Date("2026-05-05T10:06:00.000Z"),
		});
		const source = await saveDiscoveredResearchSource({
			userId: "user-1",
			conversationId: "conv-1",
			jobId: created.id,
			url: "https://agency.example.test/ai-copyright-training-data",
			title: "Agency AI copyright training data briefing",
			provider: "public_web",
			snippet: "Agency briefing on AI copyright training data rules.",
			discoveredAt: new Date("2026-05-05T10:07:00.000Z"),
		});
		const reviewedSource = await markResearchSourceReviewed({
			userId: "user-1",
			sourceId: source.id,
			reviewedAt: new Date("2026-05-05T10:08:00.000Z"),
			reviewedNote:
				"EU and US AI copyright training data rules require provenance records and rights-risk review.",
		});
		const synthesisNotes: SynthesisNotes = {
			jobId: created.id,
			findings: [
				{
					kind: "supported",
					statement:
						"EU and US AI copyright training data rules require provenance records and rights-risk review.",
					sourceRefs: [
						{
							reviewedSourceId: reviewedSource.id,
							discoveredSourceId: reviewedSource.id,
							canonicalUrl: reviewedSource.url,
							title: reviewedSource.title ?? "Agency briefing",
						},
					],
				},
			],
			supportedFindings: [
				{
					kind: "supported",
					statement:
						"EU and US AI copyright training data rules require provenance records and rights-risk review.",
					sourceRefs: [
						{
							reviewedSourceId: reviewedSource.id,
							discoveredSourceId: reviewedSource.id,
							canonicalUrl: reviewedSource.url,
							title: reviewedSource.title ?? "Agency briefing",
						},
					],
				},
			],
			conflicts: [],
			assumptions: [],
			reportLimitations: [],
		};

		const completed = await completeDeepResearchJobWithAuditedReport({
			userId: "user-1",
			jobId: created.id,
			synthesisNotes,
			now: new Date("2026-05-05T10:20:00.000Z"),
		});
		const reportArtifact = completed?.reportArtifactId
			? await getArtifactForUser("user-1", completed.reportArtifactId)
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
			jobId: created.id,
		});

		expect(completed).toMatchObject({
			id: created.id,
			status: "completed",
			stage: "report_ready",
			completedAt: new Date("2026-05-05T10:20:00.000Z").getTime(),
		});
		expect(reportArtifact).toMatchObject({
			id: completed?.reportArtifactId,
			userId: "user-1",
			conversationId: "conv-1",
			type: "generated_output",
			retrievalClass: "durable",
			name: "Research Report - Compare EU and US AI copyright training data rules.md",
			mimeType: "text/markdown",
			extension: "md",
			metadata: {
				deepResearchJobId: created.id,
				deepResearchReport: true,
				deepResearchReportKind: "audited",
				documentRole: "research_report",
				originConversationId: "conv-1",
			},
		});
		expect(reportArtifact?.contentText).toContain(
			"# Research Report: Compare EU and US AI copyright training data rules",
		);
		expect(reportArtifact?.contentText).toContain("## Methodology");
		expect(reportArtifact?.contentText).toContain("## Comparison");
		expect(reportArtifact?.contentText).toContain(
			"EU and US AI copyright training data rules require provenance records and rights-risk review.",
		);
		expect(reportArtifact?.contentText).not.toContain(
			"The citation audit retained this core finding",
		);
		expect(reportArtifact?.contentText).toContain("## Sources");
		expect(reportArtifact?.contentText).toContain(
			"[1] Agency AI copyright training data briefing - https://agency.example.test/ai-copyright-training-data",
		);
		expect(conversation).toEqual({
			status: "sealed",
			sealedAt: new Date("2026-05-05T10:20:00.000Z"),
		});
		expect(sources).toEqual([
			expect.objectContaining({
				id: source.id,
				status: "cited",
				reviewedAt: "2026-05-05T10:08:00.000Z",
				citedAt: "2026-05-05T10:20:00.000Z",
			}),
		]);
	});

	it("turns unsupported claims into visible limitations and still completes when supported findings remain", async () => {
		const { db } = await import("$lib/server/db");
		const {
			approveDeepResearchPlan,
			completeDeepResearchJobWithAuditedReport,
			startDeepResearchJobShell,
		} = await import("./index");
		const { markResearchSourceReviewed, saveDiscoveredResearchSource } =
			await import("./sources");
		const { getArtifactForUser } = await import(
			"$lib/server/services/knowledge/store"
		);

		const created = await startDeepResearchJobShell({
			userId: "user-1",
			conversationId: "conv-1",
			triggerMessageId: "user-msg-1",
			userRequest: "Assess battery cost and supply risk trends",
			depth: "standard",
			now: new Date("2026-05-05T10:01:00.000Z"),
		});
		await approveDeepResearchPlan({
			userId: "user-1",
			jobId: created.id,
			now: new Date("2026-05-05T10:06:00.000Z"),
		});
		const source = await saveDiscoveredResearchSource({
			userId: "user-1",
			conversationId: "conv-1",
			jobId: created.id,
			url: "https://market.example.test/battery-costs",
			title: "Battery cost tracker",
			provider: "public_web",
			snippet: "Battery cost tracker summary.",
			discoveredAt: new Date("2026-05-05T10:07:00.000Z"),
		});
		const reviewedSource = await markResearchSourceReviewed({
			userId: "user-1",
			sourceId: source.id,
			reviewedAt: new Date("2026-05-05T10:08:00.000Z"),
			reviewedNote:
				"Battery costs decreased in 2025, while supply risk remained a separate open issue.",
		});
		const synthesisNotes = buildSynthesisNotes(created.id, [
			{
				statement: "Battery costs decreased in 2025.",
				sourceId: reviewedSource.id,
				url: reviewedSource.url,
				title: reviewedSource.title ?? "Battery cost tracker",
			},
			{
				statement: "Battery recycling eliminated all supply risk in 2025.",
				sourceId: reviewedSource.id,
				url: reviewedSource.url,
				title: reviewedSource.title ?? "Battery cost tracker",
			},
		]);

		const completed = await completeDeepResearchJobWithAuditedReport({
			userId: "user-1",
			jobId: created.id,
			synthesisNotes,
			now: new Date("2026-05-05T10:20:00.000Z"),
		});
		const reportArtifact = completed?.reportArtifactId
			? await getArtifactForUser("user-1", completed.reportArtifactId)
			: null;
		const [conversation] = await db
			.select({
				status: schema.conversations.status,
				sealedAt: schema.conversations.sealedAt,
			})
			.from(schema.conversations)
			.where(eq(schema.conversations.id, "conv-1"));

		expect(completed).toMatchObject({
			id: created.id,
			status: "completed",
			stage: "report_ready",
		});
		expect(reportArtifact?.contentText).toContain(
			"Battery costs decreased in 2025.",
		);
		expect(reportArtifact?.contentText).toContain("## Report Limitations");
		expect(reportArtifact?.contentText).toContain(
			"Removed unsupported core claim after citation audit: Battery recycling eliminated all supply risk in 2025.",
		);
		expect(conversation).toEqual({
			status: "sealed",
			sealedAt: new Date("2026-05-05T10:20:00.000Z"),
		});
	});

	it("keeps the final audited report in Hungarian when the research prompt is Hungarian", async () => {
		const {
			approveDeepResearchPlan,
			completeDeepResearchJobWithAuditedReport,
			startDeepResearchJobShell,
		} = await import("./index");
		const { markResearchSourceReviewed, saveDiscoveredResearchSource } =
			await import("./sources");
		const { getArtifactForUser } = await import(
			"$lib/server/services/knowledge/store"
		);

		const created = await startDeepResearchJobShell({
			userId: "user-1",
			conversationId: "conv-1",
			triggerMessageId: "user-msg-1",
			userRequest: "Kérlek kutass a magyar AI piac 2025-os trendjeiről",
			depth: "focused",
			now: new Date("2026-05-05T10:01:00.000Z"),
		});
		await approveDeepResearchPlan({
			userId: "user-1",
			jobId: created.id,
			now: new Date("2026-05-05T10:06:00.000Z"),
		});
		const source = await saveDiscoveredResearchSource({
			userId: "user-1",
			conversationId: "conv-1",
			jobId: created.id,
			url: "https://kutatas.example.test/magyar-ai-piac",
			title: "Magyar AI piaci attekintes",
			provider: "public_web",
			snippet: "A magyar AI piac 2025-ben novekedett.",
			discoveredAt: new Date("2026-05-05T10:07:00.000Z"),
		});
		const reviewedSource = await markResearchSourceReviewed({
			userId: "user-1",
			sourceId: source.id,
			reviewedAt: new Date("2026-05-05T10:08:00.000Z"),
			reviewedNote: "A magyar AI piac 2025-ben novekedett.",
		});
		const synthesisNotes = buildSynthesisNotes(created.id, [
			{
				statement: "A magyar AI piac 2025-ben novekedett.",
				sourceId: reviewedSource.id,
				url: reviewedSource.url,
				title: reviewedSource.title ?? "Magyar AI piaci attekintes",
			},
		]);

		const completed = await completeDeepResearchJobWithAuditedReport({
			userId: "user-1",
			jobId: created.id,
			synthesisNotes,
			now: new Date("2026-05-05T10:20:00.000Z"),
		});
		const reportArtifact = completed?.reportArtifactId
			? await getArtifactForUser("user-1", completed.reportArtifactId)
			: null;

		expect(created.currentPlan?.rawPlan?.researchLanguage).toBe("hu");
		expect(reportArtifact?.name).toMatch(/^Kutatási jelentés - /);
		expect(reportArtifact?.summary).toContain("Ellenőrzött kutatási jelentés");
		expect(reportArtifact?.contentText).toContain("# Kutatási jelentés:");
		expect(reportArtifact?.contentText).toContain("## Vezetői összefoglaló");
		expect(reportArtifact?.contentText).toContain("## Fő megállapítások");
		expect(reportArtifact?.contentText).toContain("## Források");
		expect(reportArtifact?.contentText).toContain(
			"Rövid válasz: A magyar AI piac 2025-ben novekedett.",
		);
		expect(reportArtifact?.contentText).not.toContain(
			"A hivatkozás-ellenőrzés után megtartott fő megállapítás",
		);
		expect(reportArtifact?.contentText).not.toContain("## Executive Summary");
		expect(reportArtifact?.contentText).not.toContain("## Key Findings");
		expect(reportArtifact?.contentText).not.toContain("## Sources");
	});

	it("publishes an Evidence Limitation Memo without sealing the conversation when no credible supported claims remain", async () => {
		const { db } = await import("$lib/server/db");
		const {
			approveDeepResearchPlan,
			completeDeepResearchJobWithAuditedReport,
			discussDeepResearchReport,
			listConversationDeepResearchJobs,
			researchFurtherFromDeepResearchReport,
			startDeepResearchJobShell,
		} = await import("./index");
		const { listResearchSources, saveDiscoveredResearchSource } = await import(
			"./sources"
		);
		const { getArtifactForUser } = await import(
			"$lib/server/services/knowledge/store"
		);

		const created = await startDeepResearchJobShell({
			userId: "user-1",
			conversationId: "conv-1",
			triggerMessageId: "user-msg-1",
			userRequest: "Assess unverified battery recycling claims",
			depth: "focused",
			now: new Date("2026-05-05T10:01:00.000Z"),
		});
		await approveDeepResearchPlan({
			userId: "user-1",
			jobId: created.id,
			now: new Date("2026-05-05T10:06:00.000Z"),
		});
		const source = await saveDiscoveredResearchSource({
			userId: "user-1",
			conversationId: "conv-1",
			jobId: created.id,
			url: "https://blog.example.test/battery-recycling-claim",
			title: "Unreviewed battery recycling claim",
			provider: "public_web",
			snippet: "Battery recycling eliminated all supply risk in 2025.",
			discoveredAt: new Date("2026-05-05T10:07:00.000Z"),
		});
		const synthesisNotes = buildSynthesisNotes(created.id, [
			{
				statement: "Battery recycling eliminated all supply risk in 2025.",
				sourceId: source.id,
				url: source.url,
				title: source.title ?? "Unreviewed battery recycling claim",
			},
		]);

		const completedMemo = await completeDeepResearchJobWithAuditedReport({
			userId: "user-1",
			jobId: created.id,
			synthesisNotes,
			now: new Date("2026-05-05T10:20:00.000Z"),
		});
		const memoArtifact = completedMemo?.reportArtifactId
			? await getArtifactForUser("user-1", completedMemo.reportArtifactId)
			: null;
		const [conversation] = await db
			.select({
				status: schema.conversations.status,
				sealedAt: schema.conversations.sealedAt,
			})
			.from(schema.conversations)
			.where(eq(schema.conversations.id, "conv-1"));
		const generatedArtifacts = await db
			.select({ id: schema.artifacts.id })
			.from(schema.artifacts)
			.where(eq(schema.artifacts.type, "generated_output"));
		const sources = await listResearchSources({
			userId: "user-1",
			jobId: created.id,
		});
		const [listedMemoJob] = await listConversationDeepResearchJobs(
			"user-1",
			"conv-1",
		);
		const discussResult = await discussDeepResearchReport({
			userId: "user-1",
			jobId: created.id,
			now: new Date("2026-05-05T10:22:00.000Z"),
		});
		const researchFurtherResult = await researchFurtherFromDeepResearchReport({
			userId: "user-1",
			jobId: created.id,
			depth: "max",
			now: new Date("2026-05-05T10:23:00.000Z"),
		});

		expect(completedMemo).toMatchObject({
			id: created.id,
			status: "completed",
			stage: "evidence_limitation_memo_ready",
			reportArtifactId: expect.any(String),
			completedAt: new Date("2026-05-05T10:20:00.000Z").getTime(),
			evidenceLimitationMemo: {
				title: "Evidence Limitation Memo: Assess unverified battery recycling claims",
				reviewedScope: {
					discoveredCount: 1,
					reviewedCount: 0,
					topicRelevantCount: 0,
					rejectedOrOffTopicCount: 0,
				},
				recoveryActions: [
					expect.objectContaining({ kind: "revise_plan" }),
					expect.objectContaining({ kind: "add_sources" }),
					expect.objectContaining({ kind: "choose_deeper_depth" }),
					expect.objectContaining({ kind: "targeted_follow_up" }),
				],
			},
		});
		expect(listedMemoJob).toMatchObject({
			id: created.id,
			evidenceLimitationMemo: completedMemo?.evidenceLimitationMemo,
		});
		expect(discussResult).toBeNull();
		expect(researchFurtherResult).toBeNull();
		expect(completedMemo?.timeline).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					stage: "citation_audit",
					kind: "warning",
					summary:
						"Citation audit failed because no credible supported claims remained.",
					warnings: expect.arrayContaining([
						"Removed claim because it cited sources that were not both reviewed and cited: Battery recycling eliminated all supply risk in 2025.",
					]),
				}),
			]),
		);
		expect(memoArtifact).toMatchObject({
			id: completedMemo?.reportArtifactId,
			name: "Evidence Limitation Memo - Assess unverified battery recycling claims.md",
			type: "generated_output",
			retrievalClass: "durable",
			metadata: {
				deepResearchEvidenceLimitationMemo: true,
				deepResearchReport: false,
				deepResearchJobId: created.id,
				documentRole: "evidence_limitation_memo",
				memoRecoveryActions: [
					expect.objectContaining({ kind: "revise_plan" }),
					expect.objectContaining({ kind: "add_sources" }),
					expect.objectContaining({ kind: "choose_deeper_depth" }),
					expect.objectContaining({ kind: "targeted_follow_up" }),
				],
			},
		});
		expect(memoArtifact?.contentText).toContain("# Evidence Limitation Memo:");
		expect(memoArtifact?.contentText).not.toContain("# Research Report:");
		expect(memoArtifact?.contentText).toContain("## Reviewed Scope");
		expect(memoArtifact?.contentText).toContain("- Discovered sources: 1");
		expect(memoArtifact?.contentText).toContain("- Reviewed sources: 0");
		expect(memoArtifact?.contentText).toContain(
			"- Topic-relevant reviewed sources: 0",
		);
		expect(memoArtifact?.contentText).toContain("## Grounded Limitation Reasons");
		expect(memoArtifact?.contentText).toContain("## Next Research Direction");
		expect(conversation).toEqual({
			status: "open",
			sealedAt: null,
		});
		expect(generatedArtifacts).toEqual([{ id: completedMemo?.reportArtifactId }]);
		expect(sources).toEqual([
			expect.objectContaining({
				id: source.id,
				status: "discovered",
				reviewedAt: null,
				citedAt: null,
			}),
		]);
	});
});

function buildSynthesisNotes(
	jobId: string,
	findings: Array<{
		statement: string;
		sourceId: string;
		url: string;
		title: string;
	}>,
): SynthesisNotes {
	const supportedFindings = findings.map((finding) => ({
		kind: "supported" as const,
		statement: finding.statement,
		sourceRefs: [
			{
				reviewedSourceId: finding.sourceId,
				discoveredSourceId: finding.sourceId,
				canonicalUrl: finding.url,
				title: finding.title,
			},
		],
	}));

	return {
		jobId,
		findings: supportedFindings,
		supportedFindings,
		conflicts: [],
		assumptions: [],
		reportLimitations: [],
	};
}
