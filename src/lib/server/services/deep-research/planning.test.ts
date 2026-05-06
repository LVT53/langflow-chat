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

	it("filters schema placeholder strings from structured plan drafts", async () => {
		const result = await createFirstResearchPlanDraft(
			{
				jobId: "job-schema-placeholders",
				userRequest:
					"Compare GitHub Copilot and Cursor for privacy and pricing.",
				selectedDepth: "focused",
				researchLanguage: "en",
			},
			{
				structuredPlanner: {
					draftPlan: vi.fn(async (_, context) => ({
						goal: "Compare GitHub Copilot and Cursor for privacy and pricing.",
						depth: "focused",
						researchLanguage: "en",
						reportIntent: "comparison",
						comparedEntities: ["string"],
						comparisonAxes: ["string"],
						researchBudget: context.selectedBudget,
						keyQuestions: ["string"],
						sourceScope: {
							includePublicWeb: true,
							planningContextDisclosure: null,
						},
						reportShape: ["string"],
						constraints: ["string"],
						deliverables: ["string"],
					})),
				},
			},
		);

		expect(result.plan.keyQuestions).not.toEqual(["string"]);
		expect(result.plan.keyQuestions.length).toBeGreaterThan(1);
		expect(result.plan.reportShape).not.toEqual(["string"]);
		expect(result.plan.deliverables).not.toEqual(["string"]);
		expect(result.plan.constraints).toEqual([]);
		expect(result.plan.comparedEntities).toEqual([
			"GitHub Copilot",
			"Cursor",
		]);
		expect(result.plan.comparisonAxes).toEqual(["privacy", "pricing"]);
		expect(result.renderedPlan).not.toContain("- string");
	});

	it("drafts concrete fallback questions for product model comparisons", async () => {
		const result = await createFirstResearchPlanDraft({
			jobId: "job-cube-bikes",
			userRequest:
				"Compare the Nulane and Kathmando bikes from Cube. Specifically their 2025-26 editions?",
			selectedDepth: "standard",
			researchLanguage: "en",
		});

		expect(result.plan.comparedEntities).toEqual([
			"Cube Nulane",
			"Cube Kathmandu",
		]);
		expect(result.plan.keyQuestions.join("\n")).toContain("2025-2026");
		expect(result.plan.keyQuestions.join("\n")).toContain("official specs");
		expect(result.plan.keyQuestions.join("\n")).toContain("prices");
		expect(result.plan.keyQuestions.join("\n")).toContain("frame and geometry");
		expect(result.plan.keyQuestions.join("\n")).toContain(
			"manufacturer pages, manuals, dealer listings, and independent reviews",
		);
		expect(result.plan.keyQuestions.join("\n")).not.toContain(
			"current evidence and context for this topic",
		);
	});

	it("drafts concrete fallback questions for the main non-comparison report intents", async () => {
		const cases = [
			{
				jobId: "job-recommendation",
				userRequest: "Recommend the best private AI coding assistant for a small software team.",
				reportIntent: "recommendation",
				expectedFragments: ["decision should the report support", "shortlist", "disqualifiers"],
			},
			{
				jobId: "job-market",
				userRequest: "Map the 2026 market landscape for home battery storage.",
				reportIntent: "market_scan",
				expectedFragments: ["market boundaries", "leading players", "trends"],
			},
			{
				jobId: "job-product",
				userRequest: "Research private AI coding assistant products for enterprise use.",
				reportIntent: "product_scan",
				expectedFragments: ["products, versions, tiers", "official capabilities", "independent tests"],
			},
			{
				jobId: "job-limitation",
				userRequest: "Research the risks and limitations of geothermal drilling in dense cities.",
				reportIntent: "limitation_focused",
				expectedFragments: ["risk and limitation checking", "failure modes", "mitigations"],
			},
			{
				jobId: "job-investigation",
				userRequest: "Investigate why European heat pump adoption slowed in 2025.",
				reportIntent: "investigation",
				expectedFragments: ["exact claim, event, problem", "key actors", "credible sources disagree"],
			},
		] as const;

		for (const item of cases) {
			const result = await createFirstResearchPlanDraft({
				jobId: item.jobId,
				userRequest: item.userRequest,
				selectedDepth: "standard",
				researchLanguage: "en",
			});
			const questions = result.plan.keyQuestions.join("\n");

			expect(result.plan.reportIntent).toBe(item.reportIntent);
			for (const fragment of item.expectedFragments) {
				expect(questions).toContain(fragment);
			}
			expect(questions).not.toContain("current evidence and context for this topic");
		}
	});

	it("adds domain-specific checks on top of broad intent templates", async () => {
		const cases = [
			{
				jobId: "job-law",
				userRequest:
					"Research GDPR compliance risks for using customer data in AI training.",
				expectedFragments: ["jurisdictions", "current legal authorities", "compliance risk"],
			},
			{
				jobId: "job-procurement",
				userRequest:
					"Recommend private AI coding assistant software for enterprise procurement.",
				expectedFragments: ["stakeholder criteria", "data-handling terms", "vendor lock-in"],
			},
			{
				jobId: "job-technical",
				userRequest:
					"Investigate SQLite to Postgres migration performance and reliability risks.",
				expectedFragments: ["versions, architectures, APIs", "operating limits", "observability"],
			},
			{
				jobId: "job-health",
				userRequest:
					"Research current clinical guidance and risks for GLP-1 weight loss drugs.",
				expectedFragments: ["clinical guidelines", "contraindications", "adverse effects"],
			},
			{
				jobId: "job-finance",
				userRequest:
					"Recommend a bond ETF strategy for a taxable portfolio in 2026.",
				expectedFragments: ["financial products", "fees, taxes", "downside risks"],
			},
			{
				jobId: "job-academic",
				userRequest:
					"Write an academic literature review of retrieval augmented generation evaluation studies.",
				expectedFragments: ["databases, search terms", "study quality", "bias risk"],
			},
		] as const;

		for (const item of cases) {
			const result = await createFirstResearchPlanDraft({
				jobId: item.jobId,
				userRequest: item.userRequest,
				selectedDepth: "standard",
				researchLanguage: "en",
			});
			const questions = result.plan.keyQuestions.join("\n");

			expect(result.plan.keyQuestions.length).toBeLessThanOrEqual(8);
			for (const fragment of item.expectedFragments) {
				expect(questions).toContain(fragment);
			}
		}
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
			expectedTimeBand:
				"Long high-depth run; duration depends on source availability and repair needs.",
			sourceReviewCeiling: 200,
			relativeCostWarning:
				"Highest relative cost; use for broad or high-stakes investigations.",
			passBudget: "5-8 meaningful research passes",
			repairPassBudget: "up to 3 repair passes",
		});
		expect(result.renderedPlan).toContain(
			"Expected time: Long high-depth run; duration depends on source availability and repair needs.",
		);
		expect(result.renderedPlan).toContain("Source review ceiling: up to 200");
	});

	it("uses the raised depth budget defaults in the Research Plan and effort estimate", async () => {
		const focused = await createFirstResearchPlanDraft({
			jobId: "job-budget-focused",
			userRequest: "Research EV home charger safety considerations.",
			selectedDepth: "focused",
			researchLanguage: "en",
		});
		const standard = await createFirstResearchPlanDraft({
			jobId: "job-budget-standard",
			userRequest: "Research EV home charger market tradeoffs.",
			selectedDepth: "standard",
			researchLanguage: "en",
		});
		const max = await createFirstResearchPlanDraft({
			jobId: "job-budget-max",
			userRequest: "Research EV home charger regulation and market tradeoffs.",
			selectedDepth: "max",
			researchLanguage: "en",
		});

		expect(focused.plan.researchBudget).toEqual({
			sourceReviewCeiling: 24,
			synthesisPassCeiling: 3,
			meaningfulPassFloor: 2,
			meaningfulPassCeiling: 3,
			repairPassCeiling: 1,
			sourceProcessingConcurrency: 6,
			modelReasoningConcurrency: 2,
		});
		expect(standard.plan.researchBudget).toEqual({
			sourceReviewCeiling: 75,
			synthesisPassCeiling: 5,
			meaningfulPassFloor: 3,
			meaningfulPassCeiling: 5,
			repairPassCeiling: 2,
			sourceProcessingConcurrency: 12,
			modelReasoningConcurrency: 4,
		});
		expect(max.plan.researchBudget).toEqual({
			sourceReviewCeiling: 200,
			synthesisPassCeiling: 8,
			meaningfulPassFloor: 5,
			meaningfulPassCeiling: 8,
			repairPassCeiling: 3,
			sourceProcessingConcurrency: 24,
			modelReasoningConcurrency: 8,
		});
		expect(max.effortEstimate).toMatchObject({
			selectedDepth: "max",
			sourceReviewCeiling: 200,
			passBudget: "5-8 meaningful research passes",
			repairPassBudget: "up to 3 repair passes",
		});
		expect(max.renderedPlan).toContain(
			"Pass budget: 5-8 meaningful research passes",
		);
		expect(max.renderedPlan).toContain("Repair pass budget: up to 3");
		expect(max.renderedPlan).toContain("Source processing concurrency: up to 24");
		expect(max.renderedPlan).toContain("Model reasoning concurrency: up to 8");
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
		expect(result.renderedPlan).toContain(
			"Várható idő: Rövid, többkörös futás; az időtartam a források elérhetőségétől függ.",
		);
		expect(result.renderedPlan).toContain(
			"Forrás-áttekintési plafon: legfeljebb 24",
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

		expect(result.plan.keyQuestions.join("\n")).toContain(
			"Mely termékek, verziók, csomagok, szállítók vagy integrációk tartoznak pontosan a kutatásba",
		);
		expect(result.plan.keyQuestions.join("\n")).toContain(
			"Milyen hivatalos képességek, árak, korlátok",
		);
		expect(result.plan.keyQuestions.join("\n")).not.toContain(
			"Mi a legfontosabb jelenlegi háttér",
		);
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
					synthesisPassCeiling: 3,
					meaningfulPassFloor: 2,
					meaningfulPassCeiling: 3,
					repairPassCeiling: 1,
					sourceProcessingConcurrency: 6,
					modelReasoningConcurrency: 2,
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
			"Research Plan exceeds Focused Deep Research budget: source review ceiling 40 is above 24.",
		);
		expect(repository.saveResearchPlanDraft).not.toHaveBeenCalled();
	});

	it("rejects a structured plan below the depth pass floor or above concurrency defaults", async () => {
		const repository = {
			saveResearchPlanDraft: vi.fn(),
		};
		const basePlan = {
			goal: "Map the tradeoffs of open-source vector databases.",
			depth: "focused" as const,
			researchBudget: {
				sourceReviewCeiling: 24,
				synthesisPassCeiling: 3,
				meaningfulPassFloor: 2,
				meaningfulPassCeiling: 3,
				repairPassCeiling: 1,
				sourceProcessingConcurrency: 6,
				modelReasoningConcurrency: 2,
			},
			keyQuestions: ["Which databases should be compared?"],
			sourceScope: {
				includePublicWeb: true,
				planningContextDisclosure: null,
			},
			reportShape: ["Executive summary"],
			constraints: [],
			deliverables: ["Cited Research Report"],
		};

		await expect(
			createFirstResearchPlanDraft(
				{
					jobId: "job-pass-floor",
					userRequest: "Map the tradeoffs of open-source vector databases.",
					selectedDepth: "focused",
					researchLanguage: "en",
				},
				{
					repository,
					structuredPlanner: {
						draftPlan: vi.fn(async () => ({
							...basePlan,
							researchBudget: {
								...basePlan.researchBudget,
								meaningfulPassFloor: 1,
							},
						})),
					},
				},
			),
		).rejects.toThrow(
			"Research Plan is below Focused Deep Research minimum pass expectation: meaningful pass floor 1 is below 2.",
		);

		await expect(
			createFirstResearchPlanDraft(
				{
					jobId: "job-concurrency",
					userRequest: "Map the tradeoffs of open-source vector databases.",
					selectedDepth: "focused",
					researchLanguage: "en",
				},
				{
					repository,
					structuredPlanner: {
						draftPlan: vi.fn(async () => ({
							...basePlan,
							researchBudget: {
								...basePlan.researchBudget,
								sourceProcessingConcurrency: 7,
							},
						})),
					},
				},
			),
		).rejects.toThrow(
			"Research Plan exceeds Focused Deep Research budget: source processing concurrency 7 is above 6.",
		);
		expect(repository.saveResearchPlanDraft).not.toHaveBeenCalled();
	});
});
