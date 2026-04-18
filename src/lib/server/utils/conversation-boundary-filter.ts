export function isCrossConversationArtifactEligible(params: {
	artifactConversationId: string | null;
	currentConversationId: string;
	matchScore: number;
	explicitlyRequested: boolean;
}): boolean {
	const { artifactConversationId, currentConversationId, matchScore, explicitlyRequested } = params;

	if (artifactConversationId === null || artifactConversationId === currentConversationId) {
		return true;
	}

	return matchScore >= 3 || explicitlyRequested;
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