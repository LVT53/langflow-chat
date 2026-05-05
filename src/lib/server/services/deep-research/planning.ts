export type ResearchDepth = "focused" | "standard" | "max";

export type ResearchLanguage = "en" | "hu";

export type ReportIntent =
	| "comparison"
	| "recommendation"
	| "investigation"
	| "market_scan"
	| "product_scan"
	| "limitation_focused";

export type PlanningContextItem = {
	type: "conversation" | "knowledge" | "attachment" | "report";
	artifactId?: string;
	title?: string;
	summary: string;
	includeAsResearchSource?: boolean;
};

export type ResearchPlanIncludedSource = {
	type: "attached_file" | "knowledge_artifact";
	artifactId: string;
	title?: string;
	summary: string;
};

export type ResearchPlan = {
	goal: string;
	depth: ResearchDepth;
	researchLanguage?: ResearchLanguage;
	reportIntent: ReportIntent;
	researchBudget: ResearchBudget;
	keyQuestions: string[];
	sourceScope: {
		includePublicWeb: boolean;
		planningContextDisclosure: string | null;
		includedSources?: ResearchPlanIncludedSource[];
	};
	reportShape: string[];
	constraints: string[];
	deliverables: string[];
};

export type ResearchBudget = {
	sourceReviewCeiling: number;
	synthesisPassCeiling: number;
};

export type ResearchEffortEstimate = {
	selectedDepth: ResearchDepth;
	expectedTimeBand: string;
	sourceReviewCeiling: number;
	relativeCostWarning: string;
};

export type ResearchPlanDraftRecord = {
	jobId: string;
	version: number;
	status: "awaiting_approval";
	rawPlan: ResearchPlan;
	renderedPlan: string;
	contextDisclosure: string | null;
	effortEstimate: ResearchEffortEstimate;
};

export type ResearchPlanDraftResult = ResearchPlanDraftRecord & {
	savedAt?: string;
	plan: ResearchPlan;
};

export type ResearchPlanRepository = {
	saveResearchPlanDraft: (
		draft: ResearchPlanDraftRecord,
	) => Promise<ResearchPlanDraftRecord & Record<string, unknown>>;
};

export type CreateFirstResearchPlanDraftInput = {
	jobId: string;
	userRequest: string;
	selectedDepth: ResearchDepth;
	researchLanguage: ResearchLanguage;
	planningContext?: PlanningContextItem[];
};

export type CreateFirstResearchPlanDraftDependencies = {
	repository?: ResearchPlanRepository;
	structuredPlanner?: {
		draftPlan: (
			input: CreateFirstResearchPlanDraftInput,
			context: {
				selectedBudget: ResearchBudget;
				contextDisclosure: string | null;
			},
		) => Promise<ResearchPlan | null>;
	};
	sourceResearch?: {
		discoverSources: (...args: unknown[]) => Promise<unknown>;
	};
};

export type CreateRevisedResearchPlanDraftInput = {
	jobId: string;
	previousPlan: ResearchPlan;
	previousVersion: number;
	editInstruction: string;
	reportIntent?: ReportIntent;
	selectedDepth: ResearchDepth;
	researchLanguage: ResearchLanguage;
	contextDisclosure?: string | null;
};

const depthLabels: Record<ResearchDepth, string> = {
	focused: "Focused Deep Research",
	standard: "Standard Deep Research",
	max: "Max Deep Research",
};

const localizedDepthLabels: Record<
	ResearchLanguage,
	Record<ResearchDepth, string>
> = {
	en: depthLabels,
	hu: {
		focused: "Fókuszált mély kutatás",
		standard: "Standard mély kutatás",
		max: "Maximális mély kutatás",
	},
};

const planLabels: Record<
	ResearchLanguage,
	{
		depth: string;
		expectedTime: string;
		sourceReviewCeiling: (count: number) => string;
		goal: string;
		reportIntent: string;
		includedSources: string;
		keyQuestions: string;
		expectedReportShape: string;
		constraints: string;
		deliverables: string;
	}
