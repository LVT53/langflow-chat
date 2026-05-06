import { marked } from "marked";
import { describe, expect, it, test } from "vitest";
import type {
	DeepResearchEvidenceNote,
	DeepResearchSynthesisClaim,
} from "$lib/types";
import type { ResearchPlan } from "./planning";
import {
	MAX_REPORT_KEY_FINDINGS,
	type ResearchReportDraft,
	writeEvidenceLimitationMemo,
	writeResearchReport,
} from "./report-writer";
import type { SynthesisNotes } from "./synthesis";

const createdAt = "2026-05-05T10:12:00.000Z";

const basePlan: ResearchPlan = {
	goal: "Compare durable AI research report shapes for decision-ready output.",
	depth: "standard",
	reportIntent: "comparison",
	researchBudget: {
		sourceReviewCeiling: 36,
		synthesisPassCeiling: 2,
	},
	keyQuestions: [
		"What answer should the report lead with?",
		"Which evidence-backed surfaces should be visible in the main body?",
		"Which caveats belong in limitations or appendices?",
	],
	sourceScope: {
		includePublicWeb: true,
		planningContextDisclosure: null,
	},
	reportShape: ["Answer", "Key Findings", "Main structured surface"],
	constraints: ["Keep source details out of the main answer body."],
	deliverables: ["Readable Cited Research Report"],
};

const baseSynthesisNotes: SynthesisNotes = {
	jobId: "job-readability-fixture",
	findings: [],
	supportedFindings: [],
	conflicts: [],
	assumptions: [],
	reportLimitations: [],
};

type ReadabilityFixture = {
	name: string;
	intent: ResearchPlan["reportIntent"];
	planExtras?: Partial<ResearchPlan>;
	notes: Array<{
		entity: string;
		axis: string;
		finding: string;
		sourceType?: DeepResearchEvidenceNote["sourceQualitySignals"];
		claimType?: DeepResearchSynthesisClaim["claimType"];
	}>;
	sources: Array<{ id: string; title: string; url: string }>;
	limitations?: string[];
	expectedMainHeadings: string[];
	expectedStructuredSurfaces: string[];
};

function buildReportFixture(fixture: ReadabilityFixture): ResearchReportDraft {
	const evidenceNotes = fixture.notes.map((note, index) =>
		buildEvidenceNote({
			id: `evidence-${fixture.name}-${index + 1}`,
			sourceId: fixture.sources[index]?.id ?? fixture.sources[0].id,
			entity: note.entity,
			axis: note.axis,
			finding: note.finding,
			sourceQualitySignals: note.sourceType ?? null,
		}),
	);
	const synthesisClaims = evidenceNotes.map((note, index) =>
		buildClaim({
			id: `claim-${fixture.name}-${index + 1}`,
			evidenceNoteId: note.id,
			statement: note.findingText,
			reportSection: note.comparisonAxis,
			claimType: fixture.notes[index]?.claimType ?? "general",
		}),
	);

	return writeResearchReport({
		jobId: `job-${fixture.name}`,
		plan: {
			...basePlan,
			...fixture.planExtras,
			reportIntent: fixture.intent,
		},
		synthesisNotes: baseSynthesisNotes,
		synthesisClaims,
		evidenceNotes,
		sources: fixture.sources.map((source) => ({
			id: source.id,
			reviewedSourceId: `reviewed-${source.id}`,
			status: "cited",
			title: source.title,
			url: source.url,
		})),
		limitations: fixture.limitations,
	});
}

