import type { PersonaMemoryItem } from '$lib/types';
import { shouldIncludePersonaMemoryInGeneratedContext } from '$lib/server/utils/conversation-boundary-filter';
import {
	determineTeiWinningMode,
	logTeiRetrievalSummary,
	type SemanticShortlistDiagnostics,
	type TeiRerankDiagnostics,
} from '../tei-observability';
import { canUseTeiReranker, rerankItems } from '../tei-reranker';
import { scoreMatch } from '../working-set';
import { shortlistSemanticMatchesBySubject } from '../semantic-ranking';
import {
	ensureClustersReadyInFlight,
	listPersonaMemoryClusters,
	ensurePersonaMemoryClustersReady,
	promptRefreshTriggeredAt,
} from '../persona-memory';

const ACTIVE_PROMPT_LIMIT = 8;
const DORMANT_PROMPT_LIMIT = 2;
const PROMPT_TEXT_BUDGET = 1600;
const PROMPT_REFRESH_THROTTLE_MS = 60_000;
const PERSONA_SEMANTIC_SHORTLIST_LIMIT = 12;
const PERSONA_RERANK_LIMIT = 8;

function getPersonaLexicalMatchScore(item: PersonaMemoryItem, query: string): number {
	return Math.max(
		scoreMatch(query, item.rawCanonicalText ?? item.canonicalText),
		item.topicKey ? scoreMatch(query, item.topicKey) : 0
	);
}

function getPersonaQueryMatchScore(params: {
	item: PersonaMemoryItem;
	query: string;
	semanticScoreById: Map<string, number>;
	rerankScoreById: Map<string, number>;
}): number {
	const lexicalScore = getPersonaLexicalMatchScore(params.item, params.query);
	const semanticScore = params.semanticScoreById.get(params.item.id) ?? 0;
	const rerankScore = params.rerankScoreById.get(params.item.id) ?? 0;

	return lexicalScore + semanticScore * 3 + rerankScore * 4;
}

async function buildPersonaQueryScoreMaps(params: {
	userId: string;
	query: string;
	items: PersonaMemoryItem[];
}): Promise<{
	semanticScoreById: Map<string, number>;
	rerankScoreById: Map<string, number>;
	semanticDiagnostics: SemanticShortlistDiagnostics | null;
	rerankDiagnostics: TeiRerankDiagnostics | null;
}> {
	const trimmedQuery = params.query.trim();
	if (!trimmedQuery || params.items.length === 0) {
		return {
			semanticScoreById: new Map(),
			rerankScoreById: new Map(),
			semanticDiagnostics: null,
			rerankDiagnostics: null,
		};
	}

	let semanticDiagnostics: SemanticShortlistDiagnostics | null = null;
	const semanticMatches =
		(await shortlistSemanticMatchesBySubject({
			userId: params.userId,
			subjectType: 'persona_cluster',
			query: trimmedQuery,
			items: params.items,
			getSubjectId: (item) => item.id,
			limit: PERSONA_SEMANTIC_SHORTLIST_LIMIT,
			onDiagnostics: (diagnostics) => {
				semanticDiagnostics = diagnostics;
			},
		})) ?? [];
	const semanticScoreById = new Map(
		semanticMatches.map((match) => [match.subjectId, match.semanticScore])
	);

	let rerankScoreById = new Map<string, number>();
	let rerankDiagnostics: TeiRerankDiagnostics | null = null;
	if (canUseTeiReranker() && semanticMatches.length > 1) {
		try {
			const reranked = await rerankItems({
				query: trimmedQuery,
				items: semanticMatches.map((match) => match.item),
				getText: (item) => item.rawCanonicalText ?? item.canonicalText,
				maxTexts: PERSONA_RERANK_LIMIT,
				onDiagnostics: (diagnostics) => {
					rerankDiagnostics = diagnostics;
				},
			});

			if (reranked && reranked.items.length > 0) {
				rerankScoreById = new Map(
					reranked.items.map((entry) => [entry.item.id, entry.score])
				);
			}
		} catch (error) {
			console.error('[PERSONA_MEMORY] Semantic reranker failed:', {
				userId: params.userId,
				error,
			});
		}
	}

	return {
		semanticScoreById,
		rerankScoreById,
		semanticDiagnostics,
		rerankDiagnostics,
	};
}

