import type {
	DeepResearchEvidenceNote,
	DeepResearchSynthesisClaim,
} from "$lib/types";
import {
	assessResearchCoverage,
	type ReviewedCoverageSource,
} from "./coverage";
import type { ResearchPlan } from "./planning";

export type DeepResearchEvaluationDimension =
	| "readableSynthesis"
	| "claimGrounding"
	| "sourceRelevance"
	| "citationSupport"
	| "comparisonCoverage"
	| "searchPolicyFit"
	| "durableResume"
	| "localization"
	| "hardSearchBehavior";

export type DeepResearchEvaluationDimensionResult = {
	passed: boolean;
	reasons: string[];
};

export type DeepResearchEvaluationResult = {
	fixtureId: string;
	accepted: boolean;
	dimensions: Record<
		DeepResearchEvaluationDimension,
		DeepResearchEvaluationDimensionResult
	>;
};

export type DeepResearchEvaluationReportArtifact = {
	id: string;
	contentText?: string | null;
	metadata?: Record<string, unknown> | null;
};

export type DeepResearchEvaluationDiscoveryRequest = {
	query: string;
	sourcePolicy?: string | null;
	comparedEntity?: string | null;
	comparisonAxis?: string | null;
};

export type DeepResearchExpectedComparisonCell = {
	comparedEntity: string;
	comparisonAxis: string;
	expectedText?: string | null;
};

export type DeepResearchEvaluationRun = {
	id: string;
	title: string;
	plan: ResearchPlan;
	reviewedSources: ReviewedCoverageSource[];
	discoveryRequests?: DeepResearchEvaluationDiscoveryRequest[];
	evidenceNotes: DeepResearchEvidenceNote[];
	synthesisClaims: DeepResearchSynthesisClaim[];
	reportArtifact?: DeepResearchEvaluationReportArtifact | null;
	expectedComparisonGrid?: DeepResearchExpectedComparisonCell[];
	reportMarkdown?: string;
	resumeTrace?: DeepResearchEvaluationResumeTrace;
	localizedOutputs?: string[];
	hardSearchTrace?: DeepResearchHardSearchStep[];
};

export type DeepResearchEvaluationFixture = DeepResearchEvaluationRun;

export type DeepResearchEvaluationResumeTrace = {
	passNumbers: number[];
	resumePoints: Array<{
		resumeKey: string;
		passNumber: number;
		status: "running" | "completed" | "failed" | "stale";
	}>;
};

export type DeepResearchHardSearchStep =
	| "search"
	| "cross_validation"
	| "conflict_correction"
	| "cautious_verification"
	| "answer";

const standardComparisonPlan: ResearchPlan = {
	goal: "Compare private AI coding assistants for a small engineering team.",
	depth: "standard",
	reportIntent: "comparison",
	researchBudget: {
		sourceReviewCeiling: 40,
		synthesisPassCeiling: 2,
	},
	keyQuestions: [
		"Which products have repository-aware coding workflows?",
		"Which pricing and compliance differences matter?",
	],
	sourceScope: {
		includePublicWeb: true,
		planningContextDisclosure: null,
	},
	reportShape: ["Executive summary", "Key findings", "Limitations"],
	constraints: ["Prefer primary vendor and independent analysis sources."],
	deliverables: ["Cited Research Report"],
};

