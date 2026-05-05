import type { DeepResearchSourceStatus } from "$lib/types";
import type { ResearchLanguage, ResearchPlan } from "./planning";
import type { SynthesisFinding, SynthesisNotes } from "./synthesis";

export type ResearchReportSourceStatus = DeepResearchSourceStatus;

export type ResearchReportSource = {
	id: string;
	reviewedSourceId?: string | null;
	status: ResearchReportSourceStatus;
	title: string;
	url: string;
	citationNote?: string | null;
};

export type CitedResearchReportSource = ResearchReportSource & {
	citationNumber: number;
};

export type ResearchReportSection = {
	heading: string;
	body: string;
};

export type ResearchReportDraft = {
	jobId: string;
	title: string;
	executiveSummary: string;
	keyFindings: string[];
	sections: ResearchReportSection[];
	sources: CitedResearchReportSource[];
	limitations: string[];
	markdown: string;
};

export type WriteResearchReportInput = {
	jobId: string;
	plan: ResearchPlan;
	synthesisNotes: SynthesisNotes;
	sources: ResearchReportSource[];
	limitations?: string[];
};

type ReportSectionKind = "methodology" | "comparison" | "recommendations";

const reportLabels: Record<
	ResearchLanguage,
	{
		titlePrefix: string;
		executiveSummary: string;
		keyFindings: string;
		mainBody: string;
		sources: string;
		reportLimitations: string;
		methodology: string;
		comparison: string;
		recommendations: string;
		researchQuestions: string;
		synthesis: string;
		methodologyScope: (depthLabel: string) => string;
		sourceReviewCeiling: string;
		synthesisPassCeiling: string;
		recommendationsBody: string;
		noFindingSummary: string;
		executiveSummaryBody: (goal: string, findingSummary: string) => string;
		mainBodyGoal: (goal: string) => string;
		emptyBullet: string;
	}
> = {
	en: {
		titlePrefix: "Research Report",
		executiveSummary: "Executive Summary",
		keyFindings: "Key Findings",
		mainBody: "Main Body",
		sources: "Sources",
		reportLimitations: "Report Limitations",
		methodology: "Methodology",
		comparison: "Comparison",
		recommendations: "Recommendations",
		researchQuestions: "Research questions",
		synthesis: "Synthesis",
		methodologyScope: (depthLabel) =>
			`Review scope followed the approved ${depthLabel} plan.`,
		sourceReviewCeiling: "Source review ceiling",
		synthesisPassCeiling: "Synthesis pass ceiling",
		recommendationsBody:
			"Use the supported findings above to choose next actions.",
		noFindingSummary:
			"The reviewed evidence did not produce a supported finding.",
		executiveSummaryBody: (goal, findingSummary) => `${goal} ${findingSummary}`,
		mainBodyGoal: (goal) =>
			`This report addresses the approved Research Plan goal: ${goal}`,
		emptyBullet: "None.",
	},
	hu: {
		titlePrefix: "Kutatási jelentés",
		executiveSummary: "Vezetői összefoglaló",
		keyFindings: "Fő megállapítások",
		mainBody: "Fő tartalom",
		sources: "Források",
		reportLimitations: "Jelentési korlátok",
		methodology: "Módszertan",
		comparison: "Összehasonlítás",
		recommendations: "Javaslatok",
		researchQuestions: "Kutatási kérdések",
		synthesis: "Szintézis",
		methodologyScope: (depthLabel) =>
			`Az áttekintés hatóköre a jóváhagyott ${depthLabel} tervet követte.`,
		sourceReviewCeiling: "Forrás-áttekintési plafon",
		synthesisPassCeiling: "Szintézis kör plafonja",
		recommendationsBody:
			"A fenti alátámasztott megállapításokat használd a következő lépések kiválasztásához.",
		noFindingSummary:
			"Az áttekintett bizonyítékok nem eredményeztek alátámasztott megállapítást.",
		executiveSummaryBody: (goal, findingSummary) =>
			`Ez a jelentés a jóváhagyott Kutatási terv céljára válaszol: ${goal} ${findingSummary}`,
		mainBodyGoal: (goal) =>
			`Ez a jelentés a jóváhagyott Kutatási terv céljára válaszol: ${goal}`,
		emptyBullet: "Nincs.",
	},
};

