import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import {
	getChatFileByConversationOwner,
	getChatFileByUser,
	readChatFileContentByConversationOwner,
	readChatFileContentByUser,
} from '$lib/server/services/chat-files';
import { isGeneratedFileTypeAllowed } from '$lib/server/services/file-production/output-validation';
import { getPreviewContentType } from '$lib/utils/file-preview';

export const GET: RequestHandler = async (event) => {
	try {
		requireAuth(event);
	} catch {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const user = event.locals.user!;
	const fileId = event.params.id;
	const chatFile =
		(await getChatFileByUser(fileId, user.id)) ??
		(await getChatFileByConversationOwner(fileId, user.id));
	if (!chatFile) {
		return json({ error: 'File not found' }, { status: 404 });
	}

	if (!isGeneratedFileTypeAllowed(chatFile.filename, chatFile.mimeType)) {
		return json({ error: 'Unsupported generated file type' }, { status: 415 });
	}

	const fileContent =
		(await readChatFileContentByUser(fileId, user.id)) ??
		(await readChatFileContentByConversationOwner(fileId, user.id));
	if (!fileContent) {
		return json({ error: 'Failed to read file content' }, { status: 500 });
	}
	const previewContentType = getPreviewContentType(chatFile.filename, chatFile.mimeType);
	const isHtmlPreview = previewContentType === 'text/html';
	const headers: Record<string, string> = {
		'Content-Type': isHtmlPreview ? 'text/html; charset=utf-8' : previewContentType,
		'Content-Length': fileContent.length.toString(),
		'Content-Disposition': `inline; filename="${encodeURIComponent(chatFile.filename)}"`,
		'Cache-Control': 'private, max-age=3600',
	};
	if (isHtmlPreview) {
		headers['Content-Security-Policy'] =
			"default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
		headers['X-Content-Type-Options'] = 'nosniff';
		headers['Referrer-Policy'] = 'no-referrer';
	}

	return new Response(new Uint8Array(fileContent), {
		status: 200,
		headers,
	});
};
