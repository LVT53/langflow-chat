import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	evaluateDeepResearchFixture,
	evaluateGoldenDeepResearchFixtures,
	evaluateDeepResearchRun,
	goldenDeepResearchFixtures,
} from "./evaluation";

describe("Deep Research evaluation harness", () => {
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
							...goldenDeepResearchFixtures.sourceNoteDumpReport.synthesisClaims[0]
								.evidenceLinks[0],
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
							...goldenDeepResearchFixtures.sourceNoteDumpReport.synthesisClaims[1]
								.evidenceLinks[0],
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
							...goldenDeepResearchFixtures.sourceNoteDumpReport.synthesisClaims[0]
								.evidenceLinks[0],
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
		const results = await evaluateGoldenDeepResearchFixtures();

		expect(results.map((result) => result.fixtureId)).toEqual([
			"off-topic-authority-weak-notes",
			"claim-support-and-conflict",
			"source-note-dump-report",
			"crash-resume-hungarian-hard-search",
		]);
		expect(results.map((result) => result.accepted)).toEqual([
			false,
			false,
			false,
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
		]);
	});
});
