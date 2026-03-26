import type { RequestHandler } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth/hooks';
import { getConversation, touchConversation } from '$lib/server/services/conversations';
import { clearConversationDraft } from '$lib/server/services/conversation-drafts';
import { sendMessageStream } from '$lib/server/services/langflow';
import { getConfig, normalizeModelSelection } from '$lib/server/config-store';
import { recordMessageAnalytics } from '$lib/server/services/analytics';
import { createMessage, updateMessageEvidence } from '$lib/server/services/messages';
import { buildAssistantEvidenceSummary } from '$lib/server/services/message-evidence';
import {
	createAttachmentTraceId,
	logAttachmentTrace,
} from '$lib/server/services/attachment-trace';
import {
	capturePersonaMemorySnapshot,
	mirrorMessage,
	mirrorWorkCapsuleConclusion,
	syncConversationPersonaMemoryAttributions,
} from '$lib/server/services/honcho';
import {
	assertPromptReadyAttachments,
	attachArtifactsToMessage,
	createGeneratedOutputArtifact,
	getConversationWorkingSet,
	getArtifactsForUser,
	isAttachmentReadinessError,
	listConversationSourceArtifactIds,
	refreshConversationWorkingSet,
	upsertWorkCapsule
} from '$lib/server/services/knowledge';
import {
	getContextDebugState,
	getConversationTaskState,
	updateTaskStateCheckpoint,
} from '$lib/server/services/task-state';
import { runUserMemoryMaintenance } from '$lib/server/services/memory-maintenance';
import {
	attachContinuityToTaskState,
	syncTaskContinuityFromTaskState,
} from '$lib/server/services/project-memory';
import { detectLanguage } from '$lib/server/services/language';
import {
	StreamingHungarianTranslator,
	translateHungarianToEnglish
} from '$lib/server/services/translator';

const STREAM_TIMEOUT_MS = 120_000;

// Tool call markers — STX/ETX control characters as delimiters, never in model output
const TOOL_CALL_START_RE = /\x02TOOL_START\x1f([^\x03]*)\x03/g;
const TOOL_CALL_END_RE = /\x02TOOL_END\x1f([^\x03]*)\x03/g;

function processToolCallMarkers(
	chunk: string,
	emit: (
		name: string,
		input: Record<string, unknown>,
		status: 'running' | 'done',
		details?: StreamToolCallDetails
	) => void
): string {
	// Debug: log any chunk that contains STX or the marker text
	if (chunk.includes('\x02') || chunk.includes('TOOL_START') || chunk.includes('TOOL_END')) {
		console.log('[TOOL_MARKER] Marker detected in chunk:', JSON.stringify(chunk).slice(0, 300));
	}

	let result = chunk;

	result = result.replace(TOOL_CALL_START_RE, (_, payload) => {
		console.log('[TOOL_MARKER] TOOL_START matched, payload:', payload.slice(0, 200));
		try {
			const parsed = JSON.parse(payload) as StreamToolCallPayload;
			emit(parsed.name ?? 'tool', parsed.input ?? {}, 'running');
		} catch {
			emit('tool', {}, 'running');
		}
		return '';
	});

	result = result.replace(TOOL_CALL_END_RE, (_, payload) => {
		console.log('[TOOL_MARKER] TOOL_END matched, payload:', payload.slice(0, 200));
		try {
			const parsed = JSON.parse(payload) as StreamToolCallPayload;
			emit(parsed.name ?? 'tool', {}, 'done', {
				outputSummary: typeof parsed.outputSummary === 'string' ? parsed.outputSummary : null,
				sourceType:
					parsed.sourceType === 'web' ||
					parsed.sourceType === 'tool' ||
					parsed.sourceType === 'document' ||
					parsed.sourceType === 'memory'
						? parsed.sourceType
						: null,
				candidates: normalizeToolCandidates(parsed.candidates),
			});
		} catch {
			emit('tool', {}, 'done');
		}
		return '';
	});

	return result;
}

// Nemotron-style thinking tags
const THINKING_OPEN_TAG = '<thinking>';
const THINKING_CLOSE_TAG = '</thinking>';

// Hermes 4-style thinking tags
const HERMES_THINKING_OPEN_TAG = '<think>';
const HERMES_THINKING_CLOSE_TAG = '</think>';

type StreamErrorCode = 'timeout' | 'network' | 'backend_failure';

type UpstreamEvent = {
	event: string;
	data: unknown;
};

type StreamToolCallCandidate = {
	id: string;
	title: string;
	url?: string | null;
	snippet?: string | null;
	sourceType?: 'web' | 'tool' | 'document' | 'memory' | null;
};

type StreamToolCallDetails = {
	outputSummary?: string | null;
	sourceType?: 'web' | 'tool' | 'document' | 'memory' | null;
	candidates?: StreamToolCallCandidate[];
};

type StreamToolCallPayload = {
	name?: string;
	input?: Record<string, unknown>;
	outputSummary?: string;
	sourceType?: string;
	candidates?: unknown;
};

const FRIENDLY_STREAM_ERRORS: Record<StreamErrorCode, string> = {
	timeout: 'The response is taking too long. Please try again.',
	network: 'We could not reach the chat service. Check your connection and try again.',
	backend_failure: 'We hit a temporary issue generating a response. Please try again.'
};

function normalizeToolCandidates(value: unknown): StreamToolCallCandidate[] {
	if (!Array.isArray(value)) return [];

	return value
		.map((candidate, index) => {
			if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
			const record = candidate as Record<string, unknown>;
			const id = typeof record.id === 'string' && record.id.trim() ? record.id : `candidate-${index}`;
			const title =
				typeof record.title === 'string' && record.title.trim()
					? record.title.trim()
					: typeof record.url === 'string'
						? record.url
						: null;
			if (!title) return null;
			return {
				id,
				title,
				url: typeof record.url === 'string' ? record.url : null,
				snippet: typeof record.snippet === 'string' ? record.snippet : null,
				sourceType:
					record.sourceType === 'web' ||
					record.sourceType === 'tool' ||
					record.sourceType === 'document' ||
					record.sourceType === 'memory'
						? record.sourceType
						: null,
			};
		})
		.filter((candidate): candidate is StreamToolCallCandidate => Boolean(candidate));
}