export const goldenDeepResearchFixtures = {
	offTopicAuthorityWeakNotes: {
		id: "off-topic-authority-weak-notes",
		title: "Off-topic high-authority sources with weak Evidence Notes",
		plan: standardComparisonPlan,
		reviewedSources: [
			reviewedSource({
				id: "official-car-spec",
				title: "Official vehicle specification manual",
				canonicalUrl: "https://authority.example.gov/vehicles/specs",
				topicRelevant: false,
				supportedKeyQuestions: standardComparisonPlan.keyQuestions,
				qualityScore: 98,
			}),
			reviewedSource({
				id: "academic-battery-study",
				title: "Academic battery durability study",
				canonicalUrl: "https://journal.example.edu/battery-durability",
				topicRelevant: false,
				supportedKeyQuestions: standardComparisonPlan.keyQuestions,
				qualityScore: 96,
			}),
		],
		evidenceNotes: [
			evidenceNote({
				id: "note-weak-1",
				findingText:
					"The reviewed sources were authoritative, but they discussed unrelated vehicle and battery topics.",
				supportedKeyQuestion:
					"Which products have repository-aware coding workflows?",
			}),
		],
		synthesisClaims: [
			synthesisClaim({
				id: "claim-unsupported-central",
				statement:
					"Private AI coding assistants differ most by repository index freshness.",
				planQuestion: "Which products have repository-aware coding workflows?",
				status: "needs-repair",
				statusReason:
					"Linked Evidence Notes do not support this central claim.",
				evidenceNoteId: "note-weak-1",
			}),
		],
	},
	claimSupportAndConflict: {
		id: "claim-support-and-conflict",
		title: "Unsupported central claim, removable side claim, and conflict",
		plan: standardComparisonPlan,
		reviewedSources: [
			reviewedSource({
				id: "vendor-repository-docs",
				title: "Repository indexing documentation",
				canonicalUrl: "https://vendor.example.com/repository-indexing",
				supportedKeyQuestions: standardComparisonPlan.keyQuestions,
			}),
			reviewedSource({
				id: "analyst-compliance-review",
				title: "Independent compliance review",
				canonicalUrl: "https://analysis.example.com/compliance-review",
				supportedKeyQuestions: standardComparisonPlan.keyQuestions,
			}),
		],
		evidenceNotes: [
			evidenceNote({
				id: "note-indexing",
				sourceId: "vendor-repository-docs",
				findingText:
					"Vendor documentation says repository indexing can be scoped by organization permissions.",
				supportedKeyQuestion:
					"Which products have repository-aware coding workflows?",
				sourceSupport: {
					sourceId: "vendor-repository-docs",
					reviewedSourceId: "vendor-repository-docs",
				},
			}),
			evidenceNote({
				id: "note-compliance-limited",
				sourceId: "analyst-compliance-review",
				findingText:
					"The independent review found compliance disclosures incomplete for small teams.",
				supportedKeyQuestion:
					"Which pricing and compliance differences matter?",
				sourceSupport: {
					sourceId: "analyst-compliance-review",
					reviewedSourceId: "analyst-compliance-review",
				},
			}),
			evidenceNote({
				id: "note-conflict",
				sourceId: "analyst-compliance-review",
				findingText:
					"A conflicting note says compliance controls are uniformly mature.",
				supportedKeyQuestion:
					"Which pricing and compliance differences matter?",
				sourceSupport: {
					sourceId: "analyst-compliance-review",
					reviewedSourceId: "analyst-compliance-review",
				},
			}),
		],
		synthesisClaims: [
			synthesisClaim({
				id: "claim-supported-central",
				statement:
					"Repository indexing can be scoped by organization permissions.",
				planQuestion: "Which products have repository-aware coding workflows?",
				status: "accepted",
				evidenceNoteId: "note-indexing",
			}),
			synthesisClaim({
				id: "claim-unsupported-central",
				statement:
					"Small teams get complete compliance control disclosure from every vendor.",
				planQuestion: "Which pricing and compliance differences matter?",
				status: "needs-repair",
				statusReason:
					"Evidence says disclosures were incomplete, not complete.",
				evidenceNoteId: "note-compliance-limited",
				competingClaimGroupId: "compliance-maturity-conflict",
			}),
			synthesisClaim({
				id: "claim-conflicting-central",
				statement: "Compliance controls are uniformly mature.",
				planQuestion: "Which pricing and compliance differences matter?",
				status: "needs-repair",
				statusReason:
					"Material contradictory evidence competes with another Synthesis Claim.",
				evidenceNoteId: "note-conflict",
				competingClaimGroupId: "compliance-maturity-conflict",
			}),
			synthesisClaim({
				id: "claim-removable-side-note",
				statement: "One vendor has the fastest onboarding.",
				planQuestion: "Which products have repository-aware coding workflows?",
				status: "rejected",
				statusReason:
					"Unsupported non-central claim can be removed from the report.",
				evidenceNoteId: "note-indexing",
				central: false,
			}),
		],
	},
	sourceNoteDumpReport: {
		id: "source-note-dump-report",
		title: "Downloaded report source-note dump regression",
		plan: standardComparisonPlan,
		reviewedSources: [
			reviewedSource({
				id: "cube-nulane",
				title: "Cube Nulane official specs",
				canonicalUrl: "https://cube.example.com/nulane",
				supportedKeyQuestions: standardComparisonPlan.keyQuestions,
			}),
			reviewedSource({
				id: "cube-kathmandu",
				title: "Cube Kathmandu official specs",
				canonicalUrl: "https://cube.example.com/kathmandu",
				supportedKeyQuestions: standardComparisonPlan.keyQuestions,
			}),
		],
		evidenceNotes: [
			evidenceNote({
				id: "note-readable-1",
				sourceId: "cube-nulane",
				findingText:
					"The Nulane evidence supports comparing lightweight commuting geometry.",
				supportedKeyQuestion:
					"Which products have repository-aware coding workflows?",
				sourceSupport: {
					sourceId: "cube-nulane",
					reviewedSourceId: "cube-nulane",
				},
			}),
			evidenceNote({
				id: "note-readable-2",
				sourceId: "cube-kathmandu",
				findingText:
					"The Kathmandu evidence supports comparing touring-oriented components.",
				supportedKeyQuestion:
					"Which pricing and compliance differences matter?",
				sourceSupport: {
					sourceId: "cube-kathmandu",
					reviewedSourceId: "cube-kathmandu",
				},
			}),
		],
		synthesisClaims: [
			synthesisClaim({
				id: "claim-readable-1",
				statement:
					"The report should synthesize Nulane and Kathmandu differences instead of repeating source snippets.",
				planQuestion: "Which products have repository-aware coding workflows?",
				status: "accepted",
				evidenceNoteId: "note-readable-1",
			}),
			synthesisClaim({
				id: "claim-readable-2",
				statement:
					"Touring-oriented component evidence should be tied to the approved comparison scope.",
				planQuestion: "Which pricing and compliance differences matter?",
				status: "accepted",
				evidenceNoteId: "note-readable-2",
			}),
		],
		reportMarkdown: [
			"# Research Report: Source note dump",
			"## Executive Summary",
			"Bottom line: Cube Nulane official specs [1]",
			"## Key Findings",
			"- Cube Nulane official specs [1]",
			"- Cube Kathmandu official specs [2]",
			"- Unrelated forum source [3]",
			"## Analysis",
			"- Cube Nulane official specs [1]",
			"- Cube Kathmandu official specs [2]",
			"- Unrelated forum source [3]",
		].join("\n"),
	},
	crashResumeHungarianHardSearch: {
		id: "crash-resume-hungarian-hard-search",
		title: "Crash resume with Hungarian hard-search output",
		plan: {
			...standardComparisonPlan,
			goal: "Hasonlítsd össze a privát AI kódoló asszisztenseket",
			researchLanguage: "hu",
		},
		reviewedSources: [
			reviewedSource({
				id: "vendor-indexing-hu",
				title: "Repository indexing docs",
				canonicalUrl: "https://vendor.example.com/repository-indexing",
				supportedKeyQuestions: standardComparisonPlan.keyQuestions,
			}),
			reviewedSource({
				id: "independent-compliance-hu",
				title: "Independent compliance analysis",
				canonicalUrl: "https://analysis.example.com/compliance",
				supportedKeyQuestions: standardComparisonPlan.keyQuestions,
			}),
		],
		evidenceNotes: [
			evidenceNote({
				id: "note-hu-indexing",
				sourceId: "vendor-indexing-hu",
				findingText:
					"A dokumentáció közvetlenül alátámasztja a jogosultság-alapú repository indexelést.",
				supportedKeyQuestion:
					"Which products have repository-aware coding workflows?",
				sourceSupport: {
					sourceId: "vendor-indexing-hu",
					reviewedSourceId: "vendor-indexing-hu",
				},
			}),
			evidenceNote({
				id: "note-hu-compliance",
				sourceId: "independent-compliance-hu",
				findingText:
					"Az elemzés elkülöníti az árképzési és megfelelőségi különbségeket kis csapatoknál.",
				supportedKeyQuestion:
					"Which pricing and compliance differences matter?",
				sourceSupport: {
					sourceId: "independent-compliance-hu",
					reviewedSourceId: "independent-compliance-hu",
				},
			}),
		],
		synthesisClaims: [
			synthesisClaim({
				id: "claim-hu-indexing",
				statement:
					"A repository indexelés jogosultsági hatókör szerint korlátozható.",
				planQuestion: "Which products have repository-aware coding workflows?",
				status: "accepted",
				evidenceNoteId: "note-hu-indexing",
			}),
			synthesisClaim({
				id: "claim-hu-compliance",
				statement:
					"Kis csapatoknál az árképzési és megfelelőségi különbségek külön döntési szempontot jelentenek.",
				planQuestion: "Which pricing and compliance differences matter?",
				status: "accepted",
				evidenceNoteId: "note-hu-compliance",
			}),
		],
		reportMarkdown: [
			"# Kutatási jelentés: Privát AI kódoló asszisztensek",
			"## Vezetői összefoglaló",
			"A bizonyítékok alapján a jogosultsági hatókör és a megfelelőségi átláthatóság a két fő döntési pont.",
			"## Fő megállapítások",
			"- A repository indexelés jogosultsági hatókör szerint korlátozható. [1]",
			"- Az árképzési és megfelelőségi különbségek külön döntési szempontot jelentenek. [2]",
			"## Források",
			"[1] Repository indexing docs - https://vendor.example.com/repository-indexing",
			"[2] Independent compliance analysis - https://analysis.example.com/compliance",
		].join("\n"),
		resumeTrace: {
			passNumbers: [1, 2, 3],
			resumePoints: [
				{
					resumeKey: "pass-1:source-review",
					passNumber: 1,
					status: "completed",
				},
				{
					resumeKey: "pass-2:cross-validation",
					passNumber: 2,
					status: "completed",
				},
				{
					resumeKey: "pass-3:report-assembly",
					passNumber: 3,
					status: "completed",
				},
			],
		},
		localizedOutputs: [
			"Kutatási terv",
			"Idővonal",
			"Bizonyítékkorlát-memó",
			"Kutatási jelentés",
			"Forrásnapló pillanatkép",
		],
		hardSearchTrace: [
			"search",
			"cross_validation",
			"conflict_correction",
			"cautious_verification",
			"answer",
		],
	},
} satisfies Record<string, DeepResearchEvaluationFixture>;

