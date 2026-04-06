import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import {
	getChatFileByConversationOwner,
	getChatFileByUser,
	readChatFileContentByConversationOwner,
	readChatFileContentByUser,
} from '$lib/server/services/chat-files';
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

	const fileContent =
		(await readChatFileContentByUser(fileId, user.id)) ??
		(await readChatFileContentByConversationOwner(fileId, user.id));
	if (!fileContent) {
		return json({ error: 'Failed to read file content' }, { status: 500 });
	}

	return new Response(new Uint8Array(fileContent), {
		status: 200,
		headers: {
			'Content-Type': getPreviewContentType(chatFile.filename, chatFile.mimeType),
			'Content-Length': fileContent.length.toString(),
			'Content-Disposition': `inline; filename="${encodeURIComponent(chatFile.filename)}"`,
			'Cache-Control': 'private, max-age=3600',
		},
	});
};
