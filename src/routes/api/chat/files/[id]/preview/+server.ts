import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { requireAuth } from '$lib/server/auth/hooks';
import { previewChatFileContentByUser } from '$lib/server/services/chat-files';

export const GET: RequestHandler = async (event) => {
	try {
		requireAuth(event);
	} catch {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const user = event.locals.user!;
	const fileId = event.params.id;

	const preview = await previewChatFileContentByUser(fileId, user.id);
	if (!preview) {
		return json({ error: 'File not found' }, { status: 404 });
	}

	return json({
		fileId: preview.file.id,
		filename: preview.file.filename,
		mimeType: preview.file.mimeType,
		contentText: preview.contentText,
	});
};