function buildEvidenceNote(input: {
	id: string;
	sourceId: string;
	entity: string;
	axis: string;
	finding: string;
	sourceQualitySignals: DeepResearchEvidenceNote["sourceQualitySignals"];
}): DeepResearchEvidenceNote {
	return {
		id: input.id,
		jobId: "job-readability-fixture",
		conversationId: "conv-readability",
		userId: "user-readability",
		passCheckpointId: "pass-readability",
		passNumber: 1,
		sourceId: input.sourceId,
		taskId: null,
		supportedKeyQuestion: basePlan.keyQuestions[1],
		comparedEntity: input.entity,
		comparisonAxis: input.axis,
		findingText: input.finding,
		sourceSupport: {
			sourceId: input.sourceId,
			reviewedSourceId: `reviewed-${input.sourceId}`,
		},
		sourceQualitySignals: input.sourceQualitySignals,
		sourceAuthoritySummary: null,
		createdAt,
		updatedAt: createdAt,
	};
}

function buildClaim(input: {
	id: string;
	evidenceNoteId: string;
	statement: string;
	reportSection?: string | null;
	claimType?: DeepResearchSynthesisClaim["claimType"];
}): DeepResearchSynthesisClaim {
	return {
		id: input.id,
		jobId: "job-readability-fixture",
		conversationId: "conv-readability",
		userId: "user-readability",
		passCheckpointId: "pass-readability",
		synthesisPass: "synthesis-pass-readability",
		planQuestion: basePlan.keyQuestions[1],
		reportSection: input.reportSection ?? null,
		statement: input.statement,
		claimType: input.claimType ?? "general",
		central: true,
		status: "accepted",
		statusReason: null,
		competingClaimGroupId: null,
		evidenceLinks: [
			{
				id: `link-${input.id}`,
				claimId: input.id,
				evidenceNoteId: input.evidenceNoteId,
				jobId: "job-readability-fixture",
				conversationId: "conv-readability",
				userId: "user-readability",
				relation: "support",
				rationale: "The evidence note supports the fixture claim.",
				material: true,
				createdAt,
			},
		],
		createdAt,
		updatedAt: createdAt,
	};
}

function headingTexts(markdown: string, depth = 2): string[] {
	return marked
		.lexer(markdown)
		.filter((token) => token.type === "heading" && token.depth === depth)
		.map((token) => token.text);
}

function sectionBetween(
	markdown: string,
	startHeading: string,
	endHeading: string,
) {
	const start = markdown.indexOf(`## ${startHeading}`);
	const end = markdown.indexOf(`## ${endHeading}`);
	expect(start).toBeGreaterThanOrEqual(0);
	expect(end).toBeGreaterThan(start);
	return markdown.slice(start, end);
}

function mainBodyBeforeAppendix(markdown: string): string {
	const appendixIndex = markdown.indexOf("## Appendix:");
	expect(appendixIndex).toBeGreaterThanOrEqual(0);
	return markdown.slice(0, appendixIndex);
}

function expectReadableReportSkeleton(
	report: ResearchReportDraft,
	expectedMainHeadings: string[],
) {
	const headings = headingTexts(report.markdown);
	expect(headings.slice(0, expectedMainHeadings.length)).toEqual(
		expectedMainHeadings,
	);
	expect(headings.indexOf("Answer")).toBe(0);
	expect(headings.indexOf("Key Findings")).toBe(1);
	expect(headings.indexOf("Report Limitations")).toBeLessThan(
		headings.indexOf("Appendix: Source Ledger Snapshot"),
	);
	expect(headings.at(-2)).toBe("Appendix: Source Ledger Snapshot");
	expect(headings.at(-1)).toBe("Appendix: Sources");
	expect(report.keyFindings.length).toBeLessThanOrEqual(
		MAX_REPORT_KEY_FINDINGS,
	);
}

function expectMainBodyNotSourceLed(report: ResearchReportDraft) {
	const mainBody = mainBodyBeforeAppendix(report.markdown);
	expect(mainBody).not.toMatch(
		/reviewedSourceId|sourceQualitySignals|citationNote/,
	);
	expect(mainBody).not.toMatch(/https:\/\/example\.test\/[^\s|)]+/);
	expect(mainBody).not.toContain("### Cited Sources");
	expect(mainBody).not.toContain("### Topic-relevant Reviewed Sources");
	expect(mainBody).not.toContain("### Rejected/Off-topic Reviewed Sources");
}

