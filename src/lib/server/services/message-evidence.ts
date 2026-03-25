import type {
	ContextDebugState,
	ConversationContextStatus,
	EvidenceSourceType,
	MessageEvidenceGroup,
	MessageEvidenceItem,
	MessageEvidenceSummary,
	TaskState,
	ToolCallEntry,
	ToolEvidenceCandidate,
} from '$lib/types';
import { canUseContextSummarizer, requestStructuredControlModel } from './task-state';

const GROUP_LABELS: Record<EvidenceSourceType, string> = {
	web: 'Web Search',
	document: 'Retrieved Documents',
	memory: 'Memory',
	tool: 'Tool Outputs',
};

const GROUP_ORDER: Record<EvidenceSourceType, number> = {
	web: 0,
	document: 1,
	tool: 2,
	memory: 3,
};

function clip(text: string, maxLength: number): string {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function sanitizeUrl(value: unknown): string | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	try {
		return new URL(value).toString();
	} catch {
		return null;
	}
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
	return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function buildMemoryGroup(contextStatus: ConversationContextStatus | null | undefined): MessageEvidenceGroup | null {
	if (!contextStatus) return null;

	const items: MessageEvidenceItem[] = [];

	if (contextStatus.taskStateApplied) {
		items.push({
			id: 'task-state',
			title: 'Task state',
			sourceType: 'memory',
			status: 'reference',
			description: 'Structured objective, constraints, decisions, and next steps carried into this turn.',
		});
	}

	if (contextStatus.recentTurnCount > 0) {
		items.push({
			id: 'recent-turns',
			title: `Recent turns (${contextStatus.recentTurnCount})`,
			sourceType: 'memory',
			status: 'reference',
			description: 'Recent dialogue used for continuity.',
		});
	}

	if (contextStatus.layersUsed.includes('session')) {
		items.push({
			id: 'session-memory',
			title: 'Session memory',
			sourceType: 'memory',
			status: 'reference',
			description: contextStatus.summary
				? clip(contextStatus.summary, 180)
				: 'Session summary and recalled context were included.',
		});
	}

	if (contextStatus.layersUsed.includes('capsule')) {
		items.push({
			id: 'workflow-memory',
			title: 'Prior workflows',
			sourceType: 'memory',
			status: 'reference',
			description: 'Relevant workflow capsules were included for continuity.',
		});
	}

	if (items.length === 0) return null;

	return {
		sourceType: 'memory',
		label: GROUP_LABELS.memory,
		reranked: false,
		items,
	};
}

function buildArtifactGroups(contextDebug: ContextDebugState | null | undefined): MessageEvidenceGroup[] {
	if (!contextDebug?.selectedEvidence.length) return [];

	const bySource = new Map<EvidenceSourceType, MessageEvidenceItem[]>();
	for (const evidence of contextDebug.selectedEvidence) {
		const list = bySource.get(evidence.sourceType) ?? [];
		list.push({
			id: evidence.artifactId,
			title: evidence.name,
			sourceType: evidence.sourceType,
			status: 'selected',
			artifactId: evidence.artifactId,
			confidence: evidence.confidence,
			reason: evidence.reason,
			description: evidence.reason,
		});
		bySource.set(evidence.sourceType, list);
	}

	return Array.from(bySource.entries())
		.map(([sourceType, items]) => ({
			sourceType,
			label: GROUP_LABELS[sourceType],
			reranked: contextDebug.routingStage === 'evidence_rerank',
			confidence: contextDebug.routingConfidence,
			items: items.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || a.title.localeCompare(b.title)),
		}))
		.filter((group) => group.items.length > 0);
}

function getToolCallSourceType(tool: ToolCallEntry): EvidenceSourceType {
	if (tool.sourceType) return tool.sourceType;
	const toolName = tool.name.toLowerCase();
	if (toolName.includes('search') || toolName.includes('tavily') || toolName.includes('searx')) {
		return 'web';
	}
	return 'tool';
}