> = {
	en: {
		depth: "Depth",
		expectedTime: "Expected time",
		sourceReviewCeiling: (count) => `Source review ceiling: up to ${count}`,
		goal: "Goal",
		reportIntent: "Report intent",
		includedSources: "Included sources",
		keyQuestions: "Key questions",
		expectedReportShape: "Expected report shape",
		constraints: "Constraints",
		deliverables: "Deliverables",
	},
	hu: {
		depth: "Mélység",
		expectedTime: "Várható idő",
		sourceReviewCeiling: (count) =>
			`Forrás-áttekintési plafon: legfeljebb ${count}`,
		goal: "Cél",
		reportIntent: "Jelentési szándék",
		includedSources: "Bevont források",
		keyQuestions: "Fő kérdések",
		expectedReportShape: "Várt jelentésszerkezet",
		constraints: "Korlátok",
		deliverables: "Eredménytermékek",
	},
};

const localizedDefaultPlanProse: Record<
	ResearchLanguage,
	{
		reportShape: string[];
		constraints: string[];
		deliverables: string[];
		planEditPrefix: string;
	}
> = {
	en: {
		reportShape: [
			"Executive summary",
			"Key findings",
			"Main comparison",
			"Source list",
			"Limitations",
		],
		constraints: [],
		deliverables: ["Cited Research Report"],
		planEditPrefix: "Plan edit",
	},
	hu: {
		reportShape: [
			"Vezetői összefoglaló",
			"Fő megállapítások",
			"Fő összehasonlítás",
			"Forráslista",
			"Korlátok",
		],
		constraints: [],
		deliverables: ["Hivatkozásokkal ellátott kutatási jelentés"],
		planEditPrefix: "Tervmódosítás",
	},
};

const localizedExpectedTimeBands: Record<
	ResearchLanguage,
	Record<ResearchDepth, string>
> = {
	en: {
		focused: "3-8 minutes",
		standard: "10-25 minutes",
		max: "45-120 minutes",
	},
	hu: {
		focused: "3-8 perc",
		standard: "10-25 perc",
		max: "45-120 perc",
	},
};

const localizedCostWarnings: Record<
	ResearchLanguage,
	Record<ResearchDepth, string>
> = {
	en: {
		focused:
			"Lowest relative cost; use for narrow questions that need a cited brief.",
		standard: "Moderate relative cost; use for serious multi-source synthesis.",
		max: "Highest relative cost; use for broad or high-stakes investigations.",
	},
	hu: {
		focused:
			"Legalacsonyabb relatív költség; szűk, hivatkozott összefoglalót igénylő kérdésekhez.",
		standard: "Közepes relatív költség; komoly, többforrású szintézishez.",
		max: "Legmagasabb relatív költség; széles vagy nagy tétű kutatáshoz.",
	},
};

const localizedReportIntentLabels: Record<
	ResearchLanguage,
	Record<ReportIntent, string>
> = {
	en: {
		comparison: "Comparison",
		recommendation: "Recommendation",
		investigation: "Investigation",
		market_scan: "Market scan",
		product_scan: "Product scan",
		limitation_focused: "Limitation-focused",
	},
	hu: {
		comparison: "Összehasonlítás",
		recommendation: "Ajánlás",
		investigation: "Vizsgálat",
		market_scan: "Piaci áttekintés",
		product_scan: "Termékáttekintés",
		limitation_focused: "Korlátokra fókuszáló",
	},
};

const depthBudgets: Record<ResearchDepth, ResearchBudget> = {
	focused: {
		sourceReviewCeiling: 12,
		synthesisPassCeiling: 1,
	},
	standard: {
		sourceReviewCeiling: 40,
		synthesisPassCeiling: 2,
	},
	max: {
		sourceReviewCeiling: 120,
		synthesisPassCeiling: 4,
	},
};

