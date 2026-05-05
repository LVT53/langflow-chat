import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "$lib/server/db/schema";
import {
	buildDefaultResearchSourceLedger,
	countResearchSources,
	getResearchSourceFaviconUrl,
	listResearchSources,
	markResearchSourceCited,
	markResearchSourceRejected,
	markResearchSourceReviewed,
	saveDiscoveredResearchSource,
} from "./sources";

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
			stage: "source_discovery",
			title: "Compare EU and US AI copyright training data rules",
			userRequest: "Compare EU and US AI copyright training data rules",
			createdAt: now,
			updatedAt: now,
		})
		.run();

	sqlite.close();
}

describe("deep research source ledger", () => {
	beforeEach(async () => {
		dbPath = `/tmp/alfyai-research-sources-${randomUUID()}.db`;
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

	it("saves and lists Discovered Sources with job-scoped counts", async () => {
		const discovered = await saveDiscoveredResearchSource({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			url: "https://example.com/eu-ai-act",
			title: "EU AI Act overview",
			provider: "web_search",
			discoveredAt: new Date("2026-05-05T10:30:00.000Z"),
		});

		const sources = await listResearchSources({
			userId: "user-1",
			jobId: "job-1",
		});
		const counts = await countResearchSources({
			userId: "user-1",
			jobId: "job-1",
		});

		expect(discovered).toMatchObject({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			status: "discovered",
			url: "https://example.com/eu-ai-act",
			title: "EU AI Act overview",
			provider: "web_search",
			discoveredAt: "2026-05-05T10:30:00.000Z",
			reviewedAt: null,
			citedAt: null,
		});
		expect(discovered.id).toEqual(expect.any(String));
		expect(sources).toEqual([discovered]);
		expect(counts).toEqual({
			discovered: 1,
			reviewed: 0,
			cited: 0,
		});
	});

	it("does not allow a Discovered Source to become cited before review", async () => {
		const discovered = await saveDiscoveredResearchSource({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			url: "https://example.com/unreviewed-source",
			title: "Unreviewed source",
			provider: "web_search",
			discoveredAt: new Date("2026-05-05T10:30:00.000Z"),
		});

		await expect(
			markResearchSourceCited({
				userId: "user-1",
				sourceId: discovered.id,
				citedAt: new Date("2026-05-05T11:30:00.000Z"),
			}),
		).rejects.toThrow("Research source must be reviewed before citation");

		const counts = await countResearchSources({
			userId: "user-1",
			jobId: "job-1",
		});

		expect(counts).toEqual({
			discovered: 1,
			reviewed: 0,
			cited: 0,
		});
	});

	it("allows a Reviewed Source to later be marked cited", async () => {
		const discovered = await saveDiscoveredResearchSource({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			url: "https://example.com/reviewed-source",
			title: "Reviewed source",
			provider: "web_search",
			discoveredAt: new Date("2026-05-05T10:30:00.000Z"),
		});

		const reviewed = await markResearchSourceReviewed({
			userId: "user-1",
			sourceId: discovered.id,
			reviewedAt: new Date("2026-05-05T11:00:00.000Z"),
			reviewedNote: "Relevant authority for the report.",
		});
		const cited = await markResearchSourceCited({
			userId: "user-1",
			sourceId: reviewed.id,
			citedAt: new Date("2026-05-05T11:30:00.000Z"),
			citationNote: "Supports the comparison table.",
		});
		const sources = await listResearchSources({
			userId: "user-1",
			conversationId: "conversation-1",
		});
		const counts = await countResearchSources({
			userId: "user-1",
			conversationId: "conversation-1",
		});

		expect(reviewed).toMatchObject({
			id: discovered.id,
			status: "reviewed",
			reviewedAt: "2026-05-05T11:00:00.000Z",
			reviewedNote: "Relevant authority for the report.",
			citedAt: null,
		});
		expect(cited).toMatchObject({
			id: discovered.id,
			status: "cited",
			reviewedAt: "2026-05-05T11:00:00.000Z",
			citedAt: "2026-05-05T11:30:00.000Z",
			citationNote: "Supports the comparison table.",
		});
		expect(sources).toEqual([cited]);
		expect(counts).toEqual({
			discovered: 1,
			reviewed: 1,
			cited: 1,
		});
	});

	it("persists Source Quality Signals on reviewed source ledger rows", async () => {
		const discovered = await saveDiscoveredResearchSource({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			url: "https://vendor.example.com/products/model-x/specs",
			title: "Vendor Model X official specifications",
			provider: "web_search",
			discoveredAt: new Date("2026-05-05T10:30:00.000Z"),
		});

		await markResearchSourceReviewed({
			userId: "user-1",
			sourceId: discovered.id,
			reviewedAt: new Date("2026-05-05T11:00:00.000Z"),
			reviewedNote: "Official specifications list 16 GB memory.",
			sourceQualitySignals: {
				sourceType: "official_vendor",
				independence: "affiliated",
				freshness: "undated",
				directness: "direct",
				extractionConfidence: "high",
				claimFit: "strong",
			},
		});

		const [source] = await listResearchSources({
			userId: "user-1",
			jobId: "job-1",
		});

		expect(source.sourceQualitySignals).toEqual({
			sourceType: "official_vendor",
			independence: "affiliated",
			freshness: "undated",
			directness: "direct",
			extractionConfidence: "high",
			claimFit: "strong",
		});
		expect(source.sourceAuthoritySummary).toEqual(
			expect.objectContaining({
				label: "Strong for official details",
				score: expect.any(Number),
			}),
		);
	});

	it("keeps off-topic rejection state inspectable in the source ledger", async () => {
		const discovered = await saveDiscoveredResearchSource({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			url: "https://cars.example.test/volkswagen-ev-prices",
			title: "Volkswagen EV prices in Hungary",
			provider: "web_search",
			snippet: "Dealer discounts and electric car market pricing.",
			discoveredAt: new Date("2026-05-05T10:30:00.000Z"),
		});

		const rejected = await markResearchSourceRejected({
			userId: "user-1",
			sourceId: discovered.id,
			rejectedAt: new Date("2026-05-05T11:00:00.000Z"),
			rejectedReason:
				"Rejected because the source is off-topic for the approved Research Plan.",
			relevanceScore: 95,
			supportedKeyQuestions: [
				"How do Cube Kathmandu and Cube Nulane specifications differ?",
			],
			extractedClaims: ["Volkswagen EV prices decreased in Hungary."],
			openedContentLength: 740,
			topicRelevant: false,
			topicRelevanceReason:
				"Source discusses Volkswagen EV prices, not Cube bicycle models.",
		});
		const [listed] = await listResearchSources({
			userId: "user-1",
			jobId: "job-1",
		});

		expect(rejected).toMatchObject({
			id: discovered.id,
			status: "discovered",
			rejectedReason:
				"Rejected because the source is off-topic for the approved Research Plan.",
			relevanceScore: 95,
			topicRelevant: false,
			topicRelevanceReason:
				"Source discusses Volkswagen EV prices, not Cube bicycle models.",
			reviewedAt: null,
		});
		expect(listed).toMatchObject({
			id: discovered.id,
			topicRelevant: false,
			topicRelevanceReason:
				"Source discusses Volkswagen EV prices, not Cube bicycle models.",
		});
	});

	it("scopes the default ledger to cited, topic-relevant reviewed, and useful limitation sources", async () => {
		const cited = await saveDiscoveredResearchSource({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			url: "https://docs.example.com/security",
			title: "Security documentation",
			provider: "web_search",
		});
		await markResearchSourceReviewed({
			userId: "user-1",
			sourceId: cited.id,
			topicRelevant: true,
			reviewedNote: "Official documentation directly supports the security claim.",
		});
		const citedSource = await markResearchSourceCited({
			userId: "user-1",
			sourceId: cited.id,
			citationNote: "Supports a central report claim.",
		});

		const reviewed = await saveDiscoveredResearchSource({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			url: "https://analysis.example.com/background",
			title: "Relevant background analysis",
			provider: "web_search",
		});
		const reviewedSource = await markResearchSourceReviewed({
			userId: "user-1",
			sourceId: reviewed.id,
			topicRelevant: true,
			reviewedNote: "Relevant background source for the approved topic.",
		});

		const rejected = await saveDiscoveredResearchSource({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			url: "https://unrelated.example.com/pricing",
			title: "Unrelated pricing page",
			provider: "web_search",
		});
		const rejectedSource = await markResearchSourceRejected({
			userId: "user-1",
			sourceId: rejected.id,
			rejectedReason:
				"Rejected because it explains why pricing coverage is limited.",
			topicRelevant: false,
			topicRelevanceReason:
				"Pricing page was about a different product category.",
		});

		const discoveredOnly = await saveDiscoveredResearchSource({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			url: "https://search.example.com/result",
			title: "Discovered-only result",
			provider: "web_search",
		});
		const offTopicWithoutLimitation = await saveDiscoveredResearchSource({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			url: "https://noise.example.com/post",
			title: "Noise post",
			provider: "web_search",
		});
		await markResearchSourceRejected({
			userId: "user-1",
			sourceId: offTopicWithoutLimitation.id,
			rejectedReason: "Unrelated search result.",
			topicRelevant: false,
		});

		const ledger = buildDefaultResearchSourceLedger([
			citedSource,
			reviewedSource,
			rejectedSource,
			discoveredOnly,
			...(await listResearchSources({ userId: "user-1", jobId: "job-1" })).filter(
				(source) => source.id === offTopicWithoutLimitation.id,
			),
		]);

		expect(ledger.map((source) => source.id)).toEqual([
			citedSource.id,
			reviewedSource.id,
			rejectedSource.id,
		]);
	});

	it("generates favicons only for normal public web URLs", () => {
		expect(getResearchSourceFaviconUrl("https://docs.example.com/path")).toBe(
			"https://docs.example.com/favicon.ico",
		);
		expect(getResearchSourceFaviconUrl("http://news.example.org/article")).toBe(
			"http://news.example.org/favicon.ico",
		);
		expect(getResearchSourceFaviconUrl("ftp://files.example.com/source")).toBeNull();
		expect(getResearchSourceFaviconUrl("http://localhost:5173/source")).toBeNull();
		expect(getResearchSourceFaviconUrl("http://127.0.0.1/source")).toBeNull();
		expect(getResearchSourceFaviconUrl("http://10.1.2.3/source")).toBeNull();
		expect(getResearchSourceFaviconUrl("not a url")).toBeNull();
	});
});