export async function evaluateGoldenDeepResearchFixtures(): Promise<
	DeepResearchEvaluationResult[]
> {
	const results: DeepResearchEvaluationResult[] = [];
	for (const fixture of Object.values(goldenDeepResearchFixtures)) {
		results.push(await evaluateDeepResearchFixture(fixture));
	}
	return results;
}

export async function evaluateDeepResearchFixture(
	fixture: DeepResearchEvaluationFixture,
): Promise<DeepResearchEvaluationResult> {
	return evaluateDeepResearchRun(fixture);
}

export async function evaluateDeepResearchRun(
	run: DeepResearchEvaluationRun,
): Promise<DeepResearchEvaluationResult> {
	const dimensions = buildPassingDimensions();
	const coverage = assessResearchCoverage({
		jobId: run.id,
		conversationId: "evaluation-conversation",
		plan: run.plan,
		reviewedSources: run.reviewedSources,
		remainingBudget: {
			sourceReviews: 0,
			synthesisPasses: 0,
		},
	});

	if (coverage.status === "insufficient") {
		failDimension(
			dimensions.sourceRelevance,
			coverage.reportLimitations.some(
				(limitation) => limitation.reviewedSourceCount === 0,
			)
				? "Off-topic reviewed sources cannot satisfy approved key-question coverage."
				: "Reviewed sources did not satisfy approved key-question coverage.",
		);
	}

	const acceptedSupportedCentralClaims = run.synthesisClaims.filter(
		(claim) =>
			claim.central &&
			claim.status === "accepted" &&
			claim.evidenceLinks.length > 0,
	);
	const minimumAcceptedCentralClaims = run.expectedComparisonGrid?.length
		? run.expectedComparisonGrid.length
		: run.plan.keyQuestions.length;
	if (acceptedSupportedCentralClaims.length < minimumAcceptedCentralClaims) {
		failDimension(
			dimensions.claimGrounding,
			"Enough reviewed sources were present, but the fixture had too few accepted supported central claims.",
		);
	}
	if (
		run.synthesisClaims.some(
			(claim) =>
				claim.central && ["needs-repair", "rejected"].includes(claim.status),
		)
	) {
		failDimension(
			dimensions.claimGrounding,
			"Unsupported Central Claims must be repaired before report publication.",
		);
	}
	if (
		reportTextForEvaluation(run) &&
		isSourceNoteDumpReport(reportTextForEvaluation(run))
	) {
		failDimension(
			dimensions.readableSynthesis,
			"Report reads like repeated source notes instead of synthesized analysis.",
		);
	}
	evaluateComparisonCoverage(run, dimensions.comparisonCoverage);
	evaluateSearchPolicyFit(run, dimensions.searchPolicyFit);
	if (run.resumeTrace && !hasDurableCrashResumeTrace(run.resumeTrace)) {
		failDimension(
			dimensions.durableResume,
			"Crash/resume fixtures must preserve unique resume points across multiple Iterative Research Passes.",
		);
	}
	if (
		run.plan.researchLanguage === "hu" &&
		!hasHungarianResearchOutput(
			run.localizedOutputs ?? [],
			reportTextForEvaluation(run),
		)
	) {
		failDimension(
			dimensions.localization,
			"Hungarian fixtures must localize plan, timeline, memo, and report output labels.",
		);
	}
	if (
		run.hardSearchTrace &&
		!hasKimiInspiredHardSearchTrace(run.hardSearchTrace)
	) {
		failDimension(
			dimensions.hardSearchBehavior,
			"Hard-search fixtures must search, cross-validate, correct conflicts, and verify cautiously before answering.",
		);
	}
	if (hasUnresolvedMaterialClaimConflict(run.synthesisClaims)) {
		failDimension(
			dimensions.claimGrounding,
			"Material Claim Conflicts must remain visible as competing claims until resolved.",
		);
	}
	if (
		run.synthesisClaims.some(
			(claim) =>
				!claim.central && ["needs-repair", "rejected"].includes(claim.status),
		)
	) {
		failDimension(
			dimensions.citationSupport,
			"Unsupported Non-Central Claims were removable without blocking supported central claims.",
		);
	}

	return {
		fixtureId: run.id,
		accepted: Object.values(dimensions).every((dimension) => dimension.passed),
		dimensions,
	};
}

