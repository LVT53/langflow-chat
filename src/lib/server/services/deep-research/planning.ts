import { getConfig, type RuntimeConfig } from "$lib/server/config-store";

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
	comparedEntities?: string[];
	comparisonAxes?: string[];
	planNormalizationNote?: string;
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
	meaningfulPassFloor: number;
	meaningfulPassCeiling: number;
	repairPassCeiling: number;
	sourceProcessingConcurrency: number;
	modelReasoningConcurrency: number;
};

export type ResearchEffortEstimate = {
	selectedDepth: ResearchDepth;
	expectedTimeBand: string;
	sourceReviewCeiling: number;
	relativeCostWarning: string;
	passBudget: string;
	repairPassBudget: string;
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
		passBudget: (floor: number, ceiling: number) => string;
		repairPassBudget: (count: number) => string;
		sourceProcessingConcurrency: (count: number) => string;
		modelReasoningConcurrency: (count: number) => string;
		goal: string;
		reportIntent: string;
		planNormalizationNote: string;
		comparedEntities: string;
		comparisonAxes: string;
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
		passBudget: (floor, ceiling) =>
			`Pass budget: ${floor}-${ceiling} meaningful research passes`,
		repairPassBudget: (count) => `Repair pass budget: up to ${count}`,
		sourceProcessingConcurrency: (count) =>
			`Source processing concurrency: up to ${count}`,
		modelReasoningConcurrency: (count) =>
			`Model reasoning concurrency: up to ${count}`,
		goal: "Goal",
		reportIntent: "Report intent",
		planNormalizationNote: "Plan Normalization Note",
		comparedEntities: "Compared entities",
		comparisonAxes: "Central comparison axes",
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
		passBudget: (floor, ceiling) =>
			`Kutatási kör keret: ${floor}-${ceiling} érdemi kutatási kör`,
		repairPassBudget: (count) => `Javítási kör keret: legfeljebb ${count}`,
		sourceProcessingConcurrency: (count) =>
			`Forrásfeldolgozási párhuzamosság: legfeljebb ${count}`,
		modelReasoningConcurrency: (count) =>
			`Modell következtetési párhuzamosság: legfeljebb ${count}`,
		goal: "Cél",
		reportIntent: "Jelentési szándék",
		planNormalizationNote: "Tervnormalizálási megjegyzés",
		comparedEntities: "Összehasonlított entitások",
		comparisonAxes: "Központi összehasonlítási tengelyek",
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
		focused: "Short multi-pass run; duration depends on source availability.",
		standard:
			"Extended multi-pass run; duration depends on source availability.",
		max: "Long high-depth run; duration depends on source availability and repair needs.",
	},
	hu: {
		focused:
			"Rövid, többkörös futás; az időtartam a források elérhetőségétől függ.",
		standard:
			"Kibővített, többkörös futás; az időtartam a források elérhetőségétől függ.",
		max: "Hosszú, nagy mélységű futás; az időtartam a forrásoktól és a javítási igényektől függ.",
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

export async function createFirstResearchPlanDraft(
	input: CreateFirstResearchPlanDraftInput,
	dependencies: CreateFirstResearchPlanDraftDependencies = {},
): Promise<ResearchPlanDraftResult> {
	const contextDisclosure = buildContextDisclosure(
		input.planningContext ?? [],
		input.researchLanguage,
	);
	const researchBudget = buildResearchBudget(input.selectedDepth);
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
		structuredPlan ??
		draftDefaultResearchPlan(input, researchBudget, contextDisclosure);
	const plan = {
		...draftedPlan,
		researchLanguage: input.researchLanguage,
		reportIntent: normalizeReportIntent(
			draftedPlan.reportIntent,
			input.userRequest,
		),
	};
	normalizePlanTextFields(plan, input.userRequest);
	normalizePlanAbstractDecisionFraming(plan, input.userRequest);
	normalizePlanComparisonMetadata(plan, input.userRequest);
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
	const researchBudget = buildResearchBudget(input.selectedDepth);
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
	normalizePlanTextFields(
		plan,
		`${input.previousPlan.goal} ${input.editInstruction}`,
	);
	normalizePlanAbstractDecisionFraming(
		plan,
		`${input.previousPlan.goal} ${input.editInstruction}`,
	);
	normalizePlanComparisonMetadata(
		plan,
		`${input.previousPlan.goal} ${input.editInstruction}`,
	);
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
		researchBudget: buildResearchBudget(input.selectedDepth),
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
	const selectedBudget = buildResearchBudget(selectedDepth);
	if (
		plan.researchBudget.sourceReviewCeiling > selectedBudget.sourceReviewCeiling
	) {
		throw new Error(
			`Research Plan exceeds ${depthLabels[selectedDepth]} budget: source review ceiling ${plan.researchBudget.sourceReviewCeiling} is above ${selectedBudget.sourceReviewCeiling}.`,
		);
	}
	if (
		plan.researchBudget.meaningfulPassCeiling >
			selectedBudget.meaningfulPassCeiling ||
		plan.researchBudget.synthesisPassCeiling >
			selectedBudget.synthesisPassCeiling
	) {
		throw new Error(
			`Research Plan exceeds ${depthLabels[selectedDepth]} budget: meaningful pass ceiling ${Math.max(plan.researchBudget.meaningfulPassCeiling, plan.researchBudget.synthesisPassCeiling)} is above ${selectedBudget.meaningfulPassCeiling}.`,
		);
	}
	if (
		plan.researchBudget.meaningfulPassFloor < selectedBudget.meaningfulPassFloor
	) {
		throw new Error(
			`Research Plan is below ${depthLabels[selectedDepth]} minimum pass expectation: meaningful pass floor ${plan.researchBudget.meaningfulPassFloor} is below ${selectedBudget.meaningfulPassFloor}.`,
		);
	}
	if (
		plan.researchBudget.meaningfulPassFloor >
		plan.researchBudget.meaningfulPassCeiling
	) {
		throw new Error(
			`Research Plan has an invalid pass budget: meaningful pass floor ${plan.researchBudget.meaningfulPassFloor} is above meaningful pass ceiling ${plan.researchBudget.meaningfulPassCeiling}.`,
		);
	}
	if (
		plan.researchBudget.repairPassCeiling > selectedBudget.repairPassCeiling
	) {
		throw new Error(
			`Research Plan exceeds ${depthLabels[selectedDepth]} budget: repair pass ceiling ${plan.researchBudget.repairPassCeiling} is above ${selectedBudget.repairPassCeiling}.`,
		);
	}
	if (
		plan.researchBudget.sourceProcessingConcurrency >
		selectedBudget.sourceProcessingConcurrency
	) {
		throw new Error(
			`Research Plan exceeds ${depthLabels[selectedDepth]} budget: source processing concurrency ${plan.researchBudget.sourceProcessingConcurrency} is above ${selectedBudget.sourceProcessingConcurrency}.`,
		);
	}
	if (
		plan.researchBudget.modelReasoningConcurrency >
		selectedBudget.modelReasoningConcurrency
	) {
		throw new Error(
			`Research Plan exceeds ${depthLabels[selectedDepth]} budget: model reasoning concurrency ${plan.researchBudget.modelReasoningConcurrency} is above ${selectedBudget.modelReasoningConcurrency}.`,
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
		...(plan.planNormalizationNote
			? ["", `${labels.planNormalizationNote}:`, plan.planNormalizationNote]
			: []),
		...(plan.comparedEntities?.length
			? [
					"",
					`${labels.comparedEntities}:`,
					...plan.comparedEntities.map((entity) => `- ${entity}`),
				]
			: []),
		...(plan.comparisonAxes?.length
			? [
					"",
					`${labels.comparisonAxes}:`,
					...plan.comparisonAxes.map((axis) => `- ${axis}`),
				]
			: []),
		"",
		`${labels.depth}: ${localizedDepthLabels[researchLanguage][plan.depth]}`,
		`${labels.expectedTime}: ${effortEstimate.expectedTimeBand}`,
		labels.sourceReviewCeiling(effortEstimate.sourceReviewCeiling),
		labels.passBudget(
			plan.researchBudget.meaningfulPassFloor,
			plan.researchBudget.meaningfulPassCeiling,
		),
		labels.repairPassBudget(plan.researchBudget.repairPassCeiling),
		labels.sourceProcessingConcurrency(
			plan.researchBudget.sourceProcessingConcurrency,
		),
		labels.modelReasoningConcurrency(
			plan.researchBudget.modelReasoningConcurrency,
		),
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
	if (
		value === "comparison" &&
		shouldFrameAsCandidateDiscoveryRecommendation(fallbackText)
	) {
		return "recommendation";
	}
	if (isReportIntent(value)) return value;
	return inferReportIntent(fallbackText);
}

function normalizePlanTextFields(
	plan: ResearchPlan,
	fallbackText: string,
): void {
	const researchLanguage = plan.researchLanguage ?? "en";
	const defaultProse = localizedDefaultPlanProse[researchLanguage];
	const goal = normalizePlanTextValue(plan.goal);
	plan.goal = goal ?? fallbackText.trim().replace(/\s+/g, " ");
	plan.keyQuestions = normalizePlanTextArray(plan.keyQuestions);
	if (plan.keyQuestions.length === 0) {
		plan.keyQuestions = buildDefaultKeyQuestions(
			fallbackText,
			researchLanguage,
		);
	}
	plan.reportShape = normalizePlanTextArray(plan.reportShape);
	if (plan.reportShape.length === 0) {
		plan.reportShape = defaultProse.reportShape;
	}
	plan.constraints = normalizePlanTextArray(plan.constraints);
	plan.deliverables = normalizePlanTextArray(plan.deliverables);
	if (plan.deliverables.length === 0) {
		plan.deliverables = defaultProse.deliverables;
	}
	if (plan.comparedEntities) {
		plan.comparedEntities = normalizePlanTextArray(plan.comparedEntities);
		if (plan.comparedEntities.length === 0) delete plan.comparedEntities;
	}
	if (plan.comparisonAxes) {
		plan.comparisonAxes = normalizePlanTextArray(plan.comparisonAxes);
		if (plan.comparisonAxes.length === 0) delete plan.comparisonAxes;
	}
	plan.planNormalizationNote =
		normalizePlanTextValue(plan.planNormalizationNote) ?? undefined;
}

function normalizePlanTextArray(values: unknown): string[] {
	if (!Array.isArray(values)) return [];
	return values
		.map((value) => normalizePlanTextValue(value))
		.filter((value): value is string => Boolean(value));
}

function normalizePlanTextValue(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim().replace(/\s+/g, " ");
	if (!normalized || isSchemaPlaceholderText(normalized)) return null;
	return normalized;
}

function isSchemaPlaceholderText(value: string): boolean {
	const normalized = value
		.trim()
		.replace(/^["']|["']$/g, "")
		.toLowerCase();
	return (
		normalized === "string" ||
		normalized === "string[]" ||
		normalized.startsWith("string[] ")
	);
}

function normalizePlanComparisonMetadata(
	plan: ResearchPlan,
	fallbackText: string,
): void {
	if (plan.reportIntent !== "comparison") {
		delete plan.comparedEntities;
		delete plan.comparisonAxes;
		return;
	}

	const inferred = inferComparisonMetadata(fallbackText);
	const providedComparedEntities = normalizeTextList(
		plan.comparedEntities ?? [],
	);
	const axisCandidates = normalizeTextList(
		[...(plan.comparisonAxes ?? []), ...inferred.axes].map(cleanComparisonAxis),
	);
	const repairedProvidedMetadata = repairProvidedComparisonMetadata(
		providedComparedEntities,
		axisCandidates,
	);
	const entityCandidates =
		repairedProvidedMetadata.entities.length >= 2
			? repairedProvidedMetadata.entities
			: inferred.entities.length >= 2
				? inferred.entities
				: repairedProvidedMetadata.entities;
	const comparedEntities = normalizeTextList(entityCandidates).slice(0, 6);
	const comparisonAxes = normalizeTextList(
		[
			...(plan.comparisonAxes ?? []),
			...repairedProvidedMetadata.axes,
			...inferred.axes,
		].map(cleanComparisonAxis),
	).slice(0, 12);

	if (comparedEntities.length >= 2) {
		plan.comparedEntities = comparedEntities;
	} else {
		delete plan.comparedEntities;
	}
	if (comparisonAxes.length > 0) {
		plan.comparisonAxes = comparisonAxes;
	} else {
		delete plan.comparisonAxes;
	}
}

function normalizePlanAbstractDecisionFraming(
	plan: ResearchPlan,
	fallbackText: string,
): void {
	if (!shouldFrameAsCandidateDiscoveryRecommendation(fallbackText)) {
		return;
	}

	plan.reportIntent = "recommendation";
	delete plan.comparedEntities;
	delete plan.comparisonAxes;
	plan.planNormalizationNote =
		(plan.researchLanguage ?? "en") === "hu"
			? "A jelölt architektúramintákat a kutatás során kell feltárni, nem előre kitölteni összehasonlított entitásként, mert a kérés opciókategóriát nevez meg konkrét, forrásokban kereshető megközelítések helyett."
			: "Candidate architecture patterns will be discovered during research instead of pre-filled as compared entities, because the request names an option category rather than specific source-searchable approaches.";
	plan.keyQuestions = buildDefaultKeyQuestions(
		fallbackText,
		plan.researchLanguage ?? "en",
	);
}

function repairProvidedComparisonMetadata(
	entities: string[],
	axisCandidates: string[],
): {
	entities: string[];
	axes: string[];
} {
	const cleanedEntities: string[] = [];
	const recoveredAxes: string[] = [];
	const axisCandidateKeys = new Set(axisCandidates.map(comparisonMetadataKey));
	for (const entity of entities.map(normalizeKnownProductSpelling)) {
		const repaired = repairComparedEntityCandidate(entity, axisCandidateKeys);
		cleanedEntities.push(...repaired.entities);
		recoveredAxes.push(...repaired.axes);
	}
	return {
		entities: applySharedKnownBrand(normalizeTextList(cleanedEntities)),
		axes: normalizeTextList(recoveredAxes),
	};
}

function repairComparedEntityCandidate(
	value: string,
	axisCandidateKeys: Set<string>,
): {
	entities: string[];
	axes: string[];
} {
	const split = splitComparedEntityAxisBoundary(value);
	const axes = recoverComparisonAxes(split.axisText, axisCandidateKeys);
	const entityText = split.entityText ?? value;
	if (
		isAxisCandidateList(entityText, axisCandidateKeys) ||
		isComparisonConstraintOrAxisTerm(entityText, axisCandidateKeys)
	) {
		return {
			entities: [],
			axes: [...axes, ...recoverComparisonAxes(entityText, axisCandidateKeys)],
		};
	}
	const cleanedEntity = cleanComparedEntityName(entityText);
	if (
		!cleanedEntity ||
		isAxisCandidateList(cleanedEntity, axisCandidateKeys) ||
		isComparisonConstraintOrAxisTerm(cleanedEntity, axisCandidateKeys)
	) {
		return {
			entities: [],
			axes: [...axes, ...recoverComparisonAxes(entityText, axisCandidateKeys)],
		};
	}
	return {
		entities: [cleanedEntity],
		axes,
	};
}

function splitComparedEntityAxisBoundary(value: string): {
	entityText: string | null;
	axisText: string | null;
} {
	const match = value.match(
		/^(.*?)(?:[.;]\s*|,\s*|\s+)(?:pay attention to|focusing on|focused on|with attention to)\s+(.+)$/iu,
	);
	if (!match) {
		return { entityText: null, axisText: null };
	}
	return {
		entityText: match[1].trim(),
		axisText: match[2].trim(),
	};
}

function cleanComparedEntityName(value: string): string {
	const cleaned = value
		.replace(
			/\b(?:in|for|across)\s+[^.]*\b(?:markets?|regions?|customers?|users?|frame sizes?|sizes?)\b.*$/iu,
			"",
		)
		.replace(
			/\b\d{4}(?:[-/]\d{2,4})?\s+(?:editions?|model years?|models?|versions?)\b/giu,
			"",
		)
		.replace(/\s+/g, " ")
		.trim()
		.replace(
			/\s+(?:approaches?|models?|platforms?|tools?|bikes?|bicycles?|products?|editions?|versions?|variants?)$/iu,
			"",
		)
		.replace(/\s+/g, " ")
		.trim();
	return normalizeKnownProductSpelling(cleaned);
}

function recoverComparisonAxes(
	value: string | null,
	axisCandidateKeys: Set<string>,
): string[] {
	if (!value) return [];
	return splitComparisonList(
		value.replace(
			/^(?:pay attention to|focusing on|focused on|with attention to)\s+/iu,
			"",
		),
	)
		.filter((axis) => isComparisonConstraintOrAxisTerm(axis, axisCandidateKeys))
		.map(axisFromComparedEntityReject)
		.filter((axis): axis is string => Boolean(axis));
}

function isComparisonConstraintOrAxisTerm(
	value: string,
	axisCandidateKeys: Set<string>,
): boolean {
	const normalized = value.toLocaleLowerCase();
	if (axisCandidateKeys.has(comparisonMetadataKey(value))) return true;
	if (isAxisCandidateList(value, axisCandidateKeys)) return true;
	return (
		normalized === "focusing" ||
		normalized === "focused" ||
		normalized === "europe" ||
		/\b(?:pricing|price|availability|medium frame size|frame size|model year|specs?|specifications?|weight|motor|battery|motor\/battery|drivetrain|brakes?|geometry|accessories)\b/iu.test(
			normalized,
		)
	);
}

function isAxisCandidateList(
	value: string,
	axisCandidateKeys: Set<string>,
): boolean {
	const parts = splitComparisonList(value);
	return (
		parts.length > 0 &&
		parts.every((part) => axisCandidateKeys.has(comparisonMetadataKey(part)))
	);
}

function comparisonMetadataKey(value: string): string {
	return cleanComparisonAxis(value)
		.toLocaleLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function axisFromComparedEntityReject(value: string): string | null {
	const normalized = cleanComparisonAxis(value);
	if (/^(?:focusing|focused|europe)$/iu.test(normalized)) return null;
	return normalized;
}

function inferComparisonMetadata(value: string): {
	entities: string[];
	axes: string[];
} {
	const normalized = value.replace(/\s+/g, " ").trim();
	const brandedProductMatch = normalized.match(
		/\bcompare\s+(?:the\s+)?(.+?)\s+from\s+([A-Z][\p{L}\p{N}&.-]+)(?:[.!?]|$)/iu,
	);
	if (brandedProductMatch) {
		const brand = brandedProductMatch[2];
		const productEntities = splitComparisonList(brandedProductMatch[1]).map(
			(entity) => prefixBrand(entity, brand),
		);
		const axisMatch = matchComparisonAxisClause(normalized);
		return {
			entities: productEntities,
			axes: axisMatch ? splitComparisonList(axisMatch).map(lowercaseFirst) : [],
		};
	}
	const entityMatch = normalized.match(
		/\b(?:compare|comparison of|versus|vs\.?)\s+(.+?)(?:,\s*(?:focusing|focused)\s+on\s+|\s+(?:for|on|across|by|regarding|in terms of)\s+|[.!?]?$)/iu,
	);
	const axisMatch = matchComparisonAxisClause(normalized);
	return {
		entities: entityMatch
			? applySharedKnownBrand(splitComparisonList(entityMatch[1]))
			: [],
		axes: axisMatch
			? splitComparisonList(axisMatch)
					.map(cleanComparisonAxis)
					.map(lowercaseFirst)
			: [],
	};
}

function matchComparisonAxisClause(value: string): string | null {
	const explicitAxisMatch = value.match(
		/\b(?:pay attention to|focusing\s+on|focused\s+on|in terms of|with attention to)\s+(.+?)[.!?]?$/iu,
	);
	if (explicitAxisMatch) return explicitAxisMatch[1];
	const scopedAxisMatch = value.match(
		/\b(?:for|on|across|by|regarding)\s+(.+?)[.!?]?$/iu,
	);
	return scopedAxisMatch?.[1] ?? null;
}

function splitComparisonList(value: string): string[] {
	return normalizeTextList(
		value
			.replace(/\bversus\b/giu, ",")
			.replace(/\bvs\.?\b/giu, ",")
			.replace(/\s+and\s+/giu, ",")
			.split(",")
			.map((part) =>
				part
					.replace(/^(?:the|a|an|current)\s+/iu, "")
					.replace(
						/\s+(?:approaches?|models?|platforms?|tools?|bikes?|bicycles?|products?|editions?|versions?|variants?)$/iu,
						"",
					),
			),
	).map(normalizeKnownProductSpelling);
}

function applySharedKnownBrand(entities: string[]): string[] {
	const sharedBrand = entities
		.map((entity) => entity.match(/^([A-Z][\p{L}\p{N}&.-]+)\s+/u)?.[1])
		.find((brand): brand is string =>
			Boolean(brand && isKnownProductBrand(brand)),
		);
	if (!sharedBrand) return entities;
	return entities.map((entity) => prefixBrand(entity, sharedBrand));
}

function isKnownProductBrand(value: string): boolean {
	return /^cube$/iu.test(value);
}

function cleanComparisonAxis(value: string): string {
	return value
		.replace(
			/^(?:pay attention to|focusing on|focused on|with attention to)\s+/iu,
			"",
		)
		.replace(/\bavailability\s+in\s+Europe\b/iu, "availability Europe")
		.replace(/^2026\s+model\s+year$/iu, "model year")
		.trim();
}

function prefixBrand(entity: string, brand: string): string {
	const normalizedEntity = normalizeKnownProductSpelling(entity);
	const entityKey = normalizedEntity.toLocaleLowerCase();
	const brandKey = brand.toLocaleLowerCase();
	if (entityKey === brandKey || entityKey.startsWith(`${brandKey} `)) {
		return normalizedEntity;
	}
	return `${brand} ${normalizedEntity}`;
}

function normalizeKnownProductSpelling(value: string): string {
	const normalized = value.replace(/\bKathmando\b/giu, "Kathmandu").trim();
	const cubeSuffixMatch = normalized.match(/^(.+?)\s+Cube$/iu);
	if (cubeSuffixMatch) return `Cube ${cubeSuffixMatch[1].trim()}`;
	return normalized;
}

function lowercaseFirst(value: string): string {
	if (!value) return value;
	if (/^[A-Z0-9]{2}/u.test(value)) return value;
	return `${value[0].toLocaleLowerCase()}${value.slice(1)}`;
}

function normalizeTextList(values: string[]): string[] {
	const seen = new Set<string>();
	const normalized: string[] = [];
	for (const value of values) {
		const item = value.replace(/\s+/g, " ").trim();
		if (!item) continue;
		const key = item.toLocaleLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		normalized.push(item);
	}
	return normalized;
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
	if (
		/\b(compare|comparison|versus|vs\.?|összehasonl|hasonlíts(?:d)?)\b/u.test(
			text,
		)
	) {
		if (shouldFrameAsCandidateDiscoveryRecommendation(value)) {
			return "recommendation";
		}
		return "comparison";
	}
	if (
		/\b(recommend|recommendation|choose|best|ajánl|válassz|legjobb)\b/u.test(
			text,
		)
	) {
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
	if (isEvidenceReviewIntent(text)) {
		return "limitation_focused";
	}
	if (/\b(limitations?|constraints?|risks?|korlát|kockázat)\b/u.test(text)) {
		return "limitation_focused";
	}
	return "investigation";
}

function shouldFrameAsCandidateDiscoveryRecommendation(value: string): boolean {
	const text = value.toLocaleLowerCase();
	return (
		hasRecommendationDecisionSignal(text) &&
		hasUnnamedOptionCategoryComparison(text) &&
		countValidComparedEntities(inferComparisonMetadata(value).entities) < 2
	);
}

function countValidComparedEntities(entities: string[]): number {
	return entities.filter((entity) => !isInvalidComparedEntityCandidate(entity))
		.length;
}

function isInvalidComparedEntityCandidate(value: string): boolean {
	const normalized = value.trim().toLocaleLowerCase();
	return (
		/^(?:at\s+least\s+)?(?:one|two|three|four|five|six|\d+)\s+[\w -]+(?:patterns?|options?|approaches?|architectures?|designs?|strategies?|systems?|solutions?|categories?)$/u.test(
			normalized,
		) ||
		/^(?:identify|recommend|include|compare|evaluate|assess|analy[sz]e|map|research|find)\b/u.test(
			normalized,
		)
	);
}

function hasRecommendationDecisionSignal(text: string): boolean {
	return (
		/\b(recommend|recommendation|choose|best|most reliable|one design|decision|roadmap)\b/u.test(
			text,
		) || /(?:ajánl|válassz|legjobb)/u.test(text)
	);
}

function hasUnnamedOptionCategoryComparison(text: string): boolean {
	return (
		/\bcompare\s+(?:at\s+least\s+)?(?:two|three|four|five|\d+)\s+[\w -]+(?:patterns?|options?|approaches?|architectures?|designs?|strategies?|systems?|solutions?|categories?)\b/u.test(
			text,
		) ||
		/\bcompare\s+(?:unnamed|candidate|possible|potential|different|several|multiple)\s+[\w -]+(?:patterns?|options?|approaches?|architectures?|designs?|strategies?|systems?|solutions?|categories?)\b/u.test(
			text,
		) ||
		/\b(?:hasonlíts(?:d)?\s+össze|összehasonlít(?:ás|ani)?)\s+(?:legalább\s+)?(?:két|három|négy|öt|\d+)\s+[\p{L}\p{M}\d _-]+(?:mintát|mintákat|opciót|opciókat|megközelítést|megközelítéseket|architektúrát|architektúrákat|megoldást|megoldásokat|kategóriát|kategóriákat)\b/u.test(
			text,
		)
	);
}

function isEvidenceReviewIntent(text: string): boolean {
	return (
		/\bevidence\s+(?:review|strength|quality|base|support|gap|gaps)\b/u.test(
			text,
		) ||
		/\b(?:review|assess|evaluate|analy[sz]e|synthesi[sz]e)\b.{0,100}\b(?:evidence|consensus|conflicts?|disagreements?|contradictions?)\b/u.test(
			text,
		) ||
		/\b(?:consensus|conflicts?|disagreements?|contradictions?)\b.{0,100}\b(?:evidence|research|studies|sources|findings|claims?)\b/u.test(
			text,
		) ||
		/\b(?:contradictory|conflicting)\s+(?:evidence|findings|studies|sources|claims?)\b/u.test(
			text,
		) ||
		/\bunresolved\s+conflicts?\b/u.test(text)
	);
}

function buildDefaultKeyQuestions(
	userRequest: string,
	researchLanguage: ResearchLanguage,
): string[] {
	const topic = userRequest
		.trim()
		.replace(/\s+/g, " ")
		.replace(/[.!?]+$/u, "");
	const reportIntent = inferReportIntent(userRequest);
	if (reportIntent === "comparison") {
		const comparison = inferComparisonMetadata(userRequest);
		if (comparison.entities.length >= 2) {
			return withDomainSpecificKeyQuestions(
				buildComparisonKeyQuestions({
					topic,
					researchLanguage,
					entities: comparison.entities,
					axes: comparison.axes,
				}),
				topic,
				researchLanguage,
			);
		}
	}
	return withDomainSpecificKeyQuestions(
		buildIntentKeyQuestions({
			topic,
			researchLanguage,
			reportIntent,
		}),
		topic,
		researchLanguage,
	);
}

function buildIntentKeyQuestions(input: {
	topic: string;
	researchLanguage: ResearchLanguage;
	reportIntent: ReportIntent;
}): string[] {
	if (input.reportIntent === "recommendation") {
		return buildRecommendationKeyQuestions(input.topic, input.researchLanguage);
	}
	if (input.reportIntent === "market_scan") {
		return buildMarketScanKeyQuestions(input.topic, input.researchLanguage);
	}
	if (input.reportIntent === "product_scan") {
		return buildProductScanKeyQuestions(input.topic, input.researchLanguage);
	}
	if (input.reportIntent === "limitation_focused") {
		return buildLimitationKeyQuestions(input.topic, input.researchLanguage);
	}
	return buildInvestigationKeyQuestions(input.topic, input.researchLanguage);
}

function buildRecommendationKeyQuestions(
	topic: string,
	researchLanguage: ResearchLanguage,
): string[] {
	if (isArchitectureDecisionTopic(topic)) {
		return buildArchitectureRecommendationKeyQuestions(topic, researchLanguage);
	}
	if (researchLanguage === "hu") {
		return [
			`Milyen döntést kell támogatnia a jelentésnek a témában, és mik a kötelező kritériumok, kizáró okok, költség- vagy időkorlátok: ${topic}?`,
			"Mely opciók kerülhetnek hiteles rövidlistára, és mi az aktuális áruk, elérhetőségük, bevezetési igényük vagy támogatási állapotuk?",
			"Hogyan teljesítenek a rövidlistás opciók a döntési kritériumok szerint, és mely állításokat támasztják alá elsődleges vagy független források?",
			"Milyen kompromisszumokat, kockázatokat, váltási költségeket és kizáró feltételeket kell figyelembe venni?",
			"Mely ajánlás adható, milyen feltételek mellett változna meg, és milyen bizonytalanságokat kell kimondani?",
		];
	}

	return [
		`What decision should the report support for ${topic}, and what must-have criteria, disqualifiers, budget limits, timing constraints, or user needs define a good recommendation?`,
		"Which credible options belong on the shortlist, and what current pricing, availability, setup requirements, and support status can be verified?",
		"How does each shortlisted option perform against the decision criteria, and which claims are backed by primary or independent sources?",
		"What tradeoffs, risks, switching costs, lock-in, or failure conditions could change the recommendation?",
		"What recommendation follows, under which conditions would it change, and what uncertainties must be stated plainly?",
	];
}

function buildArchitectureRecommendationKeyQuestions(
	topic: string,
	researchLanguage: ResearchLanguage,
): string[] {
	if (researchLanguage === "hu") {
		return [
			`Milyen döntési kritériumok alapján kell architektúrát ajánlani ehhez a feladathoz: ${topic}?`,
			"Mely jelölt architektúraminták alkalmasak mély kutatási asszisztenshez, és milyen források támasztják alá az egyes minták erősségeit és korlátait?",
			"Milyen hibamódok vezetnek hallucinált állításokhoz, gyenge forrásminőséghez, elveszett kontextushoz vagy törékeny hosszú jelentésekhez?",
			"Hogyan biztosítják az opciók a bizonyíték- és hivatkozás-megbízhatóságot, beleértve az állítások forráshoz kötését és auditálását?",
			"Hogyan kezelik az opciók a feltöltött dokumentumok vizsgálatát, jogosultságait, forrásidézeteit és a webes forrásokkal való összevetését?",
			"Milyen biztonsági, megfelelőségi, adatkezelési és üzemeltetési kontrollok szükségesek egy vállalati bevezetéshez?",
			"Mekkora implementációs teher, integrációs komplexitás, költség és karbantartási kockázat jár az egyes jelöltekkel?",
			"Melyik architektúra ajánlható, milyen bevezetési roadmap következik belőle, és milyen feltételek mellett változna az ajánlás?",
		];
	}

	return [
		`What decision criteria should govern the architecture recommendation for ${topic}?`,
		"Which candidate architecture patterns should be discovered for a deep research assistant, and what evidence supports each pattern's strengths and limits?",
		"What failure modes lead to fabricated claims, weak source quality, lost context, or brittle long-form reports?",
		"How does each option protect evidence and citation reliability, including claim-to-source traceability and auditability?",
		"How does each option inspect uploaded documents, preserve document permissions, cite document evidence, and reconcile document evidence with web sources?",
		"What security, compliance, data-handling, and operational controls are required for enterprise deployment?",
		"What implementation burden, integration complexity, cost, and maintenance risk does each candidate architecture create?",
		"Which architecture should be recommended, what implementation roadmap follows, and under what conditions would the recommendation change?",
	];
}

function isArchitectureDecisionTopic(topic: string): boolean {
	return /\b(?:architecture|architectural|architecture patterns?|workflow graphs?|multi-agent|rag|retrieval|deep research assistant|research assistant architecture|uploaded documents?)\b/iu.test(
		topic,
	);
}

function buildMarketScanKeyQuestions(
	topic: string,
	researchLanguage: ResearchLanguage,
): string[] {
	if (researchLanguage === "hu") {
		return [
			`Milyen piacot, földrajzi területet, időtávot, ügyfélszegmenst és kategóriahatárt kell lefednie a kutatásnak: ${topic}?`,
			"Kik a vezető szereplők és feltörekvő belépők, és milyen források igazolják a részesedést, növekedést, árazást, finanszírozást vagy ügyfélvonzást?",
			"Mely technológiai, szabályozási, keresleti vagy ellátási trendek változtatják a piacot most?",
			"Hol gyenge, hiányos vagy ellentmondásos a piaci adat, és mely források módszertana érdemel óvatosságot?",
			"Milyen gyakorlati lehetőségeket, fenyegetéseket, belépési korlátokat és figyelendő jeleket kell kiemelni?",
		];
	}

	return [
		`What market boundaries, geography, timeframe, customer segments, and category definitions should frame ${topic}?`,
		"Who are the leading players and emerging entrants, and what evidence verifies share, growth, pricing, funding, distribution, or customer traction?",
		"What technology, regulatory, demand, supply, or pricing trends are changing the market now?",
		"Where are market data, rankings, forecasts, or analyst claims weak, stale, disputed, or methodologically limited?",
		"What practical opportunities, threats, entry barriers, buying signals, and watchpoints should the report call out?",
	];
}

function buildProductScanKeyQuestions(
	topic: string,
	researchLanguage: ResearchLanguage,
): string[] {
	if (researchLanguage === "hu") {
		return [
			`Mely termékek, verziók, csomagok, szállítók vagy integrációk tartoznak pontosan a kutatásba: ${topic}?`,
			"Milyen hivatalos képességek, árak, korlátok, régiós eltérések, biztonsági állítások és támogatási feltételek ellenőrizhetők?",
			"Mely független tesztek, benchmarkok, felhasználói beszámolók vagy dokumentációk erősítik meg vagy cáfolják a termékállításokat?",
			"Milyen használati esetekben működik jól vagy rosszul a termék, és milyen üzemeltetési, megfelelőségi, lock-in vagy minőségi kockázatok vannak?",
			"Mely felhasználóknak vagy munkafolyamatoknak illik a termék, és milyen információ hiányzik még a magabiztos döntéshez?",
		];
	}

	return [
		`Which exact products, versions, tiers, vendors, or integrations are in scope for ${topic}?`,
		"What official capabilities, pricing, limits, regional differences, security claims, and support terms can be verified?",
		"Which independent tests, benchmarks, user reports, documentation, or incident records corroborate or contradict product claims?",
		"Where does the product perform well or poorly by use case, and what operational, compliance, lock-in, quality, or reliability risks matter?",
		"Which users or workflows fit the product best, and what missing information prevents a confident conclusion?",
	];
}

function buildLimitationKeyQuestions(
	topic: string,
	researchLanguage: ResearchLanguage,
): string[] {
	if (researchLanguage === "hu") {
		return [
			`Mely állításokat, hatóköröket, feltételezéseket vagy döntéseket kell kockázati és korlát szempontból ellenőrizni: ${topic}?`,
			"Milyen fő kockázatok, hibamódok, jogi vagy technikai korlátok, függőségek és edge case-ek jelennek meg hiteles forrásokban?",
			"Mely bizonyítékok számszerűsítik a valószínűséget, hatást, gyakoriságot, incidenseket vagy szakértői konszenzust?",
			"Milyen mitigációk, kontrollok, alternatívák, monitoring jelek vagy döntési küszöbök csökkentik a kockázatot?",
			"Mely bizonytalanságokat nem lehet feloldani, és hogyan kell ezeket korlátként vagy feltételes következtetésként megfogalmazni?",
		];
	}

	return [
		`Which claims, scope boundaries, assumptions, or decisions need risk and limitation checking for ${topic}?`,
		"What major risks, failure modes, legal or technical constraints, dependencies, and edge cases are documented by credible sources?",
		"What evidence quantifies likelihood, severity, frequency, incidents, expert consensus, or uncertainty?",
		"What mitigations, controls, alternatives, monitoring signals, or decision thresholds reduce the risk?",
		"What uncertainty cannot be resolved, and how should it be framed as a limitation or conditional conclusion?",
	];
}

function buildInvestigationKeyQuestions(
	topic: string,
	researchLanguage: ResearchLanguage,
): string[] {
	if (researchLanguage === "hu") {
		return [
			`Mely pontos állítást, eseményt, problémát vagy döntési kérdést kell feltárni, és mi a releváns idővonal: ${topic}?`,
			"Kik a fő szereplők, intézmények, termékek vagy érintettek, és milyen elsődleges források rögzítik az alapvető tényeket?",
			"Mely okok, mechanizmusok, ösztönzők vagy külső tényezők magyarázzák a helyzetet, és mennyire erős a bizonyíték?",
			"Hol térnek el egymástól a hiteles források, és mely állítások igényelnek további ellenőrzést vagy óvatos megfogalmazást?",
			"Milyen következtetéseket, gyakorlati következményeket, nyitott kérdéseket és korlátokat kell a jelentésben elkülöníteni?",
		];
	}

	return [
		`What exact claim, event, problem, or decision question should be investigated for ${topic}, and what timeline matters?`,
		"Who are the key actors, institutions, products, or stakeholders, and which primary sources establish the core facts?",
		"What causes, mechanisms, incentives, or external factors explain the situation, and how strong is the evidence?",
		"Where do credible sources disagree, leave gaps, or require careful qualification?",
		"What conclusions, practical implications, open questions, and limitations should the report separate clearly?",
	];
}

function withDomainSpecificKeyQuestions(
	keyQuestions: string[],
	topic: string,
	researchLanguage: ResearchLanguage,
): string[] {
	return normalizeTextList([
		...keyQuestions,
		...buildDomainSpecificKeyQuestions(topic, researchLanguage),
	]).slice(0, 8);
}

function buildDomainSpecificKeyQuestions(
	topic: string,
	researchLanguage: ResearchLanguage,
): string[] {
	const text = topic.toLocaleLowerCase();
	const questions: string[] = [];
	if (isLawTopic(text)) {
		questions.push(
			...(researchLanguage === "hu"
				? [
						"Mely joghatóságok, hatályos jogforrások, szabályozói útmutatók, bírósági vagy hatósági döntések és végrehajtási határidők irányadók most?",
						"Mely jogi állítások vitatottak, még nem teszteltek vagy joghatóságonként eltérőek, és milyen gyakorlati megfelelési kockázatot okoznak?",
					]
				: [
						"Which jurisdictions, current legal authorities, regulator guidance, court or agency decisions, and enforcement dates govern the topic now?",
						"Which legal claims are disputed, untested, jurisdiction-dependent, or practically hard to enforce, and what compliance risk follows?",
					]),
		);
	}
	if (isProcurementTopic(text)) {
		questions.push(
			...(researchLanguage === "hu"
				? [
						"Mely érintetti kritériumokat, beszerzési korlátokat, biztonsági és megfelelőségi követelményeket, adatkezelési feltételeket és jóváhagyási lépéseket kell ellenőrizni?",
						"Milyen implementációs terhet, szerződéses kockázatot, támogatási minőséget, vendor lock-int és teljes életciklus-költséget mutatnak a források?",
					]
				: [
						"Which stakeholder criteria, procurement constraints, security and compliance requirements, data-handling terms, and approval gates must be checked?",
						"What implementation burden, contract risk, support quality, vendor lock-in, and total lifecycle cost do credible sources show?",
					]),
		);
	}
	if (isSoftwareTechnicalTopic(text)) {
		questions.push(
			...(researchLanguage === "hu"
				? [
						"Mely verziók, architektúrák, API-k, függőségek, kompatibilitási feltételek, teljesítményadatok és üzemeltetési korlátok relevánsak?",
						"Milyen biztonsági, megbízhatósági, skálázási, migrációs, observability vagy hibakezelési kockázatokat dokumentálnak a források?",
					]
				: [
						"Which versions, architectures, APIs, dependencies, compatibility constraints, performance data, and operating limits are relevant?",
						"What security, reliability, scalability, migration, observability, or failure-handling risks are documented by credible sources?",
					]),
		);
	}
	if (isHealthTopic(text)) {
		questions.push(
			...(researchLanguage === "hu"
				? [
						"Mely aktuális klinikai irányelvek, szabályozói figyelmeztetések, populációs feltételek, kontraindikációk és ellátási környezetek határozzák meg az alkalmazhatóságot?",
						"Milyen bizonyíték támasztja alá az előnyöket, károkat, abszolút kockázatokat, mellékhatásokat és bizonytalanságokat, és hol szükséges orvosi óvatosság?",
					]
				: [
						"Which current clinical guidelines, regulator warnings, population criteria, contraindications, and care settings define applicability?",
						"What evidence supports benefits, harms, absolute risks, adverse effects, and uncertainties, and where should medical caution be explicit?",
					]),
		);
	}
	if (isFinanceTopic(text)) {
		questions.push(
			...(researchLanguage === "hu"
				? [
						"Mely pénzügyi termékek, piacok, időtávok, adatforrások, díjak, adók, likviditási feltételek és szabályozási korlátok relevánsak?",
						"Milyen feltételezések, volatilitási vagy veszteségkockázatok, érzékenységek, historikus korlátok és alternatív forgatókönyvek változtatják a következtetést?",
					]
				: [
						"Which financial products, markets, time horizons, data sources, fees, taxes, liquidity conditions, and regulatory constraints are relevant?",
						"What assumptions, volatility or downside risks, sensitivities, historical limitations, and alternative scenarios could change the conclusion?",
					]),
		);
	}
	if (isAcademicLiteratureTopic(text)) {
		questions.push(
			...(researchLanguage === "hu"
				? [
						"Mely adatbázisokat, keresőkifejezéseket, beválasztási és kizárási kritériumokat, időablakot és tanulmánytípusokat kell használni?",
						"Milyen a tanulmányok módszertani minősége, reprodukálhatósága, mintamérete, torzítási kockázata, konszenzusa, ellentmondása és frissessége?",
					]
				: [
						"Which databases, search terms, inclusion and exclusion criteria, date window, and study types should define the literature search?",
						"What do study quality, reproducibility, sample size, bias risk, consensus, contradictions, and recency show?",
					]),
		);
	}
	return questions;
}

function isLawTopic(text: string): boolean {
	return /\b(law|legal|regulation|regulatory|compliance|court|lawsuit|statute|directive|liability|jurisdiction|copyright|privacy|gdpr|eu ai act)\b/u.test(
		text,
	);
}

function isProcurementTopic(text: string): boolean {
	return /\b(procurement|purchase|buy|vendor|supplier|rfp|security review|due diligence|enterprise|contract|sourcing|tco|total cost|beszerz|szállító)\b/u.test(
		text,
	);
}

function isSoftwareTechnicalTopic(text: string): boolean {
	return /\b(software|technical|api|sdk|database|framework|library|architecture|deployment|infrastructure|cloud|security|performance|scalability|migration|observability|kubernetes|svelte|typescript|python|node|postgres|sqlite)\b/u.test(
		text,
	);
}

function isHealthTopic(text: string): boolean {
	return /\b(health|medical|clinical|patient|doctor|disease|treatment|drug|therapy|diagnosis|symptom|vaccine|fda|ema|guideline|contraindication|side effect)\b/u.test(
		text,
	);
}

function isFinanceTopic(text: string): boolean {
	return /\b(finance|financial|stock|bond|etf|fund|crypto|investment|portfolio|loan|mortgage|insurance|tax|inflation|interest rate|yield|valuation|revenue|profit|market cap|liquidity|volatility)\b/u.test(
		text,
	);
}

function isAcademicLiteratureTopic(text: string): boolean {
	return /\b(academic|literature review|systematic review|meta-analysis|paper|papers|study|studies|journal|peer[- ]reviewed|research literature|citation|pubmed|arxiv|scholar)\b/u.test(
		text,
	);
}

function buildComparisonKeyQuestions(input: {
	topic: string;
	researchLanguage: ResearchLanguage;
	entities: string[];
	axes: string[];
}): string[] {
	const entityText = formatList(input.entities);
	const axisText = input.axes.length
		? formatList(input.axes)
		: inferDefaultComparisonAxes(input.topic);
	const yearText = extractRequestedYearScope(input.topic);
	const yearPhrase = yearText ? `${yearText} ` : "";
	if (!isVehicleComparisonTopic(input.topic)) {
		return buildGenericComparisonKeyQuestions({
			...input,
			entityText,
			axisText,
		});
	}
	if (input.researchLanguage === "hu") {
		return [
			`Pontosan mely ${yearPhrase}${entityText} változatok tartoznak a kérdésbe, és mely hivatalos specifikációk, árak, elérhetőségi adatok vagy régiós eltérések ellenőrizhetők?`,
			`Miben különbözik a ${entityText} a következő szempontok szerint: ${axisText}?`,
			`Mi változott a kért kiadások vagy modellévek között, és mely felszereltségi szintek módosíthatják az összehasonlítást?`,
			"Mely gyártói oldalak, kézikönyvek, kereskedői listák és független tesztek erősítik meg vagy cáfolják a fő állításokat?",
			"Mely felhasználási esetekhez melyik opció tűnik jobb választásnak, és milyen bizonytalanságokat kell kimondania a jelentésnek?",
		];
	}

	return [
		`Which exact ${yearPhrase}${entityText} variants are in scope, and what official specs, prices, availability, regional names, and trim differences can be verified?`,
		`How do ${entityText} differ on ${axisText}?`,
		"What changed between the requested editions or model years, and which trim-level differences could materially change the comparison?",
		"Which manufacturer pages, manuals, dealer listings, and independent reviews corroborate or conflict with the main claims?",
		"Which rider or buyer use cases favor each option, and what evidence gaps, risks, or limitations should the report state plainly?",
	];
}

function buildGenericComparisonKeyQuestions(input: {
	topic: string;
	researchLanguage: ResearchLanguage;
	entities: string[];
	axes: string[];
	entityText: string;
	axisText: string;
}): string[] {
	if (input.researchLanguage === "hu") {
		return [
			`Pontosan hogyan kell meghatározni és elhatárolni a következő összehasonlított opciókat: ${input.entityText}?`,
			`Miben különbözik a ${input.entityText} a következő tengelyek mentén: ${input.axisText}?`,
			"Mely elsődleges, független vagy technikai források támasztják alá vagy cáfolják a fő összehasonlító állításokat?",
			"Milyen költségek, korlátok, kockázatok, üzemeltetési terhek és bevezetési feltételek változtatják meg az összehasonlítást?",
			"Mely opció mely helyzetben illeszkedik jobban, és milyen bizonytalanságokat vagy bizonyítékréseket kell kimondani?",
		];
	}

	return [
		`How should ${input.entityText} be precisely defined and scoped for this comparison?`,
		`How do ${input.entityText} differ on ${input.axisText}?`,
		"Which primary, independent, or technical sources support or contradict the main comparison claims?",
		"What costs, constraints, risks, operating burdens, and adoption conditions materially change the comparison?",
		"Which option fits which context best, and what uncertainties or evidence gaps should the report state plainly?",
	];
}

function isVehicleComparisonTopic(topic: string): boolean {
	return /\b(?:bike|bikes|bicycle|bicycles|cube|nulane|kathmandu|kathmando|frame size|drivetrain|brakes?|geometry|motor\/battery)\b/iu.test(
		topic,
	);
}

function inferDefaultComparisonAxes(topic: string): string {
	if (
		/\b(?:bike|bikes|bicycle|bicycles|cube|nulane|kathmandu|kathmando)\b/iu.test(
			topic,
		)
	) {
		return "intended use, frame and geometry, drivetrain, motor and battery if electric, brakes, wheels and tires, racks/fenders/lights, comfort, weight, price, and availability";
	}
	if (
		/\b(?:law|rules?|regulation|policy|copyright|compliance)\b/iu.test(topic)
	) {
		return "legal scope, enforcement authority, affected actors, compliance duties, unresolved disputes, timelines, and practical risk";
	}
	return "features, evidence quality, costs, constraints, risks, tradeoffs, and practical fit";
}

function extractRequestedYearScope(topic: string): string | null {
	const compactRange = topic.match(/\b(20\d{2})\s*[-–]\s*(\d{2})\b/u);
	if (compactRange) {
		return `${compactRange[1]}-${compactRange[1].slice(0, 2)}${compactRange[2]}`;
	}
	const years = Array.from(new Set(topic.match(/\b20\d{2}\b/gu) ?? []));
	if (years.length === 0) return null;
	return years.length === 1 ? years[0] : years.slice(0, 3).join("/");
}

function formatList(values: string[]): string {
	if (values.length <= 2) return values.join(" and ");
	return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function isInternalApprovalConstraint(value: string): boolean {
	return (
		/do not start source-heavy research until the research plan is approved/i.test(
			value,
		) || /ne induljon forrásigényes kutatás/i.test(value)
	);
}

function buildEffortEstimate(
	depth: ResearchDepth,
	researchLanguage: ResearchLanguage = "en",
): ResearchEffortEstimate {
	const budget = buildResearchBudget(depth);
	return {
		selectedDepth: depth,
		sourceReviewCeiling: budget.sourceReviewCeiling,
		expectedTimeBand: localizedExpectedTimeBands[researchLanguage][depth],
		relativeCostWarning: localizedCostWarnings[researchLanguage][depth],
		passBudget: `${budget.meaningfulPassFloor}-${budget.meaningfulPassCeiling} meaningful research passes`,
		repairPassBudget: `up to ${budget.repairPassCeiling} repair passes`,
	};
}

export function buildResearchBudget(
	depth: ResearchDepth,
	config: RuntimeConfig = getConfig(),
): ResearchBudget {
	const budget = config.deepResearchDepthBudgets[depth];
	return {
		sourceReviewCeiling: budget.sourceReviewCeiling,
		synthesisPassCeiling: budget.meaningfulPassCeiling,
		meaningfulPassFloor: budget.meaningfulPassFloor,
		meaningfulPassCeiling: budget.meaningfulPassCeiling,
		repairPassCeiling: budget.repairPassCeiling,
		sourceProcessingConcurrency: budget.sourceProcessingConcurrency,
		modelReasoningConcurrency: budget.modelReasoningConcurrency,
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
