import type {
	DeepResearchEvidenceNote,
	DeepResearchSourceStatus,
	DeepResearchSynthesisClaim,
} from "$lib/types";
import type { ResearchLanguage, ResearchPlan } from "./planning";
import { buildDefaultResearchSourceLedger } from "./sources";
import type { SynthesisFinding, SynthesisNotes } from "./synthesis";

export type ResearchReportSourceStatus = DeepResearchSourceStatus;

export type ResearchReportSource = {
	id: string;
	reviewedSourceId?: string | null;
	status: ResearchReportSourceStatus;
	title: string;
	url: string;
	faviconUrl?: string | null;
	citationNote?: string | null;
	reviewedNote?: string | null;
	rejectedReason?: string | null;
	topicRelevant?: boolean | null;
	topicRelevanceReason?: string | null;
	reviewedAt?: string | null;
	citedAt?: string | null;
};

export type CitedResearchReportSource = ResearchReportSource & {
	citationNumber: number;
};

export type ResearchReportSection = {
	heading: string;
	body: string;
};

export type StructuredResearchReportReference = {
	claimIds: string[];
	evidenceLinkIds: string[];
	sourceIds: string[];
};

export type StructuredResearchReportTextBlock =
	StructuredResearchReportReference & {
		text: string;
	};

export type StructuredResearchReportCore = {
	title: string;
	scope: string;
	executiveSummary: StructuredResearchReportTextBlock;
	keyFindings: StructuredResearchReportTextBlock[];
	methodologySourceBasis: string;
	limitations: StructuredResearchReportTextBlock[];
	sourceLedgerSnapshot: string;
};

export type StructuredResearchReportSection =
	StructuredResearchReportReference & {
		heading: string;
		body: string;
		citationBlocks?: StructuredResearchReportTextBlock[];
	};

export type StructuredResearchReportBlockKind =
	| "summary"
	| "findings"
	| "section"
	| "limitations"
	| "appendix";

export type StructuredResearchReportBlock =
	StructuredResearchReportReference & {
		kind: StructuredResearchReportBlockKind;
		heading: string;
		markdown: string;
	};

export type StructuredResearchReport = {
	intent: ResearchPlan["reportIntent"];
	core: StructuredResearchReportCore;
	sections: StructuredResearchReportSection[];
};

export type ResearchReportDraft = {
	jobId: string;
	title: string;
	executiveSummary: string;
	keyFindings: string[];
	sections: ResearchReportSection[];
	sources: CitedResearchReportSource[];
	limitations: string[];
	structuredReport: StructuredResearchReport;
	reportBlocks: StructuredResearchReportBlock[];
	sourceLedgerSnapshotSources: ResearchReportSource[];
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
	sourceLedgerSnapshot: string;
	sourceLedgerSnapshotSources: ResearchReportSource[];
	markdown: string;
};

export type WriteResearchReportInput = {
	jobId: string;
	plan: ResearchPlan;
	synthesisNotes: SynthesisNotes;
	synthesisClaims?: DeepResearchSynthesisClaim[];
	evidenceNotes?: DeepResearchEvidenceNote[];
	sources: ResearchReportSource[];
	limitations?: string[];
};

export type WriteEvidenceLimitationMemoInput = {
	jobId: string;
	plan: ResearchPlan;
	reviewedScope: EvidenceLimitationMemoReviewedScope;
	limitations: string[];
	nextResearchDirection?: string | null;
	sources?: ResearchReportSource[];
};

type ReportSectionKind = "methodology" | "comparison" | "recommendations";
type EvidenceConfidenceCueKind =
	| "official_spec"
	| "vendor_claim"
	| "dated_price"
	| "owner_report";
type EvidenceLimitationMemoReasonGroup =
	| "source_coverage"
	| "evidence_quality"
	| "scope_fit"
	| "other";

type ComparisonEvidenceCell = {
	text: string;
	cue: EvidenceConfidenceCueKind | null;
};

export const MAX_REPORT_KEY_FINDINGS = 7;
const MAX_EXECUTIVE_SUMMARY_FINDINGS = 3;
const MAX_REPORT_TITLE_WORDS = 16;
const MAX_EVIDENCE_LIMITATION_MEMO_REASONS = 5;

const reportLabels: Record<
	ResearchLanguage,
	{
		titlePrefix: string;
		executiveSummary: string;
		keyFindings: string;
		analysis: string;
		sources: string;
		sourceLedgerSnapshot: string;
		reportLimitations: string;
		citedSources: string;
		topicRelevantReviewedSources: string;
		rejectedOrOffTopicReviewedSources: string;
		methodology: string;
		methodologySourceBasis: string;
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
		answer: string;
		appendix: (heading: string) => string;
		analysisGoal: (goal: string) => string;
		emptyBullet: string;
		notEstablished: string;
		decisionMeaning: string;
		confidenceCues: string;
		confidenceCueDescriptions: Record<EvidenceConfidenceCueKind, string>;
		decisionMeaningBody: (axis: string, filledCellCount: number) => string;
	}
> = {
	en: {
		titlePrefix: "Research Report",
		executiveSummary: "Executive Summary",
		keyFindings: "Key Findings",
		analysis: "Analysis",
		sources: "Sources",
		sourceLedgerSnapshot: "Source Ledger Snapshot",
		reportLimitations: "Report Limitations",
		citedSources: "Cited Sources",
		topicRelevantReviewedSources: "Topic-relevant Reviewed Sources",
		rejectedOrOffTopicReviewedSources: "Rejected/Off-topic Reviewed Sources",
		methodology: "Methodology",
		methodologySourceBasis: "Methodology / Source Basis",
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
		answer: "Answer",
		appendix: (heading) => `Appendix: ${heading}`,
		analysisGoal: (goal) =>
			`This report addresses the approved Research Plan goal: ${goal}`,
		emptyBullet: "None.",
		notEstablished: "Not established",
		decisionMeaning: "Decision Meaning",
		confidenceCues: "Confidence cues",
		confidenceCueDescriptions: {
			official_spec: "**Official spec** = primary official specifications",
			vendor_claim: "**Vendor claim** = vendor or affiliated claim",
			dated_price: "**Dated price** = price or availability may have changed",
			owner_report: "**Owner report** = user-reported experience",
		},
		decisionMeaningBody: (axis, filledCellCount) =>
			filledCellCount > 1
				? `${axis}: compare the supported differences directly, then weigh source confidence before choosing.`
				: `${axis}: evidence is incomplete, so treat this row as a caveat rather than a deciding advantage.`,
	},
	hu: {
		titlePrefix: "Kutatási jelentés",
		executiveSummary: "Vezetői összefoglaló",
		keyFindings: "Fő megállapítások",
		analysis: "Elemzés",
		sources: "Források",
		sourceLedgerSnapshot: "Forrásnapló pillanatkép",
		reportLimitations: "Jelentési korlátok",
		citedSources: "Idézett források",
		topicRelevantReviewedSources: "Témához illeszkedő áttekintett források",
		rejectedOrOffTopicReviewedSources:
			"Elutasított/témán kívüli áttekintett források",
		methodology: "Módszertan",
		methodologySourceBasis: "Módszertan / forrásalap",
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
		answer: "Válasz",
		appendix: (heading) => `Függelék: ${heading}`,
		analysisGoal: (goal) =>
			`Ez a jelentés a jóváhagyott Kutatási terv céljára válaszol: ${goal}`,
		emptyBullet: "Nincs.",
		notEstablished: "Nincs megállapítva",
		decisionMeaning: "Döntési jelentés",
		confidenceCues: "Bizalmi jelzések",
		confidenceCueDescriptions: {
			official_spec:
				"**Hivatalos specifikáció** = elsődleges hivatalos specifikáció",
			vendor_claim: "**Gyártói állítás** = gyártói vagy kapcsolt állítás",
			dated_price:
				"**Dátumhoz kötött ár** = az ár vagy elérhetőség változhatott",
			owner_report:
				"**Tulajdonosi beszámoló** = felhasználói tapasztalati jelzés",
		},
		decisionMeaningBody: (axis, filledCellCount) =>
			filledCellCount > 1
				? `${axis}: hasonlítsd össze közvetlenül az alátámasztott különbségeket, majd mérlegeld a forrásbizalmat.`
				: `${axis}: a bizonyíték hiányos, ezért ezt a sort inkább korlátként kezeld, ne döntő előnyként.`,
	},
};