function buildPassingDimensions(): Record<
	DeepResearchEvaluationDimension,
	DeepResearchEvaluationDimensionResult
> {
	return {
		readableSynthesis: { passed: true, reasons: [] },
		claimGrounding: { passed: true, reasons: [] },
		sourceRelevance: { passed: true, reasons: [] },
		citationSupport: { passed: true, reasons: [] },
		comparisonCoverage: { passed: true, reasons: [] },
		searchPolicyFit: { passed: true, reasons: [] },
		durableResume: { passed: true, reasons: [] },
		localization: { passed: true, reasons: [] },
		hardSearchBehavior: { passed: true, reasons: [] },
	};
}

function failDimension(
	dimension: DeepResearchEvaluationDimensionResult,
	reason: string,
) {
	dimension.passed = false;
	if (!dimension.reasons.includes(reason)) dimension.reasons.push(reason);
}

function reportTextForEvaluation(run: DeepResearchEvaluationRun): string {
	return run.reportArtifact?.contentText ?? run.reportMarkdown ?? "";
}

function evaluateComparisonCoverage(
	run: DeepResearchEvaluationRun,
	dimension: DeepResearchEvaluationDimensionResult,
) {
	if (run.plan.reportIntent !== "comparison") return;
	const expectedCells = expectedComparisonCells(run);
	if (expectedCells.length === 0) return;
	const reportText = normalizeComparableText(reportTextForEvaluation(run));
	if (!reportText) {
		failDimension(
			dimension,
			"Persisted report artifact text is required to evaluate comparison coverage.",
		);
	}
	const acceptedClaimByEvidenceNoteId = new Set(
		run.synthesisClaims
			.filter((claim) => claim.status === "accepted" || claim.status === "limited")
			.flatMap((claim) =>
				claim.evidenceLinks
					.filter(
						(link) =>
							link.relation === "support" ||
							link.relation === "qualification",
					)
					.map((link) => link.evidenceNoteId),
			),
	);
	const missingCells = expectedCells.filter((cell) => {
		const evidence = run.evidenceNotes.find(
			(note) =>
				termsMatch(note.comparedEntity, cell.comparedEntity) &&
				termsMatch(note.comparisonAxis, cell.comparisonAxis) &&
				acceptedClaimByEvidenceNoteId.has(note.id),
		);
		if (!evidence) return true;
		const expectedText = cell.expectedText ?? evidence.findingText;
		return !reportText.includes(normalizeComparableText(expectedText));
	});
	if (missingCells.length > 0) {
		failDimension(
			dimension,
			`Persisted report is missing expected comparison coverage for ${missingCells
				.map((cell) => `${cell.comparedEntity} / ${cell.comparisonAxis}`)
				.join(", ")}.`,
		);
	}
}

