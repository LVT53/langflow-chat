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

export type EvidenceLimitationMemoRecoveryActionKind =
	| "revise_plan"
	| "add_sources"
	| "choose_deeper_depth"
	| "targeted_follow_up";

export type EvidenceLimitationMemoRecoveryAction = {
	kind: EvidenceLimitationMemoRecoveryActionKind;
	label: string;
	description: string;
};

export type EvidenceLimitationMemoReviewedScope = {
	discoveredCount: number;
	reviewedCount: number;
	topicRelevantCount: number;
	rejectedOrOffTopicCount: number;
};

export type EvidenceLimitationMemoDraft = {
	jobId: string;
	title: string;
	reviewedScope: EvidenceLimitationMemoReviewedScope;
	limitations: string[];
	nextResearchDirection: string;
	recoveryActions: EvidenceLimitationMemoRecoveryAction[];
	markdown: string;
};

export type WriteResearchReportInput = {
	jobId: string;
	plan: ResearchPlan;
	synthesisNotes: SynthesisNotes;
	sources: ResearchReportSource[];
	limitations?: string[];
};

export type WriteEvidenceLimitationMemoInput = {
	jobId: string;
	plan: ResearchPlan;
	reviewedScope: EvidenceLimitationMemoReviewedScope;
	limitations: string[];
	nextResearchDirection?: string | null;
};

type ReportSectionKind = "methodology" | "comparison" | "recommendations";

export const MAX_REPORT_KEY_FINDINGS = 7;
const MAX_EXECUTIVE_SUMMARY_FINDINGS = 3;
const MAX_REPORT_TITLE_WORDS = 16;

const reportLabels: Record<
	ResearchLanguage,
	{
		titlePrefix: string;
		executiveSummary: string;
		keyFindings: string;
		analysis: string;
		sources: string;
		reportLimitations: string;
		methodology: string;
		comparison: string;
		recommendations: string;
		bottomLine: string;
		supportingEvidence: string;
		researchQuestions: string;
		synthesis: string;
		analysisIntro: string;
		comparisonIntro: string;
		recommendationsIntro: string;
		comparedEntities: string;
		comparisonAxes: string;
		evidenceBackedPoint: string;
		evidence: string;
		methodologyScope: (depthLabel: string) => string;
		sourceReviewCeiling: string;
		synthesisPassCeiling: string;
		recommendationsBody: string;
		noFindingSummary: string;
		executiveSummaryQuestion: (goal: string) => string;
		analysisGoal: (goal: string) => string;
		emptyBullet: string;
	}
> = {
	en: {
		titlePrefix: "Research Report",
		executiveSummary: "Executive Summary",
		keyFindings: "Key Findings",
		analysis: "Analysis",
		sources: "Sources",
		reportLimitations: "Report Limitations",
		methodology: "Methodology",
		comparison: "Comparison",
		recommendations: "Recommendations",
		bottomLine: "Bottom line",
		supportingEvidence: "Supporting evidence",
		researchQuestions: "Research questions",
		synthesis: "Synthesis",
		analysisIntro: "Evidence-backed answer",
		comparisonIntro: "At a glance",
		recommendationsIntro: "Decision implications",
		comparedEntities: "Compared entities",
		comparisonAxes: "Central comparison axes",
		evidenceBackedPoint: "Evidence-backed point",
		evidence: "Evidence",
		methodologyScope: (depthLabel) =>
			`Review scope followed the approved ${depthLabel} plan.`,
		sourceReviewCeiling: "Source review ceiling",
		synthesisPassCeiling: "Synthesis pass ceiling",
		recommendationsBody:
			"Use the supported findings above to choose next actions.",
		noFindingSummary:
			"The reviewed evidence did not produce a supported finding.",
		executiveSummaryQuestion: (goal) => `Question: ${goal}`,
		analysisGoal: (goal) =>
			`This report addresses the approved Research Plan goal: ${goal}`,
		emptyBullet: "None.",
	},
	hu: {
		titlePrefix: "Kutatási jelentés",
		executiveSummary: "Vezetői összefoglaló",
		keyFindings: "Fő megállapítások",
		analysis: "Elemzés",
		sources: "Források",
		reportLimitations: "Jelentési korlátok",
		methodology: "Módszertan",
		comparison: "Összehasonlítás",
		recommendations: "Javaslatok",
		bottomLine: "Rövid válasz",
		supportingEvidence: "Alátámasztó bizonyíték",
		researchQuestions: "Kutatási kérdések",
		synthesis: "Szintézis",
		analysisIntro: "Bizonyítékokra épülő válasz",
		comparisonIntro: "Gyors áttekintés",
		recommendationsIntro: "Döntési következmények",
		comparedEntities: "Összehasonlított entitások",
		comparisonAxes: "Központi összehasonlítási tengelyek",
		evidenceBackedPoint: "Bizonyítékkal alátámasztott pont",
		evidence: "Bizonyíték",
		methodologyScope: (depthLabel) =>
			`Az áttekintés hatóköre a jóváhagyott ${depthLabel} tervet követte.`,
		sourceReviewCeiling: "Forrás-áttekintési plafon",
		synthesisPassCeiling: "Szintézis kör plafonja",
		recommendationsBody:
			"A fenti alátámasztott megállapításokat használd a következő lépések kiválasztásához.",
		noFindingSummary:
			"Az áttekintett bizonyítékok nem eredményeztek alátámasztott megállapítást.",
		executiveSummaryQuestion: (goal) => `Kérdés: ${goal}`,
		analysisGoal: (goal) =>
			`Ez a jelentés a jóváhagyott Kutatási terv céljára válaszol: ${goal}`,
		emptyBullet: "Nincs.",
	},
};

