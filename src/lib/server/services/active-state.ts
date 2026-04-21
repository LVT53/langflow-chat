import { parseWorkingDocumentMetadata } from "$lib/server/services/knowledge/store";
import type { Artifact, WorkingSetReasonCode } from "$lib/types";
import { resolveCurrentGeneratedDocumentSelection } from "./document-resolution";

const DOCUMENT_FOCUS_RE =
	/\b(document|doc|file|pdf|attachment|attached|resume|cv|recipe|job description|contract|report)\b/i;
const USER_CORRECTION_RE =
	/\b(actually|instead|rather than|use the previous|use the earlier|change it to|revise this|refine this|update this|fix this|correct this|replace that|not that one)\b/i;
const CONTEXT_RESET_RE =
	/\b(done with (?:that|this|it)|finished with (?:that|this|it)|finished (?:that|this|it)|completed (?:that|this|it)|that(?:'s| is) done|wrapped up|move on|switch topics|new topic|another topic|something else|let's talk about something else)\b/i;

export interface ActiveDocumentState {
	documentFocused: boolean;
	hasRecentUserCorrection: boolean;
	hasContextResetSignal: boolean;
	activeDocumentIds: Set<string>;
	correctionTargetIds: Set<string>;
	recentlyRefinedFamilyId: string | null;
	recentlyRefinedArtifactIds: Set<string>;
	currentGeneratedArtifactId: string | null;
	latestGeneratedArtifactIds: string[];
	currentGeneratedReasonCodes: Set<WorkingSetReasonCode>;
}

const LIVE_DOCUMENT_REASON_CODES: WorkingSetReasonCode[] = [
	"attached_this_turn",
	"active_document_focus",
	"recent_user_correction",
	"recently_refined_document_family",
	"current_generated_document",
	"latest_generated_output",
	"matched_current_turn",
];

function isDocumentFocusedTurn(
	message: string,
	attachmentIds: string[] = [],
): boolean {
	return attachmentIds.length > 0 || DOCUMENT_FOCUS_RE.test(message);
}

export function hasRecentUserCorrectionSignal(
	message: string | null | undefined,
): boolean {
	if (!message?.trim()) return false;
	return USER_CORRECTION_RE.test(message);
}

function hasActiveContextResetSignal(
	message: string | null | undefined,
): boolean {
	if (!message?.trim()) return false;
	return CONTEXT_RESET_RE.test(message);
}

export function deriveCurrentTurnReasonCodes(params: {
	artifactId: string;
	reasonCodes: WorkingSetReasonCode[];
	activeDocumentState: ActiveDocumentState;
}): WorkingSetReasonCode[] {
	const nextReasonCodes = new Set(params.reasonCodes);
	for (const code of LIVE_DOCUMENT_REASON_CODES) {
		nextReasonCodes.delete(code);
	}

	if (params.activeDocumentState.activeDocumentIds.has(params.artifactId)) {
		nextReasonCodes.add("active_document_focus");
	}
	if (params.activeDocumentState.correctionTargetIds.has(params.artifactId)) {
		nextReasonCodes.add("recent_user_correction");
	}
	if (
		params.activeDocumentState.recentlyRefinedArtifactIds.has(params.artifactId)
	) {
		nextReasonCodes.add("recently_refined_document_family");
	}
	if (
		params.activeDocumentState.currentGeneratedArtifactId === params.artifactId
	) {
		for (const code of params.activeDocumentState.currentGeneratedReasonCodes) {
			nextReasonCodes.add(code);
		}
	}

	return Array.from(nextReasonCodes);
}

function hasGeneratedDocumentRefinementMetadata(artifact: Artifact): boolean {
	const metadata = parseWorkingDocumentMetadata(artifact.metadata);
	const recentVersionIds = Array.isArray(
		artifact.metadata?.recentGeneratedVersionIds,
	)
		? artifact.metadata.recentGeneratedVersionIds.filter(
				(value): value is string =>
					typeof value === "string" && value.trim().length > 0,
			)
		: [];

	return Boolean(
		metadata.documentFamilyId &&
			((metadata.versionNumber ?? 0) > 1 ||
				metadata.supersedesArtifactId ||
				recentVersionIds.length > 0 ||
				(typeof artifact.metadata?.previousGeneratedArtifactId === "string" &&
					artifact.metadata.previousGeneratedArtifactId.trim().length > 0)),
	);
}

function resolveRecentlyRefinedGeneratedFamily(params: {
	artifacts: Artifact[];
	preferredArtifactId?: string | null;
	currentConversationId?: string | null;
}): {
	familyId: string | null;
	latestArtifactIds: string[];
} {
	const allGeneratedArtifacts = params.artifacts
		.filter((artifact) => artifact.type === "generated_output")
		.slice()
		.sort((left, right) => right.updatedAt - left.updatedAt);
	const sameConversationArtifacts = params.currentConversationId
		? allGeneratedArtifacts.filter(
				(artifact) => artifact.conversationId === params.currentConversationId,
			)
		: [];
	const generatedArtifacts =
		sameConversationArtifacts.length > 0
			? sameConversationArtifacts
			: allGeneratedArtifacts;

	const preferredArtifact = params.preferredArtifactId
		? (generatedArtifacts.find(
				(artifact) => artifact.id === params.preferredArtifactId,
			) ?? null)
		: null;
	const preferredMetadata = preferredArtifact
		? parseWorkingDocumentMetadata(preferredArtifact.metadata)
		: null;

	if (
		preferredArtifact &&
		preferredMetadata?.documentFamilyId &&
		hasGeneratedDocumentRefinementMetadata(preferredArtifact)
	) {
		return {
			familyId: preferredMetadata.documentFamilyId,
			latestArtifactIds: [preferredArtifact.id],
		};
	}

	const recentRefinedArtifact =
		generatedArtifacts.find((artifact) =>
			hasGeneratedDocumentRefinementMetadata(artifact),
		) ?? null;
	const recentRefinedMetadata = recentRefinedArtifact
		? parseWorkingDocumentMetadata(recentRefinedArtifact.metadata)
		: null;

	if (!recentRefinedMetadata?.documentFamilyId) {
		return {
			familyId: null,
			latestArtifactIds: [],
		};
	}

	const latestArtifactForFamily =
		generatedArtifacts.find((artifact) => {
			const metadata = parseWorkingDocumentMetadata(artifact.metadata);
			return (
				metadata.documentFamilyId === recentRefinedMetadata.documentFamilyId
			);
		}) ?? null;

	return {
		familyId: recentRefinedMetadata.documentFamilyId,
		latestArtifactIds: latestArtifactForFamily
			? [latestArtifactForFamily.id]
			: [],
	};
}

export function buildActiveDocumentState(params: {
	artifacts: Artifact[];
	message: string;
	attachmentIds?: string[];
	activeDocumentArtifactId?: string;
	preferredGeneratedArtifactId?: string | null;
	currentConversationId?: string | null;
}): ActiveDocumentState {
	const hasContextResetSignal = hasActiveContextResetSignal(params.message);
	const shouldContinueDocumentState = !hasContextResetSignal;
	const recentRefinedState = shouldContinueDocumentState
		? resolveRecentlyRefinedGeneratedFamily({
				artifacts: params.artifacts,
				preferredArtifactId:
					params.activeDocumentArtifactId ??
					params.preferredGeneratedArtifactId ??
					null,
				currentConversationId: params.currentConversationId ?? null,
			})
		: {
				familyId: null,
				latestArtifactIds: [],
			};
	const selection = shouldContinueDocumentState
		? resolveCurrentGeneratedDocumentSelection({
				artifacts: params.artifacts,
				preferredArtifactId:
					params.activeDocumentArtifactId ??
					params.preferredGeneratedArtifactId,
				preferredFamilyId: recentRefinedState.familyId,
				query: params.message.trim(),
				currentConversationId: params.currentConversationId ?? null,
			})
		: {
				primaryArtifactId: null,
				latestArtifactIds: [],
				latestArtifacts: [],
				primaryReasonCodes: [],
			};
	const documentFocused =
		shouldContinueDocumentState &&
		(Boolean(params.activeDocumentArtifactId) ||
			isDocumentFocusedTurn(params.message, params.attachmentIds ?? []));
	const hasRecentUserCorrection = hasRecentUserCorrectionSignal(params.message);
	const activeDocumentIds = new Set(
		shouldContinueDocumentState && params.activeDocumentArtifactId
			? [params.activeDocumentArtifactId]
			: [],
	);
	const correctionTargetIds = new Set<string>();
	if (shouldContinueDocumentState && hasRecentUserCorrection) {
		for (const artifactId of activeDocumentIds) {
			correctionTargetIds.add(artifactId);
		}
		if (selection.primaryArtifactId) {
			correctionTargetIds.add(selection.primaryArtifactId);
		}
	}

	return {
		documentFocused,
		hasRecentUserCorrection,
		hasContextResetSignal,
		activeDocumentIds,
		correctionTargetIds,
		recentlyRefinedFamilyId: recentRefinedState.familyId,
		recentlyRefinedArtifactIds: new Set(recentRefinedState.latestArtifactIds),
		currentGeneratedArtifactId: selection.primaryArtifactId,
		latestGeneratedArtifactIds: selection.latestArtifactIds,
		currentGeneratedReasonCodes: new Set(selection.primaryReasonCodes),
	};
}