export async function createFirstResearchPlanDraft(
	input: CreateFirstResearchPlanDraftInput,
	dependencies: CreateFirstResearchPlanDraftDependencies = {},
): Promise<ResearchPlanDraftResult> {
	const contextDisclosure = buildContextDisclosure(
		input.planningContext ?? [],
		input.researchLanguage,
	);
	const researchBudget = depthBudgets[input.selectedDepth];
	const effortEstimate = buildEffortEstimate(
		input.selectedDepth,
		input.researchLanguage,
	);
	const structuredPlan = dependencies.structuredPlanner
		? await dependencies.structuredPlanner.draftPlan(input, {
				selectedBudget: researchBudget,
				contextDisclosure,
			})
		: null;
	const draftedPlan =
		structuredPlan ?? draftDefaultResearchPlan(input, researchBudget, contextDisclosure);
	const plan = {
		...draftedPlan,
		researchLanguage: input.researchLanguage,
		reportIntent: normalizeReportIntent(draftedPlan.reportIntent, input.userRequest),
	};
	validatePlanAgainstSelectedDepth(plan, input.selectedDepth);
	const renderedPlan = renderResearchPlan(plan);
	const draft: ResearchPlanDraftRecord = {
		jobId: input.jobId,
		version: 1,
		status: "awaiting_approval",
		rawPlan: plan,
		renderedPlan,
		contextDisclosure,
		effortEstimate,
	};
	const persisted = dependencies.repository
		? await dependencies.repository.saveResearchPlanDraft(draft)
		: draft;

	return {
		...persisted,
		status: "awaiting_approval",
		rawPlan: plan,
		renderedPlan,
		contextDisclosure,
		effortEstimate,
		plan,
	};
}

export async function createRevisedResearchPlanDraft(
	input: CreateRevisedResearchPlanDraftInput,
	dependencies: CreateFirstResearchPlanDraftDependencies = {},
): Promise<ResearchPlanDraftResult> {
	const researchBudget = depthBudgets[input.selectedDepth];
	const effortEstimate = buildEffortEstimate(
		input.selectedDepth,
		input.researchLanguage,
	);
	const structuredPlan = dependencies.structuredPlanner
		? await dependencies.structuredPlanner.draftPlan(
				{
					jobId: input.jobId,
					userRequest: input.previousPlan.goal,
					selectedDepth: input.selectedDepth,
					researchLanguage: input.researchLanguage,
				},
				{
					selectedBudget: researchBudget,
					contextDisclosure: input.contextDisclosure ?? null,
				},
			)
		: null;
	const draftedPlan = structuredPlan ?? reviseDefaultResearchPlan(input);
	const plan = {
		...draftedPlan,
		researchLanguage: input.researchLanguage,
		reportIntent: normalizeReportIntent(
			input.reportIntent ?? draftedPlan.reportIntent,
			`${input.previousPlan.goal} ${input.editInstruction}`,
		),
	};
	validatePlanAgainstSelectedDepth(plan, input.selectedDepth);
	const renderedPlan = renderResearchPlan(plan);
	const draft: ResearchPlanDraftRecord = {
		jobId: input.jobId,
		version: input.previousVersion + 1,
		status: "awaiting_approval",
		rawPlan: plan,
		renderedPlan,
		contextDisclosure: input.contextDisclosure ?? null,
		effortEstimate,
	};
	const persisted = dependencies.repository
		? await dependencies.repository.saveResearchPlanDraft(draft)
		: draft;

	return {
		...persisted,
		status: "awaiting_approval",
		rawPlan: plan,
		renderedPlan,
		contextDisclosure: input.contextDisclosure ?? null,
		effortEstimate,
		plan,
	};
}

function draftDefaultResearchPlan(
	input: CreateFirstResearchPlanDraftInput,
	researchBudget: ResearchBudget,
	contextDisclosure: string | null,
): ResearchPlan {
	const defaultProse = localizedDefaultPlanProse[input.researchLanguage];
	return {
		goal: input.userRequest,
		depth: input.selectedDepth,
		researchLanguage: input.researchLanguage,
		reportIntent: inferReportIntent(input.userRequest),
		researchBudget,
		keyQuestions: buildDefaultKeyQuestions(
			input.userRequest,
			input.researchLanguage,
		),
		sourceScope: {
			includePublicWeb: true,
			planningContextDisclosure: contextDisclosure,
			includedSources: buildDefaultIncludedSources(input.planningContext ?? []),
		},
		reportShape: defaultProse.reportShape,
		constraints: defaultProse.constraints,
		deliverables: defaultProse.deliverables,
	};
}

