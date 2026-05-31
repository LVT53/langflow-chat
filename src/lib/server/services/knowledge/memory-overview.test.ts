import { describe, expect, it } from "vitest";

import { buildKnowledgeMemoryOverview } from "./memory-overview";

describe("Knowledge Memory Overview", () => {
	it("turns timestamped Honcho observations into app-ready bullets", () => {
		const overview = buildKnowledgeMemoryOverview({
			rawOverview:
				"Explicit Observations [2026-04-25 23:15:33] Levi is enrolled in the Communication & Multimedia Design bachelor's programme. [2026-05-14 12:25:20] Levi owns an eBike that arrived on May 13, 2026.",
			durablePersonaCount: 2,
			honchoEnabled: true,
			attemptedAt: 1_780_000_000_000,
		});

		expect(overview.overviewBullets).toEqual([
			"Levi is enrolled in the Communication & Multimedia Design bachelor's programme.",
			"Levi owns an eBike that arrived on May 13, 2026.",
		]);
		expect(overview.overview).toBe(
			"Levi is enrolled in the Communication & Multimedia Design bachelor's programme.\nLevi owns an eBike that arrived on May 13, 2026.",
		);
		expect(overview.overviewSource).toBe("honcho_scoped");
		expect(overview.overviewStatus).toBe("ready");
		expect(overview.overviewUpdatedAt).toBe(1_780_000_000_000);
		expect(overview.overviewLastAttemptAt).toBe(1_780_000_000_000);
	});

	it("strips markdown headings and section labels from overview bullets", () => {
		const overview = buildKnowledgeMemoryOverview({
			rawOverview:
				"## Memory Overview\n- Levi has front-end and back-end development skills.\n- Memory Profile: Levi owns a Cube Kathmandu and has asked about insurance.",
			durablePersonaCount: 2,
			honchoEnabled: true,
			attemptedAt: 1_780_000_000_001,
		});

		expect(overview.overviewBullets).toEqual([
			"Levi has front-end and back-end development skills.",
			"Levi owns a Cube Kathmandu and has asked about insurance.",
		]);
		expect(overview.overview).not.toContain("##");
		expect(overview.overview).not.toContain("Memory Profile");
	});

	it("strips scoped Honcho provenance labels", () => {
		const overview = buildKnowledgeMemoryOverview({
			rawOverview:
				"Scoped user memory from Honcho conclusions:\n- Prefers concise responses.",
			durablePersonaCount: 1,
			honchoEnabled: true,
			attemptedAt: 1_780_000_000_001,
		});

		expect(overview.overviewBullets).toEqual(["Prefers concise responses."]);
		expect(overview.overview).not.toContain("Scoped user memory");
		expect(overview.overview).not.toContain("Honcho conclusions");
	});

	it("softens obvious sensitive values without dropping useful memory bullets", () => {
		const overview = buildKnowledgeMemoryOverview({
			rawOverview: [
				"[2026-04-25 23:30:15] Levi has a phone number of 0642919770.",
				"[2026-04-25 23:30:15] Levi uses contact email futuredesigncenter@nhlstenden.com when discussing the programme.",
				"[2026-04-25 23:30:15] Levi has token: abcdefghijklmnop for a test integration.",
			].join(" "),
			durablePersonaCount: 3,
			honchoEnabled: true,
			attemptedAt: 1_780_000_000_002,
		});

		expect(overview.overviewBullets).toEqual([
			"Levi has a phone number of [phone number].",
			"Levi uses contact email [email address] when discussing the programme.",
			"Levi has token: [redacted] for a test integration.",
		]);
	});

	it("deduplicates bullets and caps the overview list at forty items", () => {
		const source = [
			"[2026-04-25 23:15:33] Levi prefers concise responses.",
			"[2026-04-25 23:15:33] Levi prefers concise responses.",
			...Array.from(
				{ length: 45 },
				(_, index) =>
					`[2026-04-25 23:15:33] Levi has durable memory item ${index + 1}.`,
			),
		].join(" ");

		const overview = buildKnowledgeMemoryOverview({
			rawOverview: source,
			durablePersonaCount: 46,
			honchoEnabled: true,
			attemptedAt: 1_780_000_000_003,
		});

		expect(overview.overviewBullets).toHaveLength(40);
		expect(overview.overviewBullets[0]).toBe("Levi prefers concise responses.");
		expect(
			overview.overviewBullets.filter(
				(bullet) => bullet === "Levi prefers concise responses.",
			),
		).toHaveLength(1);
		expect(overview.overviewBullets[39]).toBe(
			"Levi has durable memory item 39.",
		);
	});

	it("returns an empty disabled contract when Honcho memory is disabled", () => {
		const overview = buildKnowledgeMemoryOverview({
			rawOverview: "Memory Overview\n- This stale text should not render.",
			durablePersonaCount: 3,
			honchoEnabled: false,
			attemptedAt: 1_780_000_000_004,
		});

		expect(overview.overview).toBeNull();
		expect(overview.overviewBullets).toEqual([]);
		expect(overview.overviewSource).toBeNull();
		expect(overview.overviewStatus).toBe("disabled");
		expect(overview.overviewUpdatedAt).toBeNull();
		expect(overview.overviewLastAttemptAt).toBeNull();
		expect(overview.durablePersonaCount).toBe(3);
	});

	it("returns not-enough-memory state for an enabled empty overview", () => {
		const overview = buildKnowledgeMemoryOverview({
			rawOverview: "Memory Overview\n",
			durablePersonaCount: 0,
			honchoEnabled: true,
			attemptedAt: 1_780_000_000_005,
		});

		expect(overview.overview).toBeNull();
		expect(overview.overviewBullets).toEqual([]);
		expect(overview.overviewSource).toBeNull();
		expect(overview.overviewStatus).toBe("not_enough_durable_memory");
		expect(overview.overviewUpdatedAt).toBeNull();
		expect(overview.overviewLastAttemptAt).toBe(1_780_000_000_005);
		expect(overview.durablePersonaCount).toBe(0);
	});

	it("returns temporarily unavailable when live overview generation fails without fallback text", () => {
		const overview = buildKnowledgeMemoryOverview({
			rawOverview: null,
			durablePersonaCount: 2,
			honchoEnabled: true,
			attemptedAt: 1_780_000_000_006,
			overviewUnavailable: true,
		});

		expect(overview.overview).toBeNull();
		expect(overview.overviewBullets).toEqual([]);
		expect(overview.overviewSource).toBeNull();
		expect(overview.overviewStatus).toBe("temporarily_unavailable");
		expect(overview.overviewUpdatedAt).toBeNull();
		expect(overview.overviewLastAttemptAt).toBe(1_780_000_000_006);
		expect(overview.durablePersonaCount).toBe(2);
	});

	it("uses durable persona text as fallback bullets when the live overview is unavailable", () => {
		const overview = buildKnowledgeMemoryOverview({
			rawOverview: null,
			personaFallbackTexts: [
				"Prefers concise responses.",
				"Uses Hungarian and English interfaces.",
			],
			durablePersonaCount: 2,
			honchoEnabled: true,
			attemptedAt: 1_780_000_000_007,
			overviewUnavailable: true,
		});

		expect(overview.overviewBullets).toEqual([
			"Prefers concise responses.",
			"Uses Hungarian and English interfaces.",
		]);
		expect(overview.overviewSource).toBe("persona_fallback");
		expect(overview.overviewStatus).toBe("temporarily_unavailable");
		expect(overview.overviewUpdatedAt).toBeNull();
		expect(overview.overviewLastAttemptAt).toBe(1_780_000_000_007);
	});

	it("preserves cached Honcho source and successful update timestamps", () => {
		const overview = buildKnowledgeMemoryOverview({
			rawOverview: "- Cached durable overview item.",
			rawOverviewSource: "honcho_cache",
			durablePersonaCount: 1,
			honchoEnabled: true,
			updatedAt: 1_779_000_000_000,
			attemptedAt: 1_780_000_000_008,
		});

		expect(overview.overviewBullets).toEqual(["Cached durable overview item."]);
		expect(overview.overviewSource).toBe("honcho_cache");
		expect(overview.overviewStatus).toBe("ready");
		expect(overview.overviewUpdatedAt).toBe(1_779_000_000_000);
		expect(overview.overviewLastAttemptAt).toBe(1_780_000_000_008);
	});
});