const evidenceLimitationMemoLabels: Record<
	ResearchLanguage,
	{
		titlePrefix: string;
		reviewedScope: string;
		discoveredSources: string;
		reviewedSources: string;
		topicRelevantReviewedSources: string;
		rejectedOrOffTopicSources: string;
		groundedLimitationReasons: string;
		nextResearchDirection: string;
		recoveryActions: string;
		defaultNextResearchDirection: string;
		emptyLimitation: string;
		actions: Record<
			EvidenceLimitationMemoRecoveryActionKind,
			{ label: string; description: string }
		>;
	}
> = {
	en: {
		titlePrefix: "Evidence Limitation Memo",
		reviewedScope: "Reviewed Scope",
		discoveredSources: "Discovered sources",
		reviewedSources: "Reviewed sources",
		topicRelevantReviewedSources: "Topic-relevant reviewed sources",
		rejectedOrOffTopicSources: "Rejected or off-topic sources",
		groundedLimitationReasons: "Grounded Limitation Reasons",
		nextResearchDirection: "Next Research Direction",
		recoveryActions: "Memo Recovery Actions",
		defaultNextResearchDirection:
			"Revise the Research Plan or add more topic-relevant sources before requesting a report.",
		emptyLimitation:
			"The reviewed workspace did not contain enough topic-relevant evidence to support a credible Research Report.",
		actions: {
			revise_plan: {
				label: "Revise plan",
				description:
					"Clarify the approved question or scope before running source-heavy research again.",
			},
			add_sources: {
				label: "Add sources",
				description:
					"Attach or include stronger primary sources for the approved topic.",
			},
			choose_deeper_depth: {
				label: "Choose deeper depth",
				description:
					"Start a new run at a deeper depth only after choosing that depth explicitly.",
			},
			targeted_follow_up: {
				label: "Targeted follow-up",
				description:
					"Run focused follow-up research against the limitation or missing key question.",
			},
		},
	},
	hu: {
		titlePrefix: "Bizonyítékkorlát-memó",
		reviewedScope: "Áttekintett hatókör",
		discoveredSources: "Felfedezett források",
		reviewedSources: "Áttekintett források",
		topicRelevantReviewedSources: "Témához illeszkedő áttekintett források",
		rejectedOrOffTopicSources: "Elutasított vagy témán kívüli források",
		groundedLimitationReasons: "Megalapozott korlátozási okok",
		nextResearchDirection: "Következő kutatási irány",
		recoveryActions: "Memó helyreállítási műveletek",
		defaultNextResearchDirection:
			"Módosítsd a kutatási tervet, vagy adj hozzá több témához illeszkedő forrást, mielőtt jelentést kérsz.",
		emptyLimitation:
			"Az áttekintett munkaterület nem tartalmazott elég témához illeszkedő bizonyítékot egy hiteles kutatási jelentéshez.",
		actions: {
			revise_plan: {
				label: "Terv módosítása",
				description:
					"Pontosítsd a jóváhagyott kérdést vagy hatókört, mielőtt újra forrásigényes kutatás indul.",
			},
			add_sources: {
				label: "Források hozzáadása",
				description:
					"Csatolj vagy jelölj ki erősebb elsődleges forrásokat a jóváhagyott témához.",
			},
			choose_deeper_depth: {
				label: "Mélyebb szint választása",
				description:
					"Csak akkor induljon mélyebb új futás, ha ezt külön kiválasztod.",
			},
			targeted_follow_up: {
				label: "Célzott utánkutatás",
				description:
					"Indíts fókuszált utánkutatást a korlátra vagy a hiányzó kulcskérdésre.",
			},
		},
	},
};

