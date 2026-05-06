import { marked } from "marked";
import { describe, expect, it } from "vitest";
import type {
	DeepResearchEvidenceNote,
	DeepResearchSynthesisClaim,
} from "$lib/types";
import type { ResearchPlan } from "./planning";
import {
	writeEvidenceLimitationMemo,
	writeResearchReport,
} from "./report-writer";
import type { SynthesisNotes } from "./synthesis";

const basePlan: ResearchPlan = {
	goal: "Compare private AI coding assistants for a small engineering team.",
	depth: "standard",
	reportIntent: "comparison",
	researchBudget: {
		sourceReviewCeiling: 40,
		synthesisPassCeiling: 2,
	},
	keyQuestions: [
		"Which products have the strongest repository-aware coding workflow?",
		"Which pricing and compliance differences matter for a small team?",
	],
	sourceScope: {
		includePublicWeb: true,
		planningContextDisclosure: null,
	},
	reportShape: [
		"Executive summary",
		"Key findings",
		"Main comparison",
		"Source list",
		"Limitations",
	],
	constraints: ["Prefer primary vendor and documentation sources."],
	deliverables: ["Cited Research Report"],
};

const baseSynthesisNotes: SynthesisNotes = {
	jobId: "job-1",
	findings: [
		{
			kind: "supported",
			statement:
				"Repository-aware coding assistants differ most on index freshness and permission controls.",
			sourceRefs: [
				{
					reviewedSourceId: "reviewed-1",
					discoveredSourceId: "source-1",
					canonicalUrl: "https://docs.example.com/ai-coding/security",
					title: "AI coding security documentation",
				},
			],
		},
	],
	supportedFindings: [
		{
			kind: "supported",
			statement:
				"Repository-aware coding assistants differ most on index freshness and permission controls.",
			sourceRefs: [
				{
					reviewedSourceId: "reviewed-1",
					discoveredSourceId: "source-1",
					canonicalUrl: "https://docs.example.com/ai-coding/security",
					title: "AI coding security documentation",
				},
			],
		},
	],
	conflicts: [],
	assumptions: [],
	reportLimitations: [],
};

const acceptedClaim: DeepResearchSynthesisClaim = {
	id: "claim-1",
	jobId: "job-1",
	conversationId: "conv-1",
	userId: "user-1",
	passCheckpointId: "pass-1",
	synthesisPass: "synthesis-pass-1",
	planQuestion:
		"Which products have the strongest repository-aware coding workflow?",
	reportSection: "Repository workflow",
	statement:
		"Repository-aware coding assistants differ most on index freshness and permission controls.",
	claimType: "reliability_experience",
	central: true,
	status: "accepted",
	statusReason: null,
	competingClaimGroupId: null,
	evidenceLinks: [
		{
			id: "link-1",
			claimId: "claim-1",
			evidenceNoteId: "evidence-1",
			jobId: "job-1",
			conversationId: "conv-1",
			userId: "user-1",
			relation: "support",
			rationale: "The reviewed evidence directly supports the claim.",
			material: true,
			createdAt: "2026-05-05T10:12:00.000Z",
		},
	],
	createdAt: "2026-05-05T10:12:00.000Z",
	updatedAt: "2026-05-05T10:12:00.000Z",
};

const limitedClaim: DeepResearchSynthesisClaim = {
	...acceptedClaim,
	id: "claim-2",
	reportSection: "Compliance",
	statement:
		"Compliance coverage should be treated as limited because pricing pages did not disclose all enterprise controls.",
	status: "limited",
	statusReason:
		"The claim is useful but qualified by incomplete pricing evidence.",
	evidenceLinks: [
		{
			...acceptedClaim.evidenceLinks[0],
			id: "link-2",
			claimId: "claim-2",
			evidenceNoteId: "evidence-2",
			relation: "qualification",
		},
	],
};

const evidenceNotes: DeepResearchEvidenceNote[] = [
	{
		id: "evidence-1",
		jobId: "job-1",
		conversationId: "conv-1",
		userId: "user-1",
		passCheckpointId: "pass-1",
		sourceId: "source-1",
		taskId: null,
		supportedKeyQuestion:
			"Which products have the strongest repository-aware coding workflow?",
		comparedEntity: "Private AI coding assistants",
		comparisonAxis: "Repository workflow",
		findingText:
			"Repository-aware coding assistants differ most on index freshness and permission controls.",
		sourceSupport: {
			sourceId: "source-1",
			reviewedSourceId: "reviewed-1",
		},
		sourceQualitySignals: null,
		sourceAuthoritySummary: null,
		createdAt: "2026-05-05T10:11:00.000Z",
		updatedAt: "2026-05-05T10:11:00.000Z",
	},
	{
		id: "evidence-2",
		jobId: "job-1",
		conversationId: "conv-1",
		userId: "user-1",
		passCheckpointId: "pass-1",
		sourceId: "source-2",
		taskId: null,
		supportedKeyQuestion:
			"Which pricing and compliance differences matter for a small team?",
		comparedEntity: "Private AI coding assistants",
		comparisonAxis: "Compliance",
		findingText:
			"Pricing pages did not disclose all enterprise controls for compliance evaluation.",
		sourceSupport: {
			sourceId: "source-2",
			reviewedSourceId: "reviewed-2",
		},
		sourceQualitySignals: null,
		sourceAuthoritySummary: null,
		createdAt: "2026-05-05T10:11:00.000Z",
		updatedAt: "2026-05-05T10:11:00.000Z",
	},
];

