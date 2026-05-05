import type { ResearchPlan } from "./planning";
import type { SynthesisFinding, SynthesisNotes } from "./synthesis";

export type ResearchReportSourceStatus = "reviewed" | "cited";

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

export function writeResearchReport(
	input: WriteResearchReportInput,
): ResearchReportDraft {
	const citedSources = buildCitedSources(input.synthesisNotes, input.sources);
	const keyFindings = input.synthesisNotes.supportedFindings.map((finding) =>
		formatFindingWithCitations(finding, citedSources),
	);
	const executiveSummary = buildExecutiveSummary(input.plan, keyFindings);
	const sections = buildReportSections(input.plan, keyFindings);
	const limitations = [
		...input.synthesisNotes.reportLimitations.map(
			(limitation) => limitation.statement,
		),
		...(input.limitations ?? []),
	]
		.map(normalizeText)
		.filter(Boolean);
	const title = `Research Report: ${input.plan.goal}`;
	const markdown = renderReportMarkdown({
		title,
		executiveSummary,
		keyFindings,
		sections,
		sources: citedSources,
		limitations,
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
): string {
	const findingSummary =
		keyFindings.length > 0
			? keyFindings[0]
			: "The reviewed evidence did not produce a supported finding.";
	return `${plan.goal} ${findingSummary}`;
}

function buildMainBody(plan: ResearchPlan, keyFindings: string[]): string {
	const body = [
		`This report addresses the approved Research Plan goal: ${plan.goal}`,
		"",
		"Research questions:",
		...plan.keyQuestions.map((question) => `- ${question}`),
	];

	if (keyFindings.length > 0) {
		body.push(
			"",
			"Synthesis:",
			...keyFindings.map((finding) => `- ${finding}`),
		);
	}

	return body.join("\n");
}

function buildReportSections(
	plan: ResearchPlan,
	keyFindings: string[],
): ResearchReportSection[] {
	const sections = plan.reportShape
		.map((section) => normalizeSectionHeading(section))
		.filter((section): section is ResearchReportSection => Boolean(section));

	if (sections.length > 0) {
		return sections.map((section) => ({
			heading: section.heading,
			body: buildSectionBody(section.heading, plan, keyFindings),
		}));
	}

	return [
		{
			heading: "Main Body",
			body: buildMainBody(plan, keyFindings),
		},
	];
}

function normalizeSectionHeading(
	section: string,
): Pick<ResearchReportSection, "heading"> | null {
	const normalized = section
		.toLowerCase()
		.replace(/[^a-z]+/g, " ")
		.trim();
	if (normalized === "methodology") {
		return { heading: "Methodology" };
	}
	if (normalized === "comparison") {
		return { heading: "Comparison" };
	}
	if (normalized === "recommendations") {
		return { heading: "Recommendations" };
	}
	return null;
}

function buildSectionBody(
	heading: string,
	plan: ResearchPlan,
	keyFindings: string[],
): string {
	if (heading === "Methodology") {
		return [
			`Review scope followed the approved ${formatDepthLabel(plan.depth)} plan.`,
			`Source review ceiling: ${plan.researchBudget.sourceReviewCeiling}.`,
			`Synthesis pass ceiling: ${plan.researchBudget.synthesisPassCeiling}.`,
			"",
			"Research questions:",
			...plan.keyQuestions.map((question) => `- ${question}`),
		].join("\n");
	}

	if (heading === "Comparison") {
		return renderBullets(keyFindings).join("\n");
	}

	if (heading === "Recommendations") {
		return [
			"Use the supported findings above to choose next actions.",
			...renderBullets(keyFindings),
		].join("\n");
	}

	return buildMainBody(plan, keyFindings);
}

function formatDepthLabel(depth: ResearchPlan["depth"]): string {
	const labels: Record<ResearchPlan["depth"], string> = {
		focused: "Focused Deep Research",
		standard: "Standard Deep Research",
		max: "Max Deep Research",
	};
	return labels[depth];
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
}): string {
	const lines = [
		`# ${input.title}`,
		"",
		"## Executive Summary",
		input.executiveSummary,
		"",
		"## Key Findings",
		...renderBullets(input.keyFindings),
		"",
	];

	for (const section of input.sections) {
		lines.push(`## ${section.heading}`, section.body, "");
	}

	lines.push(
		"## Sources",
		...input.sources.map(
			(source) => `[${source.citationNumber}] ${source.title} - ${source.url}`,
		),
	);

	if (input.limitations.length > 0) {
		lines.push(
			"",
			"## Report Limitations",
			...renderBullets(input.limitations),
		);
	}

	return lines.join("\n");
}

function renderBullets(values: string[]): string[] {
	if (values.length === 0) {
		return ["- None."];
	}

	return values.map((value) => `- ${value}`);
}

function normalizeText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}