function reviseDefaultResearchPlan(
	input: CreateRevisedResearchPlanDraftInput,
): ResearchPlan {
	const editInstruction = input.editInstruction.trim();
	return {
		...input.previousPlan,
		depth: input.selectedDepth,
		reportIntent: input.reportIntent ?? input.previousPlan.reportIntent,
		researchBudget: depthBudgets[input.selectedDepth],
		sourceScope: {
			...input.previousPlan.sourceScope,
			planningContextDisclosure: input.contextDisclosure ?? null,
		},
		constraints: [
			...input.previousPlan.constraints,
			`${localizedDefaultPlanProse[input.researchLanguage].planEditPrefix}: ${editInstruction}`,
		],
	};
}

function validatePlanAgainstSelectedDepth(
	plan: ResearchPlan,
	selectedDepth: ResearchDepth,
): void {
	const selectedBudget = depthBudgets[selectedDepth];
	if (
		plan.researchBudget.sourceReviewCeiling > selectedBudget.sourceReviewCeiling
	) {
		throw new Error(
			`Research Plan exceeds ${depthLabels[selectedDepth]} budget: source review ceiling ${plan.researchBudget.sourceReviewCeiling} is above ${selectedBudget.sourceReviewCeiling}.`,
		);
	}
	if (
		plan.researchBudget.synthesisPassCeiling >
		selectedBudget.synthesisPassCeiling
	) {
		throw new Error(
			`Research Plan exceeds ${depthLabels[selectedDepth]} budget: synthesis pass ceiling ${plan.researchBudget.synthesisPassCeiling} is above ${selectedBudget.synthesisPassCeiling}.`,
		);
	}
}

function renderResearchPlan(plan: ResearchPlan): string {
	const researchLanguage = plan.researchLanguage ?? "en";
	const labels = planLabels[researchLanguage];
	const effortEstimate = buildEffortEstimate(plan.depth, researchLanguage);
	const visibleConstraints = plan.constraints.filter(
		(constraint) => !isInternalApprovalConstraint(constraint),
	);
	return [
		`${labels.goal}: ${plan.goal}`,
		`${labels.reportIntent}: ${localizedReportIntentLabels[researchLanguage][plan.reportIntent]}`,
		"",
		`${labels.depth}: ${localizedDepthLabels[researchLanguage][plan.depth]}`,
		`${labels.expectedTime}: ${effortEstimate.expectedTimeBand}`,
		labels.sourceReviewCeiling(effortEstimate.sourceReviewCeiling),
		...(plan.sourceScope.planningContextDisclosure
			? ["", plan.sourceScope.planningContextDisclosure]
			: []),
		...(plan.sourceScope.includedSources?.length
			? [
					"",
					`${labels.includedSources}:`,
					...plan.sourceScope.includedSources.map((source) =>
						source.title ? `- ${source.title}` : `- ${source.artifactId}`,
					),
				]
			: []),
		"",
		`${labels.keyQuestions}:`,
		...plan.keyQuestions.map((question) => `- ${question}`),
		"",
		`${labels.expectedReportShape}:`,
		...plan.reportShape.map((section) => `- ${section}`),
		...(visibleConstraints.length > 0
			? [
					"",
					`${labels.constraints}:`,
					...visibleConstraints.map((constraint) => `- ${constraint}`),
				]
			: []),
		...(researchLanguage === "hu"
			? [
					"",
					`${labels.deliverables}:`,
					...plan.deliverables.map((deliverable) => `- ${deliverable}`),
				]
			: []),
	].join("\n");
}

function normalizeReportIntent(
	value: unknown,
	fallbackText: string,
): ReportIntent {
	if (isReportIntent(value)) return value;
	return inferReportIntent(fallbackText);
}

function isReportIntent(value: unknown): value is ReportIntent {
	return (
		value === "comparison" ||
		value === "recommendation" ||
		value === "investigation" ||
		value === "market_scan" ||
		value === "product_scan" ||
		value === "limitation_focused"
	);
}

