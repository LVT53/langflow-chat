import { readFile } from 'fs/promises';
import { join } from 'path';
import { Honcho } from '@honcho-ai/sdk';
import type { Message, Peer } from '@honcho-ai/sdk';
import type { Session } from '@honcho-ai/sdk/dist/session';
import { getConfig } from '../config-store';
import { getSystemPrompt } from '../prompts';
import {
	COMPACTION_UI_THRESHOLD,
	findRelevantKnowledgeArtifacts,
	findRelevantWorkCapsules,
	getArtifactsForUser,
	selectWorkingSetArtifactsForPrompt,
	TARGET_CONSTRUCTED_CONTEXT,
	updateConversationContextStatus,
	WORKING_SET_DOCUMENT_TOKEN_BUDGET,
	WORKING_SET_OUTPUT_TOKEN_BUDGET,
	WORKING_SET_PROMPT_TOKEN_BUDGET,
} from './knowledge';
import type {
	Artifact,
	ConversationContextStatus,
	MemoryLayer,
	WorkCapsule,
} from '$lib/types';

let client: Honcho | null = null;

const peerCache = new Map<string, Peer>();
const sessionCache = new Map<string, Session>();

function estimateTokenCount(text: string): number {
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

function truncateByTokens(text: string, maxTokens: number): string {
	if (estimateTokenCount(text) <= maxTokens) return text;
	const chars = Math.max(300, maxTokens * 4);
	return `${text.slice(0, chars).trim()}\n...[truncated]`;
}

function buildSection(title: string, body: string): string {
	const trimmed = body.trim();
	return trimmed ? `## ${title}\n${trimmed}` : '';
}

function assistantPeerId(userId: string): string {
	return `assistant:${userId}`;
}

function roleForMessage(message: Message, userId: string): 'user' | 'assistant' {
	const metadataRole =
		typeof message.metadata?.role === 'string' ? message.metadata.role : null;
	if (metadataRole === 'assistant' || metadataRole === 'user') {
		return metadataRole;
	}
	return message.peerId === assistantPeerId(userId) ? 'assistant' : 'user';
}

function serializeMessages(messages: Message[], userId: string, limit: number): string {
	return messages
		.slice(-limit)
		.map((message) => `${roleForMessage(message, userId).toUpperCase()}: ${message.content.trim()}`)
		.join('\n\n');
}

function serializeSearchMessages(messages: Message[], userId: string): string {
	return messages
		.map((message) => `${roleForMessage(message, userId).toUpperCase()}: ${message.content.trim()}`)
		.join('\n\n');
}

function serializePeerContext(peerContext: { representation: string | null; peerCard: string[] | null }): string {
	const parts: string[] = [];
	if (peerContext.representation?.trim()) {
		parts.push(peerContext.representation.trim());
	}
	if (peerContext.peerCard?.length) {
		parts.push(`Peer card:\n- ${peerContext.peerCard.join('\n- ')}`);
	}
	return parts.join('\n\n');
}

function serializeCapsules(capsules: WorkCapsule[]): string {
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

function serializeArtifacts(artifacts: Artifact[], label: string): string {
	return artifacts
		.map((artifact) => {
			const excerptSource = artifact.contentText ?? artifact.summary ?? artifact.name;
			return `${label}: ${artifact.name}\n${truncateByTokens(excerptSource, 1200)}`;
		})
			.join('\n\n');
}

function serializeWorkingSetArtifacts(artifacts: Artifact[]): string {
	let budgetRemaining = WORKING_SET_PROMPT_TOKEN_BUDGET;
	const parts: string[] = [];

	for (const artifact of artifacts) {
		if (budgetRemaining <= 0) break;
		const excerptSource = artifact.contentText ?? artifact.summary ?? artifact.name;
		const perArtifactBudget =
			artifact.type === 'generated_output'
				? WORKING_SET_OUTPUT_TOKEN_BUDGET
				: WORKING_SET_DOCUMENT_TOKEN_BUDGET;
		const excerptBudget = Math.min(perArtifactBudget, budgetRemaining);
		const kind = artifact.type === 'generated_output' ? 'Result' : 'Document';
		const section = `${kind}: ${artifact.name}\n${truncateByTokens(excerptSource, excerptBudget)}`;
		parts.push(section);
		budgetRemaining -= estimateTokenCount(section);
	}

	return parts.join('\n\n');
}

export function isHonchoEnabled(): boolean {
	return getConfig().honchoEnabled;
}

async function ensureClient(): Promise<Honcho> {
	if (client) return client;

	const config = getConfig();
	client = new Honcho({
		apiKey: config.honchoApiKey || 'no-auth',
		baseURL: config.honchoBaseUrl,
		workspaceId: config.honchoWorkspace,
	});

	console.log('[HONCHO] Initialized — workspace:', config.honchoWorkspace);
	return client;
}

async function getPeerById(peerId: string): Promise<Peer> {
	const cached = peerCache.get(peerId);
	if (cached) return cached;

	const honcho = await ensureClient();
	const peer = await honcho.peer(peerId);
	peerCache.set(peerId, peer);
	return peer;
}

export async function getUserPeer(userId: string): Promise<Peer> {
	return getPeerById(userId);
}

export async function getAssistantPeer(userId: string): Promise<Peer> {
	return getPeerById(assistantPeerId(userId));
}

async function getSession(userId: string, conversationId: string): Promise<Session> {
	const cached = sessionCache.get(conversationId);
	if (cached) return cached;

	const honcho = await ensureClient();
	const session = await honcho.session(conversationId);
	const userPeer = await getUserPeer(userId);
	const assistantPeer = await getAssistantPeer(userId);

	try {
		await session.addPeers([userPeer, assistantPeer]);
		console.log(`[HONCHO] Attached peers to session ${conversationId}`);
	} catch (err) {
		console.error('[HONCHO] Failed to attach peers to session:', err);
	}

	sessionCache.set(conversationId, session);
	return session;
}

export async function getOrCreateSession(userId: string, conversationId: string): Promise<string> {
	const session = await getSession(userId, conversationId);
	return session.id;
}

export async function mirrorMessage(
	userId: string,
	conversationId: string,
	role: 'user' | 'assistant',
	content: string
): Promise<void> {
	if (!isHonchoEnabled() || !content.trim()) return;

	const session = await getSession(userId, conversationId);
	const peer = role === 'assistant'
		? await getAssistantPeer(userId)
		: await getUserPeer(userId);

	const msgs = await session.addMessages(
		peer.message(content, { metadata: { role } })
	);
	console.log(`[HONCHO] Mirrored ${role} message to session ${conversationId} (${msgs.length} msgs created)`);
}

export async function syncArtifactToHoncho(params: {
	userId: string;
	conversationId: string;
	artifact: Artifact;
	file?: File;
	fallbackTextArtifact?: Artifact | null;
}): Promise<{ uploaded: boolean; mode: 'native' | 'normalized' | 'none' }> {
	if (!isHonchoEnabled()) {
		return { uploaded: false, mode: 'none' };
	}

	const session = await getSession(params.userId, params.conversationId);
	const userPeer = await getUserPeer(params.userId);

	try {
		if (params.file) {
			await session.uploadFile(params.file, userPeer, {
				metadata: {
					role: 'user',
					artifactId: params.artifact.id,
					artifactType: params.artifact.type,
				},
			});
			return { uploaded: true, mode: 'native' };
		}
		if (params.artifact.storagePath) {
			const buffer = await readFile(join(process.cwd(), params.artifact.storagePath));
			await session.uploadFile(
				{
					filename: params.artifact.name,
					content: buffer,
					content_type: params.artifact.mimeType ?? 'application/octet-stream',
				},
				userPeer,
				{
					metadata: {
						role: 'user',
						artifactId: params.artifact.id,
						artifactType: params.artifact.type,
					},
				}
			);
			return { uploaded: true, mode: 'native' };
		}
	} catch (error) {
		console.error('[HONCHO] Native artifact upload failed:', error);
	}

	const fallbackArtifact = params.fallbackTextArtifact;
	if (fallbackArtifact?.contentText?.trim()) {
		await session.addMessages(
			userPeer.message(fallbackArtifact.contentText, {
				metadata: {
					role: 'user',
					artifactId: fallbackArtifact.id,
					artifactType: fallbackArtifact.type,
					sourceArtifactId: params.artifact.id,
				},
			})
		);
		return { uploaded: true, mode: 'normalized' };
	}

	return { uploaded: false, mode: 'none' };
}

export async function mirrorWorkCapsuleConclusion(params: {
	userId: string;
	conversationId: string;
	content: string;
}): Promise<void> {
	if (!isHonchoEnabled() || !params.content.trim()) return;
	try {
		const peer = await getUserPeer(params.userId);
		await peer.conclusions.create({
			content: truncateByTokens(params.content, 800),
			sessionId: params.conversationId,
		});
	} catch (error) {
		console.error('[HONCHO] Failed to mirror work capsule conclusion:', error);
	}
}

async function getSessionMessages(session: Session): Promise<Message[]> {
	const page = await session.messages();
	const all = await page.toArray();
	return all.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

async function getPeerContextString(userId: string, query: string): Promise<string> {
	const peer = await getUserPeer(userId);
	const peerContext = await peer.context({
		searchQuery: query,
		searchTopK: 8,
		maxConclusions: 12,
	});
	return serializePeerContext(peerContext);
}

export async function buildConstructedContext(params: {
	userId: string;
	conversationId: string;
	message: string;
	attachmentIds?: string[];
}): Promise<{ inputValue: string; contextStatus: ConversationContextStatus }> {
	const attachmentIds = params.attachmentIds ?? [];
	const session = await getSession(params.userId, params.conversationId);
	const [sessionMessages, summaries, searchedMessages, peerContext, currentAttachments, workingSetArtifacts, relevantCapsules, relevantArtifacts] =
		await Promise.all([
			getSessionMessages(session).catch(() => []),
			session.summaries().catch(() => null),
			session.search(params.message, { limit: 4 }).catch(() => []),
			getPeerContextString(params.userId, params.message).catch(() => ''),
			getArtifactsForUser(params.userId, attachmentIds),
			selectWorkingSetArtifactsForPrompt(
				params.userId,
				params.conversationId,
				params.message,
				attachmentIds
			).catch(() => []),
			findRelevantWorkCapsules(params.userId, params.message, params.conversationId, 3).catch(() => []),
			findRelevantKnowledgeArtifacts(params.userId, params.message, params.conversationId, 6).catch(() => []),
		]);

	const sections: Array<{ title: string; body: string; layer?: MemoryLayer; essential?: boolean }> = [];

	if (currentAttachments.length > 0) {
		sections.push({
			title: 'Current Attachments',
			body: serializeArtifacts(currentAttachments, 'Attachment'),
			layer: 'documents',
			essential: true,
		});
	}

	if (workingSetArtifacts.length > 0) {
		sections.push({
			title: 'Active Working Set',
			body: serializeWorkingSetArtifacts(workingSetArtifacts),
			layer: 'working_set',
			essential: true,
		});
	}

	const longSummary = summaries?.longSummary?.content ?? summaries?.shortSummary?.content ?? '';
	if (longSummary.trim()) {
		sections.push({
			title: 'Session Summary',
			body: truncateByTokens(longSummary, 1600),
			layer: 'session',
			essential: true,
		});
	}

	if (sessionMessages.length > 0) {
		sections.push({
			title: 'Recent Session Turns',
			body: serializeMessages(sessionMessages, params.userId, 10),
			layer: 'session',
			essential: true,
		});
	}

	if (peerContext.trim()) {
		sections.push({
			title: 'User Memory',
			body: truncateByTokens(peerContext, 1400),
			layer: 'session',
		});
	}

	if (searchedMessages.length > 0) {
		sections.push({
			title: 'Relevant Session Recalls',
			body: truncateByTokens(serializeSearchMessages(searchedMessages, params.userId), 1000),
			layer: 'session',
		});
	}

	if (relevantCapsules.length > 0) {
		sections.push({
			title: 'Relevant Prior Workflows',
			body: truncateByTokens(serializeCapsules(relevantCapsules), 1200),
			layer: 'capsule',
		});
	}

	if (relevantArtifacts.length > 0) {
		const dedupeIds = new Set([
			...currentAttachments.map((artifact) => artifact.id),
			...workingSetArtifacts.map((artifact) => artifact.id),
		]);
		const dedupedArtifacts = relevantArtifacts.filter((artifact) => !dedupeIds.has(artifact.id));
		const outputs = dedupedArtifacts.filter((artifact) => artifact.type === 'generated_output');
		const documents = dedupedArtifacts.filter((artifact) => artifact.type !== 'generated_output');
		if (outputs.length > 0) {
			sections.push({
				title: 'Relevant Prior Results',
				body: truncateByTokens(serializeArtifacts(outputs, 'Result'), 1200),
				layer: 'outputs',
			});
		}
		if (documents.length > 0) {
			sections.push({
				title: 'Relevant Knowledge Documents',
				body: truncateByTokens(serializeArtifacts(documents, 'Document'), 1200),
				layer: 'documents',
			});
		}
	}

	let bodyParts: string[] = [];
	let layersUsed = new Set<MemoryLayer>();
	let usedTokens = estimateTokenCount(params.message) + 12;
	let compactionApplied = false;

	for (const section of sections) {
		const candidate = buildSection(section.title, section.body);
		if (!candidate) continue;
		const candidateTokens = estimateTokenCount(candidate);
		const nextTotal = usedTokens + candidateTokens;
		if (!section.essential && nextTotal > TARGET_CONSTRUCTED_CONTEXT) {
			compactionApplied = true;
			continue;
		}
		if (section.essential && nextTotal > TARGET_CONSTRUCTED_CONTEXT) {
			const remaining = Math.max(400, TARGET_CONSTRUCTED_CONTEXT - usedTokens - 200);
			const truncated = buildSection(section.title, truncateByTokens(section.body, remaining));
			bodyParts.push(truncated);
			usedTokens += estimateTokenCount(truncated);
			compactionApplied = true;
		} else {
			bodyParts.push(candidate);
			usedTokens = nextTotal;
		}
		if (section.layer) layersUsed.add(section.layer);
	}

	const inputValue = [
		'You are receiving a compacted conversation context bundle. Use it as the working context for this turn.',
		...bodyParts,
		buildSection('Current User Message', params.message),
	].join('\n\n');

	const status = await updateConversationContextStatus({
		conversationId: params.conversationId,
		userId: params.userId,
		estimatedTokens: estimateTokenCount(inputValue),
		compactionApplied:
			compactionApplied || estimateTokenCount(inputValue) >= COMPACTION_UI_THRESHOLD,
		layersUsed: Array.from(layersUsed),
		workingSetCount: workingSetArtifacts.length,
		workingSetArtifactIds: workingSetArtifacts.map((artifact) => artifact.id),
		workingSetApplied: workingSetArtifacts.length > 0,
		summary: longSummary || null,
	});

	return { inputValue, contextStatus: status };
}

export async function getPeerContext(userId: string): Promise<string | null> {
	if (!isHonchoEnabled()) return null;

	try {
		const peer = await getUserPeer(userId);
		const response = await peer.chat(
			'Summarize what you know about this user: preferences, interests, communication style, and important context. Be concise (under 200 words).',
			{ reasoningLevel: 'low' }
		);
		return response?.trim() || null;
	} catch (err) {
		console.error('[HONCHO] getPeerContext failed:', err);
		return null;
	}
}

export async function buildEnhancedSystemPrompt(
	promptName: string | undefined,
	_userId: string
): Promise<string> {
	return getSystemPrompt(promptName);
}

export async function checkHealth(): Promise<{
	enabled: boolean;
	connected: boolean;
	workspace: string | null;
}> {
	if (!isHonchoEnabled()) {
		return { enabled: false, connected: false, workspace: null };
	}

	try {
		await ensureClient();
		const honcho = client!;
		await honcho.getMetadata();
		return {
			enabled: true,
			connected: true,
			workspace: getConfig().honchoWorkspace,
		};
	} catch {
		return {
			enabled: true,
			connected: false,
			workspace: getConfig().honchoWorkspace,
		};
	}
}
