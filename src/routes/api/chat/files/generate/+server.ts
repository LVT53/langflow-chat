import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { getConversation } from '$lib/server/services/conversations';
import { executeCode } from '$lib/server/services/sandbox-execution';
import { storeGeneratedFile } from '$lib/server/services/chat-files';

interface GenerateRequest {
	conversationId: string;
	code: string;
	language: string;
	filename?: string;
}

interface FileMetadata {
	id: string;
	filename: string;
	downloadUrl: string;
	size: number;
	mimeType: string;
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

	if (language !== 'python') {
		return { ok: false, error: `Unsupported language: ${language}. Only 'python' is supported.`, status: 400 };
	}

	return {
		ok: true,
		value: {
			conversationId: conversationId.trim(),
			code: code.trim(),
			language: language.trim(),
			filename: typeof filename === 'string' ? filename.trim() : undefined,
		},
	};
}

export const POST: RequestHandler = async (event) => {
	try {
		requireAuth(event);
	} catch {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const user = event.locals.user!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const validation = validateRequest(body);
	if (validation.ok === false) {
		return json({ error: validation.error }, { status: validation.status });
	}

	const { conversationId, code, filename: customFilename } = validation.value;

	// Verify conversation exists and belongs to user
	const conversation = await getConversation(user.id, conversationId);
	if (!conversation) {
		return json({ error: 'Conversation not found' }, { status: 404 });
	}

	// Execute code in sandbox (language is already validated as 'python')
	let executionResult;
	try {
		executionResult = await executeCode(code, 'python');
	} catch (error) {
		console.error('[FILE_GENERATE] Sandbox execution error:', error);
		return json(
			{ error: 'Failed to execute code in sandbox' },
			{ status: 500 }
		);
	}

	// Check for execution errors
	if (executionResult.error) {
		return json(
			{ error: executionResult.error },
			{ status: 500 }
		);
	}

	// Store generated files
	const files: FileMetadata[] = [];
	for (const file of executionResult.files) {
		const storedFile = await storeGeneratedFile(conversationId, user.id, {
			filename: customFilename || file.filename,
			mimeType: file.mimeType,
			content: file.content,
		});

		files.push({
			id: storedFile.id,
			filename: storedFile.filename,
			downloadUrl: `/api/chat/files/${conversationId}/${storedFile.id}`,
			size: storedFile.sizeBytes,
			mimeType: storedFile.mimeType || 'application/octet-stream',
		});
	}

	return json({ files });
};