const reportIntentSectionHeadings: Record<
	ResearchLanguage,
	Record<ResearchPlan["reportIntent"], string[]>
> = {
	en: {
		comparison: ["Comparison Matrix", "Decision Implications"],
		recommendation: [
			"Recommendation",
			"Ranked Options",
			"Criteria Rubric",
			"Fit/Risk Table",
			"Next Actions",
		],
		investigation: [
			"Timeline / Causal Map",
			"Competing Explanations",
			"Confidence And Open Questions",
		],
		market_scan: [
			"Shortlist",
			"Evaluation Rubric",
			"Freshness / Pricing / Availability",
			"Watchouts",
		],
		product_scan: [
			"Shortlist",
			"Evaluation Rubric",
			"Freshness / Pricing / Availability",
			"Watchouts",
		],
		limitation_focused: [
			"Evidence Strength",
			"Consensus And Conflict",
			"Strength-Tied Limitations",
		],
	},
	hu: {
		comparison: ["Összehasonlító mátrix", "Döntési következmények"],
		recommendation: [
			"Ajánlás",
			"Rangsorolt opciók",
			"Értékelési rubrika",
			"Illeszkedés/kockázat tábla",
			"Következő lépések",
		],
		investigation: [
			"Idővonal / oksági térkép",
			"Versengő magyarázatok",
			"Bizonyosság és nyitott kérdések",
		],
		market_scan: [
			"Rövidlista",
			"Értékelési rubrika",
			"Frissesség / ár / elérhetőség",
			"Figyelmeztetések",
		],
		product_scan: [
			"Rövidlista",
			"Értékelési rubrika",
			"Frissesség / ár / elérhetőség",
			"Figyelmeztetések",
		],
		limitation_focused: [
			"Bizonyíték erőssége",
			"Konszenzus és konfliktus",
			"Erősséghez kötött korlátok",
		],
	},
};