function classifyStreamError(rawMessage: string): StreamErrorCode {
	const message = rawMessage.toLowerCase();

	if (message.includes('timeout') || message.includes('timed out') || message.includes('abort')) {
		return 'timeout';
	}

	if (
		message.includes('network') ||
		message.includes('fetch') ||
		message.includes('econn') ||
		message.includes('enotfound') ||
		message.includes('socket') ||
		message.includes('connection')
	) {
		return 'network';
	}

	return 'backend_failure';
}

function isAbruptUpstreamTermination(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const message = error.message.toLowerCase();
	const cause = 'cause' in error ? (error as Error & { cause?: unknown }).cause : undefined;
	const causeCode =
		cause && typeof cause === 'object' && 'code' in cause ? (cause as { code?: unknown }).code : undefined;

	return (
		message.includes('terminated') ||
		message.includes('socket') ||
		causeCode === 'UND_ERR_SOCKET'
	);
}

function streamErrorEvent(code: StreamErrorCode): string {
	return `event: error\ndata: ${JSON.stringify({ code, message: FRIENDLY_STREAM_ERRORS[code] })}\n\n`;
}

function parseMaybeJson(value: unknown): unknown {
	if (typeof value !== 'string') {
		return value;
	}

	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function parseSseBlock(block: string): UpstreamEvent | null {
	let event = 'message';
	const dataLines: string[] = [];

	for (const rawLine of block.split('\n')) {
		const line = rawLine.trimEnd();
		if (!line || line.startsWith(':')) continue;

		if (line.startsWith('event:')) {
			event = line.slice('event:'.length).trim() || 'message';
			continue;
		}

		if (line.startsWith('data:')) {
			dataLines.push(line.slice('data:'.length).trimStart());
		}
	}

	if (dataLines.length === 0 && event === 'message') {
		return null;
	}

	return {
		event,
		data: parseMaybeJson(dataLines.join('\n'))
	};
}

function parseJsonBlock(block: string): UpstreamEvent | null {
	try {
		const parsed = JSON.parse(block) as { event?: unknown; data?: unknown };
		return {
			event: typeof parsed.event === 'string' ? parsed.event : 'message',
			data: parsed.data
		};
	} catch {
		return null;
	}
}

function parseEventBlock(block: string): UpstreamEvent | null {
	return block.includes('event:') || block.includes('data:')
		? parseSseBlock(block)
		: parseJsonBlock(block);
}

function getPartialTagPrefixLength(value: string, tag: string): number {
	const maxLength = Math.min(value.length, tag.length - 1);

	for (let length = maxLength; length > 0; length -= 1) {
		if (value.endsWith(tag.slice(0, length))) {
			return length;
		}
	}

	return 0;
}

async function* parseUpstreamEvents(
	stream: ReadableStream<Uint8Array>
): AsyncGenerator<UpstreamEvent, void, unknown> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (true) {
			let chunk: ReadableStreamReadResult<Uint8Array>;
			try {
				chunk = await reader.read();
			} catch (error) {
				const finalBlock = buffer.trim();
				if (finalBlock) {
					const event = parseEventBlock(finalBlock);
					if (event) {
						yield event;
						return;
					}
				}
				throw error;
			}

			const { done, value } = chunk;
			if (done) break;
			if (!value) continue;

			buffer += decoder.decode(value, { stream: true });
			buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

			if (buffer.includes('event:') || buffer.includes('data:')) {
				let separatorIndex = buffer.indexOf('\n\n');
				while (separatorIndex !== -1) {
					const block = buffer.slice(0, separatorIndex).trim();
					buffer = buffer.slice(separatorIndex + 2);

					if (block) {
						const event = parseEventBlock(block);
						if (event) {
							yield event;
						}
					}

					separatorIndex = buffer.indexOf('\n\n');
				}
				continue;
			}

			let newlineIndex = buffer.indexOf('\n');
			while (newlineIndex !== -1) {
				const line = buffer.slice(0, newlineIndex).trim();
				buffer = buffer.slice(newlineIndex + 1);

				if (line) {
					const event = parseJsonBlock(line);
					if (event) {
						yield event;
					} else {
						buffer = `${line}\n${buffer}`;
						break;
					}
				}

				newlineIndex = buffer.indexOf('\n');
			}
		}

		buffer += decoder.decode();
		buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

		const finalBlock = buffer.trim();
		if (finalBlock) {
			const event = parseEventBlock(finalBlock);
			if (event) {
				yield event;
			}
		}
	} finally {
		reader.releaseLock();
	}
}

function getNestedObject(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function getFirstChoice(value: unknown): Record<string, unknown> | null {
	const payload = getNestedObject(value);
	if (!payload || !Array.isArray(payload.choices) || payload.choices.length === 0) {
		return null;
	}

	const [firstChoice] = payload.choices;
	return getNestedObject(firstChoice);
}

function getSender(value: unknown): string | null {
	const payload = getNestedObject(value);
	if (!payload) return null;

	const sender =
		typeof payload.sender === 'string'
			? payload.sender
			: typeof payload.sender_name === 'string'
				? payload.sender_name
				: null;
	if (sender) {
		return sender.toLowerCase();
	}

	if ('data' in payload) {
		return getSender(payload.data);
	}

	return null;
}

function getTextContent(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}

	const payload = getNestedObject(value);
	if (!payload) return '';

	const choice = getFirstChoice(payload);
	if (choice) {
		for (const key of ['delta', 'message']) {
			if (key in choice) {
				const nestedContent = getTextContent(choice[key]);
				if (nestedContent) {
					return nestedContent;
				}
			}
		}
	}

	for (const key of ['text', 'chunk', 'content']) {
		const candidate = payload[key];
		if (typeof candidate === 'string' && candidate.length > 0) {
			return candidate;
		}
	}

	if ('data' in payload) {
		return getTextContent(payload.data);
	}

	return '';
}

