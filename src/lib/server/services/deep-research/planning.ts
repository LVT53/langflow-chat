export type ResearchDepth = "focused" | "standard" | "max";

export type ResearchLanguage = "en" | "hu";

export type PlanningContextItem = {
	type: "conversation" | "knowledge" | "attachment" | "report";
	title?: string;
	summary: string;
};

export type ResearchPlan = {
	goal: string;
	depth: ResearchDepth;
	researchBudget: ResearchBudget;
	keyQuestions: string[];
	sourceScope: {
		includePublicWeb: boolean;
		planningContextDisclosure: string | null;
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
		) => Promise<ResearchPlan>;
	};
	sourceResearch?: {
		discoverSources: (...args: unknown[]) => Promise<unknown>;
	};
};

const depthLabels: Record<ResearchDepth, string> = {
	focused: "Focused Deep Research",
	standard: "Standard Deep Research",
	max: "Max Deep Research",
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

const effortEstimateByDepth: Record<
	ResearchDepth,
	Omit<ResearchEffortEstimate, "selectedDepth" | "sourceReviewCeiling">
> = {
	focused: {
		expectedTimeBand: "10-20 minutes",
		relativeCostWarning:
			"Lowest relative cost; use for narrow questions that need a cited brief.",
	},
	standard: {
		expectedTimeBand: "30-60 minutes",
		relativeCostWarning:
			"Moderate relative cost; use for serious multi-source synthesis.",
	},
	max: {
		expectedTimeBand: "2-4 hours",
		relativeCostWarning:
			"Highest relative cost; use for broad or high-stakes investigations.",
	},
};

export async function createFirstResearchPlanDraft(
	input: CreateFirstResearchPlanDraftInput,
	dependencies: CreateFirstResearchPlanDraftDependencies = {},
): Promise<ResearchPlanDraftResult> {
	const contextDisclosure = buildContextDisclosure(input.planningContext ?? []);
	const researchBudget = depthBudgets[input.selectedDepth];
	const effortEstimate = buildEffortEstimate(input.selectedDepth);
	const plan = dependencies.structuredPlanner
		? await dependencies.structuredPlanner.draftPlan(input, {
				selectedBudget: researchBudget,
				contextDisclosure,
			})
		: draftDefaultResearchPlan(input, researchBudget, contextDisclosure);
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

function draftDefaultResearchPlan(
	input: CreateFirstResearchPlanDraftInput,
	researchBudget: ResearchBudget,
	contextDisclosure: string | null,
): ResearchPlan {
	return {
		goal: input.userRequest,
		depth: input.selectedDepth,
		researchBudget,
		keyQuestions: [
			"What is the current state of the topic?",
			"Which similarities and differences matter most?",
			"What practical implications should the report call out?",
		],
		sourceScope: {
			includePublicWeb: true,
			planningContextDisclosure: contextDisclosure,
		},
		reportShape: [
			"Executive summary",
			"Key findings",
			"Main comparison",
			"Source list",
			"Limitations",
		],
		constraints: [
			"Do not start source-heavy research until the Research Plan is approved.",
		],
		deliverables: ["Cited Research Report"],
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
	const effortEstimate = buildEffortEstimate(plan.depth);
	return [
		"# Research Plan",
		"",
		`Depth: ${depthLabels[plan.depth]}`,
		`Expected time: ${effortEstimate.expectedTimeBand}`,
		`Source review ceiling: up to ${effortEstimate.sourceReviewCeiling}`,
		`Cost: ${effortEstimate.relativeCostWarning}`,
		"",
		`Goal: ${plan.goal}`,
		"",
		"Key questions:",
		...plan.keyQuestions.map((question) => `- ${question}`),
		"",
		"Expected report shape:",
		...plan.reportShape.map((section) => `- ${section}`),
	].join("\n");
}

function buildEffortEstimate(depth: ResearchDepth): ResearchEffortEstimate {
	return {
		selectedDepth: depth,
		sourceReviewCeiling: depthBudgets[depth].sourceReviewCeiling,
		...effortEstimateByDepth[depth],
	};
}

function buildContextDisclosure(
	planningContext: PlanningContextItem[],
): string | null {
	if (planningContext.length === 0) {
		return null;
	}

	const counts = new Map<PlanningContextItem["type"], number>();
	for (const item of planningContext) {
		counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
	}

	const parts = Array.from(counts.entries()).map(([type, count]) => {
		const noun = type === "knowledge" ? "knowledge item" : `${type} item`;
		return `${count} ${noun}${count === 1 ? "" : "s"}`;
	});

	return `Context considered: ${parts.join(", ")}.`;
}