function expectedComparisonCells(
	run: DeepResearchEvaluationRun,
): DeepResearchExpectedComparisonCell[] {
	if (run.expectedComparisonGrid?.length) return run.expectedComparisonGrid;
	const entities = run.plan.comparedEntities ?? [];
	const axes = run.plan.comparisonAxes ?? [];
	if (entities.length === 0 || axes.length === 0) return [];
	return entities.flatMap((comparedEntity) =>
		axes.map((comparisonAxis) => ({
			comparedEntity,
			comparisonAxis,
		})),
	);
}

function evaluateSearchPolicyFit(
	run: DeepResearchEvaluationRun,
	dimension: DeepResearchEvaluationDimensionResult,
) {
	const requests = run.discoveryRequests ?? [];
	if (requests.length === 0) return;
	const missingPolicyRequests = requests.filter((request) => !request.sourcePolicy);
	if (missingPolicyRequests.length > 0) {
		failDimension(
			dimension,
			"Discovery requests must record the source policy used for search.",
		);
	}
	const expectedCells = expectedComparisonCells(run);
	const missingDiscoveryCells = expectedCells.filter(
		(cell) =>
			!requests.some(
				(request) =>
					termsMatch(request.comparedEntity, cell.comparedEntity) &&
					termsMatch(request.comparisonAxis, cell.comparisonAxis),
			),
	);
	if (missingDiscoveryCells.length > 0) {
		failDimension(
			dimension,
			`Discovery requests did not cover expected comparison cells: ${missingDiscoveryCells
				.map((cell) => `${cell.comparedEntity} / ${cell.comparisonAxis}`)
				.join(", ")}.`,
		);
	}
	const incompatibleRequests = requests.filter(
		(request) => !isSearchPolicyCompatible(run.plan, request),
	);
	if (incompatibleRequests.length > 0) {
		failDimension(
			dimension,
			"Discovery requests used a source policy that did not fit the approved research plan.",
		);
	}
}

