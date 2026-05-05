import { describe, expect, it, vi } from "vitest";
import { createFirstResearchPlanDraft } from "./planning";

describe("createFirstResearchPlanDraft", () => {
	it("drafts and persists a structured Research Plan with a rendered user-facing plan", async () => {
		const repository = {
			saveResearchPlanDraft: vi.fn(async (draft) => ({
				...draft,
				savedAt: "2026-05-05T10:00:00.000Z",
			})),
		};

		const result = await createFirstResearchPlanDraft(
			{
				jobId: "job-1",
				userRequest:
					"Compare the current EU and US approaches to AI copyright training data rules.",
				selectedDepth: "standard",
				researchLanguage: "en",
				planningContext: [
					{
						type: "conversation",
						title: "Earlier chat",
						summary: "The user cares about practical product compliance.",
					},
				],
			},
			{ repository },
		);

		expect(result.status).toBe("awaiting_approval");
		expect(result.plan).toMatchObject({
			depth: "standard",
			goal: "Compare the current EU and US approaches to AI copyright training data rules.",
			reportIntent: "comparison",
			sourceScope: expect.objectContaining({
				includePublicWeb: true,
			}),
		});
		expect(result.plan.keyQuestions.length).toBeGreaterThanOrEqual(3);
		expect(result.renderedPlan).not.toContain("# Research Plan");
		expect(result.renderedPlan).toContain(
			"Goal: Compare the current EU and US approaches to AI copyright training data rules.",
		);
		expect(result.renderedPlan).toContain("Report intent: Comparison");
		expect(result.renderedPlan).toContain("Standard Deep Research");
		expect(result.contextDisclosure).toEqual(
			"Context considered: 1 conversation item.",
		);
		expect(repository.saveResearchPlanDraft).toHaveBeenCalledWith(
			expect.objectContaining({
				jobId: "job-1",
				version: 1,
				status: "awaiting_approval",
				rawPlan: result.plan,
				renderedPlan: result.renderedPlan,
			}),
		);
	});

	it("does not call source-heavy web research while drafting the plan", async () => {
		const sourceResearch = {
			discoverSources: vi.fn(async () => {
				throw new Error("source research should not run before plan approval");
			}),
		};

		await createFirstResearchPlanDraft(
			{
				jobId: "job-2",
				userRequest: "Research the latest market for home battery storage.",
				selectedDepth: "focused",
				researchLanguage: "en",
			},
			{ sourceResearch },
		);

		expect(sourceResearch.discoverSources).not.toHaveBeenCalled();
	});

	it("exposes compared entities and central comparison axes for explicit comparison requests", async () => {
		const result = await createFirstResearchPlanDraft({
			jobId: "job-comparison-axes",
			userRequest:
				"Compare GitHub Copilot and Cursor for privacy, pricing, and code review workflows.",
			selectedDepth: "focused",
			researchLanguage: "en",
		});

		expect(result.plan).toMatchObject({
			reportIntent: "comparison",
			comparedEntities: ["GitHub Copilot", "Cursor"],
			comparisonAxes: ["privacy", "pricing", "code review workflows"],
		});
		expect(result.renderedPlan).toContain("Compared entities:");
		expect(result.renderedPlan).toContain("- GitHub Copilot");
		expect(result.renderedPlan).toContain("- Cursor");
		expect(result.renderedPlan).toContain("Central comparison axes:");
		expect(result.renderedPlan).toContain("- privacy");
		expect(result.renderedPlan).toContain("- pricing");
		expect(result.renderedPlan).toContain("- code review workflows");
	});

	it("includes a coarse Research Effort Estimate for the selected depth", async () => {
		const result = await createFirstResearchPlanDraft({
			jobId: "job-3",
			userRequest: "Map the tradeoffs of open-source vector databases.",
			selectedDepth: "max",
			researchLanguage: "en",
		});

		expect(result.effortEstimate).toEqual({
			selectedDepth: "max",
			expectedTimeBand: "45-120 minutes",
			sourceReviewCeiling: 120,
			relativeCostWarning:
				"Highest relative cost; use for broad or high-stakes investigations.",
		});
		expect(result.renderedPlan).toContain("Expected time: 45-120 minutes");
		expect(result.renderedPlan).toContain("Source review ceiling: up to 120");
	});

	it("renders Hungarian Research Plan labels without translating included source titles", async () => {
		const result = await createFirstResearchPlanDraft({
			jobId: "job-hu",
			userRequest:
				"Kérlek kutasd ki az AI kódoló asszisztensek beszerzési szempontjait.",
			selectedDepth: "focused",
			researchLanguage: "hu",
			planningContext: [
				{
					type: "attachment",
					artifactId: "artifact-1",
					title: "OpenAI Codex Pricing",
					summary: "Vendor pricing export supplied by the user.",
				},
			],
		});

		expect(result.renderedPlan).not.toContain("# Kutatási terv");
		expect(result.renderedPlan).toContain(
			"Cél: Kérlek kutasd ki az AI kódoló asszisztensek beszerzési szempontjait.",
		);
		expect(result.renderedPlan).toContain("Mélység: Fókuszált mély kutatás");
		expect(result.renderedPlan).toContain("Jelentési szándék: Termékáttekintés");
		expect(result.renderedPlan).toContain("Várható idő: 3-8 perc");
		expect(result.renderedPlan).toContain(
			"Forrás-áttekintési plafon: legfeljebb 12",
		);
		expect(result.renderedPlan).toContain("Bevont források:");
		expect(result.renderedPlan).toContain("OpenAI Codex Pricing");
		expect(result.renderedPlan).not.toContain("OpenAI Codex Árazás");
	});

	it("uses Hungarian default plan prose while preserving original included source titles", async () => {
		const result = await createFirstResearchPlanDraft({
			jobId: "job-hu-prose",
			userRequest:
				"Kérlek foglald össze a privát AI kódoló asszisztensek beszerzési kockázatait.",
			selectedDepth: "standard",
			researchLanguage: "hu",
			planningContext: [
				{
					type: "knowledge",
					artifactId: "artifact-knowledge-1",
					title: "GitHub Copilot Trust Center",
					summary: "Original vendor trust-center notes.",
					includeAsResearchSource: true,
				},
			],
		});

		expect(result.plan.keyQuestions).toEqual([
			"Mi a legfontosabb jelenlegi háttér ehhez a témához: Kérlek foglald össze a privát AI kódoló asszisztensek beszerzési kockázatait?",
			"Mely hiteles források támasztják alá vagy árnyalják a fő állításokat?",
			"Milyen gyakorlati következtetéseket és korlátokat kell kiemelnie a jelentésnek?",
		]);
		expect(result.plan.reportShape).toEqual([
			"Vezetői összefoglaló",
			"Fő megállapítások",
			"Fő összehasonlítás",
			"Forráslista",
			"Korlátok",
		]);
		expect(result.plan.constraints).toEqual([]);
		expect(result.plan.deliverables).toEqual([
			"Hivatkozásokkal ellátott kutatási jelentés",
		]);
		expect(result.renderedPlan).toContain("Eredménytermékek:");
		expect(result.renderedPlan).toContain(
			"Hivatkozásokkal ellátott kutatási jelentés",
		);
		expect(result.renderedPlan).toContain("GitHub Copilot Trust Center");
		expect(result.renderedPlan).not.toContain(
			"What is the current state of the topic?",
		);
		expect(result.renderedPlan).not.toContain("Executive summary");
		expect(result.renderedPlan).not.toContain("Cited Research Report");
	});

	it("rejects a structured plan that exceeds the selected depth budget", async () => {
		const repository = {
			saveResearchPlanDraft: vi.fn(),
		};
		const structuredPlanner = {
			draftPlan: vi.fn(async () => ({
				goal: "Map the tradeoffs of open-source vector databases.",
				depth: "focused",
				researchBudget: {
					sourceReviewCeiling: 40,
					synthesisPassCeiling: 1,
				},
				keyQuestions: ["Which databases should be compared?"],
				sourceScope: {
					includePublicWeb: true,
					planningContextDisclosure: null,
				},
				reportShape: ["Executive summary"],
				constraints: [],
				deliverables: ["Cited Research Report"],
			})),
		};

		await expect(
			createFirstResearchPlanDraft(
				{
					jobId: "job-4",
					userRequest: "Map the tradeoffs of open-source vector databases.",
					selectedDepth: "focused",
					researchLanguage: "en",
				},
				{ repository, structuredPlanner },
			),
		).rejects.toThrow(
			"Research Plan exceeds Focused Deep Research budget: source review ceiling 40 is above 12.",
		);
		expect(repository.saveResearchPlanDraft).not.toHaveBeenCalled();
	});
});
