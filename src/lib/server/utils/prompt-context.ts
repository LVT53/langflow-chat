import type {
	Artifact,
	ConversationContextStatus,
	MemoryLayer,
	WorkCapsule,
} from '$lib/types';
import { estimateTokenCount } from '$lib/utils/tokens';

export type PromptContextSection = {
	title: string;
	body: string;
	layer?: MemoryLayer;
	essential?: boolean;
	llmCompactible?: boolean;
};

type HistoricalSectionReranker = (params: {
	query: string;
	candidates: PromptContextSection[];
}) => Promise<{
	selectedTitles: string[];
	confidence: number;
} | null>;

export function truncateToTokenBudget(text: string, maxTokens: number): string {
	if (estimateTokenCount(text) <= maxTokens) return text;
	const chars = Math.max(300, maxTokens * 4);
	return `${text.slice(0, chars).trim()}\n...[truncated]`;
}

export function buildContextSection(title: string, body: string): string {
	const trimmed = body.trim();
	return trimmed ? `## ${title}\n${trimmed}` : '';
}

export function dedupeById<T extends { id: string }>(items: T[]): T[] {
	return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

export function serializeRoleMessages<T>(
	messages: T[],
	resolveRole: (message: T) => 'user' | 'assistant',
	resolveContent: (message: T) => string,
	limit = messages.length
): string {
	return messages
		.slice(-limit)
		.map((message) => `${resolveRole(message).toUpperCase()}: ${resolveContent(message).trim()}`)
		.join('\n\n');
}

export function selectRecentRoleTurns<T>(
	messages: T[],
	resolveRole: (message: T) => 'user' | 'assistant',
	limit: number
): Array<{ messages: T[] }> {
	const turns: Array<{ messages: T[] }> = [];
	let currentTurn: T[] = [];

	for (const message of messages) {
		const role = resolveRole(message);
		if (role === 'user') {
			if (currentTurn.length > 0) {
				turns.push({ messages: currentTurn });
			}
			currentTurn = [message];
			continue;
		}

		if (currentTurn.length === 0) {
			currentTurn = [message];
		} else {
			currentTurn.push(message);
		}
	}

	if (currentTurn.length > 0) {
		turns.push({ messages: currentTurn });
	}

	return turns.slice(-limit);
}

export function serializePeerContext(peerContext: {
	representation: string | null;
	peerCard: string[] | null;
}): string {
	const parts: string[] = [];
	if (peerContext.representation?.trim()) {
		parts.push(peerContext.representation.trim());
	}
	if (peerContext.peerCard?.length) {
		parts.push(`Peer card:\n- ${peerContext.peerCard.join('\n- ')}`);
	}
	return parts.join('\n\n');
}

export function serializeWorkCapsules(capsules: WorkCapsule[]): string {
	return capsules
		.map((capsule) => {
			const lines = [
				`Workflow: ${capsule.artifact.name}`,
				capsule.taskSummary ? `Task: ${capsule.taskSummary}` : null,
				capsule.workflowSummary ? `Summary: ${capsule.workflowSummary}` : null,
				capsule.keyConclusions.length > 0
					? `Key conclusions: ${capsule.keyConclusions.join(' ')}`
					: null,
				capsule.reusablePatterns.length > 0
					? `Reusable patterns: ${capsule.reusablePatterns.join(' ')}`
					: null,
			].filter((line): line is string => Boolean(line));
			return lines.join('\n');
		})
		.join('\n\n');
}

export function serializeArtifacts(params: {
	artifacts: Artifact[];
	label: string;
	snippets?: Map<string, string>;
	excerptTokenBudget?: number;
}): string {
	const snippets = params.snippets ?? new Map<string, string>();
	const excerptTokenBudget = params.excerptTokenBudget ?? 1200;

	return params.artifacts
		.map((artifact) => {
			const excerptSource =
				snippets.get(artifact.id) ?? artifact.contentText ?? artifact.summary ?? artifact.name;
			return `${params.label}: ${artifact.name}\n${truncateToTokenBudget(
				excerptSource,
				excerptTokenBudget
			)}`;
		})
		.join('\n\n');
}

export function extractSerializedAttachmentBody(serialized: string): string {
	return serialized
		.split('\n')
		.filter((line) => !line.startsWith('Attachment: '))
		.join('\n')
		.trim();
}

export function serializeWorkingSetArtifacts(params: {
	artifacts: Artifact[];
	snippets?: Map<string, string>;
	totalBudget: number;
	documentBudget: number;
	outputBudget: number;
}): string {
	const snippets = params.snippets ?? new Map<string, string>();
	let budgetRemaining = params.totalBudget;
	const parts: string[] = [];

	for (const artifact of params.artifacts) {
		if (budgetRemaining <= 0) break;
		const excerptSource =
			snippets.get(artifact.id) ?? artifact.contentText ?? artifact.summary ?? artifact.name;
		const perArtifactBudget =
			artifact.type === 'generated_output' ? params.outputBudget : params.documentBudget;
		const excerptBudget = Math.min(perArtifactBudget, budgetRemaining);
		const kind = artifact.type === 'generated_output' ? 'Result' : 'Document';
		const section = `${kind}: ${artifact.name}\n${truncateToTokenBudget(
			excerptSource,
			excerptBudget
		)}`;
		parts.push(section);
		budgetRemaining -= estimateTokenCount(section);
	}

	return parts.join('\n\n');
}

export async function rerankHistoricalSections(params: {
	message: string;
	taskObjective?: string | null;
	sections: PromptContextSection[];
	enabled: boolean;
	rerankSections: HistoricalSectionReranker;
	logPrefix?: string;
}): Promise<PromptContextSection[]> {
	if (!params.enabled) return params.sections;

	const candidateSections = params.sections.filter(
		(section) =>
			!section.essential &&
			section.llmCompactible &&
			(section.layer === 'session' || section.layer === 'capsule') &&
			section.body.trim()
	);

	if (candidateSections.length <= 2) {
		return params.sections;
	}

	try {
		const reranked = await params.rerankSections({
			query: [
				params.taskObjective ? `Current task: ${params.taskObjective}` : null,
				`User message: ${params.message}`,
			]
				.filter((value): value is string => Boolean(value))
				.join('\n\n'),
			candidates: candidateSections,
		});

		if (!(reranked && typeof reranked.confidence === 'number' && reranked.confidence >= 64)) {
			return params.sections;
		}

		const selectedTitles = new Set(
			(Array.isArray(reranked.selectedTitles) ? reranked.selectedTitles : []).filter(
				(value): value is string => typeof value === 'string'
			)
		);
		if (selectedTitles.size === 0) {
			return params.sections;
		}

		return params.sections.filter(
			(section) =>
				section.essential ||
				!candidateSections.includes(section) ||
				selectedTitles.has(section.title)
		);
	} catch (error) {
		console.error(`${params.logPrefix ?? '[CONTEXT]'} Historical section reranker failed:`, error);
		return params.sections;
	}
}

export function compactContextSections(params: {
	intro: string;
	message: string;
	sections: PromptContextSection[];
	targetTokens: number;
	initialCompactionMode?: ConversationContextStatus['compactionMode'];
}): {
	inputValue: string;
	compactionApplied: boolean;
	compactionMode: ConversationContextStatus['compactionMode'];
	layersUsed: MemoryLayer[];
	estimatedTokens: number;
} {
	const bodyParts: string[] = [];
	const layersUsed = new Set<MemoryLayer>();
	let usedTokens = estimateTokenCount(params.message) + 12;
	let compactionApplied = false;
	let compactionMode = params.initialCompactionMode ?? 'none';

	for (const section of params.sections) {
		const candidate = buildContextSection(section.title, section.body);
		if (!candidate) continue;
		const candidateTokens = estimateTokenCount(candidate);
		const nextTotal = usedTokens + candidateTokens;
		if (!section.essential && nextTotal > params.targetTokens) {
			compactionApplied = true;
			if (compactionMode === 'none') compactionMode = 'deterministic';
			continue;
		}
		if (section.essential && nextTotal > params.targetTokens) {
			const remaining = Math.max(400, params.targetTokens - usedTokens - 200);
			const truncated = buildContextSection(
				section.title,
				truncateToTokenBudget(section.body, remaining)
			);
			bodyParts.push(truncated);
			usedTokens += estimateTokenCount(truncated);
			compactionApplied = true;
			if (compactionMode === 'none') compactionMode = 'deterministic';
		} else {
			bodyParts.push(candidate);
			usedTokens = nextTotal;
		}
		if (section.layer) layersUsed.add(section.layer);
	}

	const inputValue = [
		params.intro,
		...bodyParts,
		buildContextSection('Current User Message', params.message),
	].join('\n\n');

	return {
		inputValue,
		compactionApplied,
		compactionMode,
		layersUsed: Array.from(layersUsed),
		estimatedTokens: estimateTokenCount(inputValue),
	};
}
