import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	evaluateDeepResearchFixture,
	evaluateGoldenDeepResearchFixtures,
	goldenDeepResearchFixtures,
} from "./evaluation";

describe("Deep Research evaluation harness", () => {
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
			"durableResume",
			"hardSearchBehavior",
			"localization",
			"readableSynthesis",
			"sourceRelevance",
		]);
	});
});