const officialDirectSignal = {
	sourceType: "official_vendor",
	independence: "primary",
	freshness: "current",
	directness: "direct",
	extractionConfidence: "high",
	claimFit: "strong",
} satisfies NonNullable<DeepResearchEvidenceNote["sourceQualitySignals"]>;

const datedVendorSignal = {
	sourceType: "vendor_marketing",
	independence: "affiliated",
	freshness: "dated",
	directness: "direct",
	extractionConfidence: "medium",
	claimFit: "partial",
} satisfies NonNullable<DeepResearchEvidenceNote["sourceQualitySignals"]>;

const ownerReportSignal = {
	sourceType: "forum",
	independence: "community",
	freshness: "recent",
	directness: "anecdotal",
	extractionConfidence: "medium",
	claimFit: "partial",
} satisfies NonNullable<DeepResearchEvidenceNote["sourceQualitySignals"]>;

const reportFixtures: ReadabilityFixture[] = [
	{
		name: "comparison",
		intent: "comparison",
		planExtras: {
			goal: "Compare two report-generation vendors for a regulated team.",
			comparedEntities: ["Atlas Reports", "Beacon Reports"],
			comparisonAxes: ["Governance", "Price", "Operator experience"],
		},
		notes: [
			{
				entity: "Atlas Reports",
				axis: "Governance",
				finding:
					"Atlas Reports publishes current governance controls for tenant isolation.",
				sourceType: officialDirectSignal,
			},
			{
				entity: "Beacon Reports",
				axis: "Price",
				finding:
					"Beacon Reports listed a discounted annual price in an archived pricing page.",
				sourceType: datedVendorSignal,
				claimType: "price_availability",
			},
			{
				entity: "Beacon Reports",
				axis: "Operator experience",
				finding:
					"Operators report Beacon Reports is easier to configure for small teams.",
				sourceType: ownerReportSignal,
			},
		],
		sources: [
			{
				id: "source-atlas-governance",
				title: "Atlas governance documentation",
				url: "https://example.test/atlas-governance",
			},
			{
				id: "source-beacon-price",
				title: "Beacon archived pricing page",
				url: "https://example.test/beacon-price",
			},
			{
				id: "source-beacon-operators",
				title: "Beacon operator thread",
				url: "https://example.test/beacon-operators",
			},
		],
		limitations: [
			"Price evidence is dated and should be rechecked before purchase.",
		],
		expectedMainHeadings: [
			"Answer",
			"Key Findings",
			"Comparison Matrix",
			"Decision Implications",
			"Report Limitations",
		],
		expectedStructuredSurfaces: [
			"| Axis | Atlas Reports | Beacon Reports | Decision Meaning |",
			"Confidence cues:",
		],
	},
	{
		name: "recommendation",
		intent: "recommendation",
		planExtras: {
			goal: "Recommend the best internal research reporting stack.",
			comparedEntities: ["Atlas Reports", "Beacon Reports"],
			comparisonAxes: ["Governance", "Rollout risk", "Workflow fit"],
		},
		notes: [
			{
				entity: "Atlas Reports",
				axis: "Workflow fit",
				finding:
					"Atlas Reports has the strongest workflow fit for teams that need governed report approvals.",
				sourceType: officialDirectSignal,
			},
			{
				entity: "Beacon Reports",
				axis: "Rollout risk",
				finding:
					"Beacon Reports has lower rollout effort but weaker governance disclosure.",
				sourceType: datedVendorSignal,
			},
		],
		sources: [
			{
				id: "source-atlas-workflow",
				title: "Atlas workflow guide",
				url: "https://example.test/atlas-workflow",
			},
			{
				id: "source-beacon-rollout",
				title: "Beacon rollout guide",
				url: "https://example.test/beacon-rollout",
			},
		],
		limitations: ["Governance evidence is stronger for Atlas than Beacon."],
		expectedMainHeadings: [
			"Answer",
			"Key Findings",
			"Recommendation",
			"Ranked Options",
			"Criteria Rubric",
			"Fit/Risk Table",
			"Next Actions",
			"Report Limitations",
		],
		expectedStructuredSurfaces: [
			"1. **Atlas Reports**",
			"| Criterion | Why it matters | Evidence basis |",
			"| Option | Best fit | Main risk | Evidence basis |",
			"- Validate the top-ranked option",
		],
	},
	{
		name: "investigation",
		intent: "investigation",
		planExtras: {
			goal: "Investigate why a research report collapsed into source notes.",
			keyQuestions: [
				"What failure happened first?",
				"Which explanation best fits the evidence?",
				"What remains unresolved?",
			],
		},
		notes: [
			{
				entity: "Prompt upgrade",
				axis: "Timeline",
				finding:
					"The prose collapse started after a prompt upgrade removed answer-first structure.",
				sourceType: officialDirectSignal,
			},
			{
				entity: "Citation audit",
				axis: "Competing explanation",
				finding:
					"Citation audit details increased at the same time, but they belonged in appendices.",
				sourceType: ownerReportSignal,
			},
		],
		sources: [
			{
				id: "source-prompt-upgrade",
				title: "Prompt upgrade changelog",
				url: "https://example.test/prompt-upgrade",
			},
			{
				id: "source-citation-audit",
				title: "Citation audit runbook",
				url: "https://example.test/citation-audit",
			},
		],
		limitations: ["No full raw model transcript was retained."],
		expectedMainHeadings: [
			"Answer",
			"Key Findings",
			"Timeline / Causal Map",
			"Competing Explanations",
			"Confidence And Open Questions",
			"Report Limitations",
		],
		expectedStructuredSurfaces: [
			"| Sequence | Event or factor | Evidence basis |",
			"- **Prompt upgrade**:",
			"Confidence:",
			"- Open question: What failure happened first?",
		],
	},
	{
		name: "market-scan",
		intent: "market_scan",
		planExtras: {
			goal: "Scan the market for research report tooling candidates.",
			comparedEntities: ["Atlas Reports", "Beacon Reports"],
			comparisonAxes: ["Pricing", "Availability", "Adoption fit"],
		},
		notes: [
			{
				entity: "Atlas Reports",
				axis: "Pricing",
				finding:
					"Atlas Reports publishes a current starter price and broad availability.",
				sourceType: officialDirectSignal,
				claimType: "price_availability",
			},
			{
				entity: "Beacon Reports",
				axis: "Availability",
				finding:
					"Beacon Reports availability is regional and pricing appears dated.",
				sourceType: datedVendorSignal,
				claimType: "price_availability",
			},
		],
		sources: [
			{
				id: "source-atlas-pricing",
				title: "Atlas pricing page",
				url: "https://example.test/atlas-pricing",
			},
			{
				id: "source-beacon-availability",
				title: "Beacon availability page",
				url: "https://example.test/beacon-availability",
			},
		],
		limitations: ["Availability evidence was regional."],
		expectedMainHeadings: [
			"Answer",
			"Key Findings",
			"Shortlist",
			"Evaluation Rubric",
			"Freshness / Pricing / Availability",
			"Watchouts",
			"Report Limitations",
		],
		expectedStructuredSurfaces: [
			"| Candidate | Signal | Evidence basis |",
			"| Criterion | What to check | Evidence basis |",
			"- **Pricing**:",
			"- Watchout:",
		],
	},
	{
		name: "product-scan",
		intent: "product_scan",
		planExtras: {
			goal: "Scan product options for an internal evidence review workflow.",
			comparedEntities: ["Atlas Reviews", "Beacon Reviews"],
			comparisonAxes: ["Pricing", "Availability", "Review workflow"],
		},
		notes: [
			{
				entity: "Atlas Reviews",
				axis: "Review workflow",
				finding:
					"Atlas Reviews supports structured evidence review queues for report authors.",
				sourceType: officialDirectSignal,
			},
			{
				entity: "Beacon Reviews",
				axis: "Availability",
				finding:
					"Beacon Reviews is available only in selected enterprise regions.",
				sourceType: datedVendorSignal,
			},
		],
		sources: [
			{
				id: "source-atlas-review-workflow",
				title: "Atlas Reviews product guide",
				url: "https://example.test/atlas-review-workflow",
			},
			{
				id: "source-beacon-regions",
				title: "Beacon Reviews region guide",
				url: "https://example.test/beacon-regions",
			},
		],
		limitations: ["Region availability may change after the scan."],
		expectedMainHeadings: [
			"Answer",
			"Key Findings",
			"Shortlist",
			"Evaluation Rubric",
			"Freshness / Pricing / Availability",
			"Watchouts",
			"Report Limitations",
		],
		expectedStructuredSurfaces: [
			"| Candidate | Signal | Evidence basis |",
			"| Criterion | What to check | Evidence basis |",
			"- **Availability**:",
			"- Watchout:",
		],
	},
	{
		name: "evidence-review",
		intent: "limitation_focused",
		planExtras: {
			goal: "Review the evidence strength behind report readability claims.",
		},
		notes: [
			{
				entity: "Consensus",
				axis: "Evidence strength",
				finding:
					"Primary documentation and independent analysis agree that structured reports improve readability.",
				sourceType: officialDirectSignal,
			},
			{
				entity: "Conflict",
				axis: "Evidence conflict",
				finding:
					"Owner reports conflict with vendor claims about long report usability.",
				sourceType: ownerReportSignal,
			},
		],
		sources: [
			{
				id: "source-readability-docs",
				title: "Readability documentation",
				url: "https://example.test/readability-docs",
			},
			{
				id: "source-owner-usability",
				title: "Owner usability report",
				url: "https://example.test/owner-usability",
			},
		],
		limitations: [
			"Usability evidence includes owner reports, not a formal study.",
		],
		expectedMainHeadings: [
			"Answer",
			"Key Findings",
			"Evidence Strength",
			"Consensus And Conflict",
			"Strength-Tied Limitations",
			"Report Limitations",
		],
		expectedStructuredSurfaces: [
			"| Claim | Strength | Evidence basis |",
			"- **Consensus**:",
			"- **Conflict**:",
			"- Limitation tied to evidence strength:",
		],
	},
];