export function writeResearchReport(
	input: WriteResearchReportInput,
): ResearchReportDraft {
	const researchLanguage = input.plan.researchLanguage ?? "en";
	const citedSources = buildCitedSources(input.synthesisNotes, input.sources);
	const visibleFindings = selectResearchReportFindings(input.synthesisNotes);
	const keyFindings = visibleFindings.map((finding) =>
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
	const title = buildReportTitle(input.plan.goal, researchLanguage);
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

export function writeEvidenceLimitationMemo(
	input: WriteEvidenceLimitationMemoInput,
): EvidenceLimitationMemoDraft {
	const researchLanguage = input.plan.researchLanguage ?? "en";
	const labels = evidenceLimitationMemoLabels[researchLanguage];
	const title = `${labels.titlePrefix}: ${shortenTitleSubject(input.plan.goal)}`;
	const limitations = input.limitations.map(normalizeText).filter(Boolean);
	const visibleLimitations =
		limitations.length > 0 ? limitations : [labels.emptyLimitation];
	const nextResearchDirection =
		normalizeText(input.nextResearchDirection ?? "") ||
		labels.defaultNextResearchDirection;
	const recoveryActions = buildEvidenceLimitationMemoRecoveryActions(
		researchLanguage,
	);
	const markdown = renderEvidenceLimitationMemoMarkdown({
		title,
		reviewedScope: input.reviewedScope,
		limitations: visibleLimitations,
		nextResearchDirection,
		recoveryActions,
		researchLanguage,
	});

	return {
		jobId: input.jobId,
		title,
		reviewedScope: input.reviewedScope,
		limitations: visibleLimitations,
		nextResearchDirection,
		recoveryActions,
		markdown,
	};
}

export function selectResearchReportFindings(
	synthesisNotes: SynthesisNotes,
): SynthesisFinding[] {
	const seen = new Set<string>();
	const findings: SynthesisFinding[] = [];

	for (const finding of synthesisNotes.supportedFindings) {
		const statement = normalizeText(finding.statement);
		if (!statement || finding.sourceRefs.length === 0) {
			continue;
		}
		const key = statement.toLowerCase();
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		findings.push({ ...finding, statement });
		if (findings.length >= MAX_REPORT_KEY_FINDINGS) {
			break;
		}
	}

	return findings;
}

function buildEvidenceLimitationMemoRecoveryActions(
	researchLanguage: ResearchLanguage,
): EvidenceLimitationMemoRecoveryAction[] {
	const labels = evidenceLimitationMemoLabels[researchLanguage].actions;
	return (
		[
			"revise_plan",
			"add_sources",
			"choose_deeper_depth",
			"targeted_follow_up",
		] satisfies EvidenceLimitationMemoRecoveryActionKind[]
	).map((kind) => ({
		kind,
		label: labels[kind].label,
		description: labels[kind].description,
	}));
}

function renderEvidenceLimitationMemoMarkdown(input: {
	title: string;
	reviewedScope: EvidenceLimitationMemoReviewedScope;
	limitations: string[];
	nextResearchDirection: string;
	recoveryActions: EvidenceLimitationMemoRecoveryAction[];
	researchLanguage: ResearchLanguage;
}): string {
	const labels = evidenceLimitationMemoLabels[input.researchLanguage];
	return [
		`# ${input.title}`,
		"",
		`## ${labels.reviewedScope}`,
		`- ${labels.discoveredSources}: ${input.reviewedScope.discoveredCount}`,
		`- ${labels.reviewedSources}: ${input.reviewedScope.reviewedCount}`,
		`- ${labels.topicRelevantReviewedSources}: ${input.reviewedScope.topicRelevantCount}`,
		`- ${labels.rejectedOrOffTopicSources}: ${input.reviewedScope.rejectedOrOffTopicCount}`,
		"",
		`## ${labels.groundedLimitationReasons}`,
		...input.limitations.map((limitation) => `- ${limitation}`),
		"",
		`## ${labels.nextResearchDirection}`,
		input.nextResearchDirection,
		"",
		`## ${labels.recoveryActions}`,
		...input.recoveryActions.map(
			(action) => `- **${action.label}**: ${action.description}`,
		),
	].join("\n");
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
	const labels = reportLabels[researchLanguage];
	const findingSummary =
		keyFindings.length > 0 ? keyFindings[0] : labels.noFindingSummary;
	const lines = [
		labels.executiveSummaryQuestion(plan.goal),
		`${labels.bottomLine}: ${findingSummary}`,
	];
	const supportingFindings = keyFindings.slice(
		1,
		MAX_EXECUTIVE_SUMMARY_FINDINGS,
	);
	if (supportingFindings.length > 0) {
		lines.push(`${labels.supportingEvidence}: ${supportingFindings.join(" ")}`);
	}
	return lines.join("\n");
}

function buildMainBody(
	plan: ResearchPlan,
	keyFindings: string[],
	researchLanguage: ResearchLanguage,
): string {
	const labels = reportLabels[researchLanguage];
	const body = [
		labels.analysisGoal(plan.goal),
		"",
		`${labels.researchQuestions}:`,
		...plan.keyQuestions.map((question) => `- ${question}`),
	];

	if (keyFindings.length > 0) {
		body.push(
			"",
			`${labels.analysisIntro}:`,
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
		const dedupedSections = uniqueValues<ReportSectionKind>([
			"methodology",
			...sections,
		]);
		return dedupedSections.map((sectionKind) => ({
			heading: formatSectionHeading(sectionKind, researchLanguage),
			body: buildSectionBody(sectionKind, plan, keyFindings, researchLanguage),
		}));
	}

	return [
		{
			heading: reportLabels[researchLanguage].methodology,
			body: buildSectionBody(
				"methodology",
				plan,
				keyFindings,
				researchLanguage,
			),
		},
		{
			heading: reportLabels[researchLanguage].analysis,
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
		normalized === "main comparison" ||
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
		return renderComparisonTable(plan, keyFindings, researchLanguage);
	}

	if (sectionKind === "recommendations") {
		return [
			labels.recommendationsBody,
			...renderBullets(keyFindings, researchLanguage),
		].join("\n");
	}

	return buildMainBody(plan, keyFindings, researchLanguage);
}

function renderComparisonTable(
	plan: ResearchPlan,
	keyFindings: string[],
	researchLanguage: ResearchLanguage,
): string {
	const labels = reportLabels[researchLanguage];
	const comparisonScope = buildComparisonScopeLines(plan, researchLanguage);
	if (keyFindings.length === 0) {
		return [...comparisonScope, ...renderBullets(keyFindings, researchLanguage)].join(
			"\n",
		);
	}

	return [
		labels.comparisonIntro,
		...comparisonScope,
		"",
		`| # | ${labels.evidenceBackedPoint} |`,
		"| --- | --- |",
		...keyFindings.map(
			(finding, index) =>
				`| ${index + 1} | ${escapeMarkdownTableCell(finding)} |`,
		),
	].join("\n");
}

function buildComparisonScopeLines(
	plan: ResearchPlan,
	researchLanguage: ResearchLanguage,
): string[] {
	const labels = reportLabels[researchLanguage];
	const lines: string[] = [];
	if (plan.comparedEntities?.length) {
		lines.push(`${labels.comparedEntities}: ${plan.comparedEntities.join("; ")}`);
	}
	if (plan.comparisonAxes?.length) {
		lines.push(`${labels.comparisonAxes}: ${plan.comparisonAxes.join("; ")}`);
	}
	return lines;
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

	if (input.limitations.length > 0) {
		lines.push(
			`## ${labels.reportLimitations}`,
			...renderBullets(input.limitations, input.researchLanguage),
			"",
		);
	}

	lines.push(
		`## ${labels.sources}`,
		...input.sources.map(
			(source) => `[${source.citationNumber}] ${source.title} - ${source.url}`,
		),
	);

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

function buildReportTitle(
	goal: string,
	researchLanguage: ResearchLanguage,
): string {
	return `${reportLabels[researchLanguage].titlePrefix}: ${shortenTitleSubject(goal)}`;
}

function shortenTitleSubject(value: string): string {
	const normalized = normalizeText(value)
		.replace(/^["'`]+|["'`.?!:;]+$/g, "")
		.trim();
	const words = normalized.split(/\s+/).filter(Boolean);
	if (words.length <= MAX_REPORT_TITLE_WORDS) {
		return normalized;
	}
	return words.slice(0, MAX_REPORT_TITLE_WORDS).join(" ");
}

function uniqueValues<T>(values: T[]): T[] {
	return [...new Set(values)];
}

function escapeMarkdownTableCell(value: string): string {
	return value.replace(/\|/g, "\\|").replace(/\n+/g, " ");
}