describe("Deep Research report writer", () => {
	it("writes an Evidence Limitation Memo with reviewed scope, counts, limitations, and recovery actions", () => {
		const memo = writeEvidenceLimitationMemo({
			jobId: "job-weak-evidence",
			plan: basePlan,
			reviewedScope: {
				discoveredCount: 5,
				reviewedCount: 2,
				topicRelevantCount: 1,
				rejectedOrOffTopicCount: 3,
			},
			limitations: [
				"Only one reviewed source matched the approved key questions.",
				"Two opened sources were rejected as off-topic.",
			],
			nextResearchDirection:
				"Revise the plan toward official enforcement guidance and add primary sources before requesting a report.",
		});

		expect(memo.title).toBe(
			"Evidence Limitation Memo: Compare private AI coding assistants for a small engineering team",
		);
		expect(memo.markdown).toContain("# Evidence Limitation Memo:");
		expect(memo.markdown).not.toContain("# Research Report:");
		expect(memo.markdown).toContain("## Reviewed Scope");
		expect(memo.markdown).toContain("| Scope item | Count |");
		expect(memo.markdown).toContain("| Discovered sources | 5 |");
		expect(memo.markdown).toContain("| Reviewed sources | 2 |");
		expect(memo.markdown).toContain("| Topic-relevant reviewed sources | 1 |");
		expect(memo.markdown).toContain("| Rejected or off-topic sources | 3 |");
		expect(memo.markdown).toContain("## Grounded Limitation Reasons");
		expect(memo.markdown).toContain(
			"- Only one reviewed source matched the approved key questions.",
		);
		expect(memo.markdown).toContain("## Recovery Actions");
		expect(memo.markdown).toContain(
			"Revise the plan toward official enforcement guidance and add primary sources before requesting a report.",
		);
		expect(memo.markdown).toContain("## Appendix: Source Ledger Detail");
		expect(memo.markdown.indexOf("## Reviewed Scope")).toBeLessThan(
			memo.markdown.indexOf("## Grounded Limitation Reasons"),
		);
		expect(
			memo.markdown.indexOf("## Grounded Limitation Reasons"),
		).toBeLessThan(memo.markdown.indexOf("## Recovery Actions"));
		expect(memo.markdown.indexOf("## Recovery Actions")).toBeLessThan(
			memo.markdown.indexOf("## Appendix: Source Ledger Detail"),
		);
		expect(memo.recoveryActions).toEqual([
			expect.objectContaining({ kind: "revise_plan" }),
			expect.objectContaining({ kind: "add_sources" }),
			expect.objectContaining({ kind: "choose_deeper_depth" }),
			expect.objectContaining({ kind: "targeted_follow_up" }),
		]);
	});

	it("renders Hungarian Evidence Limitation Memo labels and recovery actions", () => {
		const memo = writeEvidenceLimitationMemo({
			jobId: "job-hu-weak-evidence",
			plan: {
				...basePlan,
				goal: "Hasonlítsd össze a magyar AI piac friss trendjeit",
				researchLanguage: "hu",
			},
			reviewedScope: {
				discoveredCount: 4,
				reviewedCount: 1,
				topicRelevantCount: 0,
				rejectedOrOffTopicCount: 2,
			},
			limitations: ["Nem volt elég témához illeszkedő forrás."],
			nextResearchDirection:
				"Adj hozzá elsődleges magyar piaci forrásokat, majd indíts célzott utánkutatást.",
		});

		expect(memo.title).toBe(
			"Bizonyítékkorlát-memó: Hasonlítsd össze a magyar AI piac friss trendjeit",
		);
		expect(memo.markdown).toContain("# Bizonyítékkorlát-memó:");
		expect(memo.markdown).toContain("## Áttekintett hatókör");
		expect(memo.markdown).toContain("| Hatóköri elem | Darab |");
		expect(memo.markdown).toContain("| Felfedezett források | 4 |");
		expect(memo.markdown).toContain("| Áttekintett források | 1 |");
		expect(memo.markdown).toContain(
			"| Témához illeszkedő áttekintett források | 0 |",
		);
		expect(memo.markdown).toContain(
			"| Elutasított vagy témán kívüli források | 2 |",
		);
		expect(memo.markdown).toContain("## Megalapozott korlátozási okok");
		expect(memo.markdown).toContain("## Memó helyreállítási műveletek");
		expect(memo.markdown).toContain("**Következő kutatási irány:**");
		expect(memo.markdown).toContain("## Függelék: Forrásnapló részletei");
		expect(memo.recoveryActions.map((action) => action.label)).toEqual([
			"Terv módosítása",
			"Források hozzáadása",
			"Mélyebb szint választása",
			"Célzott utánkutatás",
		]);
	});

	it("includes a Source Ledger Snapshot in Evidence Limitation Memos", () => {
		const memo = writeEvidenceLimitationMemo({
			jobId: "job-weak-evidence",
			plan: basePlan,
			reviewedScope: {
				discoveredCount: 3,
				reviewedCount: 1,
				topicRelevantCount: 0,
				rejectedOrOffTopicCount: 2,
			},
			limitations: ["No reviewed source matched the approved question."],
			sources: [
				{
					id: "source-rejected",
					status: "discovered",
					title: "Rejected vendor page",
					url: "https://vendor.example.com/off-topic",
					rejectedReason:
						"Rejected because it explains why the memo has a source coverage limitation.",
					topicRelevant: false,
				},
				{
					id: "source-discovered",
					status: "discovered",
					title: "Discovered-only result",
					url: "https://search.example.com/result",
				},
			],
		});

		expect(memo.markdown).toContain("## Appendix: Source Ledger Detail");
		expect(memo.markdown).toContain("### Rejected/Off-topic Reviewed Sources");
		expect(memo.markdown).toContain("Rejected vendor page");
		expect(memo.markdown).not.toContain("Discovered-only result");
	});

	it("groups and caps grounded limitation reasons in Evidence Limitation Memos", () => {
		const memo = writeEvidenceLimitationMemo({
			jobId: "job-many-limitations",
			plan: basePlan,
			reviewedScope: {
				discoveredCount: 12,
				reviewedCount: 8,
				topicRelevantCount: 1,
				rejectedOrOffTopicCount: 7,
			},
			limitations: [
				"No reviewed source directly answered the repository-aware workflow question.",
				"Only one topic-relevant reviewed source remained after screening.",
				"Official pricing evidence was missing for enterprise controls.",
				"Official compliance evidence was missing for security controls.",
				"Several opened sources were rejected as off-topic vendor marketing.",
				"Rejected sources focused on unrelated consumer coding tools.",
				"Secondary commentary could not verify current product behavior.",
			],
		});

		const limitationSection = memo.markdown.slice(
			memo.markdown.indexOf("## Grounded Limitation Reasons"),
			memo.markdown.indexOf("## Recovery Actions"),
		);

		expect(limitationSection).toContain("### Source coverage");
		expect(limitationSection).toContain("### Evidence quality");
		expect(limitationSection).toContain("### Scope fit");
		expect(limitationSection.match(/^- /gm)).toHaveLength(5);
		expect(limitationSection).toContain("2 more grounded reasons");
	});

	it("writes a durable markdown report from supported synthesis notes with citations and source list", () => {
		const report = writeResearchReport({
			jobId: "job-1",
			plan: basePlan,
			synthesisNotes: baseSynthesisNotes,
			sources: [
				{
					id: "source-1",
					reviewedSourceId: "reviewed-1",
					status: "cited",
					title: "AI coding security documentation",
					url: "https://docs.example.com/ai-coding/security",
				},
			],
		});

		expect(report.title).toBe(
			"Research Report: Compare private AI coding assistants for a small engineering team",
		);
		expect(report.markdown).toContain(`# ${report.title}`);
		expect(report.markdown).toContain("## Executive Summary");
		expect(report.markdown).toContain("## Key Findings");
		expect(report.markdown).toContain("## Methodology");
		expect(report.markdown).toContain("## Comparison");
		expect(report.markdown).toContain(
			"- Repository-aware coding assistants differ most on index freshness and permission controls. [1]",
		);
		expect(report.markdown).toContain("## Sources");
		expect(report.markdown).toContain(
			"[1] AI coding security documentation - https://docs.example.com/ai-coding/security",
		);
		expect(report.sources).toEqual([
			expect.objectContaining({
				id: "source-1",
				citationNumber: 1,
				status: "cited",
			}),
		]);
	});

	it("assembles a structured Report Core from accepted and limited Synthesis Claims", () => {
		const report = writeResearchReport({
			jobId: "job-1",
			plan: basePlan,
			synthesisNotes: baseSynthesisNotes,
			synthesisClaims: [acceptedClaim, limitedClaim],
			evidenceNotes,
			sources: [
				{
					id: "source-1",
					reviewedSourceId: "reviewed-1",
					status: "cited",
					title: "AI coding security documentation",
					url: "https://docs.example.com/ai-coding/security",
				},
				{
					id: "source-2",
					reviewedSourceId: "reviewed-2",
					status: "cited",
					title: "AI coding pricing documentation",
					url: "https://docs.example.com/ai-coding/pricing",
				},
			],
		});

		expect(report.structuredReport.core.title).toBe(report.title);
		expect(report.structuredReport.core.scope).toContain(basePlan.goal);
		expect(report.structuredReport.core.keyFindings).toHaveLength(2);
		expect(report.structuredReport.core.keyFindings[0]).toMatchObject({
			text: acceptedClaim.statement,
			claimIds: ["claim-1"],
			evidenceLinkIds: ["link-1"],
		});
		expect(report.structuredReport.core.limitations).toEqual([
			expect.objectContaining({
				text: limitedClaim.statusReason,
				claimIds: ["claim-2"],
				evidenceLinkIds: ["link-2"],
			}),
		]);
		expect(report.markdown).toContain("## Answer");
		expect(report.markdown).toContain(
			"## Appendix: Methodology / Source Basis",
		);
		expect(report.markdown).toContain("## Appendix: Source Ledger Snapshot");
		expect(report.markdown).toContain(acceptedClaim.statement);
		expect(report.markdown).not.toContain("claim-1");
		expect(report.markdown).not.toContain("link-1");
	});

	it("renders decision-brief markdown from app-owned structured report blocks", () => {
		const extraClaims = Array.from({ length: 8 }, (_, index) => ({
			...acceptedClaim,
			id: `claim-extra-${index + 1}`,
			statement: `Supported decision finding ${index + 1}.`,
			evidenceLinks: [
				{
					...acceptedClaim.evidenceLinks[0],
					id: `link-extra-${index + 1}`,
					claimId: `claim-extra-${index + 1}`,
				},
			],
		}));
		const report = writeResearchReport({
			jobId: "job-decision-brief",
			plan: {
				...basePlan,
				reportIntent: "recommendation",
				reportShape: ["Recommendation", "Tradeoffs"],
			},
			synthesisNotes: baseSynthesisNotes,
			synthesisClaims: [acceptedClaim, ...extraClaims],
			evidenceNotes,
			sources: [
				{
					id: "source-1",
					reviewedSourceId: "reviewed-1",
					status: "cited",
					title: "AI coding security documentation",
					url: "https://docs.example.com/ai-coding/security",
				},
			],
			limitations: ["Pricing data was incomplete for smaller team tiers."],
		});

		expect(report.reportBlocks.map((block) => block.kind)).toEqual([
			"summary",
			"findings",
			"section",
			"section",
			"section",
			"section",
			"section",
			"limitations",
			"appendix",
			"appendix",
			"appendix",
		]);
		expect(report.reportBlocks[0]).toMatchObject({
			kind: "summary",
			heading: "Answer",
		});
		expect(report.reportBlocks[0].markdown).toContain(acceptedClaim.statement);
		expect(report.reportBlocks[1].markdown).toContain(
			"- Repository-aware coding assistants differ most on index freshness and permission controls. [1]",
		);
		expect(report.keyFindings).toHaveLength(7);
		expect(report.markdown).not.toContain("Supported decision finding 7.");

		const headings = marked
			.lexer(report.markdown)
			.filter((token) => token.type === "heading" && token.depth <= 2)
			.map((token) => token.text);
		expect(headings.slice(1)).toEqual([
			"Answer",
			"Key Findings",
			"Recommendation",
			"Ranked Options",
			"Criteria Rubric",
			"Fit/Risk Table",
			"Next Actions",
			"Report Limitations",
			"Appendix: Methodology / Source Basis",
			"Appendix: Source Ledger Snapshot",
			"Appendix: Sources",
		]);
		expect(headings.indexOf("Report Limitations")).toBeLessThan(
			headings.indexOf("Appendix: Source Ledger Snapshot"),
		);
		expect(report.markdown).toContain(
			"## Appendix: Source Ledger Snapshot\n### Cited Sources",
		);
		expect(report.markdown).toContain(
			"## Appendix: Sources\n[1] AI coding security documentation - https://docs.example.com/ai-coding/security",
		);
	});

	it("renders comparison reports as a matrix-first Decision Brief with material confidence cues", () => {
		const comparisonPlan: ResearchPlan = {
			...basePlan,
			goal: "Compare two commuter e-bikes for a hilly daily route.",
			reportIntent: "comparison",
			comparedEntities: ["Cube Kathmandu Hybrid One", "Cube Nuride Hybrid Pro"],
			comparisonAxes: ["Motor support", "Price", "Warranty", "Ride comfort"],
			reportShape: ["Comparison Matrix", "Decision Implications"],
		};
		const comparisonEvidence: DeepResearchEvidenceNote[] = [
			{
				...evidenceNotes[0],
				id: "evidence-kathmandu-motor",
				sourceId: "source-kathmandu-spec",
				comparedEntity: "Cube Kathmandu Hybrid One",
				comparisonAxis: "Motor support",
				findingText: "Kathmandu uses the Bosch Performance Line motor.",
				sourceSupport: {
					sourceId: "source-kathmandu-spec",
					reviewedSourceId: "reviewed-kathmandu-spec",
				},
				sourceQualitySignals: {
					sourceType: "official_vendor",
					independence: "primary",
					freshness: "current",
					directness: "direct",
					extractionConfidence: "high",
					claimFit: "strong",
				},
			},
			{
				...evidenceNotes[0],
				id: "evidence-nuride-motor",
				sourceId: "source-nuride-review",
				comparedEntity: "Cube Nuride Hybrid Pro",
				comparisonAxis: "Motor support",
				findingText:
					"Nuride motor support is described as smoother but less cargo-oriented.",
				sourceSupport: {
					sourceId: "source-nuride-review",
					reviewedSourceId: "reviewed-nuride-review",
				},
				sourceQualitySignals: {
					sourceType: "independent_analysis",
					independence: "independent",
					freshness: "current",
					directness: "direct",
					extractionConfidence: "high",
					claimFit: "strong",
				},
			},
			{
				...evidenceNotes[0],
				id: "evidence-kathmandu-price",
				sourceId: "source-kathmandu-price",
				comparedEntity: "Cube Kathmandu Hybrid One",
				comparisonAxis: "Price",
				findingText:
					"Kathmandu listed at EUR 2,899 during the archived spring sale.",
				sourceSupport: {
					sourceId: "source-kathmandu-price",
					reviewedSourceId: "reviewed-kathmandu-price",
				},
				sourceQualitySignals: {
					sourceType: "vendor_marketing",
					independence: "affiliated",
					freshness: "dated",
					directness: "direct",
					extractionConfidence: "medium",
					claimFit: "partial",
				},
			},
			{
				...evidenceNotes[0],
				id: "evidence-nuride-comfort",
				sourceId: "source-nuride-owner",
				comparedEntity: "Cube Nuride Hybrid Pro",
				comparisonAxis: "Ride comfort",
				findingText:
					"Owners report the Nuride feels more comfortable on mixed paths.",
				sourceSupport: {
					sourceId: "source-nuride-owner",
					reviewedSourceId: "reviewed-nuride-owner",
				},
				sourceQualitySignals: {
					sourceType: "forum",
					independence: "community",
					freshness: "recent",
					directness: "anecdotal",
					extractionConfidence: "medium",
					claimFit: "partial",
				},
			},
			{
				...evidenceNotes[0],
				id: "evidence-kathmandu-warranty",
				sourceId: "source-kathmandu-warranty",
				comparedEntity: "Cube Kathmandu Hybrid One",
				comparisonAxis: "Warranty",
				findingText:
					"Kathmandu warranty coverage is promoted as dealer-backed.",
				sourceSupport: {
					sourceId: "source-kathmandu-warranty",
					reviewedSourceId: "reviewed-kathmandu-warranty",
				},
				sourceQualitySignals: {
					sourceType: "vendor_marketing",
					independence: "affiliated",
					freshness: "current",
					directness: "direct",
					extractionConfidence: "medium",
					claimFit: "partial",
				},
			},
		];
		const comparisonClaims = comparisonEvidence.map((note, index) => ({
			...acceptedClaim,
			id: `claim-comparison-${index + 1}`,
			reportSection: note.comparisonAxis,
			statement: note.findingText,
			claimType: index === 2 ? "price_availability" : acceptedClaim.claimType,
			evidenceLinks: [
				{
					...acceptedClaim.evidenceLinks[0],
					id: `link-comparison-${index + 1}`,
					claimId: `claim-comparison-${index + 1}`,
					evidenceNoteId: note.id,
				},
			],
		}));
		const report = writeResearchReport({
			jobId: "job-e-bike-comparison",
			plan: comparisonPlan,
			synthesisNotes: baseSynthesisNotes,
			synthesisClaims: comparisonClaims,
			evidenceNotes: comparisonEvidence,
			sources: [
				{
					id: "source-kathmandu-spec",
					reviewedSourceId: "reviewed-kathmandu-spec",
					status: "cited",
					title: "Kathmandu official specifications",
					url: "https://cube.example.test/kathmandu/specs",
				},
				{
					id: "source-nuride-review",
					reviewedSourceId: "reviewed-nuride-review",
					status: "cited",
					title: "Nuride independent review",
					url: "https://reviews.example.test/nuride",
				},
				{
					id: "source-kathmandu-price",
					reviewedSourceId: "reviewed-kathmandu-price",
					status: "cited",
					title: "Kathmandu archived vendor price",
					url: "https://vendor.example.test/kathmandu-price",
				},
				{
					id: "source-nuride-owner",
					reviewedSourceId: "reviewed-nuride-owner",
					status: "cited",
					title: "Nuride owner ride report",
					url: "https://owners.example.test/nuride-comfort",
				},
				{
					id: "source-kathmandu-warranty",
					reviewedSourceId: "reviewed-kathmandu-warranty",
					status: "cited",
					title: "Kathmandu vendor warranty page",
					url: "https://vendor.example.test/kathmandu-warranty",
				},
			],
		});

		const headings = marked
			.lexer(report.markdown)
			.filter((token) => token.type === "heading" && token.depth === 2)
			.map((token) => token.text);
		expect(headings.slice(0, 4)).toEqual([
			"Answer",
			"Key Findings",
			"Comparison Matrix",
			"Decision Implications",
		]);
		expect(report.markdown).toContain(
			"| Axis | Cube Kathmandu Hybrid One | Cube Nuride Hybrid Pro | Decision Meaning |",
		);
		expect(report.markdown).toContain(
			"| Motor support | **Official spec** Kathmandu uses the Bosch Performance Line motor. [1] | Nuride motor support is described as smoother but less cargo-oriented. [2] |",
		);
		expect(report.markdown).toContain(
			"| Price | **Dated price** Kathmandu listed at EUR 2,899 during the archived spring sale. [3] | Not established |",
		);
		expect(report.markdown).toContain(
			"| Warranty | **Vendor claim** Kathmandu warranty coverage is promoted as dealer-backed. [5] | Not established |",
		);
		expect(report.markdown).toContain(
			"| Ride comfort | Not established | **Owner report** Owners report the Nuride feels more comfortable on mixed paths. [4] |",
		);
		expect(report.markdown).toContain(
			"Confidence cues: **Official spec** = primary official specifications; **Vendor claim** = vendor or affiliated claim; **Dated price** = price or availability may have changed; **Owner report** = user-reported experience.",
		);
		expect(report.markdown).not.toContain("official_vendor");
		expect(report.markdown).not.toContain("vendor_marketing");
		expect(report.markdown).not.toContain("forum");
		expect(report.markdown).not.toContain("sourceQualitySignals");
		expect(report.markdown).not.toContain(
			"Nuride independent review - https://reviews.example.test/nuride\nNuride motor support is described",
		);
	});

	it("prefers claim-linked comparison evidence when multiple notes share the same entity and axis", () => {
		const comparisonPlan: ResearchPlan = {
			...basePlan,
			goal: "Compare two AI coding assistants for repository workflow.",
			reportIntent: "comparison",
			comparedEntities: ["Assistant A"],
			comparisonAxes: ["Repository workflow"],
			reportShape: ["Comparison Matrix", "Decision Implications"],
		};
		const unlinkedNote: DeepResearchEvidenceNote = {
			...evidenceNotes[0],
			id: "evidence-unlinked-workflow",
			sourceId: "source-unlinked-workflow",
			comparedEntity: "Assistant A",
			comparisonAxis: "Repository workflow",
			findingText:
				"Assistant A has an uncited repository workflow note that was not accepted.",
			sourceSupport: {
				sourceId: "source-unlinked-workflow",
				reviewedSourceId: "reviewed-unlinked-workflow",
			},
		};
		const linkedNote: DeepResearchEvidenceNote = {
			...evidenceNotes[0],
			id: "evidence-linked-workflow",
			sourceId: "source-linked-workflow",
			comparedEntity: "Assistant A",
			comparisonAxis: "Repository workflow",
			findingText:
				"Assistant A supports repository-aware workflow with permission controls.",
			sourceSupport: {
				sourceId: "source-linked-workflow",
				reviewedSourceId: "reviewed-linked-workflow",
			},
		};
		const linkedClaim: DeepResearchSynthesisClaim = {
			...acceptedClaim,
			id: "claim-linked-workflow",
			statement: linkedNote.findingText,
			reportSection: linkedNote.comparisonAxis,
			evidenceLinks: [
				{
					...acceptedClaim.evidenceLinks[0],
					id: "link-linked-workflow",
					claimId: "claim-linked-workflow",
					evidenceNoteId: linkedNote.id,
				},
			],
		};

		const report = writeResearchReport({
			jobId: "job-linked-matrix-evidence",
			plan: comparisonPlan,
			synthesisNotes: baseSynthesisNotes,
			synthesisClaims: [linkedClaim],
			evidenceNotes: [unlinkedNote, linkedNote],
			sources: [
				{
					id: "source-linked-workflow",
					reviewedSourceId: "reviewed-linked-workflow",
					status: "cited",
					title: "Assistant A repository workflow documentation",
					url: "https://assistant-a.example.test/workflow",
				},
			],
		});

		expect(report.markdown).toContain(
			"| Repository workflow | Assistant A supports repository-aware workflow with permission controls. [1] |",
		);
		expect(report.markdown).not.toContain(
			"| Repository workflow | Not established |",
		);
		expect(report.markdown).not.toContain(
			"Assistant A has an uncited repository workflow note that was not accepted.",
		);
	});

	it("builds a comparison matrix from linked evidence metadata when the plan omits entities and axes", () => {
		const productEvidence: DeepResearchEvidenceNote[] = [
			{
				...evidenceNotes[0],
				id: "evidence-product-a-range",
				sourceId: "source-product-a",
				comparedEntity: "Product A",
				comparisonAxis: "Range",
				findingText: "Product A has a 400Wh battery for commuter range.",
				sourceSupport: {
					sourceId: "source-product-a",
					reviewedSourceId: "reviewed-product-a",
				},
			},
			{
				...evidenceNotes[0],
				id: "evidence-product-b-motor",
				sourceId: "source-product-b",
				comparedEntity: "Product B",
				comparisonAxis: "Motor support",
				findingText: "Product B uses a Bosch SX motor with 55Nm torque.",
				sourceSupport: {
					sourceId: "source-product-b",
					reviewedSourceId: "reviewed-product-b",
				},
			},
		];
		const productClaims = productEvidence.map((note, index) => ({
			...acceptedClaim,
			id: `claim-product-${index + 1}`,
			statement: note.findingText,
			reportSection: note.comparisonAxis,
			evidenceLinks: [
				{
					...acceptedClaim.evidenceLinks[0],
					id: `link-product-${index + 1}`,
					claimId: `claim-product-${index + 1}`,
					evidenceNoteId: note.id,
				},
			],
		}));

		const report = writeResearchReport({
			jobId: "job-comparison-metadata-fallback",
			plan: {
				...basePlan,
				reportIntent: "comparison",
				comparedEntities: undefined,
				comparisonAxes: undefined,
				reportShape: ["Comparison Matrix", "Decision Implications"],
			},
			synthesisNotes: baseSynthesisNotes,
			synthesisClaims: productClaims,
			evidenceNotes: productEvidence,
			sources: [
				{
					id: "source-product-a",
					reviewedSourceId: "reviewed-product-a",
					status: "cited",
					title: "Product A official specifications",
					url: "https://product.example.test/a",
				},
				{
					id: "source-product-b",
					reviewedSourceId: "reviewed-product-b",
					status: "cited",
					title: "Product B official specifications",
					url: "https://product.example.test/b",
				},
			],
		});

		expect(report.markdown).toContain(
			"| Axis | Product A | Product B | Decision Meaning |",
		);
		expect(report.markdown).toContain(
			"| Range | Product A has a 400Wh battery for commuter range. [1] | Not established |",
		);
		expect(report.markdown).not.toContain(
			"## Comparison Matrix\n- Product A has a 400Wh battery",
		);
	});

	it("renders recommendation reports with ranked options, rubric, fit/risk table, next actions, and compact appendix", () => {
		const recommendationEvidence: DeepResearchEvidenceNote[] = [
			{
				...evidenceNotes[0],
				id: "evidence-option-a",
				sourceId: "source-option-a",
				comparedEntity: "Option A",
				comparisonAxis: "Repository workflow",
				findingText:
					"Option A has stronger repository-aware workflow and permission controls.",
				sourceSupport: {
					sourceId: "source-option-a",
					reviewedSourceId: "reviewed-option-a",
				},
			},
			{
				...evidenceNotes[0],
				id: "evidence-option-b",
				sourceId: "source-option-b",
				comparedEntity: "Option B",
				comparisonAxis: "Implementation risk",
				findingText:
					"Option B has lower rollout effort but weaker compliance disclosure.",
				sourceSupport: {
					sourceId: "source-option-b",
					reviewedSourceId: "reviewed-option-b",
				},
			},
		];
		const recommendationClaims = recommendationEvidence.map((note, index) => ({
			...acceptedClaim,
			id: `claim-recommendation-${index + 1}`,
			statement: note.findingText,
			reportSection: note.comparisonAxis,
			evidenceLinks: [
				{
					...acceptedClaim.evidenceLinks[0],
					id: `link-recommendation-${index + 1}`,
					claimId: `claim-recommendation-${index + 1}`,
					evidenceNoteId: note.id,
				},
			],
		}));

		const report = writeResearchReport({
			jobId: "job-recommendation-shape",
			plan: {
				...basePlan,
				reportIntent: "recommendation",
				comparedEntities: ["Option A", "Option B"],
				comparisonAxes: [
					"Repository workflow",
					"Implementation risk",
					"Compliance disclosure",
				],
			},
			synthesisNotes: baseSynthesisNotes,
			synthesisClaims: recommendationClaims,
			evidenceNotes: recommendationEvidence,
			sources: [
				{
					id: "source-option-a",
					reviewedSourceId: "reviewed-option-a",
					status: "cited",
					title: "Option A documentation",
					url: "https://example.test/option-a",
				},
				{
					id: "source-option-b",
					reviewedSourceId: "reviewed-option-b",
					status: "cited",
					title: "Option B rollout guide",
					url: "https://example.test/option-b",
				},
			],
			limitations: ["Compliance evidence is thinner than workflow evidence."],
		});

		const headings = marked
			.lexer(report.markdown)
			.filter((token) => token.type === "heading" && token.depth === 2)
			.map((token) => token.text);
		expect(headings.slice(0, 7)).toEqual([
			"Answer",
			"Key Findings",
			"Recommendation",
			"Ranked Options",
			"Criteria Rubric",
			"Fit/Risk Table",
			"Next Actions",
		]);
		expect(report.markdown).toContain("1. **Option A**");
		expect(report.markdown).toContain("2. **Option B**");
		expect(report.markdown).toContain(
			"| Criterion | Why it matters | Evidence basis |",
		);
		expect(report.markdown).toContain(
			"| Option | Best fit | Main risk | Evidence basis |",
		);
		expect(report.markdown).toContain("- Validate the top-ranked option");
		expect(report.markdown).toContain("## Report Limitations");
		expect(report.markdown).toContain(
			"- Compliance evidence is thinner than workflow evidence.",
		);
		expect(report.markdown).toContain(
			"## Appendix: Methodology / Source Basis",
		);
	});

	it("renders investigation reports with answer-first conclusion, causal map, competing explanations, confidence, and open questions", () => {
		const investigationEvidence: DeepResearchEvidenceNote[] = [
			{
				...evidenceNotes[0],
				id: "evidence-deploy-change",
				sourceId: "source-deploy-log",
				comparedEntity: "Deployment change",
				comparisonAxis: "Timeline",
				findingText:
					"The outage started shortly after the deployment changed the cache configuration.",
				sourceSupport: {
					sourceId: "source-deploy-log",
					reviewedSourceId: "reviewed-deploy-log",
				},
			},
			{
				...evidenceNotes[0],
				id: "evidence-db-load",
				sourceId: "source-db-metrics",
				comparedEntity: "Database load",
				comparisonAxis: "Competing explanation",
				findingText:
					"Database load also increased during the same window, but metrics recovered before errors stopped.",
				sourceSupport: {
					sourceId: "source-db-metrics",
					reviewedSourceId: "reviewed-db-metrics",
				},
			},
		];
		const investigationClaims = investigationEvidence.map((note, index) => ({
			...acceptedClaim,
			id: `claim-investigation-${index + 1}`,
			statement: note.findingText,
			reportSection: note.comparisonAxis,
			evidenceLinks: [
				{
					...acceptedClaim.evidenceLinks[0],
					id: `link-investigation-${index + 1}`,
					claimId: `claim-investigation-${index + 1}`,
					evidenceNoteId: note.id,
				},
			],
		}));

		const report = writeResearchReport({
			jobId: "job-investigation-shape",
			plan: {
				...basePlan,
				goal: "Investigate the most likely cause of the production outage.",
				reportIntent: "investigation",
				keyQuestions: [
					"What happened first?",
					"Which explanations fit the evidence?",
					"What remains unresolved?",
				],
			},
			synthesisNotes: baseSynthesisNotes,
			synthesisClaims: investigationClaims,
			evidenceNotes: investigationEvidence,
			sources: [
				{
					id: "source-deploy-log",
					reviewedSourceId: "reviewed-deploy-log",
					status: "cited",
					title: "Deployment log",
					url: "https://example.test/deploy-log",
				},
				{
					id: "source-db-metrics",
					reviewedSourceId: "reviewed-db-metrics",
					status: "cited",
					title: "Database metrics",
					url: "https://example.test/db-metrics",
				},
			],
			limitations: ["No direct user-session trace was available."],
		});

		const headings = marked
			.lexer(report.markdown)
			.filter((token) => token.type === "heading" && token.depth === 2)
			.map((token) => token.text);
		expect(headings.slice(0, 6)).toEqual([
			"Answer",
			"Key Findings",
			"Timeline / Causal Map",
			"Competing Explanations",
			"Confidence And Open Questions",
			"Report Limitations",
		]);
		expect(report.markdown).toContain(
			"| Sequence | Event or factor | Evidence basis |",
		);
		expect(report.markdown).toContain(
			"| 1 | Deployment change | The outage started shortly after the deployment changed the cache configuration.",
		);
		expect(report.markdown).toContain("- **Deployment change**:");
		expect(report.markdown).toContain("- **Database load**:");
		expect(report.markdown).toContain("Confidence:");
		expect(report.markdown).toContain("- Open question: What happened first?");
	});

	it("renders market and product scans with shortlist, rubric, freshness/pricing/availability notes, watchouts, and compact appendix", () => {
		for (const reportIntent of ["market_scan", "product_scan"] as const) {
			const scanEvidence: DeepResearchEvidenceNote[] = [
				{
					...evidenceNotes[0],
					id: `evidence-${reportIntent}-alpha`,
					sourceId: `source-${reportIntent}-alpha`,
					comparedEntity: "Alpha",
					comparisonAxis: "Pricing",
					findingText:
						"Alpha publishes a current starter price and broad availability.",
					sourceSupport: {
						sourceId: `source-${reportIntent}-alpha`,
						reviewedSourceId: `reviewed-${reportIntent}-alpha`,
					},
					sourceQualitySignals: {
						sourceType: "official_vendor",
						independence: "primary",
						freshness: "current",
						directness: "direct",
						extractionConfidence: "high",
						claimFit: "strong",
					},
				},
				{
					...evidenceNotes[0],
					id: `evidence-${reportIntent}-beta`,
					sourceId: `source-${reportIntent}-beta`,
					comparedEntity: "Beta",
					comparisonAxis: "Availability",
					findingText:
						"Beta availability is regional and pricing appears dated.",
					sourceSupport: {
						sourceId: `source-${reportIntent}-beta`,
						reviewedSourceId: `reviewed-${reportIntent}-beta`,
					},
					sourceQualitySignals: {
						sourceType: "vendor_marketing",
						independence: "affiliated",
						freshness: "dated",
						directness: "direct",
						extractionConfidence: "medium",
						claimFit: "partial",
					},
				},
			];
			const scanClaims = scanEvidence.map((note, index) => ({
				...acceptedClaim,
				id: `claim-${reportIntent}-${index + 1}`,
				statement: note.findingText,
				claimType: index === 1 ? "price_availability" : acceptedClaim.claimType,
				reportSection: note.comparisonAxis,
				evidenceLinks: [
					{
						...acceptedClaim.evidenceLinks[0],
						id: `link-${reportIntent}-${index + 1}`,
						claimId: `claim-${reportIntent}-${index + 1}`,
						evidenceNoteId: note.id,
					},
				],
			}));

			const report = writeResearchReport({
				jobId: `job-${reportIntent}-shape`,
				plan: {
					...basePlan,
					reportIntent,
					comparedEntities: ["Alpha", "Beta"],
					comparisonAxes: ["Pricing", "Availability", "Adoption fit"],
				},
				synthesisNotes: baseSynthesisNotes,
				synthesisClaims: scanClaims,
				evidenceNotes: scanEvidence,
				sources: [
					{
						id: `source-${reportIntent}-alpha`,
						reviewedSourceId: `reviewed-${reportIntent}-alpha`,
						status: "cited",
						title: "Alpha pricing page",
						url: "https://example.test/alpha",
					},
					{
						id: `source-${reportIntent}-beta`,
						reviewedSourceId: `reviewed-${reportIntent}-beta`,
						status: "cited",
						title: "Beta availability page",
						url: "https://example.test/beta",
					},
				],
				limitations: ["Availability evidence was regional."],
			});

			const headings = marked
				.lexer(report.markdown)
				.filter((token) => token.type === "heading" && token.depth === 2)
				.map((token) => token.text);
			expect(headings.slice(0, 7)).toEqual([
				"Answer",
				"Key Findings",
				"Shortlist",
				"Evaluation Rubric",
				"Freshness / Pricing / Availability",
				"Watchouts",
				"Report Limitations",
			]);
			expect(report.markdown).toContain(
				"| Candidate | Signal | Evidence basis |",
			);
			expect(report.markdown).toContain(
				"| Criterion | What to check | Evidence basis |",
			);
			expect(report.markdown).toContain("- **Pricing**:");
			expect(report.markdown).toContain("- **Availability**:");
			expect(report.markdown).toContain("- Watchout:");
			expect(report.markdown).toContain("## Appendix: Sources");
		}
	});

	it("renders evidence reviews with strength table, consensus/conflict structure, and limitations tied to evidence strength", () => {
		const evidenceReviewNotes: DeepResearchEvidenceNote[] = [
			{
				...evidenceNotes[0],
				id: "evidence-consensus",
				sourceId: "source-consensus",
				comparedEntity: "Consensus",
				comparisonAxis: "Evidence strength",
				findingText:
					"Primary documentation and independent analysis agree on the core capability.",
				sourceSupport: {
					sourceId: "source-consensus",
					reviewedSourceId: "reviewed-consensus",
				},
				sourceQualitySignals: {
					sourceType: "official_vendor",
					independence: "primary",
					freshness: "current",
					directness: "direct",
					extractionConfidence: "high",
					claimFit: "strong",
				},
			},
			{
				...evidenceNotes[0],
				id: "evidence-conflict",
				sourceId: "source-conflict",
				comparedEntity: "Conflict",
				comparisonAxis: "Evidence conflict",
				findingText:
					"Owner reports conflict with vendor claims about reliability under load.",
				sourceSupport: {
					sourceId: "source-conflict",
					reviewedSourceId: "reviewed-conflict",
				},
				sourceQualitySignals: {
					sourceType: "forum",
					independence: "community",
					freshness: "recent",
					directness: "anecdotal",
					extractionConfidence: "medium",
					claimFit: "partial",
				},
			},
		];
		const evidenceReviewClaims = evidenceReviewNotes.map((note, index) => ({
			...acceptedClaim,
			id: `claim-evidence-review-${index + 1}`,
			statement: note.findingText,
			reportSection: note.comparisonAxis,
			evidenceLinks: [
				{
					...acceptedClaim.evidenceLinks[0],
					id: `link-evidence-review-${index + 1}`,
					claimId: `claim-evidence-review-${index + 1}`,
					evidenceNoteId: note.id,
				},
			],
		}));

		const report = writeResearchReport({
			jobId: "job-evidence-review-shape",
			plan: {
				...basePlan,
				goal: "Review the strength of evidence for the vendor reliability claims.",
				reportIntent: "limitation_focused",
			},
			synthesisNotes: {
				...baseSynthesisNotes,
				conflicts: [
					{
						kind: "conflict",
						statement:
							"Owner reports conflict with vendor claims about reliability under load.",
						sourceRefs: [],
					},
				],
			},
			synthesisClaims: evidenceReviewClaims,
			evidenceNotes: evidenceReviewNotes,
			sources: [
				{
					id: "source-consensus",
					reviewedSourceId: "reviewed-consensus",
					status: "cited",
					title: "Vendor documentation",
					url: "https://example.test/vendor-docs",
				},
				{
					id: "source-conflict",
					reviewedSourceId: "reviewed-conflict",
					status: "cited",
					title: "Owner reliability thread",
					url: "https://example.test/owner-thread",
				},
			],
			limitations: [
				"Reliability evidence includes owner reports, not load-test data.",
			],
		});

		const headings = marked
			.lexer(report.markdown)
			.filter((token) => token.type === "heading" && token.depth === 2)
			.map((token) => token.text);
		expect(headings.slice(0, 6)).toEqual([
			"Answer",
			"Key Findings",
			"Evidence Strength",
			"Consensus And Conflict",
			"Strength-Tied Limitations",
			"Report Limitations",
		]);
		expect(report.markdown).toContain("| Claim | Strength | Evidence basis |");
		expect(report.markdown).toContain(
			"| Primary documentation and independent analysis agree",
		);
		expect(report.markdown).toContain("- **Consensus**:");
		expect(report.markdown).toContain("- **Conflict**:");
		expect(report.markdown).toContain(
			"- Limitation tied to evidence strength:",
		);
		expect(report.markdown).toContain(
			"Reliability evidence includes owner reports, not load-test data.",
		);
	});

	it("renders a durable Source Ledger Snapshot scoped to sources that affected the report", () => {
		const report = writeResearchReport({
			jobId: "job-1",
			plan: basePlan,
			synthesisNotes: baseSynthesisNotes,
			synthesisClaims: [acceptedClaim],
			evidenceNotes,
			sources: [
				{
					id: "source-1",
					reviewedSourceId: "reviewed-1",
					status: "cited",
					title: "AI coding security documentation",
					url: "https://docs.example.com/ai-coding/security",
					citationNote: "Supports a central report claim.",
				},
				{
					id: "source-reviewed",
					status: "reviewed",
					title: "Repository workflow background",
					url: "https://analysis.example.com/repository-workflow",
					reviewedNote: "Topic-relevant background for the approved scope.",
					topicRelevant: true,
				},
				{
					id: "source-rejected",
					status: "discovered",
					title: "Unrelated pricing roundup",
					url: "https://noise.example.com/pricing",
					rejectedReason:
						"Rejected because it explains a limitation in pricing coverage.",
					topicRelevant: false,
					topicRelevanceReason:
						"The source covered a different product category.",
				},
				{
					id: "source-discovered",
					status: "discovered",
					title: "Discovered-only result",
					url: "https://search.example.com/result",
				},
			],
		});

		expect(report.structuredReport.core.sourceLedgerSnapshot).toContain(
			"### Cited Sources",
		);
		expect(report.structuredReport.core.sourceLedgerSnapshot).toContain(
			"- AI coding security documentation - https://docs.example.com/ai-coding/security",
		);
		expect(report.structuredReport.core.sourceLedgerSnapshot).toContain(
			"### Topic-relevant Reviewed Sources",
		);
		expect(report.structuredReport.core.sourceLedgerSnapshot).toContain(
			"- Repository workflow background - https://analysis.example.com/repository-workflow",
		);
		expect(report.structuredReport.core.sourceLedgerSnapshot).toContain(
			"### Rejected/Off-topic Reviewed Sources",
		);
		expect(report.structuredReport.core.sourceLedgerSnapshot).toContain(
			"- Unrelated pricing roundup - https://noise.example.com/pricing",
		);
		expect(report.structuredReport.core.sourceLedgerSnapshot).not.toContain(
			"Discovered-only result",
		);
		expect(report.markdown).toContain("## Appendix: Source Ledger Snapshot");
		expect(report.markdown).toContain("### Cited Sources");
	});

	it("selects structured report shape templates from Report Intent", () => {
		const expectedHeadingsByIntent = {
			comparison: ["Comparison Matrix", "Decision Implications"],
			recommendation: [
				"Recommendation",
				"Ranked Options",
				"Criteria Rubric",
				"Fit/Risk Table",
				"Next Actions",
			],
			investigation: [
				"Timeline / Causal Map",
				"Competing Explanations",
				"Confidence And Open Questions",
			],
			market_scan: [
				"Shortlist",
				"Evaluation Rubric",
				"Freshness / Pricing / Availability",
				"Watchouts",
			],
			product_scan: [
				"Shortlist",
				"Evaluation Rubric",
				"Freshness / Pricing / Availability",
				"Watchouts",
			],
			limitation_focused: [
				"Evidence Strength",
				"Consensus And Conflict",
				"Strength-Tied Limitations",
			],
		} as const;

		for (const [reportIntent, expectedHeadings] of Object.entries(
			expectedHeadingsByIntent,
		)) {
			const report = writeResearchReport({
				jobId: "job-1",
				plan: {
					...basePlan,
					reportIntent: reportIntent as ResearchPlan["reportIntent"],
				},
				synthesisNotes: baseSynthesisNotes,
				synthesisClaims: [acceptedClaim],
				evidenceNotes,
				sources: [
					{
						id: "source-1",
						reviewedSourceId: "reviewed-1",
						status: "cited",
						title: "AI coding security documentation",
						url: "https://docs.example.com/ai-coding/security",
					},
				],
			});

			expect(report.structuredReport.intent).toBe(reportIntent);
			expect(
				report.structuredReport.sections.map((section) => section.heading),
			).toEqual(expectedHeadings);
			for (const section of report.structuredReport.sections) {
				expect(section.claimIds).toEqual(["claim-1"]);
				expect(section.evidenceLinkIds).toEqual(["link-1"]);
				expect(section.sourceIds).toContain("source-1");
			}
		}
	});

	it("renders Hungarian structured report intent headings and source ledger snapshot labels", () => {
		const report = writeResearchReport({
			jobId: "job-hu-structured",
			plan: {
				...basePlan,
				researchLanguage: "hu",
				goal: "Privát AI kódoló asszisztensek összehasonlítása",
				reportIntent: "comparison",
			},
			synthesisNotes: baseSynthesisNotes,
			synthesisClaims: [acceptedClaim],
			evidenceNotes,
			sources: [
				{
					id: "source-1",
					reviewedSourceId: "reviewed-1",
					status: "cited",
					title: "AI coding security documentation",
					url: "https://docs.example.com/ai-coding/security",
				},
			],
		});

		expect(
			report.structuredReport.sections.map((section) => section.heading),
		).toEqual(["Összehasonlító mátrix", "Döntési következmények"]);
		expect(report.markdown).toContain("## Összehasonlító mátrix");
		expect(report.markdown).toContain("## Döntési következmények");
		expect(report.markdown).toContain("## Függelék: Forrásnapló pillanatkép");
		expect(report.markdown).toContain("### Idézett források");
		expect(report.markdown).toContain(
			"[1] AI coding security documentation - https://docs.example.com/ai-coding/security",
		);
		expect(report.markdown).not.toContain("## Comparison Matrix");
		expect(report.markdown).not.toContain("Cited sources in this report");
	});

	it("honors plan-specific sections such as methodology, comparison, and recommendations", () => {
		const report = writeResearchReport({
			jobId: "job-1",
			plan: {
				...basePlan,
				reportShape: [
					"Executive summary",
					"Methodology",
					"Comparison",
					"Recommendations",
					"Source list",
				],
			},
			synthesisNotes: baseSynthesisNotes,
			sources: [
				{
					id: "source-1",
					reviewedSourceId: "reviewed-1",
					status: "cited",
					title: "AI coding security documentation",
					url: "https://docs.example.com/ai-coding/security",
				},
			],
		});

		expect(report.sections.map((section) => section.heading)).toEqual([
			"Methodology",
			"Comparison",
			"Recommendations",
		]);
		expect(report.markdown).toContain("## Methodology");
		expect(report.markdown).toContain(
			"Review scope followed the approved Standard Deep Research plan.",
		);
		expect(report.markdown).toContain("## Comparison");
		expect(report.markdown).toContain(
			"| 1 | Repository-aware coding assistants differ most on index freshness and permission controls. [1] |",
		);
		expect(report.markdown).toContain("## Recommendations");
		expect(report.markdown).toContain(
			"Use the supported findings above to choose next actions.",
		);
	});

	it("preserves Report Limitations visibly", () => {
		const report = writeResearchReport({
			jobId: "job-1",
			plan: basePlan,
			synthesisNotes: {
				...baseSynthesisNotes,
				reportLimitations: [
					{
						kind: "report_limitation",
						statement:
							"No primary vendor pricing dataset was available within the Research Budget.",
						sourceRefs: [],
					},
				],
			},
			sources: [
				{
					id: "source-1",
					reviewedSourceId: "reviewed-1",
					status: "cited",
					title: "AI coding security documentation",
					url: "https://docs.example.com/ai-coding/security",
				},
			],
			limitations: [
				"Coverage for Hungarian-language procurement references remained incomplete.",
			],
		});

		expect(report.limitations).toEqual([
			"No primary vendor pricing dataset was available within the Research Budget.",
			"Coverage for Hungarian-language procurement references remained incomplete.",
		]);
		expect(report.markdown).toContain("## Report Limitations");
		expect(report.markdown).toContain(
			"- No primary vendor pricing dataset was available within the Research Budget.",
		);
		expect(report.markdown).toContain(
			"- Coverage for Hungarian-language procurement references remained incomplete.",
		);
	});

	it("renders Hungarian report headings while preserving citation source titles and URLs", () => {
		const report = writeResearchReport({
			jobId: "job-hu",
			plan: {
				...basePlan,
				researchLanguage: "hu",
				goal: "Privát AI kódoló asszisztensek összehasonlítása",
				reportShape: ["Methodology", "Comparison"],
			},
			synthesisNotes: baseSynthesisNotes,
			sources: [
				{
					id: "source-1",
					reviewedSourceId: "reviewed-1",
					status: "cited",
					title: "AI coding security documentation",
					url: "https://docs.example.com/ai-coding/security",
				},
			],
			limitations: ["A piaci árak gyorsan változhatnak."],
		});

		expect(report.title).toBe(
			"Kutatási jelentés: Privát AI kódoló asszisztensek összehasonlítása",
		);
		expect(report.markdown).toContain("## Vezetői összefoglaló");
		expect(report.markdown).toContain("## Fő megállapítások");
		expect(report.markdown).toContain("## Módszertan");
		expect(report.markdown).toContain("## Összehasonlítás");
		expect(report.markdown).toContain("## Források");
		expect(report.markdown).toContain("## Jelentési korlátok");
		expect(report.markdown).toContain(
			"[1] AI coding security documentation - https://docs.example.com/ai-coding/security",
		);
		expect(report.markdown).not.toContain(
			"AI kódolási biztonsági dokumentáció",
		);
	});

	it("uses Hungarian report boilerplate without translating source titles or cited finding text", () => {
		const citedFinding =
			"Repository-aware coding assistants differ most on index freshness and permission controls.";
		const report = writeResearchReport({
			jobId: "job-hu-default-body",
			plan: {
				...basePlan,
				researchLanguage: "hu",
				goal: "Privát AI kódoló asszisztensek összehasonlítása",
				keyQuestions: [
					"Mely termékek rendelkeznek erős repository-aware workflow-val?",
					"Mely árképzési és megfelelőségi különbségek fontosak?",
				],
			},
			synthesisNotes: {
				...baseSynthesisNotes,
				findings: [
					{
						...baseSynthesisNotes.findings[0],
						statement: citedFinding,
					},
				],
				supportedFindings: [
					{
						...baseSynthesisNotes.supportedFindings[0],
						statement: citedFinding,
					},
				],
			},
			sources: [
				{
					id: "source-1",
					reviewedSourceId: "reviewed-1",
					status: "cited",
					title: "AI coding security documentation",
					url: "https://docs.example.com/ai-coding/security",
				},
			],
		});

		expect(report.executiveSummary).toContain(
			"Kérdés: Privát AI kódoló asszisztensek összehasonlítása",
		);
		expect(report.markdown).toContain("## Módszertan");
		expect(report.markdown).toContain("## Összehasonlítás");
		expect(report.markdown).toContain(citedFinding);
		expect(report.markdown).toContain(
			"[1] AI coding security documentation - https://docs.example.com/ai-coding/security",
		);
		expect(report.markdown).not.toContain(
			"This report addresses the approved Research Plan goal",
		);
		expect(report.markdown).not.toContain("Research questions:");
		expect(report.markdown).not.toContain("Synthesis:");
		expect(report.markdown).not.toContain("- None.");
	});

	it("keeps readable reports capped instead of dumping every source note", () => {
		const manyFindings = Array.from({ length: 10 }, (_, index) => ({
			kind: "supported" as const,
			statement: `Supported finding ${index + 1}.`,
			sourceRefs: [
				{
					reviewedSourceId: `reviewed-${index + 1}`,
					discoveredSourceId: `source-${index + 1}`,
					canonicalUrl: `https://docs.example.com/source-${index + 1}`,
					title: `Source ${index + 1}`,
				},
			],
		}));
		const report = writeResearchReport({
			jobId: "job-many-findings",
			plan: {
				...basePlan,
				goal: "Compare many competing document processors with source-heavy notes and produce a decision-ready report for procurement",
				reportShape: ["Methodology", "Comparison"],
			},
			synthesisNotes: {
				...baseSynthesisNotes,
				findings: manyFindings,
				supportedFindings: manyFindings,
			},
			sources: manyFindings.map((finding, index) => ({
				id: `source-${index + 1}`,
				reviewedSourceId: finding.sourceRefs[0].reviewedSourceId,
				status: "cited",
				title: `Source ${index + 1}`,
				url: `https://docs.example.com/source-${index + 1}`,
			})),
		});

		expect(report.title).toBe(
			"Research Report: Compare many competing document processors with source-heavy notes and produce a decision-ready report for procurement",
		);
		expect(report.keyFindings).toHaveLength(7);
		expect(report.markdown).toContain("Supported finding 7.");
		expect(report.markdown).not.toContain("Supported finding 8.");
		expect(report.markdown).not.toContain("Supported finding 10.");
		expect(report.markdown).toContain("| # | Evidence-backed point |");
	});

	it("cites structured-section evidence beyond capped key findings and includes its source", () => {
		const scanEvidence = Array.from({ length: 8 }, (_, index) => {
			const evidenceNumber = index + 1;
			return {
				...evidenceNotes[0],
				id: `evidence-market-scan-${evidenceNumber}`,
				sourceId: `source-market-scan-${evidenceNumber}`,
				comparedEntity: `Vendor ${evidenceNumber}`,
				comparisonAxis:
					evidenceNumber === 8 ? "Availability" : "Shortlist signal",
				findingText:
					evidenceNumber === 8
						? "Vendor 8 has limited regional availability that should be treated as a watchout."
						: `Vendor ${evidenceNumber} has a supported shortlist signal.`,
				sourceSupport: {
					sourceId: `source-market-scan-${evidenceNumber}`,
					reviewedSourceId: `reviewed-market-scan-${evidenceNumber}`,
				},
				sourceQualitySignals:
					evidenceNumber === 8
						? {
								sourceType: "vendor_marketing" as const,
								independence: "affiliated" as const,
								freshness: "dated" as const,
								directness: "direct" as const,
								extractionConfidence: "medium" as const,
								claimFit: "partial" as const,
							}
						: null,
			};
		});
		const scanClaims = scanEvidence.map((note, index) => ({
			...acceptedClaim,
			id: `claim-market-scan-${index + 1}`,
			statement: note.findingText,
			reportSection: note.comparisonAxis,
			evidenceLinks: [
				{
					...acceptedClaim.evidenceLinks[0],
					id: `link-market-scan-${index + 1}`,
					claimId: `claim-market-scan-${index + 1}`,
					evidenceNoteId: note.id,
				},
			],
		}));

		const report = writeResearchReport({
			jobId: "job-market-scan-capped-section-citations",
			plan: {
				...basePlan,
				goal: "Scan vendors for regional availability watchouts.",
				reportIntent: "market_scan",
				comparedEntities: scanEvidence.map((note) => note.comparedEntity ?? ""),
				comparisonAxes: ["Shortlist signal", "Availability"],
			},
			synthesisNotes: baseSynthesisNotes,
			synthesisClaims: scanClaims,
			evidenceNotes: scanEvidence,
			sources: scanEvidence.map((note, index) => ({
				id: note.sourceId,
				reviewedSourceId: note.sourceSupport.reviewedSourceId,
				status: "cited",
				title: `Market scan source ${index + 1}`,
				url: `https://market-scan.example.test/source-${index + 1}`,
			})),
		});

		expect(report.keyFindings).toHaveLength(7);
		expect(report.markdown).not.toContain(
			"- Vendor 8 has limited regional availability that should be treated as a watchout.",
		);
		expect(report.markdown).toContain(
			"- Watchout: Vendor 8 has limited regional availability that should be treated as a watchout. [8]",
		);
		expect(report.markdown).toContain(
			"[8] Market scan source 8 - https://market-scan.example.test/source-8",
		);
		expect(report.sources.map((source) => source.id)).toContain(
			"source-market-scan-8",
		);
	});

	it("rejects the docs/test-report source-note dump failure pattern", () => {
		const sourceNoteFindings = [
			"2025 CUBE Bikes Nulane One - Bike Insights",
			"2026 CUBE Bikes Kathmandu One - Bike Insights",
			"Official AP1 vs AP2 Comparison - Honda-Tech - Honda Forum Discussion",
			"Compare CUBE NULANE PRO 2024 vs CUBE KATHMANDU, PRO 2025",
		].map((statement, index) => ({
			kind: "supported" as const,
			statement,
			sourceRefs: [
				{
					reviewedSourceId: `reviewed-${index + 1}`,
					discoveredSourceId: `source-${index + 1}`,
					canonicalUrl: `https://example.test/source-${index + 1}`,
					title: statement,
				},
			],
		}));

		expect(() =>
			writeResearchReport({
				jobId: "job-source-note-dump",
				plan: {
					...basePlan,
					goal: "Compare the Cube Nulane and Cube Kathmandu bikes.",
					reportIntent: "comparison",
				},
				synthesisNotes: {
					...baseSynthesisNotes,
					findings: sourceNoteFindings,
					supportedFindings: sourceNoteFindings,
				},
				sources: sourceNoteFindings.map((finding, index) => ({
					id: `source-${index + 1}`,
					reviewedSourceId: finding.sourceRefs[0].reviewedSourceId,
					status: "cited",
					title: finding.statement,
					url: finding.sourceRefs[0].canonicalUrl,
				})),
			}),
		).toThrow(/source-note dump/i);
	});
});