export function writeResearchReport(
	input: WriteResearchReportInput,
): ResearchReportDraft {
	const researchLanguage = input.plan.researchLanguage ?? "en";
	const citedSources = buildCitedSources(input.synthesisNotes, input.sources);
	const keyFindings = input.synthesisNotes.supportedFindings.map((finding) =>
		formatFindingWithCitations(finding, citedSources),
	);
	const executiveSummary = buildExecutiveSummary(
		input.plan,
		keyFindings,
		researchLanguage,
	);
	const sections = buildReportSections(
		input.plan,
		keyFindings,
		researchLanguage,
	);
	const limitations = [
		...input.synthesisNotes.reportLimitations.map(
			(limitation) => limitation.statement,
		),
		...(input.limitations ?? []),
	]
		.map(normalizeText)
		.filter(Boolean);
	const title = `${reportLabels[researchLanguage].titlePrefix}: ${input.plan.goal}`;
	const markdown = renderReportMarkdown({
		title,
		executiveSummary,
		keyFindings,
		sections,
		sources: citedSources,
		limitations,
		researchLanguage,
	});

	return {
		jobId: input.jobId,
		title,
		executiveSummary,
		keyFindings,
		sections,
		sources: citedSources,
		limitations,
		markdown,
	};
}

function buildCitedSources(
	synthesisNotes: SynthesisNotes,
	sources: ResearchReportSource[],
): CitedResearchReportSource[] {
	const sourcesByReviewedId = new Map(
		sources
			.filter((source) => source.reviewedSourceId)
			.map((source) => [source.reviewedSourceId, source]),
	);
	const sourcesById = new Map(sources.map((source) => [source.id, source]));
	const citedSources: CitedResearchReportSource[] = [];
	const seenSourceIds = new Set<string>();

	for (const finding of synthesisNotes.findings) {
		for (const sourceRef of finding.sourceRefs) {
			const source =
				sourcesByReviewedId.get(sourceRef.reviewedSourceId) ??
				sourcesById.get(sourceRef.discoveredSourceId) ??
				({
					id: sourceRef.discoveredSourceId,
					reviewedSourceId: sourceRef.reviewedSourceId,
					status: "reviewed",
					title: sourceRef.title,
					url: sourceRef.canonicalUrl,
				} satisfies ResearchReportSource);

			if (seenSourceIds.has(source.id)) {
				continue;
			}

			seenSourceIds.add(source.id);
			citedSources.push({
				...source,
				citationNumber: citedSources.length + 1,
			});
		}
	}

	return citedSources;
}

function buildExecutiveSummary(
	plan: ResearchPlan,
	keyFindings: string[],
	researchLanguage: ResearchLanguage,
): string {
	const findingSummary =
		keyFindings.length > 0
			? keyFindings[0]
			: reportLabels[researchLanguage].noFindingSummary;
	return reportLabels[researchLanguage].executiveSummaryBody(
		plan.goal,
		findingSummary,
	);
}

function buildMainBody(
	plan: ResearchPlan,
	keyFindings: string[],
	researchLanguage: ResearchLanguage,
): string {
	const labels = reportLabels[researchLanguage];
	const body = [
		labels.mainBodyGoal(plan.goal),
		"",
		`${labels.researchQuestions}:`,
		...plan.keyQuestions.map((question) => `- ${question}`),
	];

	if (keyFindings.length > 0) {
		body.push(
			"",
			`${labels.synthesis}:`,
			...keyFindings.map((finding) => `- ${finding}`),
		);
	}

	return body.join("\n");
}

function buildReportSections(
	plan: ResearchPlan,
	keyFindings: string[],
	researchLanguage: ResearchLanguage,
): ResearchReportSection[] {
	const sections = plan.reportShape
		.map((section) => normalizeSectionKind(section))
		.filter((section): section is ReportSectionKind => Boolean(section));

	if (sections.length > 0) {
		return sections.map((sectionKind) => ({
			heading: formatSectionHeading(sectionKind, researchLanguage),
			body: buildSectionBody(sectionKind, plan, keyFindings, researchLanguage),
		}));
	}

	return [
		{
			heading: reportLabels[researchLanguage].mainBody,
			body: buildMainBody(plan, keyFindings, researchLanguage),
		},
	];
}

