import type { DeepResearchClaimType } from "$lib/types";
import { classifyDeepResearchClaimType } from "./source-quality";
import type { PersistedReviewedResearchSourceNotes } from "./source-review";

export type ResearchSourceReference = {
	reviewedSourceId: string;
	discoveredSourceId: string;
	canonicalUrl: string;
	title: string;
};

export type SynthesisFindingKind =
	| "supported"
	| "conflict"
	| "assumption"
	| "report_limitation";

export type SynthesisFinding = {
	kind: SynthesisFindingKind;
	statement: string;
	sourceRefs: ResearchSourceReference[];
	claimType?: DeepResearchClaimType;
	central?: boolean;
};

export type CompletedResearchTaskOutput = {
	id: string;
	output: string;
	supportLevel?: "strong" | "weak" | "missing";
	sourceRefs?: ResearchSourceReference[];
	limitation?: string | null;
};

export type BuildSynthesisNotesInput = {
	jobId: string;
	reviewedSources: PersistedReviewedResearchSourceNotes[];
	completedTasks: CompletedResearchTaskOutput[];
};

export type SynthesisNotes = {
	jobId: string;
	findings: SynthesisFinding[];
	supportedFindings: SynthesisFinding[];
	conflicts: SynthesisFinding[];
	assumptions: SynthesisFinding[];
	reportLimitations: SynthesisFinding[];
};

export async function buildSynthesisNotes(
	input: BuildSynthesisNotesInput,
): Promise<SynthesisNotes> {
	const eligibleReviewedSources = input.reviewedSources.filter(
		isAcceptedReviewedSource,
	);
	const reviewedSourcesById = new Map(
		input.reviewedSources.map((source) => [source.id, source]),
	);
	const reviewedFindings = eligibleReviewedSources.flatMap((source) =>
		source.keyFindings.map((finding) => ({
			kind: "supported" as const,
			statement: normalizeText(finding),
			sourceRefs: [mapReviewedSourceReference(source)],
			claimType: classifyDeepResearchClaimType(finding),
			central: true,
		})),
	);
	const { conflicts, conflictedStatements } =
		findConflictingReviewedFindings(reviewedFindings);
	const supportedFindings = reviewedFindings.filter(
		(finding) => !conflictedStatements.has(finding.statement),
	);
	const taskSynthesis = synthesizeCompletedTaskOutputs(
		input.completedTasks,
		reviewedSourcesById,
	);
	const finalSupportedFindings = [
		...taskSynthesis.supportedFindings,
		...supportedFindings,
	];
	const findings = [
		...finalSupportedFindings,
		...conflicts,
		...taskSynthesis.assumptions,
		...taskSynthesis.reportLimitations,
	];

	return {
		jobId: input.jobId,
		findings,
		supportedFindings: finalSupportedFindings,
		conflicts,
		assumptions: taskSynthesis.assumptions,
		reportLimitations: taskSynthesis.reportLimitations,
	};
}

function synthesizeCompletedTaskOutputs(
	tasks: CompletedResearchTaskOutput[],
	reviewedSourcesById: Map<string, PersistedReviewedResearchSourceNotes>,
): {
	supportedFindings: SynthesisFinding[];
	assumptions: SynthesisFinding[];
	reportLimitations: SynthesisFinding[];
} {
	const supportedFindings: SynthesisFinding[] = [];
	const assumptions: SynthesisFinding[] = [];
	const reportLimitations: SynthesisFinding[] = [];

	for (const task of tasks) {
		const sourceRefs = (task.sourceRefs ?? []).filter((sourceRef) => {
			const reviewedSource = reviewedSourcesById.get(sourceRef.reviewedSourceId);
			return !reviewedSource || isAcceptedReviewedSource(reviewedSource);
		});
		const declaredSupportLevel =
			task.supportLevel ?? (sourceRefs.length > 0 ? "strong" : "missing");
		const supportLevel =
			declaredSupportLevel === "strong" && sourceRefs.length === 0
				? "missing"
				: declaredSupportLevel;
		const finding: SynthesisFinding = {
			kind: supportLevel === "strong" ? "supported" : "assumption",
			statement: normalizeText(task.output),
			sourceRefs,
		};

		if (supportLevel === "strong" && sourceRefs.length > 0) {
			supportedFindings.push({
				...finding,
				claimType: classifyDeepResearchClaimType(finding.statement),
				central: true,
			});
		} else {
			assumptions.push(finding);
		}

		if (task.limitation) {
			reportLimitations.push({
				kind: "report_limitation",
				statement: normalizeText(task.limitation),
				sourceRefs,
			});
		}
	}

	return { supportedFindings, assumptions, reportLimitations };
}

function isAcceptedReviewedSource(
	source: PersistedReviewedResearchSourceNotes,
): boolean {
	return !source.rejectedReason && source.topicRelevant !== false;
}

function findConflictingReviewedFindings(findings: SynthesisFinding[]): {
	conflicts: SynthesisFinding[];
	conflictedStatements: Set<string>;
} {
	const conflicts: SynthesisFinding[] = [];
	const conflictedStatements = new Set<string>();

	for (let leftIndex = 0; leftIndex < findings.length; leftIndex += 1) {
		for (
			let rightIndex = leftIndex + 1;
			rightIndex < findings.length;
			rightIndex += 1
		) {
			const left = findings[leftIndex];
			const right = findings[rightIndex];
			if (!areDirectionalClaimsInConflict(left.statement, right.statement)) {
				continue;
			}

			conflictedStatements.add(left.statement);
			conflictedStatements.add(right.statement);
			conflicts.push({
				kind: "conflict",
				statement: `Reviewed Sources disagree: ${left.statement} / ${right.statement}`,
				sourceRefs: [...left.sourceRefs, ...right.sourceRefs],
			});
		}
	}

	return { conflicts, conflictedStatements };
}

function areDirectionalClaimsInConflict(left: string, right: string): boolean {
	const leftDirection = directionalSignal(left);
	const rightDirection = directionalSignal(right);

	if (!leftDirection || !rightDirection || leftDirection === rightDirection) {
		return false;
	}

	return topicKey(left) === topicKey(right);
}

function directionalSignal(value: string): "up" | "down" | null {
	const normalized = value.toLowerCase();
	if (
		/\b(increased|increase|rising|rose|higher|grew|growth)\b/.test(normalized)
	) {
		return "up";
	}
	if (
		/\b(decreased|decrease|falling|fell|lower|declined|decline)\b/.test(
			normalized,
		)
	) {
		return "down";
	}
	return null;
}

function topicKey(value: string): string {
	return value
		.toLowerCase()
		.replace(
			/\b(increased|increase|rising|rose|higher|grew|growth|decreased|decrease|falling|fell|lower|declined|decline)\b/g,
			"",
		)
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function mapReviewedSourceReference(
	source: PersistedReviewedResearchSourceNotes,
): ResearchSourceReference {
	return {
		reviewedSourceId: source.id,
		discoveredSourceId: source.discoveredSourceId,
		canonicalUrl: source.canonicalUrl,
		title: source.title,
	};
}

function normalizeText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}
