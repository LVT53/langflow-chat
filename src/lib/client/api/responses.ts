/**
 * Response normalization helpers for client-side API consumption.
 *
 * Centralizes transformation of raw server payloads into the types
 * used throughout the app (ChatMessage, ConversationSummary, etc.).
 *
 * Usage:
 * ```ts
 * import { toChatMessage, toConversationSummary } from '$lib/client/api/responses';
 * ```
 */

import type {
	ArtifactSummary,
	ChatMessage,
	ConversationListItem,
	PendingAttachment,
} from '$lib/types';

// ---------------------------------------------------------------------------
// API payload types (what the server actually returns)
// ---------------------------------------------------------------------------

export interface ApiMessagePayload {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
	attachments?: PendingAttachment[];
	toolCall?: {
		name: string;
		input: Record<string, unknown>;
		inputDisplay?: string;
		outputSummary?: string;
	};
	toolCalls?: Array<{
		name: string;
		input: Record<string, unknown>;
		inputDisplay?: string;
		outputSummary?: string;
	}>;
	thinking?: string;
	thinkingSegments?: Array<{ type: 'text'; content: string } | { type: 'code'; content: string }>;
}

export interface ConversationPayload {
	id: string;
	title: string;
	updatedAt: number;
	projectId?: string | null;
}

export interface ProjectPayload {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
}

export interface ArtifactPayload {
	id: string;
	name: string;
	type: string;
	mimeType: string;
	sizeBytes: number;
	conversationId?: string | null;
	createdAt: number;
}

export interface MessageEvidencePayload {
	sourceType?: string;
	title?: string;
	description?: string;
	artifactId?: string | null;
	score?: number;
	chunks?: Array<{
		text: string;
		relevanceScore?: number;
	}>;
}

// ---------------------------------------------------------------------------
// Normalized output types
// ---------------------------------------------------------------------------

export type ConversationSummary = Pick<
	ConversationListItem,
	'id' | 'title' | 'updatedAt' | 'projectId'
>;

export type MessageEvidenceSummary = NonNullable<ChatMessage['evidenceSummary']>;

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a raw API message payload into a ChatMessage.
 */
export function toChatMessage(payload: ApiMessagePayload): ChatMessage {
	return {
		id: payload.id,
		renderKey: payload.id,
		role: payload.role,
		content: payload.content ?? '',
		timestamp: payload.timestamp ?? Date.now(),
		attachments: payload.attachments ?? [],
		toolCall: payload.toolCall,
		toolCalls: payload.toolCalls,
		thinking: payload.thinking,
		thinkingSegments: payload.thinkingSegments,
		isStreaming: false,
		isThinkingStreaming: false,
	};
}

/**
 * Normalize a raw conversation payload into a ConversationSummary.
 */
export function toConversationSummary(payload: ConversationPayload): ConversationSummary {
	return {
		id: payload.id,
		title: payload.title ?? 'Untitled',
		updatedAt: payload.updatedAt ?? Date.now(),
		projectId: payload.projectId ?? null,
	};
}

/**
 * Normalize a raw project payload into a project summary.
 */
export function toProjectSummary(payload: ProjectPayload): {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
} {
	return {
		id: payload.id,
		name: payload.name ?? 'Untitled Project',
		createdAt: payload.createdAt ?? Date.now(),
		updatedAt: payload.updatedAt ?? Date.now(),
	};
}

/**
 * Normalize a raw evidence payload into a MessageEvidenceSummary.
 */
export function toMessageEvidenceSummary(payload: MessageEvidencePayload): MessageEvidenceSummary {
	return {
		sourceType: payload.sourceType as MessageEvidenceSummary['sourceType'],
		title: payload.title ?? 'Untitled',
		description: payload.description ?? '',
		artifactId: payload.artifactId ?? null,
		score: payload.score,
		chunks:
			payload.chunks?.map((chunk) => ({
				text: chunk.text ?? '',
				relevanceScore: chunk.relevanceScore,
			})) ?? [],
	};
}

/**
 * Normalize a raw artifact payload into an ArtifactSummary.
 */
export function toArtifactSummary(payload: ArtifactPayload): ArtifactSummary {
	return {
		id: payload.id,
		name: payload.name ?? 'Untitled',
		type: payload.type ?? 'unknown',
		mimeType: payload.mimeType ?? 'application/octet-stream',
		sizeBytes: payload.sizeBytes ?? 0,
		conversationId: payload.conversationId ?? null,
		createdAt: payload.createdAt ?? Date.now(),
	};
}