function normalizeSectionKind(section: string): ReportSectionKind | null {
	const normalized = section
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.replace(/[^\p{L}]+/gu, " ")
		.trim();
	if (normalized === "methodology" || normalized === "modszertan") {
		return "methodology";
	}
	if (
		normalized === "comparison" ||
		normalized === "osszehasonlitas" ||
		normalized === "fo osszehasonlitas"
	) {
		return "comparison";
	}
	if (normalized === "recommendations" || normalized === "javaslatok") {
		return "recommendations";
	}
	return null;
}

function formatSectionHeading(
	sectionKind: ReportSectionKind,
	researchLanguage: ResearchLanguage,
): string {
	return reportLabels[researchLanguage][sectionKind];
}

function buildSectionBody(
	sectionKind: ReportSectionKind,
	plan: ResearchPlan,
	keyFindings: string[],
	researchLanguage: ResearchLanguage,
): string {
	const labels = reportLabels[researchLanguage];
	if (sectionKind === "methodology") {
		return [
			labels.methodologyScope(formatDepthLabel(plan.depth, researchLanguage)),
			`${labels.sourceReviewCeiling}: ${plan.researchBudget.sourceReviewCeiling}.`,
			`${labels.synthesisPassCeiling}: ${plan.researchBudget.synthesisPassCeiling}.`,
			"",
			`${labels.researchQuestions}:`,
			...plan.keyQuestions.map((question) => `- ${question}`),
		].join("\n");
	}

	if (sectionKind === "comparison") {
		return renderBullets(keyFindings, researchLanguage).join("\n");
	}

	if (sectionKind === "recommendations") {
		return [
			labels.recommendationsBody,
			...renderBullets(keyFindings, researchLanguage),
		].join("\n");
	}

	return buildMainBody(plan, keyFindings, researchLanguage);
}

function formatDepthLabel(
	depth: ResearchPlan["depth"],
	researchLanguage: ResearchLanguage,
): string {
	const labels: Record<
		ResearchLanguage,
		Record<ResearchPlan["depth"], string>
	> = {
		en: {
			focused: "Focused Deep Research",
			standard: "Standard Deep Research",
			max: "Max Deep Research",
		},
		hu: {
			focused: "Fókuszált mély kutatás",
			standard: "Standard mély kutatás",
			max: "Maximális mély kutatás",
		},
	};
	return labels[researchLanguage][depth];
}

function formatFindingWithCitations(
	finding: SynthesisFinding,
	citedSources: CitedResearchReportSource[],
): string {
	const citationNumbers = finding.sourceRefs
		.map((sourceRef) =>
			citedSources.find(
				(source) =>
					source.reviewedSourceId === sourceRef.reviewedSourceId ||
					source.id === sourceRef.discoveredSourceId,
			),
		)
		.filter((source): source is CitedResearchReportSource => Boolean(source))
		.map((source) => `[${source.citationNumber}]`);
	const citationSuffix =
		citationNumbers.length > 0 ? ` ${citationNumbers.join(" ")}` : "";
	return `${finding.statement}${citationSuffix}`;
}

function renderReportMarkdown(input: {
	title: string;
	executiveSummary: string;
	keyFindings: string[];
	sections: ResearchReportSection[];
	sources: CitedResearchReportSource[];
	limitations: string[];
	researchLanguage: ResearchLanguage;
}): string {
	const labels = reportLabels[input.researchLanguage];
	const lines = [
		`# ${input.title}`,
		"",
		`## ${labels.executiveSummary}`,
		input.executiveSummary,
		"",
		`## ${labels.keyFindings}`,
		...renderBullets(input.keyFindings, input.researchLanguage),
		"",
	];

	for (const section of input.sections) {
		lines.push(`## ${section.heading}`, section.body, "");
	}

	lines.push(
		`## ${labels.sources}`,
		...input.sources.map(
			(source) => `[${source.citationNumber}] ${source.title} - ${source.url}`,
		),
	);

	if (input.limitations.length > 0) {
		lines.push(
			"",
			`## ${labels.reportLimitations}`,
			...renderBullets(input.limitations, input.researchLanguage),
		);
	}

	return lines.join("\n");
}

function renderBullets(
	values: string[],
	researchLanguage: ResearchLanguage = "en",
): string[] {
	if (values.length === 0) {
		return [`- ${reportLabels[researchLanguage].emptyBullet}`];
	}

	return values.map((value) => `- ${value}`);
}

function normalizeText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}