function inferReportIntent(value: string): ReportIntent {
	const text = value.toLowerCase();
	if (/\b(compare|comparison|versus|vs\.?|összehasonl|hasonlítsd)\b/u.test(text)) {
		return "comparison";
	}
	if (/\b(recommend|recommendation|choose|best|ajánl|válassz|legjobb)\b/u.test(text)) {
		return "recommendation";
	}
	if (/\b(market|landscape|trend|piac|piaci|trend)\b/u.test(text)) {
		return "market_scan";
	}
	if (
		/\b(product|tool|vendor|assistant)\b/u.test(text) ||
		/(termék|eszköz|szállító|asszisztens)/u.test(text)
	) {
		return "product_scan";
	}
	if (/\b(limitation|constraint|risk|korlát|kockázat)\b/u.test(text)) {
		return "limitation_focused";
	}
	return "investigation";
}

function buildDefaultKeyQuestions(
	userRequest: string,
	researchLanguage: ResearchLanguage,
): string[] {
	const topic = userRequest
		.trim()
		.replace(/\s+/g, " ")
		.replace(/[.!?]+$/u, "");
	if (researchLanguage === "hu") {
		return [
			`Mi a legfontosabb jelenlegi háttér ehhez a témához: ${topic}?`,
			"Mely hiteles források támasztják alá vagy árnyalják a fő állításokat?",
			"Milyen gyakorlati következtetéseket és korlátokat kell kiemelnie a jelentésnek?",
		];
	}

	return [
		`What is the current evidence and context for this topic: ${topic}?`,
		"Where do credible sources agree, disagree, or leave important gaps?",
		"What practical implications, risks, and limitations should the report call out?",
	];
}

function isInternalApprovalConstraint(value: string): boolean {
	return /do not start source-heavy research until the research plan is approved/i.test(
		value,
	) || /ne induljon forrásigényes kutatás/i.test(value);
}

function buildEffortEstimate(
	depth: ResearchDepth,
	researchLanguage: ResearchLanguage = "en",
): ResearchEffortEstimate {
	return {
		selectedDepth: depth,
		sourceReviewCeiling: depthBudgets[depth].sourceReviewCeiling,
		expectedTimeBand: localizedExpectedTimeBands[researchLanguage][depth],
		relativeCostWarning: localizedCostWarnings[researchLanguage][depth],
	};
}

function buildContextDisclosure(
	planningContext: PlanningContextItem[],
	researchLanguage: ResearchLanguage,
): string | null {
	if (planningContext.length === 0) {
		return null;
	}

	const counts = new Map<PlanningContextItem["type"], number>();
	for (const item of planningContext) {
		counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
	}

	const parts = Array.from(counts.entries()).map(([type, count]) =>
		formatContextCount(type, count, researchLanguage),
	);

	return researchLanguage === "hu"
		? `Figyelembe vett kontextus: ${parts.join(", ")}.`
		: `Context considered: ${parts.join(", ")}.`;
}

function formatContextCount(
	type: PlanningContextItem["type"],
	count: number,
	researchLanguage: ResearchLanguage,
): string {
	if (researchLanguage === "hu") {
		const nouns: Record<PlanningContextItem["type"], string> = {
			conversation: "beszélgetési elem",
			knowledge: "tudáselem",
			attachment: "csatolmány",
			report: "jelentés",
		};
		return `${count} ${nouns[type]}`;
	}

	const noun = type === "knowledge" ? "knowledge item" : `${type} item`;
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function buildDefaultIncludedSources(
	planningContext: PlanningContextItem[],
): ResearchPlanIncludedSource[] {
	return planningContext
		.filter(
			(item) =>
				item.artifactId &&
				(item.type === "attachment" ||
					(item.type === "knowledge" && item.includeAsResearchSource)),
		)
		.map((item) => ({
			type: item.type === "knowledge" ? "knowledge_artifact" : "attached_file",
			artifactId: item.artifactId as string,
			...(item.title ? { title: item.title } : {}),
			summary: item.summary,
		}));
}
