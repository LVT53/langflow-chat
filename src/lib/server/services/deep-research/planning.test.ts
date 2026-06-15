import { describe, expect, it, vi } from "vitest";
import { createFirstResearchPlanDraft, type ResearchPlan } from "./planning";

describe("createFirstResearchPlanDraft", () => {
	it("plans abstract architecture recommendations as candidate discovery instead of fake entity comparison", async () => {
		const result = await createFirstResearchPlanDraft({
			jobId: "job-architecture-recommendation-baseline",
			userRequest:
				"What is the most reliable architecture for building an enterprise deep research assistant in 2026 that can search the web, inspect uploaded documents, cite evidence, and produce long-form reports without fabricating claims? Compare at least three architecture patterns, identify failure modes, recommend one design for a 50-person SaaS company, and include an implementation roadmap.",
			selectedDepth: "standard",
			researchLanguage: "en",
		});
		const questions = result.plan.keyQuestions.join("\n").toLowerCase();

		expect(result.plan.reportIntent).toBe("recommendation");
		expect(result.plan.comparedEntities).toBeUndefined();
		expect(result.plan.planNormalizationNote).toContain(
			"Candidate architecture patterns will be discovered during research",
		);
		expect(result.renderedPlan).toContain("Plan Normalization Note:");
		expect(result.renderedPlan).toContain(
			"Candidate architecture patterns will be discovered during research",
		);
		expect(questions).toContain("architecture patterns");
		expect(questions).toContain("failure modes");
		expect(questions).toContain("evidence");
		expect(questions).toContain("citation");
		expect(questions).toContain("uploaded documents");
		expect(questions).toContain("security");
		expect(questions).toContain("compliance");
		expect(questions).toContain("implementation burden");
		expect(questions).toContain("roadmap");
		expect(questions).not.toMatch(
			/trim differences|dealer listings|manufacturers|rider use cases|model years/,
		);
	});

	it("localizes abstract architecture Plan Normalization Note in Hungarian plans", async () => {
		const result = await createFirstResearchPlanDraft({
			jobId: "job-architecture-recommendation-hu",
			userRequest:
				"Melyik a legmegbízhatóbb architektúra egy vállalati mély kutatási asszisztenshez, amely weben keres, feltöltött dokumentumokat vizsgál, bizonyítékot idéz és hosszú jelentéseket készít kitalált állítások nélkül? Hasonlíts össze legalább három architektúramintát, azonosíts hibamódokat, ajánlj egy megoldást egy 50 fős SaaS cégnek, és adj bevezetési roadmapet.",
			selectedDepth: "standard",
			researchLanguage: "hu",
		});

		expect(result.plan.reportIntent).toBe("recommendation");
		expect(result.plan.comparedEntities).toBeUndefined();
		expect(result.renderedPlan).toContain("Tervnormalizálási megjegyzés:");
		expect(result.plan.planNormalizationNote).toContain(
			"A jelölt architektúramintákat a kutatás során kell feltárni",
		);
		expect(result.plan.planNormalizationNote).not.toContain(
			"Candidate architecture patterns",
		);
	});

	it("preserves strict comparison shape for explicitly named architecture approaches", async () => {
		const result = await createFirstResearchPlanDraft({
			jobId: "job-named-architecture-approaches",
			userRequest:
				"Compare RAG, workflow graphs, and multi-agent research systems for reliability, evidence handling, and operational complexity.",
			selectedDepth: "standard",
			researchLanguage: "en",
		});
		const questions = result.plan.keyQuestions.join("\n").toLowerCase();

		expect(result.plan.reportIntent).toBe("comparison");
		expect(result.plan.comparedEntities).toEqual([
			"RAG",
			"workflow graphs",
			"multi-agent research systems",
		]);
		expect(result.plan.comparisonAxes).toEqual([
			"reliability",
			"evidence handling",
			"operational complexity",
		]);
		expect(result.plan.planNormalizationNote).toBeUndefined();
		expect(questions).not.toMatch(
			/trim differences|dealer listings|manufacturer pages|rider or buyer use cases|model years/,
		);
	});

	it("sanitizes structured planner fake entities for abstract architecture recommendations", async () => {
		const result = await createFirstResearchPlanDraft(
			{
				jobId: "job-architecture-structured-sanitization",
				userRequest:
					"What is the most reliable architecture for building an enterprise deep research assistant in 2026 that can search the web, inspect uploaded documents, cite evidence, and produce long-form reports without fabricating claims? Compare at least three architecture patterns, identify failure modes, recommend one design for a 50-person SaaS company, and include an implementation roadmap.",
				selectedDepth: "standard",
				researchLanguage: "en",
			},
			{
				structuredPlanner: {
					draftPlan: vi.fn(
						async (_, context): Promise<ResearchPlan | null> => ({
							goal: "Compare at least three architecture patterns and recommend one design.",
							depth: "standard",
							researchLanguage: "en",
							reportIntent: "comparison",
							comparedEntities: [
								"at least three architecture patterns",
								"identify failure modes",
								"recommend one design",
							],
							comparisonAxes: ["reliability"],
							researchBudget: context.selectedBudget,
							keyQuestions: [
								"Which exact variants, trim differences, model years, dealer listings, and rider use cases matter?",
							],
							sourceScope: {
								includePublicWeb: true,
								planningContextDisclosure: null,
							},
							reportShape: ["Executive summary"],
							constraints: [],
							deliverables: ["Cited Research Report"],
						}),
					),
				},
			},
		);
		const questions = result.plan.keyQuestions.join("\n").toLowerCase();

		expect(result.plan.reportIntent).toBe("recommendation");
		expect(result.plan.comparedEntities).toBeUndefined();
		expect(result.plan.comparisonAxes).toBeUndefined();
		expect(result.plan.planNormalizationNote).toContain(
			"Candidate architecture patterns will be discovered during research",
		);
		expect(questions).toContain("candidate architecture patterns");
		expect(questions).toContain("uploaded documents");
		expect(questions).toContain("roadmap");
		expect(questions).not.toMatch(
			/trim differences|dealer listings|rider use cases|model years/,
		);
		expect(result.renderedPlan).not.toContain(
			"- at least three architecture patterns",
		);
	});

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
					draftPlan: vi.fn(
						async (_, context): Promise<ResearchPlan | null> => ({
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
						}),
					),
				},
			},
		);

		expect(result.plan.keyQuestions).not.toEqual(["string"]);
		expect(result.plan.keyQuestions.length).toBeGreaterThan(1);
		expect(result.plan.reportShape).not.toEqual(["string"]);
		expect(result.plan.deliverables).not.toEqual(["string"]);
		expect(result.plan.constraints).toEqual([]);
		expect(result.plan.comparedEntities).toEqual(["GitHub Copilot", "Cursor"]);
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

	it("keeps Cube comparison entities product-only while treating size, region, year, and spec terms as axes or constraints", async () => {
		const result = await createFirstResearchPlanDraft({
			jobId: "job-cube-entity-axis-cleanup",
			userRequest:
				"Compare Cube Nulane 400X and Kathmando SLX, focusing on 2026 model year, pricing, availability in Europe, Medium frame size, specs, weight, motor/battery, drivetrain, brakes, geometry, and accessories.",
			selectedDepth: "standard",
			researchLanguage: "en",
		});

		expect(result.plan.reportIntent).toBe("comparison");
		expect(result.plan.comparedEntities).toEqual([
			"Cube Nulane 400X",
			"Cube Kathmandu SLX",
		]);
		expect(result.plan.comparedEntities?.join("\n").toLowerCase()).not.toMatch(
			/focusing|pricing|availability|europe|medium frame size|model year|specs|weight|motor|battery|drivetrain|brakes|geometry|accessories/,
		);
		expect(result.plan.comparisonAxes).toEqual(
			expect.arrayContaining([
				"pricing",
				"availability Europe",
				"medium frame size",
				"specs",
				"weight",
				"motor/battery",
				"drivetrain",
				"brakes",
				"geometry",
				"accessories",
			]),
		);
	});

	it("repairs polluted structured Cube comparison metadata before rendering the plan", async () => {
		const result = await createFirstResearchPlanDraft(
			{
				jobId: "job-cube-structured-cleanup",
				userRequest:
					"Compare Cube Nulane 400X and Kathmando SLX, focusing on pricing, availability in Europe, and Medium frame size.",
				selectedDepth: "standard",
				researchLanguage: "en",
			},
			{
				structuredPlanner: {
					draftPlan: vi.fn(
						async (_, context): Promise<ResearchPlan | null> => ({
							goal: "Compare Cube Nulane 400X and Kathmando SLX, focusing on pricing, availability in Europe, and Medium frame size.",
							depth: "standard",
							researchLanguage: "en",
							reportIntent: "comparison",
							comparedEntities: [
								"Cube Nulane 400X",
								"Kathmando SLX",
								"focusing",
								"pricing",
								"availability",
								"Europe",
								"Medium frame size",
							],
							comparisonAxes: ["pricing"],
							researchBudget: context.selectedBudget,
							keyQuestions: ["How do the models compare?"],
							sourceScope: {
								includePublicWeb: true,
								planningContextDisclosure: null,
							},
							reportShape: ["Executive summary"],
							constraints: [],
							deliverables: ["Cited Research Report"],
						}),
					),
				},
			},
		);

		expect(result.plan.comparedEntities).toEqual([
			"Cube Nulane 400X",
			"Cube Kathmandu SLX",
		]);
		expect(result.renderedPlan).not.toContain("- focusing");
		expect(result.renderedPlan).not.toContain("- Europe");
		expect(result.plan.comparisonAxes).toEqual(
			expect.arrayContaining(["pricing", "availability", "Medium frame size"]),
		);
	});

	it("repairs polluted structured software comparison metadata without bike-specific assumptions", async () => {
		const result = await createFirstResearchPlanDraft(
			{
				jobId: "job-saas-structured-cleanup",
				userRequest:
					"Compare Acme Analytics Pro and Acme Analytics Enterprise, focusing on pricing, SOC 2, data residency, SSO, audit logs, retention, and API limits.",
				selectedDepth: "standard",
				researchLanguage: "en",
			},
			{
				structuredPlanner: {
					draftPlan: vi.fn(
						async (_, context): Promise<ResearchPlan | null> => ({
							goal: "Compare Acme Analytics Pro and Acme Analytics Enterprise, focusing on pricing, SOC 2, data residency, SSO, audit logs, retention, and API limits.",
							depth: "standard",
							researchLanguage: "en",
							reportIntent: "comparison",
							comparedEntities: [
								"Acme Analytics Pro",
								"Acme Analytics Enterprise",
								"focusing",
								"pricing",
								"SOC 2",
								"data residency",
								"SSO",
								"audit logs",
								"retention",
								"API limits",
							],
							comparisonAxes: ["pricing"],
							researchBudget: context.selectedBudget,
							keyQuestions: ["How do the Acme Analytics tiers compare?"],
							sourceScope: {
								includePublicWeb: true,
								planningContextDisclosure: null,
							},
							reportShape: ["Executive summary"],
							constraints: [],
							deliverables: ["Cited Research Report"],
						}),
					),
				},
			},
		);

		expect(result.plan.comparedEntities).toEqual([
			"Acme Analytics Pro",
			"Acme Analytics Enterprise",
		]);
		expect(result.plan.comparedEntities?.join("\n").toLowerCase()).not.toMatch(
			/focusing|pricing|soc 2|data residency|sso|audit logs|retention|api limits/,
		);
		expect(result.plan.comparisonAxes).toEqual(
			expect.arrayContaining([
				"pricing",
				"SOC 2",
				"data residency",
				"SSO",
				"audit logs",
				"retention",
				"API limits",
			]),
		);
	});

	it("recovers product entities from long polluted comparison metadata without product-domain assumptions", async () => {
		const result = await createFirstResearchPlanDraft(
			{
				jobId: "job-saas-long-structured-cleanup",
				userRequest:
					"Compare Acme Analytics Pro and Acme Analytics Enterprise for European customers. Pay attention to pricing, SOC 2, data residency, SSO, audit logs, retention, and API limits.",
				selectedDepth: "standard",
				researchLanguage: "en",
			},
			{
				structuredPlanner: {
					draftPlan: vi.fn(
						async (_, context): Promise<ResearchPlan | null> => ({
							goal: "Compare Acme Analytics Pro and Acme Analytics Enterprise for European customers. Pay attention to pricing, SOC 2, data residency, SSO, audit logs, retention, and API limits.",
							depth: "standard",
							researchLanguage: "en",
							reportIntent: "comparison",
							comparedEntities: [
								"Acme Analytics Pro",
								"Acme Analytics Enterprise for European customers. Pay attention to pricing",
								"SOC 2 and data residency",
								"SSO",
								"audit logs",
							],
							comparisonAxes: ["pricing"],
							researchBudget: context.selectedBudget,
							keyQuestions: ["How do the Acme Analytics tiers compare?"],
							sourceScope: {
								includePublicWeb: true,
								planningContextDisclosure: null,
							},
							reportShape: ["Executive summary"],
							constraints: [],
							deliverables: ["Cited Research Report"],
						}),
					),
				},
			},
		);

		expect(result.plan.comparedEntities).toEqual([
			"Acme Analytics Pro",
			"Acme Analytics Enterprise",
		]);
		expect(result.plan.comparedEntities?.join("\n").toLowerCase()).not.toMatch(
			/pricing|soc 2|data residency|sso|audit logs|customers/,
		);
		expect(result.plan.comparisonAxes).toEqual(
			expect.arrayContaining([
				"pricing",
				"SOC 2",
				"data residency",
				"SSO",
				"audit logs",
				"retention",
				"API limits",
			]),
		);
	});

	it("repairs the Nulane and Kathmandu memo entity pollution into products plus axes", async () => {
		const result = await createFirstResearchPlanDraft(
			{
				jobId: "job-cube-memo-entity-pollution",
				userRequest:
					"Compare Nulane 400X and Kathmandu Cube 2025 edition bicycles in Europe markets. Pay attention to pricing, and availability in Medium frame sizes.",
				selectedDepth: "standard",
				researchLanguage: "en",
			},
			{
				structuredPlanner: {
					draftPlan: vi.fn(
						async (_, context): Promise<ResearchPlan | null> => ({
							goal: "Compare Nulane 400X and Kathmandu Cube 2025 edition bicycles in Europe markets. Pay attention to pricing, and availability in Medium frame sizes.",
							depth: "standard",
							researchLanguage: "en",
							reportIntent: "comparison",
							comparedEntities: [
								"Nulane 400X",
								"Kathmandu Cube 2025 edition bicycles in Europe markets. Pay attention to pricing",
								"availability in Medium frame sizes",
							],
							comparisonAxes: ["pricing"],
							researchBudget: context.selectedBudget,
							keyQuestions: ["How do the models compare?"],
							sourceScope: {
								includePublicWeb: true,
								planningContextDisclosure: null,
							},
							reportShape: ["Executive summary"],
							constraints: [],
							deliverables: ["Cited Research Report"],
						}),
					),
				},
			},
		);

		expect(result.plan.comparedEntities).toEqual([
			"Cube Nulane 400X",
			"Cube Kathmandu",
		]);
		expect(result.plan.comparedEntities?.join("\n").toLowerCase()).not.toMatch(
			/pricing|availability|medium frame|europe|2025 edition|bicycles/,
		);
		expect(result.plan.comparisonAxes).toEqual(
			expect.arrayContaining(["pricing", "availability in Medium frame sizes"]),
		);
	});

	it("drafts concrete fallback questions for the main non-comparison report intents", async () => {
		const cases = [
			{
				jobId: "job-recommendation",
				userRequest:
					"Recommend the best private AI coding assistant for a small software team.",
				reportIntent: "recommendation",
				expectedFragments: [
					"decision should the report support",
					"shortlist",
					"disqualifiers",
				],
			},
			{
				jobId: "job-market",
				userRequest: "Map the 2026 market landscape for home battery storage.",
				reportIntent: "market_scan",
				expectedFragments: ["market boundaries", "leading players", "trends"],
			},
			{
				jobId: "job-product",
				userRequest:
					"Research private AI coding assistant products for enterprise use.",
				reportIntent: "product_scan",
				expectedFragments: [
					"products, versions, tiers",
					"official capabilities",
					"independent tests",
				],
			},
			{
				jobId: "job-limitation",
				userRequest:
					"Research the risks and limitations of geothermal drilling in dense cities.",
				reportIntent: "limitation_focused",
				expectedFragments: [
					"risk and limitation checking",
					"failure modes",
					"mitigations",
				],
			},
			{
				jobId: "job-investigation",
				userRequest:
					"Investigate why European heat pump adoption slowed in 2025.",
				reportIntent: "investigation",
				expectedFragments: [
					"exact claim, event, problem",
					"key actors",
					"credible sources disagree",
				],
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
			expect(questions).not.toContain(
				"current evidence and context for this topic",
			);
		}
	});

	it("routes evidence strength and consensus review requests to the limitation-focused report shape", async () => {
		const result = await createFirstResearchPlanDraft({
			jobId: "job-evidence-review",
			userRequest:
				"Review the evidence strength, consensus, conflict, and unresolved contradictions in the research on GLP-1 weight loss drugs.",
			selectedDepth: "standard",
			researchLanguage: "en",
		});

		expect(result.plan.reportIntent).toBe("limitation_focused");
		expect(result.renderedPlan).toContain("Report intent: Limitation-focused");
		expect(result.plan.keyQuestions.join("\n")).toContain("expert consensus");
	});

	it("recognizes evidence-review vocabulary as limitation-focused research requests", async () => {
		const cases = [
			"Do an evidence review of remote work productivity studies.",
			"Assess the disagreement between sources on school phone bans.",
			"Evaluate the evidence support for blue light glasses claims.",
			"Analyze contradiction between clinical trial findings on vitamin D.",
			"Review unresolved conflicts in the literature on carbon capture.",
		];

		for (const [index, userRequest] of cases.entries()) {
			const result = await createFirstResearchPlanDraft({
				jobId: `job-evidence-vocabulary-${index}`,
				userRequest,
				selectedDepth: "focused",
				researchLanguage: "en",
			});

			expect(result.plan.reportIntent).toBe("limitation_focused");
		}
	});

	it("keeps higher-priority report intents ahead of evidence-review language", async () => {
		const cases = [
			{
				userRequest:
					"Compare the evidence strength for GitHub Copilot and Cursor on code review quality.",
				reportIntent: "comparison",
			},
			{
				userRequest:
					"Recommend the best option based on evidence strength and unresolved conflicts.",
				reportIntent: "recommendation",
			},
			{
				userRequest:
					"Map the market consensus and conflicting evidence for home battery storage.",
				reportIntent: "market_scan",
			},
			{
				userRequest:
					"Review the evidence support for private AI assistant products.",
				reportIntent: "product_scan",
			},
		] as const;

		for (const [index, item] of cases.entries()) {
			const result = await createFirstResearchPlanDraft({
				jobId: `job-evidence-precedence-${index}`,
				userRequest: item.userRequest,
				selectedDepth: "focused",
				researchLanguage: "en",
			});

			expect(result.plan.reportIntent).toBe(item.reportIntent);
		}
	});

	it("adds domain-specific checks on top of broad intent templates", async () => {
		const cases = [
			{
				jobId: "job-law",
				userRequest:
					"Research GDPR compliance risks for using customer data in AI training.",
				expectedFragments: [
					"jurisdictions",
					"current legal authorities",
					"compliance risk",
				],
			},
			{
				jobId: "job-procurement",
				userRequest:
					"Recommend private AI coding assistant software for enterprise procurement.",
				expectedFragments: [
					"stakeholder criteria",
					"data-handling terms",
					"vendor lock-in",
				],
			},
			{
				jobId: "job-technical",
				userRequest:
					"Investigate SQLite to Postgres migration performance and reliability risks.",
				expectedFragments: [
					"versions, architectures, APIs",
					"operating limits",
					"observability",
				],
			},
			{
				jobId: "job-health",
				userRequest:
					"Research current clinical guidance and risks for GLP-1 weight loss drugs.",
				expectedFragments: [
					"clinical guidelines",
					"contraindications",
					"adverse effects",
				],
			},
			{
				jobId: "job-finance",
				userRequest:
					"Recommend a bond ETF strategy for a taxable portfolio in 2026.",
				expectedFragments: [
					"financial products",
					"fees, taxes",
					"downside risks",
				],
			},
			{
				jobId: "job-academic",
				userRequest:
					"Write an academic literature review of retrieval augmented generation evaluation studies.",
				expectedFragments: [
					"databases, search terms",
					"study quality",
					"bias risk",
				],
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
		expect(max.renderedPlan).toContain(
			"Source processing concurrency: up to 24",
		);
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
		expect(result.renderedPlan).toContain(
			"Jelentési szándék: Termékáttekintés",
		);
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
			draftPlan: vi.fn(
				async (): Promise<ResearchPlan | null> => ({
					goal: "Map the tradeoffs of open-source vector databases.",
					depth: "focused",
					reportIntent: "comparison",
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
				}),
			),
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
			reportIntent: "comparison" as const,
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
						draftPlan: vi.fn(
							async (): Promise<ResearchPlan | null> => ({
								...basePlan,
								researchBudget: {
									...basePlan.researchBudget,
									meaningfulPassFloor: 1,
								},
							}),
						),
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
						draftPlan: vi.fn(
							async (): Promise<ResearchPlan | null> => ({
								...basePlan,
								researchBudget: {
									...basePlan.researchBudget,
									sourceProcessingConcurrency: 7,
								},
							}),
						),
					},
				},
			),
		).rejects.toThrow(
			"Research Plan exceeds Focused Deep Research budget: source processing concurrency 7 is above 6.",
		);
		expect(repository.saveResearchPlanDraft).not.toHaveBeenCalled();
	});
});
