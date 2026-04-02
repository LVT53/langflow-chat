import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hasValidAlfyAiApiKey } from '$lib/server/auth/hooks';
import { getConversation, getConversationUserId } from '$lib/server/services/conversations';
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
	const user = event.locals.user ?? null;
	const isServiceRequest =
		user === null && hasValidAlfyAiApiKey(event.request.headers.get('authorization'));

	if (!user && !isServiceRequest) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

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

	let ownerUserId: string;
	if (user) {
		// Session-authenticated browser requests stay user-scoped.
		const conversation = await getConversation(user.id, conversationId);
		if (!conversation) {
			return json({ error: 'Conversation not found' }, { status: 404 });
		}
		ownerUserId = user.id;
	} else {
		// Langflow tool calls authenticate with the shared bearer secret and resolve
		// the conversation owner from the stored conversation record.
		const conversationUserId = await getConversationUserId(conversationId);
		if (!conversationUserId) {
			return json({ error: 'Conversation not found' }, { status: 404 });
		}
		ownerUserId = conversationUserId;
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

	if (executionResult.files.length === 0) {
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

		files.push({
			id: storedFile.id,
			filename: storedFile.filename,
			downloadUrl: `/api/chat/files/${storedFile.id}/download`,
			size: storedFile.sizeBytes,
			mimeType: storedFile.mimeType || 'application/octet-stream',
		});
	}

	return json({ files });
};
