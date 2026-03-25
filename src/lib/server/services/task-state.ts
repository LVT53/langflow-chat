import { randomUUID } from 'crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	artifactChunks,
	conversationTaskStates,
} from '$lib/server/db/schema';
import { getConfig } from '$lib/server/config-store';
import type { Artifact, ArtifactChunk, TaskState } from '$lib/types';
import { scoreMatch } from './working-set';

const CHUNK_CHAR_TARGET = 1400;
const CHUNK_CHAR_OVERLAP = 220;
const TASK_MATCH_MIN_SCORE = 12;
const MAX_LIST_ITEMS = 6;

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

async function setActiveTask(taskId: string, userId: string, conversationId: string): Promise<void> {
	await db
		.update(conversationTaskStates)
		.set({
			status: 'cooling',
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(conversationTaskStates.userId, userId),
				eq(conversationTaskStates.conversationId, conversationId),
				eq(conversationTaskStates.status, 'active')
			)
		);

	await db
		.update(conversationTaskStates)
		.set({
			status: 'active',
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
	const [active] = await db
		.select()
		.from(conversationTaskStates)
		.where(
			and(
				eq(conversationTaskStates.userId, userId),
				eq(conversationTaskStates.conversationId, conversationId),
				eq(conversationTaskStates.status, 'active')
			)
		)
		.orderBy(desc(conversationTaskStates.updatedAt))
		.limit(1);

	if (active) return mapTaskState(active);

	const [fallback] = await db
		.select()
		.from(conversationTaskStates)
		.where(
			and(
				eq(conversationTaskStates.userId, userId),
				eq(conversationTaskStates.conversationId, conversationId)
			)
		)
		.orderBy(desc(conversationTaskStates.updatedAt))
		.limit(1);

	return fallback ? mapTaskState(fallback) : null;
}

export async function selectTaskStateForTurn(params: {
	userId: string;
	conversationId: string;
	message: string;
	attachmentIds?: string[];
	createIfMissing?: boolean;
}): Promise<TaskState | null> {
	const attachmentIds = params.attachmentIds ?? [];
	const states = await listConversationTaskStates(params.userId, params.conversationId);

	let best: TaskState | null = null;
	let bestScore = -1;

	for (const state of states) {
		const score = scoreTaskState(state, params.message, attachmentIds);
		if (score > bestScore) {
			best = state;
			bestScore = score;
		}
	}

	if (best && bestScore >= TASK_MATCH_MIN_SCORE) {
		if (best.status !== 'active') {
			await setActiveTask(best.taskId, params.userId, params.conversationId);
			return (await getConversationTaskState(params.userId, params.conversationId)) ?? best;
		}
		return best;
	}

	if (!params.createIfMissing) {
		return best;
	}

	const [created] = await db
		.insert(conversationTaskStates)
		.values({
			taskId: randomUUID(),
			userId: params.userId,
			conversationId: params.conversationId,
			status: 'active',
			objective: clip(params.message, 220),
			openQuestionsJson: JSON.stringify(uniqueCompact([extractQuestionCandidate(params.message)], 4)),
			activeArtifactIdsJson: JSON.stringify(uniqueCompact(attachmentIds, 12)),
			lastCheckpointAt: new Date(),
			updatedAt: new Date(),
		})
		.returning();

	if (best) {
		await setActiveTask(created.taskId, params.userId, params.conversationId);
	}

	return mapTaskState(created);
}

export async function updateTaskStateCheckpoint(params: {
	userId: string;
	conversationId: string;
	message: string;
	assistantResponse: string;
	attachmentIds?: string[];
	promptArtifactIds?: string[];
}): Promise<TaskState | null> {
	const attachmentIds = params.attachmentIds ?? [];
	const promptArtifactIds = params.promptArtifactIds ?? [];
	const existing = await selectTaskStateForTurn({
		userId: params.userId,
		conversationId: params.conversationId,
		message: params.message,
		attachmentIds,
		createIfMissing: true,
	});

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

	const [updated] = await db
		.update(conversationTaskStates)
		.set({
			status: 'active',
			objective: clip(merged.objective ?? existing.objective, 220),
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

	await setActiveTask(existing.taskId, params.userId, params.conversationId);
	return updated ? mapTaskState(updated) : existing;
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