function isSearchPolicyCompatible(
	plan: ResearchPlan,
	request: DeepResearchEvaluationDiscoveryRequest,
): boolean {
	const policy = request.sourcePolicy;
	if (!policy) return false;
	const context = normalizeComparableText(
		[
			plan.goal,
			...plan.keyQuestions,
			...plan.constraints,
			request.query,
			request.comparedEntity ?? "",
			request.comparisonAxis ?? "",
		].join(" "),
	);
	if (
		/\b(medical|clinical|health|legal|law|regulation|financial|finance|tax|compliance|copyright)\b/u.test(
			context,
		)
	) {
		return policy === "medical_legal_financial";
	}
	if (
		/\b(api|code|software|security|repository|technical|sdk|database|architecture)\b/u.test(
			context,
		)
	) {
		return policy === "technical";
	}
	if (
		/\b(price|pricing|availability|buy|purchase|product|spec|specification|review)\b/u.test(
			context,
		)
	) {
		return policy === "commerce";
	}
	return policy === "general";
}

function hasUnresolvedMaterialClaimConflict(
	claims: DeepResearchSynthesisClaim[],
): boolean {
	const groups = new Map<string, DeepResearchSynthesisClaim[]>();
	for (const claim of claims) {
		if (!claim.competingClaimGroupId) continue;
		const group = groups.get(claim.competingClaimGroupId) ?? [];
		group.push(claim);
		groups.set(claim.competingClaimGroupId, group);
	}
	return Array.from(groups.values()).some(
		(group) =>
			group.length > 1 &&
			group.some((claim) => claim.central) &&
			group.some((claim) => claim.status !== "accepted"),
	);
}

