import { randomUUID } from 'crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	artifacts,
	artifactChunks,
	conversationContextStatus,
	conversations,
	conversationTaskStates,
	taskCheckpoints,
	taskStateEvidenceLinks,
} from '$lib/server/db/schema';
import { getConfig } from '$lib/server/config-store';
import type {
	Artifact,
	ArtifactChunk,
	ContextDebugState,
	RoutingStage,
	TaskCheckpoint,
	TaskEvidenceLink,
	TaskMemoryItem,
	TaskState,
	TaskSteeringAction,
	VerificationStatus,
} from '$lib/types';
import { scoreMatch } from './working-set';

const CHUNK_CHAR_TARGET = 1400;
const CHUNK_CHAR_OVERLAP = 220;
const TASK_MATCH_MIN_SCORE = 12;
const MAX_LIST_ITEMS = 6;
const CURRENT_TASK_STATUSES: TaskState['status'][] = ['active', 'revived', 'candidate'];
const ROUTER_CONFIDENCE_MIN = 68;
const RERANK_CONFIDENCE_MIN = 64;
const VERIFY_CONFIDENCE_MIN = 64;
const MAX_RERANK_CANDIDATES = 8;
const MAX_SELECTED_EVIDENCE = 5;
const MAX_SELECTED_LINKS = 12;

function parseJsonStringArray(value: string | null): string[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value) as unknown;
		return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
	} catch {
		return [];
	}
}

function uniqueCompact(values: Array<string | null | undefined>, limit = MAX_LIST_ITEMS): string[] {
	const seen = new Set<string>();
	const result: string[] = [];

	for (const value of values) {
		const trimmed = value?.replace(/\s+/g, ' ').trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		result.push(trimmed);
		if (result.length >= limit) break;
	}

	return result;
}

function clip(text: string, maxLength: number): string {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function estimateTokenCount(text: string): number {
	const trimmed = text.trim();
	if (!trimmed) return 0;
	const segments = trimmed.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]+/gu) ?? [];
	let estimated = 0;

	for (const segment of segments) {
		if (/^[\p{L}\p{N}]+$/u.test(segment)) {
			const isAscii = /^[\x00-\x7F]+$/.test(segment);
			estimated += Math.max(1, Math.ceil(segment.length / (isAscii ? 4 : 2)));
			continue;
		}

		estimated += segment.length;
	}

	return estimated;
}

function splitIntoChunks(text: string): string[] {
	const normalized = text.replace(/\r\n/g, '\n').trim();
	if (!normalized) return [];

	const chunks: string[] = [];
	let start = 0;

	while (start < normalized.length) {
		let end = Math.min(normalized.length, start + CHUNK_CHAR_TARGET);
		if (end < normalized.length) {
			const paragraphBreak = normalized.lastIndexOf('\n\n', end);
			const lineBreak = normalized.lastIndexOf('\n', end);
			const sentenceBreak = Math.max(
				normalized.lastIndexOf('. ', end),
				normalized.lastIndexOf('? ', end),
				normalized.lastIndexOf('! ', end)
			);
			const boundary = Math.max(paragraphBreak, lineBreak, sentenceBreak);
			if (boundary > start + Math.floor(CHUNK_CHAR_TARGET * 0.45)) {
				end = boundary + 1;
			}
		}

		const chunk = normalized.slice(start, end).trim();
		if (chunk) {
			chunks.push(chunk);
		}

		if (end >= normalized.length) break;
		start = Math.max(end - CHUNK_CHAR_OVERLAP, start + 1);
	}

	return chunks;
}

function mapArtifactChunk(row: typeof artifactChunks.$inferSelect): ArtifactChunk {
	return {
		id: row.id,
		artifactId: row.artifactId,
		userId: row.userId,
		conversationId: row.conversationId ?? null,
		chunkIndex: row.chunkIndex,
		contentText: row.contentText,
		tokenEstimate: row.tokenEstimate,
		createdAt: row.createdAt.getTime(),
		updatedAt: row.updatedAt.getTime(),
	};
}

function mapTaskState(row: typeof conversationTaskStates.$inferSelect): TaskState {
	return {
		taskId: row.taskId,
		userId: row.userId,
		conversationId: row.conversationId,
		status: row.status as TaskState['status'],
		objective: row.objective,
		confidence: row.confidence ?? 0,
		locked: row.locked === 1,
		lastConfirmedTurnMessageId: row.lastConfirmedTurnMessageId ?? null,
		constraints: parseJsonStringArray(row.constraintsJson),
		factsToPreserve: parseJsonStringArray(row.factsToPreserveJson),
		decisions: parseJsonStringArray(row.decisionsJson),
		openQuestions: parseJsonStringArray(row.openQuestionsJson),
		activeArtifactIds: parseJsonStringArray(row.activeArtifactIdsJson),
		nextSteps: parseJsonStringArray(row.nextStepsJson),
		lastCheckpointAt: row.lastCheckpointAt ? row.lastCheckpointAt.getTime() : null,
		createdAt: row.createdAt.getTime(),
		updatedAt: row.updatedAt.getTime(),
	};
}

function mapTaskEvidenceLink(row: typeof taskStateEvidenceLinks.$inferSelect): TaskEvidenceLink {
	return {
		id: row.id,
		taskId: row.taskId,
		userId: row.userId,
		conversationId: row.conversationId,
		artifactId: row.artifactId,
		chunkIndex: row.chunkIndex ?? null,
		role: row.role as TaskEvidenceLink['role'],
		origin: row.origin as TaskEvidenceLink['origin'],
		confidence: row.confidence ?? 0,
		reason: row.reason ?? null,
		createdAt: row.createdAt.getTime(),
		updatedAt: row.updatedAt.getTime(),
	};
}

function mapTaskCheckpoint(row: typeof taskCheckpoints.$inferSelect): TaskCheckpoint {
	return {
		id: row.id,
		taskId: row.taskId,
		userId: row.userId,
		conversationId: row.conversationId,
		checkpointType: row.checkpointType as TaskCheckpoint['checkpointType'],
		content: row.content,
		sourceTurnRange: row.sourceTurnRange ?? null,
		sourceEvidenceIds: parseJsonStringArray(row.sourceEvidenceIdsJson),
		verificationStatus: row.verificationStatus as VerificationStatus,
		createdAt: row.createdAt.getTime(),
		updatedAt: row.updatedAt.getTime(),
	};
}

function getTaskSearchBody(task: TaskState): string {
	return [
		task.objective,
		...task.constraints,
		...task.factsToPreserve,
		...task.decisions,
		...task.openQuestions,
		...task.nextSteps,
	].join('\n');
}

