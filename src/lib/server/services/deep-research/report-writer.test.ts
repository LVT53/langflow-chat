import { describe, expect, it } from "vitest";
import type { ResearchPlan } from "./planning";
import { writeEvidenceLimitationMemo, writeResearchReport } from "./report-writer";
import type { SynthesisNotes } from "./synthesis";

const basePlan: ResearchPlan = {
	goal: "Compare private AI coding assistants for a small engineering team.",
	depth: "standard",
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
		expect(memo.markdown).toContain("- Discovered sources: 5");
		expect(memo.markdown).toContain("- Reviewed sources: 2");
		expect(memo.markdown).toContain("- Topic-relevant reviewed sources: 1");
		expect(memo.markdown).toContain("- Rejected or off-topic sources: 3");
		expect(memo.markdown).toContain("## Grounded Limitation Reasons");
		expect(memo.markdown).toContain(
			"- Only one reviewed source matched the approved key questions.",
		);
		expect(memo.markdown).toContain("## Next Research Direction");
		expect(memo.markdown).toContain(
			"Revise the plan toward official enforcement guidance and add primary sources before requesting a report.",
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
		expect(memo.markdown).toContain("- Felfedezett források: 4");
		expect(memo.markdown).toContain("- Áttekintett források: 1");
		expect(memo.markdown).toContain(
			"- Témához illeszkedő áttekintett források: 0",
		);
		expect(memo.markdown).toContain(
			"- Elutasított vagy témán kívüli források: 2",
		);
		expect(memo.markdown).toContain("## Megalapozott korlátozási okok");
		expect(memo.markdown).toContain("## Következő kutatási irány");
		expect(memo.markdown).toContain("## Memó helyreállítási műveletek");
		expect(memo.recoveryActions.map((action) => action.label)).toEqual([
			"Terv módosítása",
			"Források hozzáadása",
			"Mélyebb szint választása",
			"Célzott utánkutatás",
		]);
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
});