const evidenceLimitationMemoLabels: Record<
	ResearchLanguage,
	{
		titlePrefix: string;
		reviewedScope: string;
		scopeItem: string;
		count: string;
		discoveredSources: string;
		reviewedSources: string;
		topicRelevantReviewedSources: string;
		rejectedOrOffTopicSources: string;
		groundedLimitationReasons: string;
		limitationReasonGroups: Record<EvidenceLimitationMemoReasonGroup, string>;
		additionalLimitationReasons: (count: number) => string;
		nextResearchDirection: string;
		recoveryActions: string;
		sourceLedgerDetailAppendix: string;
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
		scopeItem: "Scope item",
		count: "Count",
		discoveredSources: "Discovered sources",
		reviewedSources: "Reviewed sources",
		topicRelevantReviewedSources: "Topic-relevant reviewed sources",
		rejectedOrOffTopicSources: "Rejected or off-topic sources",
		groundedLimitationReasons: "Grounded Limitation Reasons",
		limitationReasonGroups: {
			source_coverage: "Source coverage",
			evidence_quality: "Evidence quality",
			scope_fit: "Scope fit",
			other: "Other grounded reasons",
		},
		additionalLimitationReasons: (count) =>
			`${count} more grounded reasons are retained in the memo metadata and source detail.`,
		nextResearchDirection: "Next Research Direction",
		recoveryActions: "Recovery Actions",
		sourceLedgerDetailAppendix: "Appendix: Source Ledger Detail",
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
		scopeItem: "Hatóköri elem",
		count: "Darab",
		discoveredSources: "Felfedezett források",
		reviewedSources: "Áttekintett források",
		topicRelevantReviewedSources: "Témához illeszkedő áttekintett források",
		rejectedOrOffTopicSources: "Elutasított vagy témán kívüli források",
		groundedLimitationReasons: "Megalapozott korlátozási okok",
		limitationReasonGroups: {
			source_coverage: "Forráslefedettség",
			evidence_quality: "Bizonyítékminőség",
			scope_fit: "Hatóköri illeszkedés",
			other: "Egyéb megalapozott okok",
		},
		additionalLimitationReasons: (count) =>
			`${count} további megalapozott ok megmarad a memó metaadataiban és a forrásrészletekben.`,
		nextResearchDirection: "Következő kutatási irány",
		recoveryActions: "Memó helyreállítási műveletek",
		sourceLedgerDetailAppendix: "Függelék: Forrásnapló részletei",
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
	const useVerifiedClaims = hasVerifiedClaimInput(input);
	const limitations = [
		...input.synthesisNotes.reportLimitations.map(
			(limitation) => limitation.statement,
		),
		...(input.limitations ?? []),
	]
		.map(normalizeText)
		.filter(Boolean);
	const title = buildReportTitle(input.plan.goal, researchLanguage);
	const structuredReport = buildStructuredResearchReport({
		...input,
		title,
		researchLanguage,
	});
	const sourceLedgerSnapshotSources = selectSourceLedgerSnapshotSources(
		input.sources,
	);
	validateStructuredResearchReport(structuredReport);
	const citedSources = useVerifiedClaims
		? buildCitedSourcesFromStructuredReport(structuredReport, input.sources)
		: buildCitedSources(input.synthesisNotes, input.sources);
	const keyFindings = useVerifiedClaims
		? structuredReport.core.keyFindings.map((finding) =>
				formatStructuredTextBlockWithCitations(finding, citedSources),
			)
		: selectResearchReportFindings(input.synthesisNotes).map((finding) =>
				formatFindingWithCitations(finding, citedSources),
			);
	assertReadableReportFindings(keyFindings, citedSources);
	const executiveSummary = useVerifiedClaims
		? formatStructuredTextBlockWithCitations(
				structuredReport.core.executiveSummary,
				citedSources,
			)
		: buildExecutiveSummary(input.plan, keyFindings, researchLanguage);
	const sections = useVerifiedClaims
		? buildStructuredReportSectionsForMarkdown(structuredReport, citedSources)
		: buildReportSections(input.plan, keyFindings, researchLanguage);
	const renderedLimitations = useVerifiedClaims
		? structuredReport.core.limitations.map((limitation) =>
				formatStructuredTextBlockWithCitations(limitation, citedSources),
			)
		: limitations;
	const reportBlocks = buildResearchReportBlocks({
		executiveSummary,
		keyFindings,
		sections,
		sources: citedSources,
		limitations: renderedLimitations,
		sourceLedgerSnapshot: structuredReport.core.sourceLedgerSnapshot,
		structuredReport,
		researchLanguage,
		useAnswerFirstLayout: useVerifiedClaims,
	});
	const markdown = renderReportMarkdownFromBlocks(title, reportBlocks);

	return {
		jobId: input.jobId,
		title,
		executiveSummary,
		keyFindings,
		sections,
		sources: citedSources,
		limitations: renderedLimitations,
		structuredReport,
		reportBlocks,
		sourceLedgerSnapshotSources,
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
	const recoveryActions =
		buildEvidenceLimitationMemoRecoveryActions(researchLanguage);
	const sourceLedgerSnapshot = buildSourceLedgerSnapshot(
		input.sources ?? [],
		researchLanguage,
	);
	const sourceLedgerSnapshotSources = selectSourceLedgerSnapshotSources(
		input.sources ?? [],
	);
	const markdown = renderEvidenceLimitationMemoMarkdown({
		title,
		reviewedScope: input.reviewedScope,
		limitations: visibleLimitations,
		nextResearchDirection,
		recoveryActions,
		sourceLedgerSnapshot,
		researchLanguage,
	});

	return {
		jobId: input.jobId,
		title,
		reviewedScope: input.reviewedScope,
		limitations: visibleLimitations,
		nextResearchDirection,
		recoveryActions,
		sourceLedgerSnapshot,
		sourceLedgerSnapshotSources,
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

function buildStructuredResearchReport(
	input: WriteResearchReportInput & {
		title: string;
		researchLanguage: ResearchLanguage;
	},
): StructuredResearchReport {
	if (hasVerifiedClaimInput(input)) {
		return buildStructuredResearchReportFromClaims(input);
	}

	const citedSources = buildCitedSources(input.synthesisNotes, input.sources);
	const keyFindings = selectResearchReportFindings(input.synthesisNotes).map(
		(finding) => ({
			text: formatFindingWithCitations(finding, citedSources),
			claimIds: [],
			evidenceLinkIds: [],
			sourceIds: uniqueValues(
				finding.sourceRefs.flatMap((sourceRef) => [
					sourceRef.discoveredSourceId,
					sourceRef.reviewedSourceId,
				]),
			),
		}),
	);
	const executiveSummaryText = buildExecutiveSummary(
		input.plan,
		keyFindings.map((finding) => finding.text),
		input.researchLanguage,
	);
	return {
		intent: input.plan.reportIntent,
		core: {
			title: input.title,
			scope: buildReportScope(input.plan),
			executiveSummary: {
				text: executiveSummaryText,
				claimIds: keyFindings.flatMap((finding) => finding.claimIds),
				evidenceLinkIds: keyFindings.flatMap(
					(finding) => finding.evidenceLinkIds,
				),
				sourceIds: uniqueValues(
					keyFindings.flatMap((finding) => finding.sourceIds),
				),
			},
			keyFindings,
			methodologySourceBasis: buildMethodologySourceBasis(
				input.plan,
				input.researchLanguage,
			),
			limitations: buildStructuredLimitationsFromText(input),
			sourceLedgerSnapshot: buildSourceLedgerSnapshot(
				input.sources,
				input.researchLanguage,
			),
		},
		sections: buildReportSections(
			input.plan,
			keyFindings.map((finding) => finding.text),
			input.researchLanguage,
		).map((section) => ({
			heading: section.heading,
			body: section.body,
			claimIds: [],
			evidenceLinkIds: [],
			sourceIds: [],
		})),
	};
}

function hasVerifiedClaimInput(input: WriteResearchReportInput): boolean {
	return Boolean(
		input.synthesisClaims?.some(
			(claim) => claim.status === "accepted" || claim.status === "limited",
		) && input.evidenceNotes,
	);
}

function buildStructuredResearchReportFromClaims(
	input: WriteResearchReportInput & {
		title: string;
		researchLanguage: ResearchLanguage;
	},
): StructuredResearchReport {
	const evidenceById = new Map(
		(input.evidenceNotes ?? []).map((note) => [note.id, note]),
	);
	const allClaimBlocks = dedupeStructuredTextBlocks(
		(input.synthesisClaims ?? [])
			.filter(
				(claim) => claim.status === "accepted" || claim.status === "limited",
			)
			.map((claim) => buildStructuredTextBlockFromClaim(claim, evidenceById))
			.filter((block): block is StructuredResearchReportTextBlock =>
				Boolean(block),
			),
	);
	const claimBlocks = allClaimBlocks.slice(0, MAX_REPORT_KEY_FINDINGS);
	const sectionCitationCandidates = dedupeStructuredTextBlocks([
		...allClaimBlocks,
		...buildEvidenceNoteCitationBlocks(input),
	]);
	const limitations = [
		...claimBlocks
			.filter((block) => {
				const claim = input.synthesisClaims?.find((item) =>
					block.claimIds.includes(item.id),
				);
				return claim?.status === "limited";
			})
			.map((block) => {
				const claim = input.synthesisClaims?.find((item) =>
					block.claimIds.includes(item.id),
				);
				return {
					...block,
					text:
						normalizeText(claim?.statusReason ?? "") ||
						`Limited claim: ${block.text}`,
				};
			}),
		...buildStructuredLimitationsFromText(input),
	];
	const executiveSummary = claimBlocks[0] ?? {
		text: reportLabels[input.researchLanguage].noFindingSummary,
		claimIds: [],
		evidenceLinkIds: [],
		sourceIds: [],
	};
	return {
		intent: input.plan.reportIntent,
		core: {
			title: input.title,
			scope: buildReportScope(input.plan),
			executiveSummary,
			keyFindings: claimBlocks,
			methodologySourceBasis: buildMethodologySourceBasis(
				input.plan,
				input.researchLanguage,
			),
			limitations,
			sourceLedgerSnapshot: buildSourceLedgerSnapshot(
				input.sources,
				input.researchLanguage,
			),
		},
		sections: buildStructuredSectionsFromClaims(
			input.plan,
			claimBlocks,
			input.researchLanguage,
			input,
			sectionCitationCandidates,
		),
	};
}

function dedupeStructuredTextBlocks(
	blocks: StructuredResearchReportTextBlock[],
): StructuredResearchReportTextBlock[] {
	return blocks.reduce<StructuredResearchReportTextBlock[]>(
		(deduped, block) => {
			const duplicate = deduped.find(
				(item) =>
					normalizeFindingForReadabilityCheck(item.text) ===
					normalizeFindingForReadabilityCheck(block.text),
			);
			if (!duplicate) {
				deduped.push({ ...block });
				return deduped;
			}
			duplicate.claimIds = uniqueValues([
				...duplicate.claimIds,
				...block.claimIds,
			]);
			duplicate.evidenceLinkIds = uniqueValues([
				...duplicate.evidenceLinkIds,
				...block.evidenceLinkIds,
			]);
			duplicate.sourceIds = uniqueValues([
				...duplicate.sourceIds,
				...block.sourceIds,
			]);
			return deduped;
		},
		[],
	);
}

function buildEvidenceNoteCitationBlocks(
	input: WriteResearchReportInput,
): StructuredResearchReportTextBlock[] {
	const acceptedClaims = (input.synthesisClaims ?? []).filter(
		(claim) => claim.status === "accepted" || claim.status === "limited",
	);
	return (input.evidenceNotes ?? [])
		.map((note) => {
			const supportingLinks = acceptedClaims.flatMap((claim) =>
				claim.evidenceLinks
					.filter(
						(link) =>
							link.evidenceNoteId === note.id &&
							["support", "qualification"].includes(link.relation),
					)
					.map((link) => ({ claim, link })),
			);
			const sourceIds = sourceIdsFromEvidenceNote(note);
			const text = normalizeText(note.findingText);
			if (!text || sourceIds.length === 0) return null;
			return {
				text,
				claimIds: uniqueValues(supportingLinks.map(({ claim }) => claim.id)),
				evidenceLinkIds: uniqueValues(
					supportingLinks.map(({ link }) => link.id),
				),
				sourceIds,
			};
		})
		.filter((block): block is StructuredResearchReportTextBlock =>
			Boolean(block),
		);
}

function buildStructuredTextBlockFromClaim(
	claim: DeepResearchSynthesisClaim,
	evidenceById: Map<string, DeepResearchEvidenceNote>,
): StructuredResearchReportTextBlock | null {
	const usefulLinks = claim.evidenceLinks.filter((link) =>
		["support", "qualification"].includes(link.relation),
	);
	if (usefulLinks.length === 0) return null;
	const sourceIds = uniqueValues(
		usefulLinks.flatMap((link) => {
			const evidence = evidenceById.get(link.evidenceNoteId);
			return evidence ? sourceIdsFromEvidenceNote(evidence) : [];
		}),
	);
	if (sourceIds.length === 0) return null;
	const text = normalizeText(claim.statement);
	if (!text) return null;
	return {
		text,
		claimIds: [claim.id],
		evidenceLinkIds: usefulLinks.map((link) => link.id),
		sourceIds,
	};
}

function sourceIdsFromEvidenceNote(note: DeepResearchEvidenceNote): string[] {
	return uniqueValues(
		[
			note.sourceId,
			note.sourceSupport.sourceId,
			note.sourceSupport.reviewedSourceId,
			...(Array.isArray(note.sourceSupport.sourceIds)
				? note.sourceSupport.sourceIds
				: []),
		].filter((value): value is string => typeof value === "string" && value),
	);
}

function buildStructuredLimitationsFromText(
	input: WriteResearchReportInput,
): StructuredResearchReportTextBlock[] {
	return [
		...input.synthesisNotes.reportLimitations.map(
			(limitation) => limitation.statement,
		),
		...(input.limitations ?? []),
	]
		.map(normalizeText)
		.filter(Boolean)
		.map((text) => ({
			text,
			claimIds: [],
			evidenceLinkIds: [],
			sourceIds: [],
		}));
}

function buildReportScope(plan: ResearchPlan): string {
	const questions =
		plan.keyQuestions.length > 0
			? ` Key questions: ${plan.keyQuestions.join("; ")}.`
			: "";
	return `Approved scope: ${plan.goal}.${questions}`;
}

function buildMethodologySourceBasis(
	plan: ResearchPlan,
	researchLanguage: ResearchLanguage,
): string {
	const labels = reportLabels[researchLanguage];
	return [
		labels.methodologyScope(formatDepthLabel(plan.depth, researchLanguage)),
		`${labels.sourceReviewCeiling}: ${plan.researchBudget.sourceReviewCeiling}.`,
		`${labels.synthesisPassCeiling}: ${plan.researchBudget.synthesisPassCeiling}.`,
	].join("\n");
}

function buildSourceLedgerSnapshot(
	sources: ResearchReportSource[],
	researchLanguage: ResearchLanguage,
): string {
	const labels = reportLabels[researchLanguage];
	const scopedSources = selectSourceLedgerSnapshotSources(sources);
	const citedSources = scopedSources.filter(
		(source) => source.status === "cited" || Boolean(source.citedAt),
	);
	const reviewedSources = scopedSources.filter(
		(source) =>
			source.status !== "cited" &&
			!source.citedAt &&
			source.topicRelevant !== false,
	);
	const rejectedSources = scopedSources.filter(
		(source) => source.topicRelevant === false,
	);

	return [
		`### ${labels.citedSources}`,
		...renderSourceSnapshotBullets(citedSources, researchLanguage),
		"",
		`### ${labels.topicRelevantReviewedSources}`,
		...renderSourceSnapshotBullets(reviewedSources, researchLanguage),
		"",
		`### ${labels.rejectedOrOffTopicReviewedSources}`,
		...renderSourceSnapshotBullets(rejectedSources, researchLanguage),
	].join("\n");
}

function selectSourceLedgerSnapshotSources(
	sources: ResearchReportSource[],
): ResearchReportSource[] {
	return buildDefaultResearchSourceLedger(sources);
}

function renderSourceSnapshotBullets(
	sources: ResearchReportSource[],
	researchLanguage: ResearchLanguage,
): string[] {
	if (sources.length === 0) {
		return [`- ${reportLabels[researchLanguage].emptyBullet}`];
	}
	return sources.map((source) => {
		const notes = [
			source.citationNote,
			source.reviewedNote,
			source.rejectedReason,
			source.topicRelevanceReason,
		]
			.map((value) => normalizeText(value ?? ""))
			.filter(Boolean);
		const noteSuffix = notes.length > 0 ? ` (${notes.join(" ")})` : "";
		return `- ${source.title || source.url} - ${source.url}${noteSuffix}`;
	});
}

function buildStructuredSectionsFromClaims(
	plan: ResearchPlan,
	keyFindings: StructuredResearchReportTextBlock[],
	researchLanguage: ResearchLanguage,
	input?: WriteResearchReportInput,
	citationCandidates: StructuredResearchReportTextBlock[] = keyFindings,
): StructuredResearchReportSection[] {
	const keyFindingReferences = {
		claimIds: uniqueValues(keyFindings.flatMap((finding) => finding.claimIds)),
		evidenceLinkIds: uniqueValues(
			keyFindings.flatMap((finding) => finding.evidenceLinkIds),
		),
		sourceIds: uniqueValues(
			keyFindings.flatMap((finding) => finding.sourceIds),
		),
	};
	const claimBody = keyFindings
		.map((finding) => `- ${finding.text}`)
		.join("\n");
	const headings = sectionHeadingsForIntent(
		plan.reportIntent,
		researchLanguage,
	);
	return headings.map((heading, index) => {
		const buildSection = (
			body: string,
			fallbackReferences: StructuredResearchReportReference = keyFindingReferences,
		): StructuredResearchReportSection => {
			const citationBlocks = findCitationBlocksRenderedInBody(
				body,
				citationCandidates,
			);
			const references =
				citationBlocks.length > 0
					? referencesFromStructuredTextBlocks(citationBlocks)
					: fallbackReferences;
			return {
				heading,
				body,
				...references,
				citationBlocks,
			};
		};
		if (input && isMatrixComparisonSection(plan, index)) {
			return buildSection(
				buildDecisionBriefComparisonMatrix(input, researchLanguage),
			);
		}
		if (input && plan.reportIntent === "comparison" && index > 0) {
			return buildSection(
				buildDecisionImplicationsBody(
					plan,
					input.evidenceNotes ?? [],
					researchLanguage,
				),
			);
		}
		if (input && plan.reportIntent === "recommendation") {
			return buildSection(
				buildRecommendationReportSectionBody(
					index,
					input,
					keyFindings,
					researchLanguage,
				),
			);
		}
		if (input && plan.reportIntent === "investigation") {
			return buildSection(
				buildInvestigationReportSectionBody(index, input, keyFindings),
			);
		}
		if (
			input &&
			(plan.reportIntent === "market_scan" ||
				plan.reportIntent === "product_scan")
		) {
			return buildSection(
				buildScanReportSectionBody(index, input, keyFindings),
			);
		}
		if (input && plan.reportIntent === "limitation_focused") {
			return buildSection(
				buildEvidenceReviewSectionBody(index, input, keyFindings),
			);
		}
		return buildSection(claimBody);
	});
}

function findCitationBlocksRenderedInBody(
	body: string,
	citationCandidates: StructuredResearchReportTextBlock[],
): StructuredResearchReportTextBlock[] {
	const normalizedBody = normalizeFindingForReadabilityCheck(body);
	return citationCandidates.filter((block) => {
		const normalizedText = normalizeFindingForReadabilityCheck(block.text);
		return normalizedText && normalizedBody.includes(normalizedText);
	});
}

function referencesFromStructuredTextBlocks(
	blocks: StructuredResearchReportTextBlock[],
): StructuredResearchReportReference {
	return {
		claimIds: uniqueValues(blocks.flatMap((block) => block.claimIds)),
		evidenceLinkIds: uniqueValues(
			blocks.flatMap((block) => block.evidenceLinkIds),
		),
		sourceIds: uniqueValues(blocks.flatMap((block) => block.sourceIds)),
	};
}

function buildEvidenceReviewSectionBody(
	sectionIndex: number,
	input: WriteResearchReportInput,
	keyFindings: StructuredResearchReportTextBlock[],
): string {
	const notes = input.evidenceNotes ?? [];
	if (sectionIndex === 0) {
		return [
			"| Claim | Strength | Evidence basis |",
			"| --- | --- | --- |",
			...keyFindings.map((finding) => {
				const note = findEvidenceNoteForFinding(finding, notes);
				return `| ${escapeMarkdownTableCell(finding.text)} | ${escapeMarkdownTableCell(evidenceStrengthLabel(note))} | ${escapeMarkdownTableCell(note?.findingText ?? finding.text)} |`;
			}),
		].join("\n");
	}

	if (sectionIndex === 1) {
		const consensus = notes.filter((note) => {
			const text = normalizeComparisonKey(
				`${note.comparedEntity ?? ""} ${note.comparisonAxis ?? ""} ${note.findingText}`,
			);
			return text.includes("consensus") || text.includes("agree");
		});
		const conflicts = notes.filter((note) => {
			const text = normalizeComparisonKey(
				`${note.comparedEntity ?? ""} ${note.comparisonAxis ?? ""} ${note.findingText}`,
			);
			return text.includes("conflict") || text.includes("disagree");
		});
		return [
			...renderConsensusConflictBullets("Consensus", consensus),
			...renderConsensusConflictBullets("Conflict", conflicts),
		].join("\n");
	}

	const explicitLimitations = [
		...input.synthesisNotes.reportLimitations.map(
			(limitation) => limitation.statement,
		),
		...(input.limitations ?? []),
	]
		.map(normalizeText)
		.filter(Boolean);
	const strengthLimitations = notes
		.filter((note) => evidenceStrengthLabel(note) !== "Strong")
		.map(
			(note) => `- Limitation tied to evidence strength: ${note.findingText}`,
		);
	return [
		...(strengthLimitations.length > 0
			? strengthLimitations
			: [
					"- Limitation tied to evidence strength: No material weakness was identified in the reviewed evidence.",
				]),
		...explicitLimitations.map(
			(limitation) => `- Limitation tied to evidence strength: ${limitation}`,
		),
	].join("\n");
}

function findEvidenceNoteForFinding(
	finding: StructuredResearchReportTextBlock,
	evidenceNotes: DeepResearchEvidenceNote[],
): DeepResearchEvidenceNote | null {
	return (
		evidenceNotes.find((note) => finding.text === note.findingText) ??
		evidenceNotes.find((note) =>
			normalizeComparisonKey(finding.text).includes(
				normalizeComparisonKey(note.findingText),
			),
		) ??
		null
	);
}

function evidenceStrengthLabel(note: DeepResearchEvidenceNote | null): string {
	const signals = note?.sourceQualitySignals;
	if (
		signals?.claimFit === "strong" &&
		signals.extractionConfidence === "high" &&
		signals.directness === "direct"
	) {
		return "Strong";
	}
	if (
		signals?.claimFit === "partial" ||
		signals?.directness === "anecdotal" ||
		signals?.extractionConfidence === "medium"
	) {
		return "Limited";
	}
	return "Moderate";
}

function renderConsensusConflictBullets(
	label: "Consensus" | "Conflict",
	notes: DeepResearchEvidenceNote[],
): string[] {
	if (notes.length === 0) {
		return [`- **${label}**: Not established in the reviewed evidence.`];
	}
	return notes.map((note) => `- **${label}**: ${note.findingText}`);
}

function buildScanReportSectionBody(
	sectionIndex: number,
	input: WriteResearchReportInput,
	keyFindings: StructuredResearchReportTextBlock[],
): string {
	const candidates = recommendationOptions(input, keyFindings);
	const criteria = recommendationCriteria(input, keyFindings);
	const notes = input.evidenceNotes ?? [];
	const primaryFinding = keyFindings[0]?.text ?? "Evidence not established.";

	if (sectionIndex === 0) {
		return [
			"| Candidate | Signal | Evidence basis |",
			"| --- | --- | --- |",
			...candidates.map((candidate) => {
				const evidence = findTextForEntity(candidate, keyFindings, notes);
				return `| ${escapeMarkdownTableCell(candidate)} | ${escapeMarkdownTableCell(scanSignalForCandidate(candidate, notes))} | ${escapeMarkdownTableCell(evidence ?? primaryFinding)} |`;
			}),
		].join("\n");
	}

	if (sectionIndex === 1) {
		return [
			"| Criterion | What to check | Evidence basis |",
			"| --- | --- | --- |",
			...criteria.map((criterion) => {
				const evidence = findTextForAxis(criterion, keyFindings, notes);
				return `| ${escapeMarkdownTableCell(criterion)} | ${escapeMarkdownTableCell(
					`Check ${criterion.toLowerCase()} against current buyer needs and source quality.`,
				)} | ${escapeMarkdownTableCell(evidence ?? primaryFinding)} |`;
			}),
		].join("\n");
	}

	if (sectionIndex === 2) {
		const trackedAxes = ["Pricing", "Availability", "Freshness"];
		return trackedAxes
			.map((axis) => {
				const evidence = findTextForAxis(axis, keyFindings, notes);
				return `- **${axis}**: ${evidence ?? "Not established in the reviewed evidence."}`;
			})
			.join("\n");
	}

	const watchouts = notes
		.filter((note) => {
			const text = normalizeComparisonKey(
				`${note.comparisonAxis ?? ""} ${note.findingText}`,
			);
			return (
				text.includes("dated") ||
				text.includes("regional") ||
				text.includes("risk") ||
				text.includes("limited") ||
				text.includes("availability") ||
				note.sourceQualitySignals?.freshness === "dated" ||
				note.sourceQualitySignals?.claimFit === "partial"
			);
		})
		.map((note) => `- Watchout: ${note.findingText}`);
	return (
		watchouts.length > 0
			? watchouts
			: ["- Watchout: Treat missing shortlist cells as evidence gaps."]
	).join("\n");
}

function scanSignalForCandidate(
	candidate: string,
	evidenceNotes: DeepResearchEvidenceNote[],
): string {
	const normalizedCandidate = normalizeComparisonKey(candidate);
	const candidateNotes = evidenceNotes.filter(
		(note) =>
			normalizeComparisonKey(note.comparedEntity ?? "") === normalizedCandidate,
	);
	if (
		candidateNotes.some(
			(note) => note.sourceQualitySignals?.freshness === "dated",
		)
	) {
		return "Dated or changing signal";
	}
	if (
		candidateNotes.some((note) =>
			normalizeComparisonKey(note.findingText).includes("regional"),
		)
	) {
		return "Availability-constrained signal";
	}
	return "Supported shortlist signal";
}

function buildInvestigationReportSectionBody(
	sectionIndex: number,
	input: WriteResearchReportInput,
	keyFindings: StructuredResearchReportTextBlock[],
): string {
	const notes = input.evidenceNotes ?? [];
	if (sectionIndex === 0) {
		const mappedNotes = notes.length > 0 ? notes : [];
		return [
			"| Sequence | Event or factor | Evidence basis |",
			"| --- | --- | --- |",
			...(mappedNotes.length > 0
				? mappedNotes.map((note, index) => {
						const factor =
							normalizeText(note.comparedEntity ?? "") ||
							normalizeText(note.comparisonAxis ?? "") ||
							`Finding ${index + 1}`;
						return `| ${index + 1} | ${escapeMarkdownTableCell(factor)} | ${escapeMarkdownTableCell(note.findingText)} |`;
					})
				: keyFindings.map(
						(finding, index) =>
							`| ${index + 1} | Finding ${index + 1} | ${escapeMarkdownTableCell(finding.text)} |`,
					)),
		].join("\n");
	}

	if (sectionIndex === 1) {
		const explanations = uniqueValues(
			notes
				.map((note) => normalizeText(note.comparedEntity ?? ""))
				.filter(Boolean),
		);
		const candidates =
			explanations.length > 0
				? explanations
				: keyFindings.map((_finding, index) => `Explanation ${index + 1}`);
		return candidates
			.map((candidate, index) => {
				const evidence =
					findTextForEntity(candidate, keyFindings, notes) ??
					keyFindings[index]?.text ??
					"Evidence not established.";
				return `- **${candidate}**: ${evidence}`;
			})
			.join("\n");
	}

	const confidence =
		keyFindings.length >= 2
			? "Confidence: moderate. Multiple supported findings point to a likely explanation, but remaining gaps still matter."
			: "Confidence: limited. The evidence base supports a conclusion, but more corroboration is needed.";
	const openQuestions = input.plan.keyQuestions.map(
		(question) => `- Open question: ${question}`,
	);
	return [confidence, ...openQuestions].join("\n");
}

function buildRecommendationReportSectionBody(
	sectionIndex: number,
	input: WriteResearchReportInput,
	keyFindings: StructuredResearchReportTextBlock[],
	researchLanguage: ResearchLanguage,
): string {
	const labels = reportLabels[researchLanguage];
	const options = recommendationOptions(input, keyFindings);
	const criteria = recommendationCriteria(input, keyFindings);
	const primaryFinding = keyFindings[0]?.text ?? labels.noFindingSummary;

	if (sectionIndex === 0) {
		const topOption = options[0];
		return topOption
			? `Recommend **${topOption}** first, based on the strongest supported finding: ${primaryFinding}`
			: `${labels.bottomLine}: ${primaryFinding}`;
	}

	if (sectionIndex === 1) {
		return options
			.map((option, index) => {
				const evidence = findTextForEntity(
					option,
					keyFindings,
					input.evidenceNotes,
				);
				return `${index + 1}. **${option}** - ${evidence ?? primaryFinding}`;
			})
			.join("\n");
	}

	if (sectionIndex === 2) {
		return [
			"| Criterion | Why it matters | Evidence basis |",
			"| --- | --- | --- |",
			...criteria.map((criterion) => {
				const evidence = findTextForAxis(
					criterion,
					keyFindings,
					input.evidenceNotes,
				);
				return `| ${escapeMarkdownTableCell(criterion)} | ${escapeMarkdownTableCell(
					`Use this to judge whether the recommendation fits ${input.plan.goal}.`,
				)} | ${escapeMarkdownTableCell(evidence ?? primaryFinding)} |`;
			}),
		].join("\n");
	}

	if (sectionIndex === 3) {
		return [
			"| Option | Best fit | Main risk | Evidence basis |",
			"| --- | --- | --- | --- |",
			...options.map((option) => {
				const evidence = findTextForEntity(
					option,
					keyFindings,
					input.evidenceNotes,
				);
				const risk = findRiskTextForEntity(
					option,
					keyFindings,
					input.evidenceNotes,
				);
				return `| ${escapeMarkdownTableCell(option)} | ${escapeMarkdownTableCell(
					evidence ?? primaryFinding,
				)} | ${escapeMarkdownTableCell(risk ?? "Evidence gap to validate before rollout.")} | ${escapeMarkdownTableCell(
					evidence ?? primaryFinding,
				)} |`;
			}),
		].join("\n");
	}

	return [
		`- Validate the top-ranked option against the highest-weight criteria: ${criteria.join("; ") || input.plan.goal}.`,
		"- Confirm unresolved risks with current primary sources before commitment.",
		"- Revisit the ranked options if new evidence changes a key criterion.",
	].join("\n");
}

function recommendationOptions(
	input: WriteResearchReportInput,
	keyFindings: StructuredResearchReportTextBlock[],
): string[] {
	const plannedOptions = uniqueValues(
		(input.plan.comparedEntities ?? []).map(normalizeText).filter(Boolean),
	);
	if (plannedOptions.length > 0) return plannedOptions;
	const evidenceOptions = uniqueValues(
		(input.evidenceNotes ?? [])
			.map((note) => normalizeText(note.comparedEntity ?? ""))
			.filter(Boolean),
	);
	if (evidenceOptions.length > 0) return evidenceOptions;
	return keyFindings.slice(0, 3).map((finding, index) => {
		const candidate = normalizeText(
			finding.text.split(/\s+(?:has|is|offers|provides)\s+/i)[0] ?? "",
		);
		return candidate && candidate.length < 80
			? candidate
			: `Option ${index + 1}`;
	});
}

function recommendationCriteria(
	input: WriteResearchReportInput,
	keyFindings: StructuredResearchReportTextBlock[],
): string[] {
	const plannedCriteria = uniqueValues(
		(input.plan.comparisonAxes ?? []).map(normalizeText).filter(Boolean),
	);
	if (plannedCriteria.length > 0) return plannedCriteria;
	const evidenceCriteria = uniqueValues(
		(input.evidenceNotes ?? [])
			.map((note) => normalizeText(note.comparisonAxis ?? ""))
			.filter(Boolean),
	);
	if (evidenceCriteria.length > 0) return evidenceCriteria;
	return keyFindings
		.map((finding) =>
			normalizeText(finding.text.split(/ because | with | and /i)[0] ?? ""),
		)
		.filter(Boolean)
		.slice(0, 3);
}

function findTextForEntity(
	entity: string,
	keyFindings: StructuredResearchReportTextBlock[],
	evidenceNotes?: DeepResearchEvidenceNote[],
): string | null {
	const normalizedEntity = normalizeComparisonKey(entity);
	const note = (evidenceNotes ?? []).find(
		(item) =>
			normalizeComparisonKey(item.comparedEntity ?? "") === normalizedEntity,
	);
	if (!note) {
		return (
			keyFindings.find((finding) =>
				normalizeComparisonKey(finding.text).includes(normalizedEntity),
			)?.text ?? null
		);
	}
	return (
		keyFindings.find(
			(finding) =>
				finding.evidenceLinkIds.length > 0 && finding.text === note.findingText,
		)?.text ?? note.findingText
	);
}

function findRiskTextForEntity(
	entity: string,
	keyFindings: StructuredResearchReportTextBlock[],
	evidenceNotes?: DeepResearchEvidenceNote[],
): string | null {
	const normalizedEntity = normalizeComparisonKey(entity);
	const riskNote = (evidenceNotes ?? []).find((note) => {
		const axis = normalizeComparisonKey(note.comparisonAxis ?? "");
		return (
			normalizeComparisonKey(note.comparedEntity ?? "") === normalizedEntity &&
			(axis.includes("risk") ||
				axis.includes("compliance") ||
				axis.includes("limit"))
		);
	});
	if (riskNote) return riskNote.findingText;
	return (
		keyFindings.find((finding) => {
			const text = normalizeComparisonKey(finding.text);
			return (
				text.includes(normalizedEntity) &&
				(text.includes("risk") ||
					text.includes("weaker") ||
					text.includes("limited") ||
					text.includes("incomplete"))
			);
		})?.text ?? null
	);
}

function findTextForAxis(
	axis: string,
	keyFindings: StructuredResearchReportTextBlock[],
	evidenceNotes?: DeepResearchEvidenceNote[],
): string | null {
	const normalizedAxis = normalizeComparisonKey(axis);
	const note = (evidenceNotes ?? []).find(
		(item) =>
			normalizeComparisonKey(item.comparisonAxis ?? "") === normalizedAxis,
	);
	if (note) return note.findingText;
	return (
		keyFindings.find((finding) =>
			normalizeComparisonKey(finding.text).includes(normalizedAxis),
		)?.text ?? null
	);
}

function isMatrixComparisonSection(
	plan: ResearchPlan,
	sectionIndex: number,
): boolean {
	return plan.reportIntent === "comparison" && sectionIndex === 0;
}

function buildDecisionBriefComparisonMatrix(
	input: WriteResearchReportInput,
	researchLanguage: ResearchLanguage,
): string {
	const labels = reportLabels[researchLanguage];
	const evidenceById = new Map(
		(input.evidenceNotes ?? []).map((note) => [note.id, note]),
	);
	const claimByEvidenceId = new Map<string, DeepResearchSynthesisClaim>();
	for (const claim of input.synthesisClaims ?? []) {
		if (claim.status !== "accepted" && claim.status !== "limited") continue;
		for (const link of claim.evidenceLinks) {
			if (!["support", "qualification"].includes(link.relation)) continue;
			claimByEvidenceId.set(link.evidenceNoteId, claim);
		}
	}
	const linkedComparisonNotes = (input.evidenceNotes ?? []).filter((note) =>
		claimByEvidenceId.has(note.id),
	);
	const entities = uniqueValues(
		(input.plan.comparedEntities?.length
			? input.plan.comparedEntities
			: linkedComparisonNotes.map((note) => note.comparedEntity ?? "")
		)
			.map(normalizeText)
			.filter(Boolean),
	);
	const axes = uniqueValues(
		(input.plan.comparisonAxes?.length
			? input.plan.comparisonAxes
			: linkedComparisonNotes.map((note) => note.comparisonAxis ?? "")
		)
			.map(normalizeText)
			.filter(Boolean),
	);
	if (entities.length === 0 || axes.length === 0) {
		return (input.synthesisClaims ?? [])
			.filter(
				(claim) => claim.status === "accepted" || claim.status === "limited",
			)
			.map((claim) => `- ${normalizeText(claim.statement)}`)
			.filter((line) => line !== "-")
			.join("\n");
	}

	const usedCues = new Set<EvidenceConfidenceCueKind>();
	const rows = axes.map((axis) => {
		const cells = entities.map((entity) => {
			const note = findComparisonEvidenceNote(
				evidenceById,
				entity,
				axis,
				claimByEvidenceId,
			);
			const claim = note ? claimByEvidenceId.get(note.id) : undefined;
			const cell = formatComparisonEvidenceCell(
				claim ? note : null,
				claim,
				labels.notEstablished,
			);
			if (cell.cue) usedCues.add(cell.cue);
			return cell.text;
		});
		const filledCellCount = cells.filter(
			(cell) => cell !== labels.notEstablished,
		).length;
		return `| ${escapeMarkdownTableCell(axis)} | ${cells
			.map(escapeMarkdownTableCell)
			.join(" | ")} | ${escapeMarkdownTableCell(
			labels.decisionMeaningBody(axis, filledCellCount),
		)} |`;
	});

	const legend = renderConfidenceCueLegend(usedCues, researchLanguage);
	return [
		`| Axis | ${entities.map(escapeMarkdownTableCell).join(" | ")} | ${labels.decisionMeaning} |`,
		`| --- | ${entities.map(() => "---").join(" | ")} | --- |`,
		...rows,
		...(legend ? ["", legend] : []),
	].join("\n");
}

function findComparisonEvidenceNote(
	evidenceById: Map<string, DeepResearchEvidenceNote>,
	entity: string,
	axis: string,
	claimByEvidenceId?: Map<string, DeepResearchSynthesisClaim>,
): DeepResearchEvidenceNote | null {
	const normalizedEntity = normalizeComparisonKey(entity);
	const normalizedAxis = normalizeComparisonKey(axis);
	const candidates: DeepResearchEvidenceNote[] = [];
	for (const note of evidenceById.values()) {
		if (
			normalizeComparisonKey(note.comparedEntity ?? "") === normalizedEntity &&
			normalizeComparisonKey(note.comparisonAxis ?? "") === normalizedAxis
		) {
			candidates.push(note);
		}
	}
	return (
		candidates.find((note) => claimByEvidenceId?.has(note.id)) ??
		candidates[0] ??
		null
	);
}

function formatComparisonEvidenceCell(
	note: DeepResearchEvidenceNote | null,
	claim: DeepResearchSynthesisClaim | undefined,
	notEstablishedLabel: string,
): ComparisonEvidenceCell {
	if (!note) {
		return { text: notEstablishedLabel, cue: null };
	}
	const text = normalizeText(claim?.statement ?? note.findingText);
	if (!text) {
		return { text: notEstablishedLabel, cue: null };
	}
	const cue = selectEvidenceConfidenceCue(note, claim);
	const cueLabel = cue ? confidenceCueLabel(cue) : "";
	return {
		text: cueLabel ? `${cueLabel} ${text}` : text,
		cue,
	};
}

function selectEvidenceConfidenceCue(
	note: DeepResearchEvidenceNote,
	claim: DeepResearchSynthesisClaim | undefined,
): EvidenceConfidenceCueKind | null {
	const signals = note.sourceQualitySignals;
	const axis = normalizeComparisonKey(note.comparisonAxis ?? "");
	const finding = normalizeComparisonKey(note.findingText);
	const isPriceLike =
		claim?.claimType === "price_availability" ||
		axis.includes("price") ||
		finding.includes("price") ||
		finding.includes("eur") ||
		finding.includes("usd") ||
		finding.includes("listed");
	if (
		isPriceLike &&
		(signals?.freshness === "dated" || signals?.freshness === "stale")
	) {
		return "dated_price";
	}
	if (
		signals?.sourceType === "forum" ||
		signals?.independence === "community" ||
		signals?.directness === "anecdotal"
	) {
		return "owner_report";
	}
	if (
		(signals?.sourceType === "official_vendor" ||
			signals?.sourceType === "official_government") &&
		signals.independence === "primary" &&
		signals.directness === "direct"
	) {
		return "official_spec";
	}
	if (
		signals?.sourceType === "vendor_marketing" ||
		signals?.independence === "affiliated"
	) {
		return "vendor_claim";
	}
	return null;
}

function confidenceCueLabel(cue: EvidenceConfidenceCueKind): string {
	const labels: Record<EvidenceConfidenceCueKind, string> = {
		official_spec: "**Official spec**",
		vendor_claim: "**Vendor claim**",
		dated_price: "**Dated price**",
		owner_report: "**Owner report**",
	};
	return labels[cue];
}

function renderConfidenceCueLegend(
	usedCues: Set<EvidenceConfidenceCueKind>,
	researchLanguage: ResearchLanguage,
): string {
	if (usedCues.size === 0) return "";
	const labels = reportLabels[researchLanguage];
	const orderedCues: EvidenceConfidenceCueKind[] = [
		"official_spec",
		"vendor_claim",
		"dated_price",
		"owner_report",
	];
	const descriptions = orderedCues
		.filter((cue) => usedCues.has(cue))
		.map((cue) => labels.confidenceCueDescriptions[cue]);
	return `${labels.confidenceCues}: ${descriptions.join("; ")}.`;
}

function buildDecisionImplicationsBody(
	plan: ResearchPlan,
	evidenceNotes: DeepResearchEvidenceNote[],
	researchLanguage: ResearchLanguage,
): string {
	const labels = reportLabels[researchLanguage];
	const coveredAxes = uniqueValues(
		evidenceNotes
			.map((note) => normalizeText(note.comparisonAxis ?? ""))
			.filter(Boolean),
	);
	const knownCoverage =
		coveredAxes.length > 0
			? coveredAxes.join("; ")
			: (plan.comparisonAxes ?? []).join("; ");
	return [
		labels.recommendationsIntro,
		`Use the matrix to compare trade-offs by axis instead of treating every evidence note as equal.`,
		knownCoverage
			? `The most decision-relevant caveats are concentrated around: ${knownCoverage}.`
			: "Treat missing cells as evidence gaps, not proof that an option lacks the attribute.",
		"Give more weight to current primary specifications than to dated prices or owner-reported experience when those cues change interpretation.",
	].join("\n");
}

function normalizeComparisonKey(value: string): string {
	return normalizeText(value)
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function sectionHeadingsForIntent(
	intent: ResearchPlan["reportIntent"],
	researchLanguage: ResearchLanguage,
): string[] {
	return reportIntentSectionHeadings[researchLanguage][intent];
}

function validateStructuredResearchReport(
	report: StructuredResearchReport,
): void {
	const missing: string[] = [];
	if (!normalizeText(report.core.title)) missing.push("title");
	if (!normalizeText(report.core.scope)) missing.push("scope");
	if (!normalizeText(report.core.executiveSummary.text)) {
		missing.push("executiveSummary");
	}
	if (report.core.keyFindings.length === 0) missing.push("keyFindings");
	if (!normalizeText(report.core.methodologySourceBasis)) {
		missing.push("methodologySourceBasis");
	}
	if (!normalizeText(report.core.sourceLedgerSnapshot)) {
		missing.push("sourceLedgerSnapshot");
	}
	if (missing.length > 0) {
		throw new Error(
			`Structured Research Report is missing required fields: ${missing.join(", ")}`,
		);
	}
}

function assertReadableReportFindings(
	keyFindings: string[],
	citedSources: CitedResearchReportSource[],
): void {
	if (keyFindings.length < 3 || citedSources.length === 0) return;
	const sourceTitles = citedSources.map((source) =>
		normalizeFindingForReadabilityCheck(source.title),
	);
	const sourceTitleMatches = keyFindings.filter((finding) => {
		const normalizedFinding = normalizeFindingForReadabilityCheck(finding);
		return sourceTitles.some((title) => title && title === normalizedFinding);
	});
	if (sourceTitleMatches.length >= Math.ceil(keyFindings.length / 2)) {
		throw new Error(
			"Structured Research Report failed readability validation: source-note dump detected.",
		);
	}
}

function normalizeFindingForReadabilityCheck(value: string): string {
	return value
		.replace(/\[\d+\]/g, "")
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.replace(/&[#a-z0-9]+;/gi, " ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
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
	sourceLedgerSnapshot: string;
	researchLanguage: ResearchLanguage;
}): string {
	const labels = evidenceLimitationMemoLabels[input.researchLanguage];
	const limitationReasonLines = renderEvidenceLimitationReasonLines(
		input.limitations,
		input.researchLanguage,
	);
	return [
		`# ${input.title}`,
		"",
		`## ${labels.reviewedScope}`,
		`| ${labels.scopeItem} | ${labels.count} |`,
		"| --- | ---: |",
		`| ${labels.discoveredSources} | ${input.reviewedScope.discoveredCount} |`,
		`| ${labels.reviewedSources} | ${input.reviewedScope.reviewedCount} |`,
		`| ${labels.topicRelevantReviewedSources} | ${input.reviewedScope.topicRelevantCount} |`,
		`| ${labels.rejectedOrOffTopicSources} | ${input.reviewedScope.rejectedOrOffTopicCount} |`,
		"",
		`## ${labels.groundedLimitationReasons}`,
		...limitationReasonLines,
		"",
		`## ${labels.recoveryActions}`,
		`**${labels.nextResearchDirection}:** ${input.nextResearchDirection}`,
		"",
		...input.recoveryActions.map(
			(action) => `- **${action.label}**: ${action.description}`,
		),
		"",
		`## ${labels.sourceLedgerDetailAppendix}`,
		input.sourceLedgerSnapshot,
	].join("\n");
}

function renderEvidenceLimitationReasonLines(
	limitations: string[],
	researchLanguage: ResearchLanguage,
): string[] {
	const labels = evidenceLimitationMemoLabels[researchLanguage];
	const groups = new Map<EvidenceLimitationMemoReasonGroup, string[]>(
		(
			[
				"source_coverage",
				"evidence_quality",
				"scope_fit",
				"other",
			] satisfies EvidenceLimitationMemoReasonGroup[]
		).map((group) => [group, []]),
	);
	const visibleLimitations = limitations.slice(
		0,
		MAX_EVIDENCE_LIMITATION_MEMO_REASONS,
	);

	for (const limitation of visibleLimitations) {
		groups.get(classifyEvidenceLimitationReason(limitation))?.push(limitation);
	}

	const lines: string[] = [];
	for (const [group, groupLimitations] of groups) {
		if (groupLimitations.length === 0) continue;
		if (lines.length > 0) lines.push("");
		lines.push(`### ${labels.limitationReasonGroups[group]}`);
		lines.push(...groupLimitations.map((limitation) => `- ${limitation}`));
	}

	const hiddenCount = limitations.length - visibleLimitations.length;
	if (hiddenCount > 0) {
		lines.push("");
		lines.push(`_${labels.additionalLimitationReasons(hiddenCount)}_`);
	}

	return lines;
}

function classifyEvidenceLimitationReason(
	limitation: string,
): EvidenceLimitationMemoReasonGroup {
	const normalized = normalizeFindingForReadabilityCheck(limitation);
	if (
		/\b(off topic|rejected|unrelated|scope|hatokor|elutasitott|teman kivuli)\b/.test(
			normalized,
		)
	) {
		return "scope_fit";
	}
	if (
		/\b(official|quality|secondary|verify|verified|missing|current|confidence|primary|hivatalos|minoseg|ellenoriz|hiany|elsodleges)\b/.test(
			normalized,
		)
	) {
		return "evidence_quality";
	}
	if (
		/\b(source|sources|reviewed|topic relevant|coverage|answer|forras|attekintett|lefedettseg)\b/.test(
			normalized,
		)
	) {
		return "source_coverage";
	}
	return "other";
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

function buildCitedSourcesFromStructuredReport(
	report: StructuredResearchReport,
	sources: ResearchReportSource[],
): CitedResearchReportSource[] {
	const citedSourceIds = collectStructuredReportSourceIds(report);
	const sourcesByReviewedId = new Map(
		sources
			.filter((source) => source.reviewedSourceId)
			.map((source) => [source.reviewedSourceId, source]),
	);
	const sourcesById = new Map(sources.map((source) => [source.id, source]));
	const citedSources: CitedResearchReportSource[] = [];
	const seen = new Set<string>();
	for (const sourceId of citedSourceIds) {
		const source =
			sourcesByReviewedId.get(sourceId) ?? sourcesById.get(sourceId);
		if (!source || seen.has(source.id)) continue;
		seen.add(source.id);
		citedSources.push({
			...source,
			citationNumber: citedSources.length + 1,
		});
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
		return [
			...comparisonScope,
			...renderBullets(keyFindings, researchLanguage),
		].join("\n");
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
		lines.push(
			`${labels.comparedEntities}: ${plan.comparedEntities.join("; ")}`,
		);
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

function formatStructuredTextBlockWithCitations(
	block: StructuredResearchReportTextBlock,
	citedSources: CitedResearchReportSource[],
): string {
	const citationNumbers = block.sourceIds
		.map((sourceId) =>
			citedSources.find(
				(source) =>
					source.id === sourceId || source.reviewedSourceId === sourceId,
			),
		)
		.filter((source): source is CitedResearchReportSource => Boolean(source))
		.map((source) => `[${source.citationNumber}]`);
	const citationSuffix =
		citationNumbers.length > 0
			? ` ${uniqueValues(citationNumbers).join(" ")}`
			: "";
	return `${block.text}${citationSuffix}`;
}

function buildStructuredReportSectionsForMarkdown(
	report: StructuredResearchReport,
	citedSources: CitedResearchReportSource[],
): ResearchReportSection[] {
	return report.sections.map((section) => ({
		heading: section.heading,
		body: section.body
			.split("\n")
			.map((line) => {
				let renderedLine = line;
				const citationBlocks = dedupeStructuredTextBlocks([
					...(section.citationBlocks ?? []),
					...report.core.keyFindings,
				]).sort((left, right) => right.text.length - left.text.length);
				for (const block of citationBlocks) {
					if (!renderedLine.includes(block.text)) continue;
					renderedLine = renderedLine.replace(
						block.text,
						formatStructuredTextBlockWithCitations(block, citedSources),
					);
				}
				return renderedLine;
			})
			.join("\n"),
	}));
}

function buildResearchReportBlocks(input: {
	executiveSummary: string;
	keyFindings: string[];
	sections: ResearchReportSection[];
	sources: CitedResearchReportSource[];
	limitations: string[];
	sourceLedgerSnapshot: string;
	structuredReport: StructuredResearchReport;
	researchLanguage: ResearchLanguage;
	useAnswerFirstLayout: boolean;
}): StructuredResearchReportBlock[] {
	const labels = reportLabels[input.researchLanguage];
	const appendixHeading = (heading: string) =>
		input.useAnswerFirstLayout ? labels.appendix(heading) : heading;
	const summaryHeading = input.useAnswerFirstLayout
		? labels.answer
		: labels.executiveSummary;
	const reportSourceIds = collectStructuredReportSourceIds(
		input.structuredReport,
	);
	const blocks: StructuredResearchReportBlock[] = [
		{
			kind: "summary",
			heading: summaryHeading,
			markdown: input.executiveSummary,
			...input.structuredReport.core.executiveSummary,
		},
		{
			kind: "findings",
			heading: labels.keyFindings,
			markdown: renderBullets(input.keyFindings, input.researchLanguage).join(
				"\n",
			),
			claimIds: uniqueValues(
				input.structuredReport.core.keyFindings.flatMap(
					(finding) => finding.claimIds,
				),
			),
			evidenceLinkIds: uniqueValues(
				input.structuredReport.core.keyFindings.flatMap(
					(finding) => finding.evidenceLinkIds,
				),
			),
			sourceIds: uniqueValues(
				input.structuredReport.core.keyFindings.flatMap(
					(finding) => finding.sourceIds,
				),
			),
		},
		...input.sections.map((section, index) => {
			const structuredSection = input.structuredReport.sections[index];
			return {
				kind: "section" as const,
				heading: section.heading,
				markdown: section.body,
				claimIds: structuredSection?.claimIds ?? [],
				evidenceLinkIds: structuredSection?.evidenceLinkIds ?? [],
				sourceIds: structuredSection?.sourceIds ?? [],
			};
		}),
	];

	if (input.limitations.length > 0) {
		blocks.push({
			kind: "limitations",
			heading: labels.reportLimitations,
			markdown: renderBullets(input.limitations, input.researchLanguage).join(
				"\n",
			),
			claimIds: uniqueValues(
				input.structuredReport.core.limitations.flatMap(
					(limitation) => limitation.claimIds,
				),
			),
			evidenceLinkIds: uniqueValues(
				input.structuredReport.core.limitations.flatMap(
					(limitation) => limitation.evidenceLinkIds,
				),
			),
			sourceIds: uniqueValues(
				input.structuredReport.core.limitations.flatMap(
					(limitation) => limitation.sourceIds,
				),
			),
		});
	}

	if (input.useAnswerFirstLayout) {
		blocks.push({
			kind: "appendix",
			heading: appendixHeading(labels.methodologySourceBasis),
			markdown: input.structuredReport.core.methodologySourceBasis,
			claimIds: [],
			evidenceLinkIds: [],
			sourceIds: [],
		});
	}

	blocks.push({
		kind: "appendix",
		heading: appendixHeading(labels.sourceLedgerSnapshot),
		markdown: input.sourceLedgerSnapshot,
		claimIds: [],
		evidenceLinkIds: [],
		sourceIds: input.sourceLedgerSnapshot ? reportSourceIds : [],
	});

	blocks.push({
		kind: "appendix",
		heading: appendixHeading(labels.sources),
		markdown: input.sources
			.map(
				(source) =>
					`[${source.citationNumber}] ${source.title} - ${source.url}`,
			)
			.join("\n"),
		claimIds: [],
		evidenceLinkIds: [],
		sourceIds: input.sources.map((source) => source.id),
	});

	return blocks;
}

function collectStructuredReportSourceIds(
	report: StructuredResearchReport,
): string[] {
	return uniqueValues([
		...report.core.executiveSummary.sourceIds,
		...report.core.keyFindings.flatMap((finding) => finding.sourceIds),
		...report.core.limitations.flatMap((limitation) => limitation.sourceIds),
		...report.sections.flatMap((section) => section.sourceIds),
	]);
}

function renderReportMarkdownFromBlocks(
	title: string,
	blocks: StructuredResearchReportBlock[],
): string {
	return [
		`# ${title}`,
		"",
		...blocks.flatMap((block) => [`## ${block.heading}`, block.markdown, ""]),
	]
		.join("\n")
		.trimEnd();
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
