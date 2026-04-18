export function isCrossConversationArtifactEligible(params: {
	artifactConversationId: string | null;
	currentConversationId: string;
	matchScore: number;
	explicitlyRequested: boolean;
	minMatchScore?: number;
}): boolean {
	const { artifactConversationId, currentConversationId, matchScore, explicitlyRequested, minMatchScore = 3 } = params;

	if (artifactConversationId === null || artifactConversationId === currentConversationId) {
		return true;
	}

	return matchScore >= minMatchScore || explicitlyRequested;
}

export function applyConversationBoundaryPenalty(params: {
	score: number;
	isSameConversation: boolean;
	daysSinceLastAccess: number;
}): number {
	const { score, isSameConversation, daysSinceLastAccess } = params;

	if (isSameConversation) {
		return score;
	}

	const decayed = score * Math.exp(-0.05 * daysSinceLastAccess);
	return Math.max(0, decayed);
}

export function shouldIncludePersonaMemoryInGeneratedContext(params: {
	memoryCanonicalText: string;
	currentQuery: string;
	queryOverlap: number;
	isGeneratedDocumentRequest: boolean;
}): boolean {
	const { queryOverlap, isGeneratedDocumentRequest } = params;

	if (!isGeneratedDocumentRequest) {
		return true;
	}

	return queryOverlap >= 2;
}