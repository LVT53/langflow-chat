import { json } from '@sveltejs/kit';
import { randomUUID } from 'crypto';
import type { RequestHandler } from './$types';
import { hasValidAlfyAiApiKey } from '$lib/server/auth/hooks';
import { getConversation, getConversationUserId } from '$lib/server/services/conversations';
import { executeCode } from '$lib/server/services/sandbox-execution';
import { storeGeneratedFile } from '$lib/server/services/chat-files';

interface GenerateRequest {
	conversationId: string;
	code: string;
	language: 'python' | 'javascript';
	filename?: string;
}

interface FileMetadata {
	id: string;
	filename: string;
	downloadUrl: string;
	size: number;
	mimeType: string;
}

function previewText(value: string | undefined, limit = 180): string | null {
	if (!value) return null;
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return null;
	return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function summarizeExecutionFiles(
	files: Array<{ filename: string; mimeType?: string; content: Buffer | Uint8Array }>
) {
	return files.map((file) => ({
		filename: file.filename,
		mimeType: file.mimeType ?? 'application/octet-stream',
		sizeBytes: Buffer.isBuffer(file.content) ? file.content.length : Buffer.byteLength(file.content),
	}));
}

function validateRequest(body: unknown): { ok: true; value: GenerateRequest } | { ok: false; error: string; status: number } {
	if (!body || typeof body !== 'object') {
		return { ok: false, error: 'Invalid request body', status: 400 };
	}

	const { conversationId, code, language, filename } = body as Record<string, unknown>;

	if (typeof conversationId !== 'string' || conversationId.trim().length === 0) {
		return { ok: false, error: 'conversationId is required', status: 400 };
	}

	if (typeof code !== 'string' || code.trim().length === 0) {
		return { ok: false, error: 'code is required', status: 400 };
	}

	if (typeof language !== 'string' || language.trim().length === 0) {
		return { ok: false, error: 'language is required', status: 400 };
	}

	if (language !== 'python' && language !== 'javascript') {
		return {
			ok: false,
			error: `Unsupported language: ${language}. Supported languages are 'python' and 'javascript'.`,
			status: 400,
		};
	}

	return {
		ok: true,
		value: {
			conversationId: conversationId.trim(),
			code: code.trim(),
			language: language.trim() as GenerateRequest['language'],
			filename: typeof filename === 'string' ? filename.trim() : undefined,
		},
	};
}

export const POST: RequestHandler = async (event) => {
	const requestId = randomUUID().slice(0, 8);
	const user = event.locals.user ?? null;
	const isServiceRequest =
		user === null && hasValidAlfyAiApiKey(event.request.headers.get('authorization'));

	if (!user && !isServiceRequest) {
		console.warn('[FILE_GENERATE] Unauthorized request', { requestId });
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		console.warn('[FILE_GENERATE] Invalid JSON body', { requestId });
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const validation = validateRequest(body);
	if (validation.ok === false) {
		console.warn('[FILE_GENERATE] Request validation failed', {
			requestId,
			error: validation.error,
			status: validation.status,
		});
		return json({ error: validation.error }, { status: validation.status });
	}

	const { conversationId, code, filename: customFilename, language } = validation.value;
	console.info('[FILE_GENERATE] Request received', {
		requestId,
		conversationId,
		authMode: user ? 'session' : 'service',
		userId: user?.id ?? null,
		language,
		customFilename: customFilename ?? null,
		codeLength: code.length,
		writesToOutput: code.includes('/output'),
		codePreview: previewText(code),
	});

	let ownerUserId: string;
	if (user) {
		// Session-authenticated browser requests stay user-scoped.
		const conversation = await getConversation(user.id, conversationId);
		if (!conversation) {
			console.warn('[FILE_GENERATE] Conversation not found for session request', {
				requestId,
				conversationId,
				userId: user.id,
			});
			return json({ error: 'Conversation not found' }, { status: 404 });
		}
		ownerUserId = user.id;
	} else {
		// Langflow tool calls authenticate with the shared bearer secret and resolve
		// the conversation owner from the stored conversation record.
		const conversationUserId = await getConversationUserId(conversationId);
		if (!conversationUserId) {
			console.warn('[FILE_GENERATE] Conversation not found for service request', {
				requestId,
				conversationId,
			});
			return json({ error: 'Conversation not found' }, { status: 404 });
		}
		ownerUserId = conversationUserId;
	}

	// Execute code in sandbox (language is already validated)
	let executionResult;
	try {
		executionResult = await executeCode(code, language);
	} catch (error) {
		console.error('[FILE_GENERATE] Sandbox execution threw', {
			requestId,
			conversationId,
			ownerUserId,
			error,
		});
		return json(
			{ error: 'Failed to execute code in sandbox' },
			{ status: 500 }
		);
	}

	console.info('[FILE_GENERATE] Sandbox execution completed', {
		requestId,
		conversationId,
		ownerUserId,
		fileCount: executionResult.files.length,
		files: summarizeExecutionFiles(executionResult.files),
		stdoutPreview: previewText(executionResult.stdout),
		stderrPreview: previewText(executionResult.stderr),
		error: executionResult.error ?? null,
	});

	// Check for execution errors
	if (executionResult.error) {
		console.warn('[FILE_GENERATE] Sandbox execution returned error', {
			requestId,
			conversationId,
			error: executionResult.error,
			stdoutPreview: previewText(executionResult.stdout),
			stderrPreview: previewText(executionResult.stderr),
		});
		return json(
			{ error: executionResult.error },
			{ status: 500 }
		);
	}

	if (executionResult.files.length === 0) {
		console.warn('[FILE_GENERATE] Sandbox finished without files', {
			requestId,
			conversationId,
			ownerUserId,
			writesToOutput: code.includes('/output'),
			stdoutPreview: previewText(executionResult.stdout),
			stderrPreview: previewText(executionResult.stderr),
		});
		return json(
			{
				error:
					'The sandbox finished without creating a file. Write the final output file to /output so it can be stored and shown in chat.',
			},
			{ status: 422 }
		);
	}

	// Store generated files
	const files: FileMetadata[] = [];
	for (const file of executionResult.files) {
		const storedFile = await storeGeneratedFile(conversationId, ownerUserId, {
			filename: customFilename || file.filename,
			mimeType: file.mimeType,
			content: file.content,
		});
		console.info('[FILE_GENERATE] Stored generated file', {
			requestId,
			conversationId,
			ownerUserId,
			fileId: storedFile.id,
			filename: storedFile.filename,
			sizeBytes: storedFile.sizeBytes,
			mimeType: storedFile.mimeType,
			storagePath: storedFile.storagePath,
		});

		files.push({
			id: storedFile.id,
			filename: storedFile.filename,
			downloadUrl: `/api/chat/files/${storedFile.id}/download`,
			size: storedFile.sizeBytes,
			mimeType: storedFile.mimeType || 'application/octet-stream',
		});
	}

	console.info('[FILE_GENERATE] Request succeeded', {
		requestId,
		conversationId,
		ownerUserId,
		fileCount: files.length,
		files,
	});

	return json({ files });
};