function isSourceNoteDumpReport(markdown: string): boolean {
	const keyFindings = extractMarkdownBullets(markdown, "Key Findings");
	const analysis = extractMarkdownBullets(markdown, "Analysis");
	if (keyFindings.length >= 3 && analysis.length >= 3) {
		const normalizedAnalysis = new Set(analysis.map(normalizeComparableLine));
		const repeatedBullets = keyFindings.filter((bullet) =>
			normalizedAnalysis.has(normalizeComparableLine(bullet)),
		);
		if (repeatedBullets.length >= 3) return true;
	}
	const narrativeBullets = extractNarrativeMarkdownBullets(markdown);
	const sourceNoteBullets = narrativeBullets.filter(isSourceNoteLikeBullet);
	return (
		sourceNoteBullets.length >= 3 &&
		sourceNoteBullets.length / Math.max(1, narrativeBullets.length) >= 0.6
	);
}

function extractMarkdownBullets(markdown: string, heading: string): string[] {
	const lines = markdown.split(/\r?\n/);
	const bullets: string[] = [];
	let inSection = false;
	for (const line of lines) {
		if (line.startsWith("## ")) {
			inSection = line.trim() === `## ${heading}`;
			continue;
		}
		if (!inSection) continue;
		const match = line.match(/^-\s+(.+)$/);
		if (match) bullets.push(match[1].trim());
	}
	return bullets;
}