function getReasoningContent(value: unknown): string | null {
	const payload = getNestedObject(value);
	if (!payload) return null;

	const choice = getFirstChoice(payload);
	if (choice) {
		for (const key of ['delta', 'message']) {
			if (key in choice) {
				const nestedReasoning = getReasoningContent(choice[key]);
				if (nestedReasoning) {
					return nestedReasoning;
				}
			}
		}
	}

	if (typeof payload.reasoning === 'string' && payload.reasoning.trim()) {
		return payload.reasoning.trim();
	}

	if (typeof payload.reasoning_content === 'string' && payload.reasoning_content.trim()) {
		return payload.reasoning_content.trim();
	}

	if (typeof payload.thinking === 'string' && payload.thinking.trim()) {
		return payload.thinking.trim();
	}

	if ('data' in payload) {
		return getReasoningContent(payload.data);
	}

	return null;
}

function extractAssistantChunk(eventType: string, rawData: unknown): string {
	const data = parseMaybeJson(rawData);
	const sender = getSender(data);

	if (sender && ['user', 'human'].includes(sender)) {
		return '';
	}

	if (
		sender &&
		!['assistant', 'ai', 'machine', 'model'].includes(sender) &&
		eventType !== 'token'
	) {
		return '';
	}

	return getTextContent(data);
}

function toIncrementalChunk(
	eventType: string,
	chunk: string,
	lastSnapshot: string,
	emittedText: string
): {
	chunk: string;
	lastSnapshot: string;
	emittedText: string;
} {
	if (eventType === 'token') {
		return {
			chunk,
			lastSnapshot,
			emittedText: emittedText + chunk
		};
	}

	if (!chunk) {
		return {
			chunk: '',
			lastSnapshot,
			emittedText
		};
	}

	if (emittedText) {
		if (chunk === emittedText) {
			return {
				chunk: '',
				lastSnapshot: chunk,
				emittedText
			};
		}

		if (chunk.startsWith(emittedText)) {
			const delta = chunk.slice(emittedText.length);
			return {
				chunk: delta,
				lastSnapshot: chunk,
				emittedText: emittedText + delta
			};
		}

		if (emittedText.startsWith(chunk)) {
			return {
				chunk: '',
				lastSnapshot: chunk,
				emittedText
			};
		}
	}

	if (!lastSnapshot) {
		return {
			chunk,
			lastSnapshot: chunk,
			emittedText: emittedText + chunk
		};
	}

	if (chunk === lastSnapshot) {
		return {
			chunk: '',
			lastSnapshot,
			emittedText
		};
	}

	if (chunk.startsWith(lastSnapshot)) {
		const delta = chunk.slice(lastSnapshot.length);
		return {
			chunk: delta,
			lastSnapshot: chunk,
			emittedText: emittedText + delta
		};
	}

	if (lastSnapshot.startsWith(chunk)) {
		return {
			chunk: '',
			lastSnapshot,
			emittedText
		};
	}

	return {
		chunk,
		lastSnapshot: chunk,
		emittedText: emittedText + chunk
	};
}

