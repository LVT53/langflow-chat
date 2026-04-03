import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { extname } from 'path';
import { requireAuth } from '$lib/server/auth/hooks';
import { getChatFileByUser, readChatFileContentByUser } from '$lib/server/services/chat-files';

function getContentType(filename: string, mimeType: string | null): string {
	if (mimeType) return mimeType;

	switch (extname(filename).toLowerCase()) {
		case '.pdf':
			return 'application/pdf';
		case '.doc':
			return 'application/msword';
		case '.docx':
			return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
		case '.xls':
			return 'application/vnd.ms-excel';
		case '.xlsx':
			return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
		case '.ppt':
			return 'application/vnd.ms-powerpoint';
		case '.pptx':
			return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
		case '.jpg':
		case '.jpeg':
			return 'image/jpeg';
		case '.png':
			return 'image/png';
		case '.gif':
			return 'image/gif';
		case '.webp':
			return 'image/webp';
		case '.svg':
			return 'image/svg+xml';
		case '.txt':
			return 'text/plain';
		case '.md':
			return 'text/markdown';
		case '.csv':
			return 'text/csv';
		case '.html':
			return 'text/html';
		case '.json':
			return 'application/json';
		case '.zip':
			return 'application/zip';
		default:
			return 'application/octet-stream';
	}
}

export const GET: RequestHandler = async (event) => {
	try {
		requireAuth(event);
	} catch {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const user = event.locals.user!;
	const fileId = event.params.id;
	const chatFile = await getChatFileByUser(fileId, user.id);
	if (!chatFile) {
		return json({ error: 'File not found' }, { status: 404 });
	}

	const fileContent = await readChatFileContentByUser(fileId, user.id);
	if (!fileContent) {
		return json({ error: 'Failed to read file content' }, { status: 500 });
	}

	return new Response(fileContent, {
		status: 200,
		headers: {
			'Content-Type': getContentType(chatFile.filename, chatFile.mimeType),
			'Content-Length': fileContent.length.toString(),
			'Content-Disposition': `inline; filename="${encodeURIComponent(chatFile.filename)}"`,
			'Cache-Control': 'private, max-age=3600',
		},
	});
};