function scoreTaskState(task: TaskState, message: string, attachmentIds: string[]): number {
	let score = scoreMatch(message, getTaskSearchBody(task)) * 10;
	const attachmentOverlap = attachmentIds.filter((id) => task.activeArtifactIds.includes(id)).length;
	score += attachmentOverlap * 18;

	if (task.status === 'active') {
		score += 4;
	}

	const ageMinutes = Math.max(0, Math.round((Date.now() - task.updatedAt) / 60_000));
	if (ageMinutes <= 30) score += 4;
	else if (ageMinutes <= 180) score += 2;

	return score;
}

function extractQuestionCandidate(text: string): string | null {
	if (!text.includes('?')) return null;
	const match = text
		.replace(/\s+/g, ' ')
		.match(/[^.?!]*\?/);
	return match ? clip(match[0], 180) : clip(text, 180);
}

function extractListItems(text: string): string[] {
	const lines = text
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	const explicit = lines
		.filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
		.map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''));

	if (explicit.length > 0) {
		return explicit.slice(0, MAX_LIST_ITEMS).map((line) => clip(line, 140));
	}

	return lines.slice(0, 3).map((line) => clip(line, 140));
}

function extractDecisionCandidates(text: string): string[] {
	const sentences = text
		.replace(/\s+/g, ' ')
		.split(/(?<=[.!?])\s+/)
		.map((sentence) => sentence.trim())
		.filter(Boolean);
	return sentences
		.filter((sentence) =>
			/\b(should|recommend|decide|best|need to|will|let's|prefer)\b/i.test(sentence)
		)
		.slice(0, 3)
		.map((sentence) => clip(sentence, 180));
}

function extractConstraintCandidates(text: string): string[] {
	const sentences = text
		.replace(/\s+/g, ' ')
		.split(/(?<=[.!?])\s+/)
		.map((sentence) => sentence.trim())
		.filter(Boolean);
	return sentences
		.filter((sentence) =>
			/\b(must|should not|cannot|can't|need to|have to|without|limit|constraint)\b/i.test(sentence)
		)
		.slice(0, 3)
		.map((sentence) => clip(sentence, 180));
}

function extractFactCandidates(text: string): string[] {
	const sentences = text
		.replace(/\s+/g, ' ')
		.split(/(?<=[.!?])\s+/)
		.map((sentence) => sentence.trim())
		.filter(Boolean);
	return sentences.slice(0, 3).map((sentence) => clip(sentence, 180));
}

function canUseContextSummarizer(): boolean {
	const config = getConfig();
	return Boolean(config.contextSummarizerUrl && config.contextSummarizerModel);
}

function parseJsonFromModel(content: string): Record<string, unknown> | null {
	const trimmed = content.trim();
	const withoutFence = trimmed
		.replace(/^```json\s*/i, '')
		.replace(/^```\s*/i, '')
		.replace(/\s*```$/, '')
		.trim();

	try {
		const parsed = JSON.parse(withoutFence) as Record<string, unknown>;
		return parsed && typeof parsed === 'object' ? parsed : null;
	} catch {
		return null;
	}
}

async function requestContextSummarizer(params: {
	system: string;
	user: string;
	maxTokens: number;
	temperature?: number;
}): Promise<string | null> {
	if (!canUseContextSummarizer()) return null;

	const config = getConfig();
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};
	if (config.contextSummarizerApiKey) {
		headers.Authorization = `Bearer ${config.contextSummarizerApiKey}`;
	}

	const response = await fetch(`${config.contextSummarizerUrl}/chat/completions`, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			model: config.contextSummarizerModel,
			messages: [
				{ role: 'system', content: params.system },
				{ role: 'user', content: params.user },
			],
			max_tokens: params.maxTokens,
			temperature: params.temperature ?? 0.1,
			stream: false,
		}),
	});

	if (!response.ok) {
		throw new Error(`Context summarizer error: ${response.status} ${response.statusText}`);
	}

	const json = await response.json();
	const content =
		json.choices?.[0]?.message?.content ??
		json.choices?.[0]?.text ??
		(json.choices?.[0]?.message?.content?.[0]?.text as string | undefined);
	return typeof content === 'string' && content.trim() ? content.trim() : null;
}

async function requestStructuredControlModel<T extends Record<string, unknown>>(params: {
	system: string;
	user: string;
	maxTokens: number;
	temperature?: number;
}): Promise<T | null> {
	const content = await requestContextSummarizer(params);
	if (!content) return null;
	const parsed = parseJsonFromModel(content);
	return parsed ? (parsed as T) : null;
}

async function summarizeTaskStateUpdate(params: {
	existing: TaskState | null;
	message: string;
	assistantResponse: string;
	attachmentIds: string[];
	promptArtifactIds: string[];
}): Promise<Partial<TaskState> | null> {
	if (!canUseContextSummarizer()) return null;

	const existingState = params.existing
		? JSON.stringify(
				{
					objective: params.existing.objective,
					constraints: params.existing.constraints,
					factsToPreserve: params.existing.factsToPreserve,
					decisions: params.existing.decisions,
					openQuestions: params.existing.openQuestions,
					activeArtifactIds: params.existing.activeArtifactIds,
					nextSteps: params.existing.nextSteps,
				},
				null,
				2
			)
		: 'null';

	try {
		const content = await requestContextSummarizer({
			system:
				'Update the structured task state for a long-running assistant conversation. Return strict JSON only with keys objective, constraints, factsToPreserve, decisions, openQuestions, nextSteps. Keep each list concise and relevant to the active task.',
			user: [
				`Existing task state: ${existingState}`,
				`User message: ${params.message}`,
				`Assistant response: ${params.assistantResponse}`,
				`Active artifact ids: ${JSON.stringify(uniqueCompact([...params.attachmentIds, ...params.promptArtifactIds], 12))}`,
			].join('\n\n'),
			maxTokens: 500,
			temperature: 0.0,
		});
		if (!content) return null;
		const parsed = parseJsonFromModel(content);
		if (!parsed) return null;
		return {
			objective:
				typeof parsed.objective === 'string' && parsed.objective.trim()
					? clip(parsed.objective, 220)
					: params.existing?.objective ?? clip(params.message, 220),
			constraints: uniqueCompact(Array.isArray(parsed.constraints) ? parsed.constraints as string[] : []),
			factsToPreserve: uniqueCompact(Array.isArray(parsed.factsToPreserve) ? parsed.factsToPreserve as string[] : []),
			decisions: uniqueCompact(Array.isArray(parsed.decisions) ? parsed.decisions as string[] : []),
			openQuestions: uniqueCompact(Array.isArray(parsed.openQuestions) ? parsed.openQuestions as string[] : [], 4),
			nextSteps: uniqueCompact(Array.isArray(parsed.nextSteps) ? parsed.nextSteps as string[] : [], 4),
			activeArtifactIds: uniqueCompact([...params.attachmentIds, ...params.promptArtifactIds], 12),
		};
	} catch (error) {
		console.error('[TASK_STATE] Summarizer checkpoint update failed:', error);
		return null;
	}
}

function buildDeterministicTaskStateUpdate(params: {
	existing: TaskState | null;
	message: string;
	assistantResponse: string;
	attachmentIds: string[];
	promptArtifactIds: string[];
}): Partial<TaskState> {
	const objective =
		params.existing && scoreMatch(params.message, params.existing.objective) > 0
			? params.existing.objective
			: clip(params.message, 220);

	return {
		objective,
		constraints: uniqueCompact([
			...(params.existing?.constraints ?? []),
			...extractConstraintCandidates(params.message),
			...extractConstraintCandidates(params.assistantResponse),
		]),
		factsToPreserve: uniqueCompact([
			...(params.existing?.factsToPreserve ?? []),
			...extractFactCandidates(params.message),
			...params.attachmentIds.map((id) => `Active artifact: ${id}`),
		]),
		decisions: uniqueCompact([
			...(params.existing?.decisions ?? []),
			...extractDecisionCandidates(params.assistantResponse),
		]),
		openQuestions: uniqueCompact([
			extractQuestionCandidate(params.message),
			...(params.existing?.openQuestions ?? []),
		], 4),
		nextSteps: uniqueCompact([
			...extractListItems(params.assistantResponse),
			...(params.existing?.nextSteps ?? []),
		], 4),
		activeArtifactIds: uniqueCompact([
			...(params.existing?.activeArtifactIds ?? []),
			...params.attachmentIds,
			...params.promptArtifactIds,
		], 12),
	};
}

function getCurrentTaskFromList(states: TaskState[]): TaskState | null {
	return (
		states.find((state) => state.locked && CURRENT_TASK_STATUSES.includes(state.status)) ??
		states.find((state) => CURRENT_TASK_STATUSES.includes(state.status)) ??
		null
	);
}

async function setCurrentTask(
	taskId: string,
	userId: string,
	conversationId: string,
	nextStatus: TaskState['status'] = 'active'
): Promise<void> {
	await db
		.update(conversationTaskStates)
		.set({
			status: 'archived',
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(conversationTaskStates.userId, userId),
				eq(conversationTaskStates.conversationId, conversationId),
				inArray(conversationTaskStates.status, CURRENT_TASK_STATUSES)
			)
		);

	await db
		.update(conversationTaskStates)
		.set({
			status: nextStatus,
			updatedAt: new Date(),
		})
		.where(eq(conversationTaskStates.taskId, taskId));
}

export async function listConversationTaskStates(
	userId: string,
	conversationId: string
): Promise<TaskState[]> {
	const rows = await db
		.select()
		.from(conversationTaskStates)
		.where(
			and(
				eq(conversationTaskStates.userId, userId),
				eq(conversationTaskStates.conversationId, conversationId)
			)
		)
		.orderBy(desc(conversationTaskStates.updatedAt));

	return rows.map(mapTaskState);
}

export async function getConversationTaskState(
	userId: string,
	conversationId: string
): Promise<TaskState | null> {
	const states = await listConversationTaskStates(userId, conversationId);
	return getCurrentTaskFromList(states) ?? states[0] ?? null;
}

export async function getTaskStateById(
	userId: string,
	taskId: string
): Promise<TaskState | null> {
	const [row] = await db
		.select()
		.from(conversationTaskStates)
		.where(
			and(
				eq(conversationTaskStates.userId, userId),
				eq(conversationTaskStates.taskId, taskId)
			)
		)
		.limit(1);

	return row ? mapTaskState(row) : null;
}

export async function listTaskEvidenceLinks(params: {
	userId: string;
	taskId: string;
	roles?: TaskEvidenceLink['role'][];
}): Promise<TaskEvidenceLink[]> {
	const filters = [
		eq(taskStateEvidenceLinks.userId, params.userId),
		eq(taskStateEvidenceLinks.taskId, params.taskId),
	];
	if (params.roles?.length) {
		filters.push(inArray(taskStateEvidenceLinks.role, params.roles));
	}

	const rows = await db
		.select()
		.from(taskStateEvidenceLinks)
		.where(and(...filters))
		.orderBy(desc(taskStateEvidenceLinks.updatedAt));

	return rows.map(mapTaskEvidenceLink);
}

export async function listTaskCheckpoints(params: {
	userId: string;
	taskId: string;
	checkpointType?: TaskCheckpoint['checkpointType'];
}): Promise<TaskCheckpoint[]> {
	const filters = [
		eq(taskCheckpoints.userId, params.userId),
		eq(taskCheckpoints.taskId, params.taskId),
	];
	if (params.checkpointType) {
		filters.push(eq(taskCheckpoints.checkpointType, params.checkpointType));
	}

	const rows = await db
		.select()
		.from(taskCheckpoints)
		.where(and(...filters))
		.orderBy(desc(taskCheckpoints.updatedAt));

	return rows.map(mapTaskCheckpoint);
}

export async function listTaskMemoryItems(userId: string): Promise<TaskMemoryItem[]> {
	const rows = await db
		.select({
			task: conversationTaskStates,
			conversationTitle: conversations.title,
		})
		.from(conversationTaskStates)
		.leftJoin(conversations, eq(conversationTaskStates.conversationId, conversations.id))
		.where(eq(conversationTaskStates.userId, userId))
		.orderBy(desc(conversationTaskStates.updatedAt));

	if (rows.length === 0) {
		return [];
	}

	const taskIds = rows.map((row) => row.task.taskId);
	const checkpointRows = await db
		.select()
		.from(taskCheckpoints)
		.where(
			and(
				eq(taskCheckpoints.userId, userId),
				inArray(taskCheckpoints.taskId, taskIds)
			)
		)
		.orderBy(desc(taskCheckpoints.updatedAt));

	const latestCheckpointByTask = new Map<string, TaskCheckpoint>();
	const latestStableCheckpointByTask = new Map<string, TaskCheckpoint>();

	for (const row of checkpointRows) {
		const checkpoint = mapTaskCheckpoint(row);
		if (!latestCheckpointByTask.has(checkpoint.taskId)) {
			latestCheckpointByTask.set(checkpoint.taskId, checkpoint);
		}
		if (
			checkpoint.checkpointType === 'stable' &&
			!latestStableCheckpointByTask.has(checkpoint.taskId)
		) {
			latestStableCheckpointByTask.set(checkpoint.taskId, checkpoint);
		}
	}

	return rows.map((row) => {
		const task = mapTaskState(row.task);
		const checkpoint =
			latestStableCheckpointByTask.get(task.taskId) ??
			latestCheckpointByTask.get(task.taskId) ??
			null;

		return {
			taskId: task.taskId,
			conversationId: task.conversationId,
			conversationTitle: row.conversationTitle ?? null,
			objective: task.objective,
			status: task.status,
			locked: task.locked,
			updatedAt: task.updatedAt,
			lastCheckpointAt: task.lastCheckpointAt,
			checkpointSummary: checkpoint ? clip(checkpoint.content, 240) : null,
		};
	});
}

export async function forgetTaskMemory(userId: string, taskId: string): Promise<boolean> {
	const existing = await getTaskStateById(userId, taskId);
	if (!existing) return false;

	await db
		.delete(conversationTaskStates)
		.where(
			and(
				eq(conversationTaskStates.userId, userId),
				eq(conversationTaskStates.taskId, taskId)
			)
		);

	return true;
}

function buildTaskCandidateSummary(task: TaskState): Record<string, unknown> {
	return {
		taskId: task.taskId,
		status: task.status,
		objective: task.objective,
		confidence: task.confidence,
		locked: task.locked,
		activeArtifactIds: task.activeArtifactIds.slice(0, 8),
		updatedAt: task.updatedAt,
	};
}

async function createTaskState(params: {
	userId: string;
	conversationId: string;
	objective: string;
	attachmentIds?: string[];
	status?: TaskState['status'];
	confidence?: number;
	locked?: boolean;
}): Promise<TaskState> {
	const [created] = await db
		.insert(conversationTaskStates)
		.values({
			taskId: randomUUID(),
			userId: params.userId,
			conversationId: params.conversationId,
			status: params.status ?? 'candidate',
			objective: clip(params.objective, 220),
			confidence: Math.round(params.confidence ?? 40),
			locked: params.locked ? 1 : 0,
			openQuestionsJson: JSON.stringify([]),
			activeArtifactIdsJson: JSON.stringify(uniqueCompact(params.attachmentIds ?? [], 12)),
			lastCheckpointAt: new Date(),
			updatedAt: new Date(),
		})
		.returning();

	return mapTaskState(created);
}

type RoutedTaskState = {
	taskState: TaskState | null;
	routingStage: RoutingStage;
	routingConfidence: number;
};

async function routeTaskStateForTurn(params: {
	userId: string;
	conversationId: string;
	message: string;
	attachmentIds?: string[];
	createIfMissing?: boolean;
}): Promise<RoutedTaskState> {
	const attachmentIds = params.attachmentIds ?? [];
	const states = await listConversationTaskStates(params.userId, params.conversationId);
	const currentTask = getCurrentTaskFromList(states);

	if (currentTask?.locked) {
		return { taskState: currentTask, routingStage: 'deterministic', routingConfidence: 100 };
	}

	const ranked = states
		.map((state) => ({
			state,
			score: scoreTaskState(state, params.message, attachmentIds),
		}))
		.sort((a, b) => b.score - a.score);

	const best = ranked[0] ?? null;
	const second = ranked[1] ?? null;
	const ambiguous =
		best !== null &&
		second !== null &&
		second.score >= Math.max(TASK_MATCH_MIN_SCORE - 2, best.score - 4);
	const shouldRouteWithModel =
		canUseContextSummarizer() &&
		ranked.length > 0 &&
		(ambiguous || (best?.score ?? 0) < TASK_MATCH_MIN_SCORE);

	if (shouldRouteWithModel) {
		type TaskRoutePayload = {
			decision?: 'continue_active' | 'revive_task' | 'start_new_task';
			taskId?: string;
			confidence?: number;
		};

		try {
			const routed = await requestStructuredControlModel<TaskRoutePayload>({
				system:
					'Route the current user turn to the correct task. Return strict JSON with decision, taskId, confidence. Decision must be one of continue_active, revive_task, start_new_task. Choose start_new_task when the user clearly changed topics.',
				user: [
					`User message: ${params.message}`,
					`Attachment ids: ${JSON.stringify(attachmentIds)}`,
					`Current task: ${currentTask ? JSON.stringify(buildTaskCandidateSummary(currentTask), null, 2) : 'null'}`,
					`Candidate tasks: ${JSON.stringify(ranked.slice(0, 5).map((entry) => ({
						...buildTaskCandidateSummary(entry.state),
						score: entry.score,
					})), null, 2)}`,
				].join('\n\n'),
				maxTokens: 220,
				temperature: 0.0,
			});

			if (routed && typeof routed.confidence === 'number' && routed.confidence >= ROUTER_CONFIDENCE_MIN) {
				if (routed.decision === 'start_new_task' && params.createIfMissing) {
					const created = await createTaskState({
						userId: params.userId,
						conversationId: params.conversationId,
						objective: params.message,
						attachmentIds,
						status: 'candidate',
						confidence: routed.confidence,
					});
					await setCurrentTask(created.taskId, params.userId, params.conversationId, 'candidate');
					return {
						taskState: (await getConversationTaskState(params.userId, params.conversationId)) ?? created,
						routingStage: 'task_router',
						routingConfidence: Math.round(routed.confidence),
					};
				}

				if (typeof routed.taskId === 'string') {
					const chosen = states.find((state) => state.taskId === routed.taskId);
					if (chosen) {
						if (!currentTask || chosen.taskId !== currentTask.taskId) {
							await setCurrentTask(
								chosen.taskId,
								params.userId,
								params.conversationId,
								routed.decision === 'revive_task' ? 'revived' : 'active'
							);
						}
						return {
							taskState: (await getConversationTaskState(params.userId, params.conversationId)) ?? chosen,
							routingStage: 'task_router',
							routingConfidence: Math.round(routed.confidence),
						};
					}
				}
			}
		} catch (error) {
			console.error('[TASK_STATE] Task routing model failed:', error);
		}
	}

	if (best && best.score >= TASK_MATCH_MIN_SCORE) {
		if (!currentTask || best.state.taskId !== currentTask.taskId) {
			await setCurrentTask(
				best.state.taskId,
				params.userId,
				params.conversationId,
				best.state.status === 'archived' ? 'revived' : 'active'
			);
			return {
				taskState: (await getConversationTaskState(params.userId, params.conversationId)) ?? best.state,
				routingStage: 'deterministic',
				routingConfidence: Math.min(99, Math.max(55, best.score * 4)),
			};
		}

		return {
			taskState: best.state,
			routingStage: 'deterministic',
			routingConfidence: Math.min(99, Math.max(55, best.score * 4)),
		};
	}

	if (!params.createIfMissing) {
		return {
			taskState: best?.state ?? currentTask ?? null,
			routingStage: 'deterministic',
			routingConfidence: Math.min(50, Math.max(0, (best?.score ?? 0) * 4)),
		};
	}

	const created = await createTaskState({
		userId: params.userId,
		conversationId: params.conversationId,
		objective: params.message,
		attachmentIds,
		status: 'candidate',
		confidence: 45,
	});
	await setCurrentTask(created.taskId, params.userId, params.conversationId, 'candidate');
	return {
		taskState: (await getConversationTaskState(params.userId, params.conversationId)) ?? created,
		routingStage: 'deterministic',
		routingConfidence: 45,
	};
}

export async function selectTaskStateForTurn(params: {
	userId: string;
	conversationId: string;
	message: string;
	attachmentIds?: string[];
	createIfMissing?: boolean;
}): Promise<TaskState | null> {
	const routed = await routeTaskStateForTurn(params);
	return routed.taskState;
}

function getArtifactSearchBody(artifact: Artifact): string {
	return [artifact.name, artifact.summary ?? '', artifact.contentText ?? ''].join('\n');
}

function dedupeArtifacts(list: Artifact[]): Artifact[] {
	return Array.from(new Map(list.map((artifact) => [artifact.id, artifact])).values());
}

async function replaceSystemSelectedEvidenceLinks(params: {
	userId: string;
	conversationId: string;
	taskId: string;
	selectedArtifacts: Array<{ artifactId: string; confidence: number; reason?: string | null }>;
}): Promise<void> {
	await db
		.delete(taskStateEvidenceLinks)
		.where(
			and(
				eq(taskStateEvidenceLinks.userId, params.userId),
				eq(taskStateEvidenceLinks.taskId, params.taskId),
				eq(taskStateEvidenceLinks.role, 'selected'),
				eq(taskStateEvidenceLinks.origin, 'system')
			)
		);

	if (params.selectedArtifacts.length === 0) return;

	await db.insert(taskStateEvidenceLinks).values(
		params.selectedArtifacts.slice(0, MAX_SELECTED_LINKS).map((artifact) => ({
			id: randomUUID(),
			taskId: params.taskId,
			userId: params.userId,
			conversationId: params.conversationId,
			artifactId: artifact.artifactId,
			role: 'selected',
			origin: 'system',
			confidence: Math.round(artifact.confidence),
			reason: artifact.reason ?? null,
			updatedAt: new Date(),
		}))
	);
}

function computeEvidenceScore(params: {
	artifact: Artifact;
	message: string;
	taskState: TaskState | null;
	pinnedIds: Set<string>;
	excludedIds: Set<string>;
	currentAttachmentIds: Set<string>;
	workingSetIds: Set<string>;
}): number {
	if (params.excludedIds.has(params.artifact.id)) return -1000;

	let score = scoreMatch(params.message, getArtifactSearchBody(params.artifact)) * 10;
	if (params.taskState) {
		score += scoreMatch(params.taskState.objective, getArtifactSearchBody(params.artifact)) * 6;
		if (params.taskState.activeArtifactIds.includes(params.artifact.id)) {
			score += 16;
		}
	}
	if (params.currentAttachmentIds.has(params.artifact.id)) score += 100;
	if (params.workingSetIds.has(params.artifact.id)) score += 10;
	if (params.pinnedIds.has(params.artifact.id)) score += 120;
	if (params.artifact.conversationId === params.taskState?.conversationId) score += 4;
	if (params.artifact.type === 'generated_output') score += 3;

	return score;
}

async function maybeRerankEvidence(params: {
	taskState: TaskState | null;
	message: string;
	candidates: Artifact[];
	pinnedIds: Set<string>;
	excludedIds: Set<string>;
}): Promise<{
	artifacts: Artifact[];
	usedModel: boolean;
	confidence: number;
}> {
	if (!canUseContextSummarizer() || params.candidates.length <= 2) {
		return { artifacts: params.candidates, usedModel: false, confidence: 0 };
	}

	type RerankPayload = {
		selectedArtifactIds?: string[];
		rejectedArtifactIds?: string[];
		confidence?: number;
	};

	try {
		const reranked = await requestStructuredControlModel<RerankPayload>({
			system:
				'Select the most relevant evidence artifacts for the current turn. Return strict JSON with selectedArtifactIds, rejectedArtifactIds, confidence. Favor the current user turn and current task. Never select irrelevant stale evidence.',
			user: [
				`Current task: ${params.taskState ? params.taskState.objective : 'none'}`,
				`User message: ${params.message}`,
				`Pinned artifact ids: ${JSON.stringify(Array.from(params.pinnedIds))}`,
				`Excluded artifact ids: ${JSON.stringify(Array.from(params.excludedIds))}`,
				`Candidates: ${JSON.stringify(params.candidates.slice(0, MAX_RERANK_CANDIDATES).map((artifact) => ({
					id: artifact.id,
					name: artifact.name,
					type: artifact.type,
					summary: clip(artifact.summary ?? artifact.contentText ?? artifact.name, 220),
				})), null, 2)}`,
			].join('\n\n'),
			maxTokens: 260,
			temperature: 0.0,
		});

		if (reranked && typeof reranked.confidence === 'number' && reranked.confidence >= RERANK_CONFIDENCE_MIN) {
			const selectedIds = new Set(
				(Array.isArray(reranked.selectedArtifactIds) ? reranked.selectedArtifactIds : [])
					.filter((value): value is string => typeof value === 'string')
			);
			const artifacts = params.candidates.filter(
				(artifact) => params.pinnedIds.has(artifact.id) || selectedIds.has(artifact.id)
			);
			if (artifacts.length > 0) {
				return {
					artifacts,
					usedModel: true,
					confidence: Math.round(reranked.confidence),
				};
			}
		}
	} catch (error) {
		console.error('[TASK_STATE] Evidence reranker failed:', error);
	}

	return { artifacts: params.candidates, usedModel: false, confidence: 0 };
}

async function maybeVerifyEvidence(params: {
	taskState: TaskState | null;
	message: string;
	selectedArtifacts: Artifact[];
	pinnedIds: Set<string>;
	shouldVerify: boolean;
}): Promise<{
	artifacts: Artifact[];
	status: VerificationStatus;
	fallbackToDeterministic: boolean;
}> {
	if (!params.shouldVerify || !canUseContextSummarizer() || params.selectedArtifacts.length === 0) {
		return { artifacts: params.selectedArtifacts, status: 'skipped', fallbackToDeterministic: false };
	}

	type VerifyPayload = {
		passed?: boolean;
		vetoArtifactIds?: string[];
		confidence?: number;
	};

	try {
		const verified = await requestStructuredControlModel<VerifyPayload>({
			system:
				'Verify whether the selected evidence is tightly aligned with the current turn. Return strict JSON with passed, vetoArtifactIds, confidence. Veto stale or weakly related evidence.',
			user: [
				`Current task: ${params.taskState ? params.taskState.objective : 'none'}`,
				`User message: ${params.message}`,
				`Selected evidence: ${JSON.stringify(params.selectedArtifacts.map((artifact) => ({
					id: artifact.id,
					name: artifact.name,
					summary: clip(artifact.summary ?? artifact.contentText ?? artifact.name, 200),
				})), null, 2)}`,
			].join('\n\n'),
			maxTokens: 180,
			temperature: 0.0,
		});

		if (verified && typeof verified.confidence === 'number' && verified.confidence >= VERIFY_CONFIDENCE_MIN) {
			const vetoIds = new Set(
				(Array.isArray(verified.vetoArtifactIds) ? verified.vetoArtifactIds : [])
					.filter((value): value is string => typeof value === 'string')
			);
			const filtered = params.selectedArtifacts.filter(
				(artifact) => params.pinnedIds.has(artifact.id) || !vetoIds.has(artifact.id)
			);
			if (filtered.length === 0 && params.selectedArtifacts.length > 0) {
				return { artifacts: params.selectedArtifacts, status: 'fallback', fallbackToDeterministic: true };
			}
			return {
				artifacts: filtered,
				status: verified.passed === false ? 'failed' : 'passed',
				fallbackToDeterministic: false,
			};
		}
	} catch (error) {
		console.error('[TASK_STATE] Evidence verifier failed:', error);
	}

	return { artifacts: params.selectedArtifacts, status: 'fallback', fallbackToDeterministic: false };
}

export async function prepareTaskContext(params: {
	userId: string;
	conversationId: string;
	message: string;
	attachmentIds?: string[];
	currentAttachments: Artifact[];
	workingSetArtifacts: Artifact[];
	relevantArtifacts: Artifact[];
}): Promise<{
	taskState: TaskState | null;
	routingStage: RoutingStage;
	routingConfidence: number;
	verificationStatus: VerificationStatus;
	selectedArtifacts: Artifact[];
	pinnedArtifactIds: string[];
	excludedArtifactIds: string[];
}> {
	const attachmentIds = params.attachmentIds ?? [];
	const routed = await routeTaskStateForTurn({
		userId: params.userId,
		conversationId: params.conversationId,
		message: params.message,
		attachmentIds,
		createIfMissing: true,
	});
	const taskState = routed.taskState;
	const links = taskState
		? await listTaskEvidenceLinks({ userId: params.userId, taskId: taskState.taskId })
		: [];
	const pinnedIds = new Set(links.filter((link) => link.role === 'pinned').map((link) => link.artifactId));
	const excludedIds = new Set(links.filter((link) => link.role === 'excluded').map((link) => link.artifactId));

	const candidateArtifacts = dedupeArtifacts([
		...params.currentAttachments,
		...params.workingSetArtifacts,
		...params.relevantArtifacts,
	]).filter((artifact) => !excludedIds.has(artifact.id) || attachmentIds.includes(artifact.id));

	const currentAttachmentIds = new Set(params.currentAttachments.map((artifact) => artifact.id));
	const workingSetIds = new Set(params.workingSetArtifacts.map((artifact) => artifact.id));
	const rankedCandidates = candidateArtifacts
		.map((artifact) => ({
			artifact,
			score: computeEvidenceScore({
				artifact,
				message: params.message,
				taskState,
				pinnedIds,
				excludedIds,
				currentAttachmentIds,
				workingSetIds,
			}),
		}))
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score);

	let selectedArtifacts = dedupeArtifacts([
		...rankedCandidates
			.filter((entry) => pinnedIds.has(entry.artifact.id) || currentAttachmentIds.has(entry.artifact.id))
			.map((entry) => entry.artifact),
		...rankedCandidates.slice(0, MAX_SELECTED_EVIDENCE).map((entry) => entry.artifact),
	]);

	let routingStage: RoutingStage = routed.routingStage;
	let routingConfidence = routed.routingConfidence;
	const reranked = await maybeRerankEvidence({
		taskState,
		message: params.message,
		candidates: dedupeArtifacts([
			...selectedArtifacts,
			...rankedCandidates.slice(0, MAX_RERANK_CANDIDATES).map((entry) => entry.artifact),
		]),
		pinnedIds,
		excludedIds,
	});
	if (reranked.usedModel) {
		selectedArtifacts = dedupeArtifacts(reranked.artifacts);
		routingStage = 'evidence_rerank';
		routingConfidence = reranked.confidence;
	}

	const verified = await maybeVerifyEvidence({
		taskState,
		message: params.message,
		selectedArtifacts,
		pinnedIds,
		shouldVerify:
			routingStage !== 'deterministic' ||
			excludedIds.size > 0 ||
			pinnedIds.size > 0 ||
			selectedArtifacts.length >= 4,
	});

	if (verified.fallbackToDeterministic) {
		routingStage = 'verification_fallback';
	}
	selectedArtifacts = dedupeArtifacts(verified.artifacts);

	if (taskState) {
		await replaceSystemSelectedEvidenceLinks({
			userId: params.userId,
			conversationId: params.conversationId,
			taskId: taskState.taskId,
			selectedArtifacts: selectedArtifacts
				.filter((artifact) => !currentAttachmentIds.has(artifact.id))
				.map((artifact) => ({
				artifactId: artifact.id,
				confidence: routingConfidence,
				reason: routingStage === 'evidence_rerank' ? 'control-model selection' : 'deterministic selection',
			})),
		});
	}

	return {
		taskState,
		routingStage,
		routingConfidence,
		verificationStatus: verified.status,
		selectedArtifacts,
		pinnedArtifactIds: Array.from(pinnedIds),
		excludedArtifactIds: Array.from(excludedIds),
	};
}

export async function getContextDebugState(
	userId: string,
	conversationId: string
): Promise<ContextDebugState | null> {
	const taskState = await getConversationTaskState(userId, conversationId);
	const [statusRow] = await db
		.select()
		.from(conversationContextStatus)
		.where(
			and(
				eq(conversationContextStatus.userId, userId),
				eq(conversationContextStatus.conversationId, conversationId)
			)
		)
		.limit(1);

	if (!taskState && !statusRow) return null;

	const links = taskState
		? await db
				.select({ link: taskStateEvidenceLinks, artifact: artifacts })
				.from(taskStateEvidenceLinks)
				.innerJoin(artifacts, eq(taskStateEvidenceLinks.artifactId, artifacts.id))
				.where(
					and(
						eq(taskStateEvidenceLinks.userId, userId),
						eq(taskStateEvidenceLinks.taskId, taskState.taskId)
					)
				)
				.orderBy(desc(taskStateEvidenceLinks.updatedAt))
		: [];

	const toDebugItems = (role: TaskEvidenceLink['role']) =>
		links
			.filter((entry) => entry.link.role === role)
			.map((entry) => ({
				artifactId: entry.artifact.id,
				name: entry.artifact.name,
				role,
				origin: entry.link.origin as TaskEvidenceLink['origin'],
				confidence: entry.link.confidence ?? 0,
				reason: entry.link.reason ?? null,
			}));

	return {
		activeTaskId: taskState?.taskId ?? null,
		activeTaskObjective: taskState?.objective ?? null,
		taskLocked: taskState?.locked ?? false,
		routingStage: (statusRow?.routingStage ?? 'deterministic') as RoutingStage,
		routingConfidence: statusRow?.routingConfidence ?? 0,
		verificationStatus: (statusRow?.verificationStatus ?? 'skipped') as VerificationStatus,
		selectedEvidence: toDebugItems('selected'),
		pinnedEvidence: toDebugItems('pinned'),
		excludedEvidence: toDebugItems('excluded'),
	};
}

async function upsertEvidenceRole(params: {
	taskId: string;
	userId: string;
	conversationId: string;
	artifactId: string;
	role: 'pinned' | 'excluded';
	enabled: boolean;
}): Promise<void> {
	const oppositeRole = params.role === 'pinned' ? 'excluded' : 'pinned';
	await db
		.delete(taskStateEvidenceLinks)
		.where(
			and(
				eq(taskStateEvidenceLinks.userId, params.userId),
				eq(taskStateEvidenceLinks.taskId, params.taskId),
				eq(taskStateEvidenceLinks.artifactId, params.artifactId),
				eq(taskStateEvidenceLinks.origin, 'user'),
				inArray(taskStateEvidenceLinks.role, [params.role, oppositeRole])
			)
		);

	if (!params.enabled) return;

	await db.insert(taskStateEvidenceLinks).values({
		id: randomUUID(),
		taskId: params.taskId,
		userId: params.userId,
		conversationId: params.conversationId,
		artifactId: params.artifactId,
		role: params.role,
		origin: 'user',
		confidence: 100,
		reason: params.role === 'pinned' ? 'Pinned by user' : 'Excluded by user',
		updatedAt: new Date(),
	});
}

export async function applyTaskSteeringAction(params: {
	userId: string;
	conversationId: string;
	action: TaskSteeringAction;
	artifactId?: string | null;
}): Promise<{ taskState: TaskState | null; contextDebug: ContextDebugState | null }> {
	let taskState = await getConversationTaskState(params.userId, params.conversationId);

	switch (params.action) {
		case 'lock_task':
		case 'unlock_task':
			if (taskState) {
				await db
					.update(conversationTaskStates)
					.set({
						locked: params.action === 'lock_task' ? 1 : 0,
						updatedAt: new Date(),
					})
					.where(eq(conversationTaskStates.taskId, taskState.taskId));
			}
			break;
		case 'start_new_task': {
			const created = await createTaskState({
				userId: params.userId,
				conversationId: params.conversationId,
				objective: 'New task',
				status: 'candidate',
				confidence: 100,
				locked: true,
			});
			await setCurrentTask(created.taskId, params.userId, params.conversationId, 'candidate');
			taskState = created;
			break;
		}
		case 'pin_artifact':
		case 'exclude_artifact':
		case 'unpin_artifact':
		case 'include_artifact':
			if (taskState && params.artifactId) {
				await upsertEvidenceRole({
					taskId: taskState.taskId,
					userId: params.userId,
					conversationId: params.conversationId,
					artifactId: params.artifactId,
					role: params.action === 'pin_artifact' || params.action === 'unpin_artifact' ? 'pinned' : 'excluded',
					enabled: params.action === 'pin_artifact' || params.action === 'exclude_artifact',
				});
			}
			break;
	}

	taskState = await getConversationTaskState(params.userId, params.conversationId);
	return {
		taskState,
		contextDebug: await getContextDebugState(params.userId, params.conversationId),
	};
}

function buildCheckpointContent(taskState: TaskState): string {
	return formatTaskStateForPrompt(taskState);
}

async function upsertTaskCheckpoint(params: {
	taskState: TaskState;
	checkpointType: TaskCheckpoint['checkpointType'];
	content: string;
	sourceEvidenceIds: string[];
	verificationStatus?: VerificationStatus;
	sourceTurnRange?: string | null;
}): Promise<void> {
	const existing = (
		await listTaskCheckpoints({
			userId: params.taskState.userId,
			taskId: params.taskState.taskId,
			checkpointType: params.checkpointType,
		})
	)[0];

	if (existing && existing.content === params.content) {
		await db
			.update(taskCheckpoints)
			.set({
				sourceTurnRange: params.sourceTurnRange ?? existing.sourceTurnRange,
				sourceEvidenceIdsJson: JSON.stringify(params.sourceEvidenceIds),
				verificationStatus: params.verificationStatus ?? existing.verificationStatus,
				updatedAt: new Date(),
			})
			.where(eq(taskCheckpoints.id, existing.id));
		return;
	}

	await db.insert(taskCheckpoints).values({
		id: randomUUID(),
		taskId: params.taskState.taskId,
		userId: params.taskState.userId,
		conversationId: params.taskState.conversationId,
		checkpointType: params.checkpointType,
		content: params.content,
		sourceTurnRange: params.sourceTurnRange ?? null,
		sourceEvidenceIdsJson: JSON.stringify(params.sourceEvidenceIds),
		verificationStatus: params.verificationStatus ?? 'skipped',
		updatedAt: new Date(),
	});
}

export async function updateTaskStateCheckpoint(params: {
	userId: string;
	conversationId: string;
	message: string;
	assistantResponse: string;
	attachmentIds?: string[];
	promptArtifactIds?: string[];
	userMessageId?: string | null;
	assistantMessageId?: string | null;
}): Promise<TaskState | null> {
	const attachmentIds = params.attachmentIds ?? [];
	const promptArtifactIds = params.promptArtifactIds ?? [];
	const routed = await routeTaskStateForTurn({
		userId: params.userId,
		conversationId: params.conversationId,
		message: params.message,
		attachmentIds,
		createIfMissing: true,
	});
	const existing = routed.taskState;

	if (!existing) return null;

	const llmUpdate = await summarizeTaskStateUpdate({
		existing,
		message: params.message,
		assistantResponse: params.assistantResponse,
		attachmentIds,
		promptArtifactIds,
	});
	const merged = llmUpdate ?? buildDeterministicTaskStateUpdate({
		existing,
		message: params.message,
		assistantResponse: params.assistantResponse,
		attachmentIds,
		promptArtifactIds,
	});

	const nextConfidence = Math.min(
		100,
		Math.max(existing.confidence, routed.routingConfidence, llmUpdate ? 82 : 72)
	);
	const [updated] = await db
		.update(conversationTaskStates)
		.set({
			status: 'active',
			objective: clip(merged.objective ?? existing.objective, 220),
			confidence: nextConfidence,
			locked: existing.locked ? 1 : 0,
			lastConfirmedTurnMessageId:
				params.assistantMessageId ?? params.userMessageId ?? existing.lastConfirmedTurnMessageId,
			constraintsJson: JSON.stringify(merged.constraints ?? existing.constraints),
			factsToPreserveJson: JSON.stringify(merged.factsToPreserve ?? existing.factsToPreserve),
			decisionsJson: JSON.stringify(merged.decisions ?? existing.decisions),
			openQuestionsJson: JSON.stringify(merged.openQuestions ?? existing.openQuestions),
			activeArtifactIdsJson: JSON.stringify(merged.activeArtifactIds ?? existing.activeArtifactIds),
			nextStepsJson: JSON.stringify(merged.nextSteps ?? existing.nextSteps),
			lastCheckpointAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(conversationTaskStates.taskId, existing.taskId))
		.returning();

	await setCurrentTask(existing.taskId, params.userId, params.conversationId, 'active');
	const current = updated ? mapTaskState(updated) : existing;
	const checkpointContent = buildCheckpointContent(current);
	const sourceEvidenceIds = uniqueCompact([...attachmentIds, ...promptArtifactIds], 12);
	const sourceTurnRange =
		params.userMessageId || params.assistantMessageId
			? `${params.userMessageId ?? 'unknown'}..${params.assistantMessageId ?? 'unknown'}`
			: null;

	await upsertTaskCheckpoint({
		taskState: current,
		checkpointType: 'micro',
		content: checkpointContent,
		sourceEvidenceIds,
		sourceTurnRange,
		verificationStatus: 'skipped',
	});

	if (current.decisions.length > 0 || current.factsToPreserve.length > 1 || current.nextSteps.length > 0) {
		await upsertTaskCheckpoint({
			taskState: current,
			checkpointType: 'stable',
			content: checkpointContent,
			sourceEvidenceIds,
			sourceTurnRange,
			verificationStatus: llmUpdate ? 'passed' : 'skipped',
		});
	}

	return current;
}

export function formatTaskStateForPrompt(taskState: TaskState): string {
	const sections = [
		`Objective: ${taskState.objective}`,
		taskState.constraints.length > 0 ? `Constraints:\n- ${taskState.constraints.join('\n- ')}` : null,
		taskState.factsToPreserve.length > 0
			? `Facts to preserve:\n- ${taskState.factsToPreserve.join('\n- ')}`
			: null,
		taskState.decisions.length > 0 ? `Decisions:\n- ${taskState.decisions.join('\n- ')}` : null,
		taskState.openQuestions.length > 0
			? `Open questions:\n- ${taskState.openQuestions.join('\n- ')}`
			: null,
		taskState.nextSteps.length > 0 ? `Next steps:\n- ${taskState.nextSteps.join('\n- ')}` : null,
	]
		.filter((value): value is string => Boolean(value));

	return sections.join('\n\n');
}

export async function syncArtifactChunks(params: {
	artifactId: string;
	userId: string;
	conversationId?: string | null;
	contentText?: string | null;
}): Promise<void> {
	await db.delete(artifactChunks).where(eq(artifactChunks.artifactId, params.artifactId));

	if (!params.contentText?.trim()) return;

	const chunks = splitIntoChunks(params.contentText);
	if (chunks.length === 0) return;

	await db.insert(artifactChunks).values(
		chunks.map((chunk, index) => ({
			id: randomUUID(),
			artifactId: params.artifactId,
			userId: params.userId,
			conversationId: params.conversationId ?? null,
			chunkIndex: index,
			contentText: chunk,
			tokenEstimate: estimateTokenCount(chunk),
			updatedAt: new Date(),
		}))
	);
}

export async function listArtifactChunksForArtifacts(
	userId: string,
	artifactIds: string[]
): Promise<ArtifactChunk[]> {
	if (artifactIds.length === 0) return [];
	const rows = await db
		.select()
		.from(artifactChunks)
		.where(
			and(
				eq(artifactChunks.userId, userId),
				inArray(artifactChunks.artifactId, artifactIds)
			)
		)
		.orderBy(artifactChunks.chunkIndex);

	return rows.map(mapArtifactChunk);
}

export async function getPromptArtifactSnippets(params: {
	userId: string;
	artifacts: Artifact[];
	query: string;
	perArtifactLimit?: number;
	perArtifactCharBudget?: number;
}): Promise<Map<string, string>> {
	const perArtifactLimit = params.perArtifactLimit ?? 2;
	const perArtifactCharBudget = params.perArtifactCharBudget ?? 1400;
	const artifactIds = params.artifacts.map((artifact) => artifact.id);
	const chunkRows = await listArtifactChunksForArtifacts(params.userId, artifactIds);
	const chunksByArtifactId = new Map<string, ArtifactChunk[]>();

	for (const chunk of chunkRows) {
		const list = chunksByArtifactId.get(chunk.artifactId) ?? [];
		list.push(chunk);
		chunksByArtifactId.set(chunk.artifactId, list);
	}

	const snippets = new Map<string, string>();

	for (const artifact of params.artifacts) {
		const chunks = chunksByArtifactId.get(artifact.id) ?? [];
		if (chunks.length === 0) {
			const fallback = artifact.contentText ?? artifact.summary ?? artifact.name;
			snippets.set(artifact.id, clip(fallback, perArtifactCharBudget));
			continue;
		}

		const ranked = chunks
			.map((chunk) => ({
				chunk,
				score: params.query.trim()
					? scoreMatch(params.query, `${artifact.name}\n${artifact.summary ?? ''}\n${chunk.contentText}`)
					: 0,
			}))
			.sort((a, b) => {
				if (b.score !== a.score) return b.score - a.score;
				return a.chunk.chunkIndex - b.chunk.chunkIndex;
			});

		const selected = ranked.filter((entry) => entry.score > 0).slice(0, perArtifactLimit);
		const chosen = selected.length > 0 ? selected : ranked.slice(0, 1);
		const combined = chosen
			.map((entry) => clip(entry.chunk.contentText, Math.floor(perArtifactCharBudget / chosen.length)))
			.join('\n\n');
		snippets.set(artifact.id, clip(combined, perArtifactCharBudget));
	}

	return snippets;
}

export async function summarizeHistoricalContext(params: {
	message: string;
	taskState: TaskState | null;
	sectionBodies: Array<{ title: string; body: string }>;
	targetTokens: number;
}): Promise<string | null> {
	if (!canUseContextSummarizer()) return null;
	if (params.sectionBodies.length === 0) return null;

	const prompt = [
		params.taskState ? `Current task objective: ${params.taskState.objective}` : null,
		`Current user message: ${params.message}`,
		'Condense the historical support context below into a compact working checkpoint for the current turn. Preserve only details that are clearly relevant to the current task and user message.',
		...params.sectionBodies.map((section) => `## ${section.title}\n${section.body}`),
	]
		.filter((value): value is string => Boolean(value))
		.join('\n\n');

	try {
		const content = await requestContextSummarizer({
			system:
				'You compress historical support context for a chat assistant. Return concise markdown, focused on currently relevant facts, decisions, open questions, and evidence. Do not invent new facts.',
			user: prompt,
			maxTokens: Math.max(240, Math.min(700, Math.floor(params.targetTokens / 3))),
			temperature: 0.0,
		});
		return content ? content.trim() : null;
	} catch (error) {
		console.error('[TASK_STATE] Historical context summarization failed:', error);
		return null;
	}
}
