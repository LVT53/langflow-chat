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
			sourceScope: expect.objectContaining({
				includePublicWeb: true,
			}),
		});
		expect(result.plan.keyQuestions.length).toBeGreaterThanOrEqual(3);
		expect(result.renderedPlan).toContain("Research Plan");
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

	it("includes a coarse Research Effort Estimate for the selected depth", async () => {
		const result = await createFirstResearchPlanDraft({
			jobId: "job-3",
			userRequest: "Map the tradeoffs of open-source vector databases.",
			selectedDepth: "max",
			researchLanguage: "en",
		});

		expect(result.effortEstimate).toEqual({
			selectedDepth: "max",
			expectedTimeBand: "2-4 hours",
			sourceReviewCeiling: 120,
			relativeCostWarning:
				"Highest relative cost; use for broad or high-stakes investigations.",
		});
		expect(result.renderedPlan).toContain("Expected time: 2-4 hours");
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

		expect(result.renderedPlan).toContain("# Kutatási terv");
		expect(result.renderedPlan).toContain("Mélység: Fókuszált mély kutatás");
		expect(result.renderedPlan).toContain("Várható idő: 10-20 perc");
		expect(result.renderedPlan).toContain(
			"Forrás-áttekintési plafon: legfeljebb 12",
		);
		expect(result.renderedPlan).toContain("Bevont források:");
		expect(result.renderedPlan).toContain("OpenAI Codex Pricing");
		expect(result.renderedPlan).not.toContain("OpenAI Codex Árazás");
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