export async function buildPersonaPromptContext(
	userId: string,
	query: string
): Promise<string> {
	const now = Date.now();
	const lastRefreshAt = promptRefreshTriggeredAt.get(userId) ?? 0;
	if (
		!ensureClustersReadyInFlight.has(userId) &&
		now - lastRefreshAt >= PROMPT_REFRESH_THROTTLE_MS
	) {
		promptRefreshTriggeredAt.set(userId, now);
		void ensurePersonaMemoryClustersReady(userId, 'prompt_read').catch((error) => {
			console.warn('[PERSONA_MEMORY] Background cluster refresh failed', {
				userId,
				reason: 'prompt_read',
				error,
			});
		});
	}

	const items = (await listPersonaMemoryClusters(userId)).filter((item) => {
		if (item.state === 'archived') return false;
		if (item.topicStatus === 'historical') return false;
		if (item.temporal?.freshness === 'expired' || item.temporal?.freshness === 'historical') {
			return false;
		}
		return true;
	});
	if (items.length === 0) return '';

	const { semanticScoreById, rerankScoreById, semanticDiagnostics, rerankDiagnostics } =
		await buildPersonaQueryScoreMaps({
		userId,
		query,
		items,
	});

	const isGeneratedDocumentRequest =
		/\bgenerate_file\b/i.test(query) ||
		(/\b(?:generate|create|write|draft|make)\b/i.test(query) &&
			/\b(?:file|document|pdf|report|presentation|deck|slide|spreadsheet)\b/i.test(query));

	const activeConstraints = items
		.filter((item) => item.state === 'active' && item.activeConstraint)
		.map((item) => ({
			item,
			matchScore: getPersonaQueryMatchScore({
				item,
				query,
				semanticScoreById,
				rerankScoreById,
			}),
			constraintRank:
				item.activeConstraint && item.temporal?.freshness === 'active'
					? 2
					: item.activeConstraint && item.temporal?.freshness === 'stale'
						? 1
						: 0,
		}))
		.filter((entry) =>
			shouldIncludePersonaMemoryInGeneratedContext({
				memoryCanonicalText: entry.item.canonicalText,
				currentQuery: query,
				queryOverlap: entry.matchScore,
				isGeneratedDocumentRequest,
			})
		)
		.sort(
			(left, right) =>
				right.constraintRank - left.constraintRank ||
				right.matchScore - left.matchScore ||
				right.item.salienceScore - left.item.salienceScore ||
				right.item.lastSeenAt - left.item.lastSeenAt
		)
		.slice(0, ACTIVE_PROMPT_LIMIT);
	const active = items
		.filter((item) => item.state === 'active' && !item.activeConstraint)
		.map((item) => ({
			item,
			matchScore: getPersonaQueryMatchScore({
				item,
				query,
				semanticScoreById,
				rerankScoreById,
			}),
		}))
		.filter((entry) =>
			shouldIncludePersonaMemoryInGeneratedContext({
				memoryCanonicalText: entry.item.canonicalText,
				currentQuery: query,
				queryOverlap: entry.matchScore,
				isGeneratedDocumentRequest,
			})
		)
		.sort(
			(left, right) =>
				right.matchScore - left.matchScore ||
				right.item.salienceScore - left.item.salienceScore ||
				right.item.lastSeenAt - left.item.lastSeenAt
		)
		.slice(0, ACTIVE_PROMPT_LIMIT);
	const dormant = items
		.filter((item) => item.state === 'dormant' && !item.activeConstraint)
		.map((item) => ({
			item,
			matchScore: getPersonaQueryMatchScore({
				item,
				query,
				semanticScoreById,
				rerankScoreById,
			}),
		}))
		.filter((entry) => entry.matchScore >= 0.1)
		.filter((entry) =>
			shouldIncludePersonaMemoryInGeneratedContext({
				memoryCanonicalText: entry.item.canonicalText,
				currentQuery: query,
				queryOverlap: entry.matchScore,
				isGeneratedDocumentRequest,
			})
		)
		.sort(
			(left, right) =>
				right.matchScore - left.matchScore ||
				Number(right.item.activeConstraint) - Number(left.item.activeConstraint) ||
				right.item.salienceScore - left.item.salienceScore
		)
		.slice(0, DORMANT_PROMPT_LIMIT)
		.map((entry) => entry.item);

	const selected = Array.from(
		new Map(
			[
				...activeConstraints.map((entry) => entry.item),
				...active.map((entry) => entry.item),
				...dormant,
			].map((item) => [item.id, item])
		).values()
	);
	if (selected.length === 0) return '';

	const winningCandidates = [
		...activeConstraints.map((entry) => ({
			item: entry.item,
			matchScore: entry.matchScore,
		})),
		...active.map((entry) => ({
			item: entry.item,
			matchScore: entry.matchScore,
		})),
		...dormant.map((item) => ({
			item,
			matchScore: getPersonaQueryMatchScore({
				item,
				query,
				semanticScoreById,
				rerankScoreById,
			}),
		})),
	].sort(
		(left, right) =>
			right.matchScore - left.matchScore ||
			right.item.salienceScore - left.item.salienceScore ||
			right.item.lastSeenAt - left.item.lastSeenAt
	);
	const winningCandidate = winningCandidates[0] ?? null;
	logTeiRetrievalSummary({
		scope: 'persona_prompt',
		userId,
		queryLength: query.trim().length,
		candidateCount: items.length,
		semantic: semanticDiagnostics,
		rerank: rerankDiagnostics,
		winningMode: determineTeiWinningMode({
			lexicalScore: winningCandidate
				? getPersonaLexicalMatchScore(winningCandidate.item, query)
				: 0,
			semanticScore: winningCandidate
				? semanticScoreById.get(winningCandidate.item.id) ?? 0
				: 0,
			rerankScore: winningCandidate
				? rerankScoreById.get(winningCandidate.item.id) ?? 0
				: 0,
		}),
		winnerId: winningCandidate?.item.id ?? null,
		extra: {
			selectedCount: selected.length,
			activeConstraintCount: activeConstraints.length,
			activeCount: active.length,
			dormantCount: dormant.length,
		},
	});

	const lines: string[] = [];
	let used = 0;
	for (const item of selected) {
		const line = `- ${item.canonicalText}`;
		used += line.length;
		if (used > PROMPT_TEXT_BUDGET) break;
		lines.push(line);
	}

	return lines.length > 0 ? lines.join('\n') : '';
}