async function buildRerankedToolGroup(params: {
	sourceType: EvidenceSourceType;
	message: string;
	taskState: TaskState | null;
	toolCalls: ToolCallEntry[];
}): Promise<MessageEvidenceGroup | null> {
	const candidateItems = uniqueById(
		params.toolCalls.flatMap((tool) =>
			(tool.candidates ?? [])
				.filter((candidate) => candidate.sourceType === params.sourceType)
				.map((candidate) => ({
					id: candidate.id,
					title: candidate.title,
					sourceType: params.sourceType,
					status: 'reference' as const,
					description: candidate.snippet ?? null,
					url: sanitizeUrl(candidate.url),
				}))
		)
	);

	const referenceItems =
		candidateItems.length === 0
			? params.toolCalls
					.filter((tool) => getToolCallSourceType(tool) === params.sourceType)
					.map((tool, index) => ({
						id: `${tool.name}-${index}`,
						title: tool.name,
						sourceType: params.sourceType,
						status: 'reference' as const,
						description: tool.outputSummary ? clip(tool.outputSummary, 180) : null,
					}))
			: [];

	if (candidateItems.length === 0 && referenceItems.length === 0) {
		return null;
	}

	if (candidateItems.length <= 1) {
		return {
			sourceType: params.sourceType,
			label: GROUP_LABELS[params.sourceType],
			reranked: false,
			items: candidateItems.length > 0 ? candidateItems.map((item) => ({ ...item, status: 'selected' })) : referenceItems,
		};
	}

	let selectedIds = new Set(candidateItems.slice(0, 3).map((item) => item.id));
	let confidence = 0;
	let reranked = false;

	if (canUseContextSummarizer()) {
		type ToolRerankPayload = {
			selectedIds?: string[];
			rejectedIds?: string[];
			confidence?: number;
		};

		try {
			const rerankedResponse = await requestStructuredControlModel<ToolRerankPayload>({
				system:
					params.sourceType === 'web'
						? 'Select the web sources that best support the current user turn. Return strict JSON with selectedIds, rejectedIds, confidence. Favor the most relevant and authoritative sources.'
						: 'Select the tool-derived evidence that best supports the current user turn. Return strict JSON with selectedIds, rejectedIds, confidence. Favor directly useful outputs and avoid duplicates.',
				user: [
					params.taskState ? `Current task: ${params.taskState.objective}` : null,
					`User message: ${params.message}`,
					`Candidates: ${JSON.stringify(
						candidateItems.map((candidate) => ({
							id: candidate.id,
							title: candidate.title,
							description: candidate.description,
							url: candidate.url,
						})),
						null,
						2
					)}`,
				]
					.filter((value): value is string => Boolean(value))
					.join('\n\n'),
				maxTokens: 240,
				temperature: 0.0,
			});

			if (
				rerankedResponse &&
				typeof rerankedResponse.confidence === 'number' &&
				rerankedResponse.confidence >= 64
			) {
				const nextSelectedIds = new Set(
					(Array.isArray(rerankedResponse.selectedIds) ? rerankedResponse.selectedIds : []).filter(
						(value): value is string => typeof value === 'string'
					)
				);
				if (nextSelectedIds.size > 0) {
					selectedIds = nextSelectedIds;
					confidence = Math.round(rerankedResponse.confidence);
					reranked = true;
				}
			}
		} catch (error) {
			console.error('[MESSAGE_EVIDENCE] Tool reranker failed:', error);
		}
	}

	const items = candidateItems
		.map((candidate) => ({
			...candidate,
			status: selectedIds.has(candidate.id) ? ('selected' as const) : ('rejected' as const),
			confidence: selectedIds.has(candidate.id) ? confidence || undefined : undefined,
		}))
		.sort((a, b) => {
			if (a.status !== b.status) return a.status === 'selected' ? -1 : 1;
			if ((b.confidence ?? 0) !== (a.confidence ?? 0)) return (b.confidence ?? 0) - (a.confidence ?? 0);
			return a.title.localeCompare(b.title);
		});

	return {
		sourceType: params.sourceType,
		label: GROUP_LABELS[params.sourceType],
		reranked,
		confidence: reranked ? confidence : undefined,
		items,
	};
}

export async function buildAssistantEvidenceSummary(params: {
	message: string;
	taskState: TaskState | null;
	contextStatus?: ConversationContextStatus | null;
	contextDebug?: ContextDebugState | null;
	toolCalls?: ToolCallEntry[];
}): Promise<MessageEvidenceSummary | null> {
	const toolCalls = params.toolCalls ?? [];
	const groups = [
		...buildArtifactGroups(params.contextDebug),
		buildMemoryGroup(params.contextStatus),
		await buildRerankedToolGroup({
			sourceType: 'web',
			message: params.message,
			taskState: params.taskState,
			toolCalls,
		}),
		await buildRerankedToolGroup({
			sourceType: 'tool',
			message: params.message,
			taskState: params.taskState,
			toolCalls,
		}),
	].filter((group): group is MessageEvidenceGroup => Boolean(group) && group.items.length > 0);

	if (groups.length === 0) return null;

	groups.sort((a, b) => GROUP_ORDER[a.sourceType] - GROUP_ORDER[b.sourceType] || a.label.localeCompare(b.label));

	return {
		structuredWebSearch: groups.some((group) => group.sourceType === 'web'),
		groups,
	};
}
