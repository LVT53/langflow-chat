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

	return new Response(new Uint8Array(fileContent), {
		status: 200,
		headers: {
			'Content-Type': chatFile.mimeType || 'application/octet-stream',
			'Content-Length': fileContent.length.toString(),
			'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(chatFile.filename)}`,
			'Cache-Control': 'private, no-store',
		},
	});
};
