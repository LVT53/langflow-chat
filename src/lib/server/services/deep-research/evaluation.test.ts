import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	evaluateDeepResearchFixture,
	evaluateDeepResearchRun,
	evaluateGoldenDeepResearchFixtures,
	goldenDeepResearchFixtures,
} from "./evaluation";

describe("Deep Research evaluation harness", () => {
	it("accepts the architecture recommendation baseline fixture without planner pollution", async () => {
		const fixture =
			goldenDeepResearchFixtures.architectureRecommendationBaseline;
		const result = await evaluateDeepResearchFixture(fixture);
		const questions = fixture.plan.keyQuestions.join("\n");

		expect(result.accepted).toBe(true);
		expect(fixture.plan.reportIntent).toBe("recommendation");
		expect(fixture.plan.comparedEntities ?? []).toEqual([]);
		expect(fixture.plan.planNormalizationNote).toContain(
			"Candidate architecture patterns will be discovered during research",
		);
		expect(questions).toEqual(expect.stringContaining("architecture patterns"));
		expect(questions).toEqual(expect.stringContaining("failure modes"));
		expect(questions).toEqual(
			expect.stringContaining("implementation roadmap"),
		);
		expect(questions).not.toMatch(/manufacturer|trim|dealer|rider|model year/i);
	});

	it("accepts named approach comparisons with strict Comparison Report Shape", async () => {
		const fixture = goldenDeepResearchFixtures.namedApproachComparison;
		const result = await evaluateDeepResearchFixture(fixture);

		expect(result.accepted).toBe(true);
		expect(fixture.plan.reportIntent).toBe("comparison");
		expect(fixture.plan.comparedEntities).toEqual([
			"RAG pipelines",
			"Workflow graphs",
			"Multi-agent research systems",
		]);
		expect(fixture.reportArtifact?.contentText).toContain(
			"| Axis | RAG pipelines | Workflow graphs | Multi-agent research systems | Decision Meaning |",
		);
		expect(result.dimensions.comparisonCoverage.passed).toBe(true);
	});

	it("keeps named product and vehicle comparison fallback available where appropriate", async () => {
		const fixture = goldenDeepResearchFixtures.nulaneKathmanduComparison;
		const result = await evaluateDeepResearchFixture(fixture);
		const questions = fixture.plan.keyQuestions.join("\n");

		expect(result.accepted).toBe(true);
		expect(fixture.plan.reportIntent).toBe("comparison");
		expect(fixture.plan.comparedEntities).toEqual([
			"CUBE Nulane Hybrid C:62 SLX 400X 2025",
			"CUBE Kathmandu Hybrid SLX 2025",
		]);
		expect(questions).toMatch(/pricing|availability|motor|battery/i);
		expect(result.dimensions.searchPolicyFit.passed).toBe(true);
	});

	it("accepts high-reviewed zero-topic Plan Health Check recovery as Research Plan Revision Needed", async () => {
		const fixture =
			goldenDeepResearchFixtures.highReviewedZeroTopicPlanHealthRecovery;
		const result = await evaluateDeepResearchFixture(fixture);

		expect(result.accepted).toBe(true);
		expect(result.dimensions.stabilizationOutcome.passed).toBe(true);
		expect(fixture.stabilizationOutcome).toMatchObject({
			outcome: "plan_revision_needed",
			status: "completed",
			stage: "plan_revision_needed",
			reportBoundaryCreated: false,
			reportArtifactId: null,
			correctedPlan: {
				version: 2,
				status: "awaiting_approval",
				sourceWorkAutoStarted: false,
				plan: {
					reportIntent: "recommendation",
					comparedEntities: [],
				},
			},
		});
	});

	it("accepts corrected-plan approval only when the same job restarts from clean execution state", async () => {
		const fixture = goldenDeepResearchFixtures.correctedPlanCleanExecution;
		const result = await evaluateDeepResearchFixture(fixture);

		expect(result.accepted).toBe(true);
		expect(result.dimensions.stabilizationOutcome.passed).toBe(true);
		expect(fixture.stabilizationOutcome?.cleanExecution).toMatchObject({
			sameJobId: fixture.id,
			approvedPlanVersion: 2,
			positivePassStateRetired: true,
			activePassNumbers: [1, 2],
			retiredPassNumbers: [-1],
			jobSealed: false,
		});
	});

	it("accepts partial evidence publication as a Limited Research Report with limitations", async () => {
		const fixture =
			goldenDeepResearchFixtures.partialEvidenceLimitedResearchReport;
		const result = await evaluateDeepResearchFixture(fixture);

		expect(result.accepted).toBe(true);
		expect(result.dimensions.stabilizationOutcome.passed).toBe(true);
		expect(fixture.stabilizationOutcome).toMatchObject({
			outcome: "limited_research_report",
			stage: "limited_research_report_ready",
			reportBoundaryCreated: true,
			reportArtifactRole: "limited_research_report",
			artifactMetadataOutcome: "limited_research_report",
		});
		expect(fixture.reportArtifact?.contentText).toContain(
			"## Report Limitations",
		);
	});

	it("accepts no-useful-claim fallback as an Evidence Limitation Memo without a Report Boundary", async () => {
		const fixture =
			goldenDeepResearchFixtures.noUsefulClaimEvidenceLimitationMemo;
		const result = await evaluateDeepResearchFixture(fixture);

		expect(result.accepted).toBe(true);
		expect(result.dimensions.stabilizationOutcome.passed).toBe(true);
		expect(fixture.stabilizationOutcome).toMatchObject({
			outcome: "evidence_limitation_memo",
			stage: "evidence_limitation_memo_ready",
			reportBoundaryCreated: false,
			reportArtifactRole: "evidence_limitation_memo",
		});
		expect(fixture.reportArtifact?.contentText).toContain(
			"# Evidence Limitation Memo:",
		);
		expect(fixture.reportArtifact?.contentText).not.toContain(
			"# Limited Research Report:",
		);
	});

	it("evaluates run-level comparison coverage and search policy fit from the saved report artifact", async () => {
		const plan = {
			...goldenDeepResearchFixtures.sourceNoteDumpReport.plan,
			goal: "Compare Product A and Product B commuter e-bikes.",
			keyQuestions: [
				"Which range differences matter?",
				"Which motor differences matter?",
			],
			constraints: ["Prefer current official product specifications."],
		};
		const result = await evaluateDeepResearchRun({
			id: "run-comparison-coverage",
			title: "Run-level comparison evaluation",
			plan,
			reviewedSources: [
				{
					id: "source-product-a",
					title: "Product A official specifications",
					canonicalUrl: "https://product.example.test/a",
					supportedKeyQuestions: plan.keyQuestions,
					keyFindings: ["Product A has a 400Wh battery for commuter range."],
					qualityScore: 90,
					topicRelevant: true,
					comparedEntity: "Product A",
					comparisonAxis: "Range",
				},
				{
					id: "source-product-b",
					title: "Product B official specifications",
					canonicalUrl: "https://product-b.example.test/specs",
					supportedKeyQuestions: plan.keyQuestions,
					keyFindings: ["Product B uses a Bosch SX motor with 55Nm torque."],
					qualityScore: 90,
					topicRelevant: true,
					comparedEntity: "Product B",
					comparisonAxis: "Motor support",
				},
			],
			discoveryRequests: [
				{
					query: "Product A official specifications Range",
					sourcePolicy: "commerce",
					comparedEntity: "Product A",
					comparisonAxis: "Range",
				},
				{
					query: "Product B official specifications Motor support",
					sourcePolicy: "commerce",
					comparedEntity: "Product B",
					comparisonAxis: "Motor support",
				},
			],
			evidenceNotes: [
				{
					...goldenDeepResearchFixtures.sourceNoteDumpReport.evidenceNotes[0],
					id: "note-product-a-range",
					sourceId: "source-product-a",
					comparedEntity: "Product A",
					comparisonAxis: "Range",
					findingText: "Product A has a 400Wh battery for commuter range.",
					sourceSupport: {
						sourceId: "source-product-a",
						reviewedSourceId: "source-product-a",
					},
				},
				{
					...goldenDeepResearchFixtures.sourceNoteDumpReport.evidenceNotes[1],
					id: "note-product-b-motor",
					sourceId: "source-product-b",
					comparedEntity: "Product B",
					comparisonAxis: "Motor support",
					findingText: "Product B uses a Bosch SX motor with 55Nm torque.",
					sourceSupport: {
						sourceId: "source-product-b",
						reviewedSourceId: "source-product-b",
					},
				},
			],
			synthesisClaims: [
				{
					...goldenDeepResearchFixtures.sourceNoteDumpReport.synthesisClaims[0],
					id: "claim-product-a-range",
					statement: "Product A has a 400Wh battery for commuter range.",
					reportSection: "Range",
					evidenceLinks: [
						{
							...goldenDeepResearchFixtures.sourceNoteDumpReport
								.synthesisClaims[0].evidenceLinks[0],
							id: "link-product-a-range",
							claimId: "claim-product-a-range",
							evidenceNoteId: "note-product-a-range",
						},
					],
				},
				{
					...goldenDeepResearchFixtures.sourceNoteDumpReport.synthesisClaims[1],
					id: "claim-product-b-motor",
					statement: "Product B uses a Bosch SX motor with 55Nm torque.",
					reportSection: "Motor support",
					evidenceLinks: [
						{
							...goldenDeepResearchFixtures.sourceNoteDumpReport
								.synthesisClaims[1].evidenceLinks[0],
							id: "link-product-b-motor",
							claimId: "claim-product-b-motor",
							evidenceNoteId: "note-product-b-motor",
						},
					],
				},
			],
			reportArtifact: {
				id: "artifact-product-comparison",
				contentText: [
					"# Research Report: Compare Product A and Product B",
					"## Answer",
					"Compared on reviewed evidence, Product A has the established range fact while Product B has the established motor fact; remaining cells are explicit limitations.",
					"## Comparison Matrix",
					"| Axis | Product A | Product B | Decision Meaning |",
					"| --- | --- | --- | --- |",
					"| Range | Product A has a 400Wh battery for commuter range. [1] | Not established | Range evidence is incomplete for Product B. |",
					"| Motor support | Not established | Product B uses a Bosch SX motor with 55Nm torque. [2] | Motor evidence is incomplete for Product A. |",
				].join("\n"),
				metadata: {
					deepResearchReport: true,
					documentRole: "research_report",
				},
			},
			expectedComparisonGrid: [
				{
					comparedEntity: "Product A",
					comparisonAxis: "Range",
					expectedText: "Product A has a 400Wh battery for commuter range.",
				},
				{
					comparedEntity: "Product B",
					comparisonAxis: "Motor support",
					expectedText: "Product B uses a Bosch SX motor with 55Nm torque.",
				},
			],
		});

		expect(result.accepted).toBe(true);
		expect(result.dimensions.comparisonCoverage.passed).toBe(true);
		expect(result.dimensions.searchPolicyFit.passed).toBe(true);
	});

	it("rejects generic discovery policies for specialized comparison searches", async () => {
		const plan = {
			...goldenDeepResearchFixtures.sourceNoteDumpReport.plan,
			goal: "Compare Product A and Product B commuter e-bikes.",
			keyQuestions: ["Which product specifications differ?"],
			constraints: ["Prefer current official product specifications."],
			comparedEntities: ["Product A"],
			comparisonAxes: ["Range"],
		};
		const result = await evaluateDeepResearchRun({
			id: "run-generic-policy-regression",
			title: "Generic policy regression",
			plan,
			reviewedSources: [
				{
					id: "source-product-a",
					title: "Product A official specifications",
					canonicalUrl: "https://product.example.test/a",
					supportedKeyQuestions: plan.keyQuestions,
					keyFindings: ["Product A has a 400Wh battery for commuter range."],
					qualityScore: 90,
					topicRelevant: true,
				},
			],
			discoveryRequests: [
				{
					query: "Product A official specifications Range",
					sourcePolicy: "general",
					comparedEntity: "Product A",
					comparisonAxis: "Range",
				},
			],
			evidenceNotes: [
				{
					...goldenDeepResearchFixtures.sourceNoteDumpReport.evidenceNotes[0],
					id: "note-product-a-range",
					sourceId: "source-product-a",
					comparedEntity: "Product A",
					comparisonAxis: "Range",
					findingText: "Product A has a 400Wh battery for commuter range.",
					sourceSupport: {
						sourceId: "source-product-a",
						reviewedSourceId: "source-product-a",
					},
				},
			],
			synthesisClaims: [
				{
					...goldenDeepResearchFixtures.sourceNoteDumpReport.synthesisClaims[0],
					id: "claim-product-a-range",
					statement: "Product A has a 400Wh battery for commuter range.",
					evidenceLinks: [
						{
							...goldenDeepResearchFixtures.sourceNoteDumpReport
								.synthesisClaims[0].evidenceLinks[0],
							id: "link-product-a-range",
							claimId: "claim-product-a-range",
							evidenceNoteId: "note-product-a-range",
						},
					],
				},
			],
			reportArtifact: {
				id: "artifact-product-a",
				contentText:
					"| Axis | Product A | Decision Meaning |\n| --- | --- | --- |\n| Range | Product A has a 400Wh battery for commuter range. [1] | Range evidence is established. |",
			},
			expectedComparisonGrid: [
				{
					comparedEntity: "Product A",
					comparisonAxis: "Range",
					expectedText: "Product A has a 400Wh battery for commuter range.",
				},
			],
		});

		expect(result.accepted).toBe(false);
		expect(result.dimensions.searchPolicyFit.passed).toBe(false);
		expect(result.dimensions.searchPolicyFit.reasons).toContain(
			"Discovery requests used a source policy that did not fit the approved research plan.",
		);
	});

	it("rejects CUBE 2025/2026 reports that cite unrelated sources and publish an empty matrix", async () => {
		const result = await evaluateDeepResearchFixture(
			goldenDeepResearchFixtures.cubeModelYearUnrelatedSources,
		);

		expect(result.accepted).toBe(false);
		expect(result.dimensions.sourceRelevance.passed).toBe(false);
		expect(result.dimensions.comparisonCoverage.passed).toBe(false);
		expect(result.dimensions.citationSupport.passed).toBe(false);
		expect(result.dimensions.comparisonCoverage.reasons).toContain(
			"Comparison matrix must not be entirely empty or Not established.",
		);
		expect(result.dimensions.citationSupport.reasons).toContain(
			"Cited sources must come from topic-relevant reviewed sources.",
		);
		expect(result.dimensions.sourceRelevance.reasons).toContain(
			"Source ledger topic-relevant section must not include rejected or off-topic sources.",
		);
	});

	it("accepts the Nulane/Kathmandu fixture when the matrix is product-only and evidence-backed", async () => {
		const result = await evaluateDeepResearchFixture(
			goldenDeepResearchFixtures.nulaneKathmanduComparison,
		);

		expect(result.accepted).toBe(true);
		expect(result.dimensions.comparisonCoverage.passed).toBe(true);
		expect(result.dimensions.searchPolicyFit.passed).toBe(true);
		expect(result.dimensions.citationSupport.passed).toBe(true);
		expect(result.dimensions.readableSynthesis.passed).toBe(true);
	});

	it("rejects Nulane/Kathmandu reports that turn constraints into matrix columns", async () => {
		const result = await evaluateDeepResearchFixture({
			...goldenDeepResearchFixtures.nulaneKathmanduComparison,
			id: "nulane-kathmandu-malformed-columns",
			reportArtifact: {
				id: "artifact-nulane-kathmandu-malformed",
				contentText: [
					"# Research Report: Nulane 400X vs Kathmandu SLX",
					"## Answer",
					"The available evidence supports a limited comparison, but the matrix is malformed.",
					"## Comparison Matrix",
					"| Axis | CUBE Nulane Hybrid C:62 SLX 400X 2025 | CUBE Kathmandu Hybrid SLX 2025 | pricing | availability | Europe | Medium frame size | model year | Decision Meaning |",
					"| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
					"| Pricing | Nulane is listed at EUR 3,499 in the compared 2025 listing. [1] | Kathmandu is listed at EUR 3,699 in the compared 2025 listing. [2] | Not established | Not established | Not established | Not established | Not established | Price evidence is limited to reviewed listings. |",
					"## Source Ledger Snapshot",
					"### Cited Sources",
					"- Cube Nulane official specification - https://cube.example.test/nulane-400x",
					"- Cube Kathmandu official specification - https://cube.example.test/kathmandu-slx",
					"### Topic-relevant Reviewed Sources",
					"- No sources recorded.",
					"### Rejected/Off-topic Reviewed Sources",
					"- No sources recorded.",
				].join("\n"),
			},
		});

		expect(result.accepted).toBe(false);
		expect(result.dimensions.comparisonCoverage.passed).toBe(false);
		expect(result.dimensions.comparisonCoverage.reasons).toContain(
			"Comparison matrix columns must be compared entities, not constraints or axes.",
		);
	});

	it("scores source relevance and claim grounding as separate acceptance dimensions", async () => {
		const result = await evaluateDeepResearchFixture(
			goldenDeepResearchFixtures.offTopicAuthorityWeakNotes,
		);

		expect(result.fixtureId).toBe("off-topic-authority-weak-notes");
		expect(result.accepted).toBe(false);
		expect(result.dimensions.sourceRelevance.passed).toBe(false);
		expect(result.dimensions.claimGrounding.passed).toBe(false);
		expect(result.dimensions.sourceRelevance.reasons).toContain(
			"Off-topic reviewed sources cannot satisfy approved key-question coverage.",
		);
		expect(result.dimensions.claimGrounding.reasons).toContain(
			"Enough reviewed sources were present, but the fixture had too few accepted supported central claims.",
		);
	});

	it("separates unsupported central claims, removable non-central claims, and claim conflicts", async () => {
		const result = await evaluateDeepResearchFixture(
			goldenDeepResearchFixtures.claimSupportAndConflict,
		);

		expect(result.accepted).toBe(false);
		expect(result.dimensions.sourceRelevance.passed).toBe(true);
		expect(result.dimensions.claimGrounding.passed).toBe(false);
		expect(result.dimensions.citationSupport.passed).toBe(false);
		expect(result.dimensions.claimGrounding.reasons).toEqual(
			expect.arrayContaining([
				"Unsupported Central Claims must be repaired before report publication.",
				"Material Claim Conflicts must remain visible as competing claims until resolved.",
			]),
		);
		expect(result.dimensions.citationSupport.reasons).toEqual(
			expect.arrayContaining([
				"Unsupported Non-Central Claims were removable without blocking supported central claims.",
			]),
		);
	});

	it("rejects docs/test-report.md style source-note dumps as unreadable synthesis", async () => {
		const markdown = readFileSync("docs/test-report.md", "utf8");
		const result = await evaluateDeepResearchFixture({
			...goldenDeepResearchFixtures.sourceNoteDumpReport,
			reportMarkdown: markdown,
		});

		expect(result.accepted).toBe(false);
		expect(result.dimensions.readableSynthesis.passed).toBe(false);
		expect(result.dimensions.readableSynthesis.reasons).toContain(
			"Report reads like repeated source notes instead of synthesized analysis.",
		);
	});

	it("rejects source-note dumps even when notes are not duplicated between Key Findings and Analysis", async () => {
		const result = await evaluateDeepResearchFixture({
			...goldenDeepResearchFixtures.sourceNoteDumpReport,
			reportMarkdown: [
				"# Research Report: Bike comparison",
				"## Findings",
				"- Source note: Cube Nulane official specs - https://cube.example.com/nulane - Nulane has lightweight commuter geometry.",
				"- Source note: Cube Kathmandu official specs - https://cube.example.com/kathmandu - Kathmandu has touring-oriented components.",
				"- Source note: Forum discussion - https://forum.example.com/thread - Riders mention comfort impressions.",
				"## Synthesis",
				"The notes above are the source evidence gathered during review.",
				"## Sources",
				"[1] Cube Nulane official specs - https://cube.example.com/nulane",
				"[2] Cube Kathmandu official specs - https://cube.example.com/kathmandu",
				"[3] Forum discussion - https://forum.example.com/thread",
			].join("\n"),
		});

		expect(result.accepted).toBe(false);
		expect(result.dimensions.readableSynthesis.passed).toBe(false);
		expect(result.dimensions.readableSynthesis.reasons).toContain(
			"Report reads like repeated source notes instead of synthesized analysis.",
		);
	});

	it("accepts multi-turn hard-search fixtures with durable crash resume and Hungarian output", async () => {
		const result = await evaluateDeepResearchFixture(
			goldenDeepResearchFixtures.crashResumeHungarianHardSearch,
		);

		expect(result.accepted).toBe(true);
		expect(result.dimensions.sourceRelevance.passed).toBe(true);
		expect(result.dimensions.claimGrounding.passed).toBe(true);
		expect(result.dimensions.citationSupport.passed).toBe(true);
		expect(result.dimensions.readableSynthesis.passed).toBe(true);
		expect(result.dimensions.durableResume.passed).toBe(true);
		expect(result.dimensions.localization.passed).toBe(true);
		expect(result.dimensions.hardSearchBehavior.passed).toBe(true);
	});

	it("runs all golden fixtures repeatably for CI without live web dependencies", async () => {
		// Focused deterministic command: npm test -- src/lib/server/services/deep-research/evaluation.test.ts
		const results = await evaluateGoldenDeepResearchFixtures();

		expect(results.map((result) => result.fixtureId)).toEqual([
			"architecture-recommendation-baseline",
			"named-approach-comparison",
			"high-reviewed-zero-topic-plan-health-recovery",
			"corrected-plan-clean-execution",
			"partial-evidence-limited-research-report",
			"no-useful-claim-evidence-limitation-memo",
			"off-topic-authority-weak-notes",
			"claim-support-and-conflict",
			"source-note-dump-report",
			"cube-model-year-unrelated-sources",
			"nulane-kathmandu-comparison",
			"crash-resume-hungarian-hard-search",
		]);
		expect(results.map((result) => result.accepted)).toEqual([
			true,
			true,
			true,
			true,
			true,
			true,
			false,
			false,
			false,
			false,
			true,
			true,
		]);
		expect(Object.keys(results[0].dimensions).sort()).toEqual([
			"citationSupport",
			"claimGrounding",
			"comparisonCoverage",
			"durableResume",
			"hardSearchBehavior",
			"localization",
			"readableSynthesis",
			"searchPolicyFit",
			"sourceRelevance",
			"stabilizationOutcome",
		]);
	});
});