function extractNarrativeMarkdownBullets(markdown: string): string[] {
	const lines = markdown.split(/\r?\n/);
	const bullets: string[] = [];
	let inSourceAppendix = false;
	for (const line of lines) {
		const heading = line.match(/^#{2,6}\s+(.+)$/);
		if (heading) {
			inSourceAppendix =
				/\b(sources?|references?|bibliography|source ledger|appendix: sources)\b/iu.test(
					heading[1] ?? "",
				);
			continue;
		}
		if (inSourceAppendix) continue;
		const match = line.match(/^-\s+(.+)$/);
		if (match) bullets.push(match[1].trim());
	}
	return bullets;
}

function isSourceNoteLikeBullet(value: string): boolean {
	const normalized = normalizeComparableText(value);
	if (
		/^(source note|source|evidence note|reviewed source|reviewed note):/u.test(
			normalized,
		)
	) {
		return true;
	}
	return (
		/https?:\/\//iu.test(value) &&
		/\b(official|specs?|review|forum|briefing|documentation|docs|source)\b/u.test(
			normalized,
		)
	);
}

function normalizeComparableLine(value: string): string {
	return value
		.replace(/\s+\[\d+\]$/u, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

function normalizeComparableText(value: string): string {
	return value
		.replace(/\s+\[\d+\]/gu, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

function termsMatch(left: string | null | undefined, right: string): boolean {
	return normalizeComparableText(left ?? "") === normalizeComparableText(right);
}

function hasDurableCrashResumeTrace(
	trace: DeepResearchEvaluationResumeTrace,
): boolean {
	const uniquePassNumbers = new Set(trace.passNumbers);
	const uniqueResumeKeys = new Set(
		trace.resumePoints.map((resumePoint) => resumePoint.resumeKey),
	);
	return (
		uniquePassNumbers.size >= 2 &&
		uniqueResumeKeys.size === trace.resumePoints.length &&
		trace.resumePoints.every(
			(resumePoint) => resumePoint.status === "completed",
		)
	);
}

function hasHungarianResearchOutput(
	localizedOutputs: string[],
	reportMarkdown = "",
): boolean {
	const output = [...localizedOutputs, reportMarkdown].join("\n");
	const requiredLabels = [
		"Kutatási terv",
		"Idővonal",
		"Bizonyítékkorlát-memó",
		"Kutatási jelentés",
	];
	const forbiddenEnglishLabels = [
		"Research Plan",
		"Timeline",
		"Evidence Limitation Memo",
		"Research Report",
		"Executive Summary",
	];
	return (
		requiredLabels.every((label) => output.includes(label)) &&
		forbiddenEnglishLabels.every((label) => !output.includes(label))
	);
}

function hasKimiInspiredHardSearchTrace(
	trace: DeepResearchHardSearchStep[],
): boolean {
	const requiredOrder: DeepResearchHardSearchStep[] = [
		"search",
		"cross_validation",
		"conflict_correction",
		"cautious_verification",
		"answer",
	];
	let cursor = 0;
	for (const step of trace) {
		if (step === requiredOrder[cursor]) cursor += 1;
	}
	return cursor === requiredOrder.length;
}

function reviewedSource(
	overrides: Partial<ReviewedCoverageSource> &
		Pick<ReviewedCoverageSource, "id">,
): ReviewedCoverageSource {
	return {
		id: overrides.id,
		title: overrides.title ?? overrides.id,
		canonicalUrl:
			overrides.canonicalUrl ?? `https://example.test/${overrides.id}`,
		supportedKeyQuestions: overrides.supportedKeyQuestions ?? [],
		keyFindings: overrides.keyFindings ?? [],
		qualityScore: overrides.qualityScore ?? 75,
		topicRelevant: overrides.topicRelevant ?? true,
	};
}

function evidenceNote(
	overrides: Partial<DeepResearchEvidenceNote> &
		Pick<DeepResearchEvidenceNote, "id" | "findingText">,
): DeepResearchEvidenceNote {
	return {
		id: overrides.id,
		jobId: "evaluation-job",
		conversationId: "evaluation-conversation",
		userId: "evaluation-user",
		passCheckpointId: "pass-1",
		passNumber: 1,
		sourceId: overrides.sourceId ?? null,
		taskId: overrides.taskId ?? null,
		supportedKeyQuestion: overrides.supportedKeyQuestion ?? null,
		comparedEntity: overrides.comparedEntity ?? null,
		comparisonAxis: overrides.comparisonAxis ?? null,
		findingText: overrides.findingText,
		sourceSupport: overrides.sourceSupport ?? {},
		sourceQualitySignals: overrides.sourceQualitySignals ?? null,
		sourceAuthoritySummary: overrides.sourceAuthoritySummary ?? null,
		createdAt: "2026-05-05T10:00:00.000Z",
		updatedAt: "2026-05-05T10:00:00.000Z",
	};
}

function synthesisClaim(input: {
	id: string;
	statement: string;
	planQuestion: string;
	status: DeepResearchSynthesisClaim["status"];
	statusReason?: string | null;
	evidenceNoteId: string;
	central?: boolean;
	competingClaimGroupId?: string | null;
}): DeepResearchSynthesisClaim {
	return {
		id: input.id,
		jobId: "evaluation-job",
		conversationId: "evaluation-conversation",
		userId: "evaluation-user",
		passCheckpointId: "pass-1",
		synthesisPass: "synthesis-pass-1",
		planQuestion: input.planQuestion,
		reportSection: "Key findings",
		statement: input.statement,
		claimType: "general",
		central: input.central ?? true,
		status: input.status,
		statusReason: input.statusReason ?? null,
		competingClaimGroupId: input.competingClaimGroupId ?? null,
		evidenceLinks: [
			{
				id: `${input.id}-link`,
				claimId: input.id,
				evidenceNoteId: input.evidenceNoteId,
				jobId: "evaluation-job",
				conversationId: "evaluation-conversation",
				userId: "evaluation-user",
				relation: "support",
				rationale: null,
				material: true,
				createdAt: "2026-05-05T10:01:00.000Z",
			},
		],
		createdAt: "2026-05-05T10:01:00.000Z",
		updatedAt: "2026-05-05T10:01:00.000Z",
	};
}