function extractErrorMessage(rawData: unknown): string {
	const data = parseMaybeJson(rawData);

	if (typeof data === 'string') return data;

	const payload = getNestedObject(data);
	if (!payload) return 'Streaming failed';

	if (typeof payload.message === 'string') return payload.message;
	if (typeof payload.error === 'string') return payload.error;
	if ('data' in payload) return extractErrorMessage(payload.data);

	return 'Streaming failed';
}

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

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const requestStartTime = Date.now();
	const runtimeConfig = getConfig();

	let body: {
		message?: unknown;
		conversationId?: unknown;
		model?: unknown;
		skipPersistUserMessage?: unknown;
		attachmentIds?: unknown;
	};
	try {
		body = await event.request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const { message, conversationId, model, skipPersistUserMessage, attachmentIds } = body;
	const safeAttachmentIds = Array.isArray(attachmentIds)
		? attachmentIds.filter((id): id is string => typeof id === 'string')
		: [];

	if (typeof message !== 'string' || message.trim().length === 0) {
		return new Response(JSON.stringify({ error: 'Message must be a non-empty string' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const { maxMessageLength } = runtimeConfig;
	if (message.length > maxMessageLength) {
		return new Response(
			JSON.stringify({
				error: `Message exceeds maximum length of ${maxMessageLength} characters`
			}),
			{ status: 400, headers: { 'Content-Type': 'application/json' } }
		);
	}

	if (typeof conversationId !== 'string' || conversationId.trim().length === 0) {
		return new Response(JSON.stringify({ error: 'conversationId is required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Validate model parameter
	const modelId =
		model === 'model1' || model === 'model2'
			? normalizeModelSelection(model, runtimeConfig)
			: undefined;
	const modelDisplayName =
		modelId === 'model2' ? runtimeConfig.model2.displayName : runtimeConfig.model1.displayName;
	const attachmentTraceId =
		safeAttachmentIds.length > 0 ? createAttachmentTraceId('stream') : undefined;

	const conversation = await getConversation(user.id, conversationId);
	if (!conversation) {
		return new Response(JSON.stringify({ error: 'Conversation not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	if (safeAttachmentIds.length > 0) {
		try {
			await assertPromptReadyAttachments({
				userId: user.id,
				conversationId,
				attachmentIds: safeAttachmentIds,
				traceId: attachmentTraceId,
			});
		} catch (error) {
			if (isAttachmentReadinessError(error)) {
				return new Response(
					JSON.stringify({
						error: error.message,
						code: error.code,
						attachmentIds: error.attachmentIds,
					}),
					{
						status: error.status,
						headers: { 'Content-Type': 'application/json' },
					}
				);
			}
			throw error;
		}
	}

	const normalizedMessage = message.trim();
	const sourceLanguage = detectLanguage(normalizedMessage);
	const isTranslationEnabled = user.translationEnabled;
	const personaMemorySnapshotPromise = capturePersonaMemorySnapshot(user.id).catch(
		() => undefined
	);

	let upstreamMessage = normalizedMessage;
	try {
		if (sourceLanguage === 'hu' && isTranslationEnabled) {
			upstreamMessage = await translateHungarianToEnglish(normalizedMessage);
		}
	} catch (error) {
		console.error('Input translation error:', error);
		return new Response(JSON.stringify({ error: 'Failed to prepare the translated prompt.' }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const encoder = new TextEncoder();
	const downstreamAbortSignal = event.request.signal;
	let cancelStream = () => undefined;

	const stream = new ReadableStream({
			async start(controller) {
				const upstreamAbortController = new AbortController();
				const outputTranslator =
					sourceLanguage === 'hu' && isTranslationEnabled ? new StreamingHungarianTranslator() : null;
				let closed = false;
				let ended = false;
				let fullResponse = '';
				let lastAssistantSnapshot = '';
				let emittedAssistantText = '';

			const closeStream = () => {
				if (closed) return;
				closed = true;
				downstreamAbortSignal.removeEventListener('abort', closeStream);
				// Do NOT abort upstream on client disconnect — let generation complete and persist to DB.
				// The client reloads persisted messages on visibility restore (mobile background fix).
				try {
					controller.close();
				} catch {
					return;
				}
			};

			cancelStream = closeStream;

			if (downstreamAbortSignal.aborted) {
				closeStream();
				return;
			}

			downstreamAbortSignal.addEventListener('abort', closeStream, { once: true });

			const enqueueChunk = (chunk: string): boolean => {
				if (closed) return false;

				try {
					controller.enqueue(encoder.encode(chunk));
					return true;
				} catch {
					closed = true;
					// Do NOT abort upstream on client disconnect — let generation complete and persist to DB.
				// The client reloads persisted messages on visibility restore (mobile background fix).
					return false;
				}
			};

			let thinkingContent = '';
			let inlineThinkingBuffer = '';
			let insideInlineThinking = false;
			let preserveBuffer = '';
			let insidePreserve = false;
			// Full interleaved segments for DB persistence — mirrors exactly what the
			// client builds in thinkingSegments so the expanded view is identical on reload.
			type ServerSegment =
				| { type: 'text'; content: string }
				| {
						type: 'tool_call';
						name: string;
						input: Record<string, unknown>;
						status: 'running' | 'done';
						outputSummary?: string | null;
						sourceType?: 'web' | 'tool' | 'document' | 'memory' | null;
						candidates?: StreamToolCallCandidate[];
				  };
			const serverSegments: ServerSegment[] = [];

			// Batch thinking chunks before emitting to the client.
			// The model streams one word at a time, each wrapped in <thinking>…</thinking>,
			// producing hundreds of tiny SSE events. We accumulate until we have at least
			// 80 characters worth of thinking text, then flush — reducing client-side
			// store updates from ~200 to ~10 per response with no perceptible latency hit.
			let pendingThinkingBuffer = '';
			const THINKING_BATCH_MIN = 80;

			const flushPendingThinking = (): boolean => {
				if (!pendingThinkingBuffer) return true;
				const chunk = pendingThinkingBuffer;
				pendingThinkingBuffer = '';
				thinkingContent += chunk;
				// Mirror the client's onThinking logic: append to last text segment or start a new one
				const lastSeg = serverSegments[serverSegments.length - 1];
				if (lastSeg?.type === 'text') {
					lastSeg.content += chunk;
				} else {
					serverSegments.push({ type: 'text', content: chunk });
				}
				return enqueueChunk(`event: thinking\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
			};

			const emitThinking = (reasoning: string) => {
				if (!reasoning) return true;
				pendingThinkingBuffer += reasoning;
				if (pendingThinkingBuffer.length >= THINKING_BATCH_MIN) {
					return flushPendingThinking();
				}
				return true;
			};

			const emitVisibleToken = (chunk: string) => {
				if (!chunk) {
					return true;
				}

				fullResponse += chunk;
				return enqueueChunk(`event: token\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
			};

			const emitToolCallEvent = (
				name: string,
				input: Record<string, unknown>,
				status: 'running' | 'done',
				details?: StreamToolCallDetails
			) => {
				// Flush any buffered thinking text before the tool call marker so the
				// UI always shows accumulated thinking before the tool call entry.
				flushPendingThinking();
				enqueueChunk(
					`event: tool_call\ndata: ${JSON.stringify({
						name,
						input,
						status,
						outputSummary: details?.outputSummary,
						sourceType: details?.sourceType,
						candidates: details?.candidates,
					})}\n\n`
				);
				// Mirror client onToolCall: insert running entry or flip last matching entry to done
				if (status === 'running') {
					serverSegments.push({ type: 'tool_call', name, input, status: 'running' });
					toolCallRecords.push({ name, input, status: 'running' });
				} else {
					for (let i = serverSegments.length - 1; i >= 0; i--) {
						const s = serverSegments[i];
						if (s.type === 'tool_call' && s.name === name && s.status === 'running') {
							s.status = 'done';
							s.outputSummary = details?.outputSummary ?? null;
							s.sourceType = details?.sourceType ?? null;
							s.candidates = details?.candidates;
							break;
						}
					}
					for (let i = toolCallRecords.length - 1; i >= 0; i--) {
						const toolRecord = toolCallRecords[i];
						if (toolRecord.name === name && toolRecord.status === 'running') {
							toolCallRecords[i] = {
								...toolRecord,
								status: 'done',
								outputSummary: details?.outputSummary ?? null,
								sourceType: details?.sourceType ?? null,
								candidates: details?.candidates,
							};
							break;
						}
					}
				}
			};

			const emitInlineToken = (chunk: string) => {
				if (!chunk) {
					return true;
				}

				inlineThinkingBuffer += chunk;

				while (inlineThinkingBuffer) {
					if (insideInlineThinking) {
						// Check for both Nemotron and Hermes close tags
						const nemotronCloseIndex = inlineThinkingBuffer.indexOf(THINKING_CLOSE_TAG);
						const hermesCloseIndex = inlineThinkingBuffer.indexOf(HERMES_THINKING_CLOSE_TAG);
						
						let closeIndex = -1;
						let closeTagLength = 0;
						
						if (nemotronCloseIndex !== -1 && hermesCloseIndex !== -1) {
							// Both found, use the first one
							if (nemotronCloseIndex < hermesCloseIndex) {
								closeIndex = nemotronCloseIndex;
								closeTagLength = THINKING_CLOSE_TAG.length;
							} else {
								closeIndex = hermesCloseIndex;
								closeTagLength = HERMES_THINKING_CLOSE_TAG.length;
							}
						} else if (nemotronCloseIndex !== -1) {
							closeIndex = nemotronCloseIndex;
							closeTagLength = THINKING_CLOSE_TAG.length;
						} else if (hermesCloseIndex !== -1) {
							closeIndex = hermesCloseIndex;
							closeTagLength = HERMES_THINKING_CLOSE_TAG.length;
						}
						
						if (closeIndex !== -1) {
							const thinkingChunk = inlineThinkingBuffer.slice(0, closeIndex);
							if (thinkingChunk && !emitThinking(thinkingChunk)) {
								return false;
							}
							inlineThinkingBuffer = inlineThinkingBuffer.slice(
								closeIndex + closeTagLength
							);
							insideInlineThinking = false;
							continue;
						}

						// Check for partial close tags (both formats)
						const partialNemotronCloseLength = getPartialTagPrefixLength(
							inlineThinkingBuffer,
							THINKING_CLOSE_TAG
						);
						const partialHermesCloseLength = getPartialTagPrefixLength(
							inlineThinkingBuffer,
							HERMES_THINKING_CLOSE_TAG
						);
						const partialCloseLength = Math.max(partialNemotronCloseLength, partialHermesCloseLength);
						
						const flushLength = inlineThinkingBuffer.length - partialCloseLength;
						if (flushLength > 0) {
							const thinkingChunk = inlineThinkingBuffer.slice(0, flushLength);
							if (!emitThinking(thinkingChunk)) {
								return false;
							}
							inlineThinkingBuffer = inlineThinkingBuffer.slice(flushLength);
						}
						break;
					}

					// Check for both Nemotron and Hermes open tags
					const nemotronOpenIndex = inlineThinkingBuffer.indexOf(THINKING_OPEN_TAG);
					const hermesOpenIndex = inlineThinkingBuffer.indexOf(HERMES_THINKING_OPEN_TAG);
					
					let openIndex = -1;
					let openTagLength = 0;
					
					if (nemotronOpenIndex !== -1 && hermesOpenIndex !== -1) {
						// Both found, use the first one
						if (nemotronOpenIndex < hermesOpenIndex) {
							openIndex = nemotronOpenIndex;
							openTagLength = THINKING_OPEN_TAG.length;
						} else {
							openIndex = hermesOpenIndex;
							openTagLength = HERMES_THINKING_OPEN_TAG.length;
						}
					} else if (nemotronOpenIndex !== -1) {
						openIndex = nemotronOpenIndex;
						openTagLength = THINKING_OPEN_TAG.length;
					} else if (hermesOpenIndex !== -1) {
						openIndex = hermesOpenIndex;
						openTagLength = HERMES_THINKING_OPEN_TAG.length;
					}
					
					if (openIndex !== -1) {
						const visibleChunk = inlineThinkingBuffer.slice(0, openIndex);
						if (visibleChunk && !emitVisibleToken(visibleChunk)) {
							return false;
						}
						inlineThinkingBuffer = inlineThinkingBuffer.slice(
							openIndex + openTagLength
						);
						insideInlineThinking = true;
						continue;
					}

					// Check for partial open tags (both formats)
					const partialNemotronOpenLength = getPartialTagPrefixLength(
						inlineThinkingBuffer,
						THINKING_OPEN_TAG
					);
					const partialHermesOpenLength = getPartialTagPrefixLength(
						inlineThinkingBuffer,
						HERMES_THINKING_OPEN_TAG
					);
					const partialOpenLength = Math.max(partialNemotronOpenLength, partialHermesOpenLength);
					
					const flushLength = inlineThinkingBuffer.length - partialOpenLength;
					if (flushLength > 0) {
						const visibleChunk = inlineThinkingBuffer.slice(0, flushLength);
						if (!emitVisibleToken(visibleChunk)) {
							return false;
						}
						inlineThinkingBuffer = inlineThinkingBuffer.slice(flushLength);
					}
					break;
				}

				return true;
			};

			const flushInlineThinkingBuffer = () => {
				if (!inlineThinkingBuffer) {
					return true;
				}

				const remainder = inlineThinkingBuffer;
				inlineThinkingBuffer = '';

				if (insideInlineThinking) {
					insideInlineThinking = false;
					return emitThinking(remainder);
				}

				// A partial open tag buffered at flush time (e.g. "<thinking" with no ">" yet)
				// must be discarded rather than leaked as visible text. This can happen when the
				// stream ends or an agent-loop iteration resets mid-tag.
				const isPartialOpenTag =
					THINKING_OPEN_TAG.startsWith(remainder) ||
					HERMES_THINKING_OPEN_TAG.startsWith(remainder);
				if (isPartialOpenTag) return true;

				return emitVisibleToken(remainder);
			};

			const PRESERVE_OPEN_TAG = '<preserve>';
			const PRESERVE_CLOSE_TAG = '</preserve>';

			const emitChunkWithPreserveHandling = (chunk: string): boolean => {
				if (!chunk) {
					return true;
				}

				preserveBuffer += chunk;

				while (preserveBuffer) {
					if (insidePreserve) {
						const closeIndex = preserveBuffer.indexOf(PRESERVE_CLOSE_TAG);
						if (closeIndex !== -1) {
							const content = preserveBuffer.slice(0, closeIndex);
							// Check if content already starts with a code fence
							const trimmedContent = content.trimStart();
							const alreadyHasCodeFence = trimmedContent.startsWith('```');

							if (alreadyHasCodeFence) {
								// Content already has code fences, just strip preserve tags and emit as-is
								if (!emitInlineToken(content)) {
									return false;
								}
							} else {
								// Content doesn't have code fences, wrap it
								const wrappedContent = `\`\`\`\n${content}\n\`\`\``;
								if (!emitInlineToken(wrappedContent)) {
									return false;
								}
							}
							preserveBuffer = preserveBuffer.slice(closeIndex + PRESERVE_CLOSE_TAG.length);
							insidePreserve = false;
							continue;
						}

						const partialCloseLength = getPartialTagPrefixLength(preserveBuffer, PRESERVE_CLOSE_TAG);
						if (partialCloseLength > 0) {
							break;
						}
						// No close tag found yet, break to wait for more chunks
						break;
					}

					const openIndex = preserveBuffer.indexOf(PRESERVE_OPEN_TAG);
					if (openIndex !== -1) {
						const visibleChunk = preserveBuffer.slice(0, openIndex);
						if (visibleChunk && !emitInlineToken(visibleChunk)) {
							return false;
						}
						preserveBuffer = preserveBuffer.slice(openIndex + PRESERVE_OPEN_TAG.length);
						insidePreserve = true;
						continue;
					}

					const partialOpenLength = getPartialTagPrefixLength(preserveBuffer, PRESERVE_OPEN_TAG);
					const flushLength = preserveBuffer.length - partialOpenLength;
					if (flushLength > 0) {
						const visibleChunk = preserveBuffer.slice(0, flushLength);
						if (!emitInlineToken(visibleChunk)) {
							return false;
						}
						preserveBuffer = preserveBuffer.slice(flushLength);
					}
					break;
				}

				return true;
			};

			const flushPreserveBuffer = (): boolean => {
				if (!preserveBuffer) {
					return true;
				}

				const remainder = preserveBuffer;
				preserveBuffer = '';

				if (insidePreserve) {
					insidePreserve = false;
					// Check if content already starts with a code fence
					const trimmedRemainder = remainder.trimStart();
					const alreadyHasCodeFence = trimmedRemainder.startsWith('```');

					if (alreadyHasCodeFence) {
						// Content already has code fences, emit as-is
						return emitInlineToken(remainder);
					} else {
						// Content doesn't have code fences, wrap it
						const wrappedContent = `\`\`\`\n${remainder}\n\`\`\``;
						return emitInlineToken(wrappedContent);
					}
				}

				const isPartialOpenTag = PRESERVE_OPEN_TAG.startsWith(remainder);
				if (isPartialOpenTag) return true;

				return emitInlineToken(remainder);
			};

			const emitError = (code: StreamErrorCode) => enqueueChunk(streamErrorEvent(code));
			let latestContextStatus:
				| import('$lib/types').ConversationContextStatus
				| undefined;
			let latestActiveWorkingSet:
				| Array<{
						id: string;
						type: string;
						name: string;
						mimeType: string | null;
						sizeBytes: number | null;
						conversationId: string | null;
						summary: string | null;
						createdAt: number;
						updatedAt: number;
				  }>
				| undefined;
			let latestTaskState:
				| import('$lib/types').TaskState
				| null
				| undefined;
			let latestContextDebug:
				| import('$lib/types').ContextDebugState
				| null
				| undefined;
			let initialContextStatus:
				| import('$lib/types').ConversationContextStatus
				| undefined;
			let initialTaskState:
				| import('$lib/types').TaskState
				| null
				| undefined;
			let initialContextDebug:
				| import('$lib/types').ContextDebugState
				| null
				| undefined;
			const toolCallRecords: import('$lib/types').ToolCallEntry[] = [];

			const completeSuccess = (wasStopped = false) => {
				if (ended) return; // Do not check `closed` — client may have disconnected but we still persist to DB
				ended = true;
				const thinkingTokenCount = estimateTokenCount(thinkingContent);
				const responseTokenCount = estimateTokenCount(fullResponse);
				const totalTokenCount = thinkingTokenCount + responseTokenCount;
				console.log(
					'[STREAM] End - thinkingTokenCount:',
					thinkingTokenCount,
					'responseTokenCount:',
					responseTokenCount,
					'totalTokenCount:',
					totalTokenCount,
					'thinkingLength:',
					thinkingContent.length,
					'wasStopped:',
					wasStopped
				);
				const genTimeMs = Date.now() - requestStartTime;
				const modelId = typeof model === 'string' && (model === 'model1' || model === 'model2') ? model : 'model1';
				const persistUserMessage = skipPersistUserMessage !== true;

				const userMsgPromise = persistUserMessage
					? createMessage(conversationId, 'user', normalizedMessage).catch(() => undefined)
					: Promise.resolve(undefined);
				const assistantMsgPromise = fullResponse.trim()
					? createMessage(
							conversationId,
							'assistant',
							fullResponse,
							thinkingContent || undefined,
							serverSegments.length > 0 ? serverSegments : undefined,
							{ evidenceStatus: 'pending' }
						).catch(() => undefined)
					: Promise.resolve(undefined);

				const sendEndAndClose = async (userMsgId?: string, assistantMsgId?: string) => {
					enqueueChunk(
						`event: end\ndata: ${JSON.stringify({
							thinkingTokenCount,
							responseTokenCount,
							totalTokenCount,
							thinking: thinkingContent || undefined,
							wasStopped,
							userMessageId: userMsgId,
							assistantMessageId: assistantMsgId,
							modelDisplayName,
							contextStatus: latestContextStatus,
							activeWorkingSet: latestActiveWorkingSet,
							taskState: latestTaskState,
							contextDebug: latestContextDebug,
						})}\n\n`
					);
					touchConversation(user.id, conversationId).catch(() => undefined);
					closeStream();
				};

				Promise.all([userMsgPromise, assistantMsgPromise]).then(([userMsg, assistantMsg]) => {
					const postPersistTasks: Promise<unknown>[] = [];
					let uiStateTask: Promise<unknown> = Promise.resolve();
					if (persistUserMessage && userMsg && safeAttachmentIds.length > 0) {
						postPersistTasks.push(
							(async () => {
								await attachArtifactsToMessage({
									userId: user.id,
									conversationId,
									messageId: userMsg.id,
									artifactIds: safeAttachmentIds
								});
								latestActiveWorkingSet = await refreshConversationWorkingSet({
									userId: user.id,
									conversationId,
									message: normalizedMessage,
									attachmentIds: safeAttachmentIds
								});
							})()
						);
					}

					if (assistantMsg) {
						recordMessageAnalytics({
							messageId: assistantMsg.id,
							userId: user.id,
							model: modelId,
							completionTokens: responseTokenCount,
							reasoningTokens: thinkingTokenCount,
							generationTimeMs: genTimeMs,
						}).catch(() => undefined);

						uiStateTask = (async () => {
							const sourceArtifactIds = safeAttachmentIds.length > 0
								? safeAttachmentIds
								: await listConversationSourceArtifactIds(user.id, conversationId);
							const outputArtifact = await createGeneratedOutputArtifact({
								userId: user.id,
								conversationId,
								messageId: assistantMsg.id,
								content: fullResponse,
								sourceArtifactIds
							});
							const workCapsule = await upsertWorkCapsule({
								userId: user.id,
								conversationId
							});
							if (workCapsule?.workflowSummary) {
								await mirrorWorkCapsuleConclusion({
									userId: user.id,
									conversationId,
									content: `${workCapsule.taskSummary ?? workCapsule.artifact.name}\n${workCapsule.workflowSummary}`
								});
							}
							latestActiveWorkingSet = await refreshConversationWorkingSet({
								userId: user.id,
								conversationId,
								message: normalizedMessage,
								latestOutputArtifactId: outputArtifact?.id ?? null
							}).catch(async () => getConversationWorkingSet(user.id, conversationId));
							latestTaskState = await updateTaskStateCheckpoint({
								userId: user.id,
								conversationId,
								message: normalizedMessage,
								assistantResponse: fullResponse,
								attachmentIds: safeAttachmentIds,
								promptArtifactIds: latestContextStatus?.workingSetArtifactIds ?? [],
								userMessageId: userMsg?.id ?? null,
								assistantMessageId: assistantMsg.id,
							}).catch(async () => getConversationTaskState(user.id, conversationId));
							if (latestTaskState) {
								await syncTaskContinuityFromTaskState({
									userId: user.id,
									taskState: latestTaskState,
								}).catch((error) =>
									console.error('[CONTINUITY] Failed to sync focus continuity from stream:', error)
								);
							}
							latestTaskState = await attachContinuityToTaskState(
								user.id,
								latestTaskState ?? null
							).catch(() => latestTaskState ?? null);
							latestContextDebug = await getContextDebugState(user.id, conversationId).catch(() => null);
							await clearConversationDraft(user.id, conversationId).catch(() => undefined);
						})();
						postPersistTasks.push(uiStateTask);

						postPersistTasks.push(
							(async () => {
								try {
									const currentAttachments =
										safeAttachmentIds.length > 0
											? await getArtifactsForUser(user.id, safeAttachmentIds)
											: [];
									const messageEvidence = await buildAssistantEvidenceSummary({
										userId: user.id,
										message: normalizedMessage,
										taskState: latestTaskState ?? initialTaskState ?? null,
										contextStatus: latestContextStatus ?? initialContextStatus ?? null,
										contextDebug: latestContextDebug ?? initialContextDebug ?? null,
										toolCalls: toolCallRecords.filter((tool) => tool.status === 'done'),
										currentAttachments,
									});
									await updateMessageEvidence(assistantMsg.id, {
										evidenceSummary: messageEvidence,
										evidenceStatus: messageEvidence ? 'ready' : 'none',
									});
								} catch (error) {
									console.error('[STREAM] Failed to persist assistant evidence summary:', error);
									await updateMessageEvidence(assistantMsg.id, {
										evidenceStatus: 'failed',
									}).catch(() => undefined);
								}
							})()
						);
					}

					const honchoTasks: Promise<unknown>[] = [
						mirrorMessage(user.id, conversationId, 'user', upstreamMessage).catch((err) =>
							console.error('[HONCHO] Mirror user message failed:', err)
						),
					];
					if (fullResponse.trim()) {
						honchoTasks.push(
							mirrorMessage(user.id, conversationId, 'assistant', fullResponse).catch((err) =>
								console.error('[HONCHO] Mirror assistant message failed:', err)
							)
						);
					}

					void uiStateTask.finally(() => {
						void sendEndAndClose(userMsg?.id, assistantMsg?.id);
					});
					Promise.allSettled(postPersistTasks).finally(() => {
						void Promise.allSettled(honchoTasks)
							.then(async () =>
								syncConversationPersonaMemoryAttributions({
									userId: user.id,
									conversationId,
									beforeIds: await personaMemorySnapshotPromise,
									attempts: 3,
									delayMs: 300,
								})
							)
							.then(() => runUserMemoryMaintenance(user.id, 'chat_stream'))
							.catch((err) =>
								console.error('[STREAM] Post-stream memory maintenance failed:', err)
							);
					});
				}).catch(() => {
					void sendEndAndClose();
				});
			};

			const failStream = (code: StreamErrorCode) => {
				if (ended || closed) return;
				ended = true;
				emitError(code);
				closeStream();
			};

			const timeoutId = setTimeout(() => {
				failStream('timeout');
			}, STREAM_TIMEOUT_MS);

			try {
			console.log('[STREAM] Starting upstream request', {
				userId: user.id,
				conversationId,
				sourceLanguage,
				normalizedMessageLength: normalizedMessage.length,
				upstreamMessageLength: upstreamMessage.length,
				modelId
			});
			const langflowResponse = await sendMessageStream(upstreamMessage, conversationId, modelId, {
				signal: upstreamAbortController.signal,
				userId: user.id,
				attachmentIds: safeAttachmentIds,
				attachmentTraceId,
			});
				const langflowStream =
					langflowResponse instanceof ReadableStream
						? langflowResponse
						: langflowResponse.stream;
				latestContextStatus = langflowResponse instanceof ReadableStream
					? undefined
					: langflowResponse.contextStatus;
				initialContextStatus = latestContextStatus;
				latestTaskState =
					langflowResponse instanceof ReadableStream
						? await getConversationTaskState(user.id, conversationId).catch(() => null)
						: langflowResponse.taskState ?? await getConversationTaskState(user.id, conversationId).catch(() => null);
				latestTaskState = await attachContinuityToTaskState(user.id, latestTaskState ?? null).catch(
					() => latestTaskState ?? null
				);
				initialTaskState = latestTaskState;
				latestContextDebug =
					langflowResponse instanceof ReadableStream
						? await getContextDebugState(user.id, conversationId).catch(() => null)
						: langflowResponse.contextDebug ?? await getContextDebugState(user.id, conversationId).catch(() => null);
				initialContextDebug = latestContextDebug;
				console.log('[STREAM] Upstream stream connected', { conversationId });
				if (closed) return;
				let upstreamEventCount = 0;

				for await (const upstreamEvent of parseUpstreamEvents(langflowStream)) {
					if (closed) break;

					const { event: eventType, data } = upstreamEvent;
					upstreamEventCount += 1;
					if (upstreamEventCount <= 20 || eventType === 'error') {
						const dataPreview =
							typeof data === 'string'
								? data.slice(0, 500)
								: JSON.stringify(data).slice(0, 500);
						console.log('[STREAM] Upstream event', {
							index: upstreamEventCount,
							eventType,
							dataPreview
						});
					}
					if (data === '[DONE]' || eventType === 'end') {
						if (outputTranslator) {
							for (const chunk of await outputTranslator.flush()) {
								if (!emitInlineToken(chunk)) {
									return;
								}
							}
						}
						flushPendingThinking();
						if (!flushInlineThinkingBuffer()) {
							return;
						}
						if (!flushPreserveBuffer()) {
							return;
						}
						completeSuccess();
						return;
					}

					if (eventType === 'error') {
						console.error('[STREAM] Upstream error event payload', {
							conversationId,
							data:
								typeof data === 'string'
									? data
									: JSON.stringify(data).slice(0, 2000)
						});
						failStream(classifyStreamError(extractErrorMessage(data)));
						return;
					}

					const rawChunk = extractAssistantChunk(eventType, data);
					const reasoningChunk = getReasoningContent(data);
					if (reasoningChunk) {
						console.log('[STREAM] Thinking chunk extracted:', reasoningChunk.slice(0, 100));
						if (!emitThinking(`${reasoningChunk}\n`)) {
							return;
						}
					}
					if (!rawChunk) {
						continue;
					}

					const incremental = toIncrementalChunk(
						eventType,
						rawChunk,
						lastAssistantSnapshot,
						emittedAssistantText
					);
					lastAssistantSnapshot = incremental.lastSnapshot;
					emittedAssistantText = incremental.emittedText;
					const chunk = incremental.chunk;
					if (!chunk) continue;

					// Suppress duplicate visible text from Langflow's final summary event.
					// Nemotron streams tokens as "<thinking>...</thinking>visible" so
					// emittedAssistantText includes thinking tags, but the final non-token
					// 'message' event has only visible text (tags stripped by Langflow).
					// toIncrementalChunk can't match them, so we guard here using fullResponse
					// with trimmed comparison to handle trailing newline/space differences.
					if (eventType !== 'token' && fullResponse) {
						const trimmedFull = fullResponse.trim();
						const trimmedChunk = chunk.trim();
						if (trimmedChunk && (
							trimmedChunk === trimmedFull ||
							trimmedFull.endsWith(trimmedChunk) ||
							trimmedChunk.endsWith(trimmedFull)
						)) {
							console.log('[STREAM] Suppressing duplicate final chunk', { chunkLength: chunk.length });
							continue;
						}
					}

					// Strip tool call markers, emitting structured tool_call SSE events
					const cleanedChunk = processToolCallMarkers(chunk, emitToolCallEvent);

					console.log('[STREAM] Token chunk, length:', cleanedChunk.length);

					if (!cleanedChunk) continue;

					if (!outputTranslator) {
						if (!emitChunkWithPreserveHandling(cleanedChunk)) {
							return;
						}
						continue;
					}

					for (const translatedChunk of await outputTranslator.addChunk(cleanedChunk)) {
						if (!emitInlineToken(translatedChunk)) {
							return;
						}
					}
				}

				if (outputTranslator) {
					for (const chunk of await outputTranslator.flush()) {
						if (!emitInlineToken(chunk)) {
							return;
						}
					}
				}
				flushPendingThinking();
				if (!flushInlineThinkingBuffer()) {
					return;
				}
				if (!flushPreserveBuffer()) {
					return;
				}
				completeSuccess();
			} catch (error) {
				if (!closed) {
					if (isAbruptUpstreamTermination(error) && fullResponse.trim()) {
						completeSuccess();
						return;
					}
					console.error('[STREAM] Chat stream error', {
						conversationId,
						userId: user.id,
						message: error instanceof Error ? error.message : String(error),
						stack: error instanceof Error ? error.stack : undefined,
						cause:
							error instanceof Error && 'cause' in error
								? (error as Error & { cause?: unknown }).cause
								: undefined
					});
					if (attachmentTraceId) {
						logAttachmentTrace('stream_failure', {
							traceId: attachmentTraceId,
							conversationId,
							attachmentIds: safeAttachmentIds,
							errorMessage: error instanceof Error ? error.message : String(error),
						});
					}
					failStream(
						classifyStreamError(error instanceof Error ? error.message : String(error))
					);
				}
			} finally {
				clearTimeout(timeoutId);
				cancelStream = () => undefined;
			}
		},
		cancel() {
			cancelStream();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