describe("Deep Research report readability regression fixtures", () => {
	test.each(
		reportFixtures,
	)("$intent reports stay answer-first, structured, capped, and source-ledger-last", (fixture) => {
		const report = buildReportFixture(fixture);

		expectReadableReportSkeleton(report, fixture.expectedMainHeadings);
		for (const expectedSurface of fixture.expectedStructuredSurfaces) {
			expect(report.markdown).toContain(expectedSurface);
		}
		expectMainBodyNotSourceLed(report);
	});

	it("deduplicates repeated accepted claims before rendering key findings", () => {
		const evidenceNotes = [
			buildEvidenceNote({
				id: "evidence-duplicate-1",
				sourceId: "source-duplicate-1",
				entity: "Atlas Reports",
				axis: "Governance",
				finding:
					"Atlas Reports publishes current governance controls for tenant isolation.",
				sourceQualitySignals: officialDirectSignal,
			}),
			buildEvidenceNote({
				id: "evidence-duplicate-2",
				sourceId: "source-duplicate-2",
				entity: "Atlas Reports",
				axis: "Governance",
				finding:
					"Atlas Reports publishes current governance controls for tenant isolation.",
				sourceQualitySignals: officialDirectSignal,
			}),
		];
		const repeatedClaims = evidenceNotes.map((note, index) =>
			buildClaim({
				id: `claim-duplicate-${index + 1}`,
				evidenceNoteId: note.id,
				statement: note.findingText,
				reportSection: note.comparisonAxis,
			}),
		);

		const report = writeResearchReport({
			jobId: "job-duplicate-claims",
			plan: {
				...basePlan,
				reportIntent: "comparison",
				comparedEntities: ["Atlas Reports"],
				comparisonAxes: ["Governance"],
			},
			synthesisNotes: baseSynthesisNotes,
			synthesisClaims: repeatedClaims,
			evidenceNotes,
			sources: [
				{
					id: "source-duplicate-1",
					reviewedSourceId: "reviewed-source-duplicate-1",
					status: "cited",
					title: "Atlas governance documentation",
					url: "https://example.test/atlas-governance",
				},
				{
					id: "source-duplicate-2",
					reviewedSourceId: "reviewed-source-duplicate-2",
					status: "cited",
					title: "Atlas governance mirrored documentation",
					url: "https://example.test/atlas-governance-mirror",
				},
			],
		});

		expect(report.keyFindings).toHaveLength(1);
		const keyFindingsSection = sectionBetween(
			report.markdown,
			"Key Findings",
			"Comparison Matrix",
		);
		expect(
			keyFindingsSection.match(
				/Atlas Reports publishes current governance controls/g,
			),
		).toHaveLength(1);
	});

	it("rejects source-title dumps before they can become the main report body", () => {
		const sourceTitleFindings = [
			"Atlas Reports 2026 Governance Documentation",
			"Beacon Reports Pricing Page Archive",
			"Atlas vs Beacon User Forum Thread",
			"Research Reporting Tool Comparison Landing Page",
		].map((statement, index) => ({
			kind: "supported" as const,
			statement,
			sourceRefs: [
				{
					reviewedSourceId: `reviewed-source-title-${index + 1}`,
					discoveredSourceId: `source-title-${index + 1}`,
					canonicalUrl: `https://example.test/source-title-${index + 1}`,
					title: statement,
				},
			],
		}));

		expect(() =>
			writeResearchReport({
				jobId: "job-source-title-dump",
				plan: {
					...basePlan,
					reportIntent: "comparison",
				},
				synthesisNotes: {
					...baseSynthesisNotes,
					findings: sourceTitleFindings,
					supportedFindings: sourceTitleFindings,
				},
				sources: sourceTitleFindings.map((finding, index) => ({
					id: `source-title-${index + 1}`,
					reviewedSourceId: finding.sourceRefs[0].reviewedSourceId,
					status: "cited",
					title: finding.statement,
					url: finding.sourceRefs[0].canonicalUrl,
				})),
			}),
		).toThrow(/source-note dump/i);
	});

	it("keeps Evidence Limitation Memos compact and puts source ledger detail in the appendix", () => {
		const memo = writeEvidenceLimitationMemo({
			jobId: "job-readability-limitation-memo",
			plan: basePlan,
			reviewedScope: {
				discoveredCount: 12,
				reviewedCount: 6,
				topicRelevantCount: 1,
				rejectedOrOffTopicCount: 5,
			},
			limitations: [
				"Only one reviewed source directly answered the approved question.",
				"Official current pricing evidence was missing.",
				"Several opened sources were rejected as off-topic implementation notes.",
				"Secondary commentary could not verify current product behavior.",
				"Coverage did not include regional availability.",
				"Forum posts were anecdotal and not enough for a stable conclusion.",
			],
			sources: [
				{
					id: "source-rejected",
					status: "reviewed",
					title: "Off-topic implementation note",
					url: "https://example.test/off-topic-note",
					topicRelevant: false,
					rejectedReason:
						"Rejected because it did not answer the approved scope.",
				},
			],
		});

		const limitationSection = sectionBetween(
			memo.markdown,
			"Grounded Limitation Reasons",
			"Recovery Actions",
		);
		expect(limitationSection.match(/^- /gm)).toHaveLength(5);
		expect(limitationSection).toContain("1 more grounded reasons");
		expect(memo.markdown.indexOf("## Recovery Actions")).toBeLessThan(
			memo.markdown.indexOf("## Appendix: Source Ledger Detail"),
		);
		expect(mainBodyBeforeAppendix(memo.markdown)).not.toContain(
			"https://example.test/off-topic-note",
		);
	});
});
