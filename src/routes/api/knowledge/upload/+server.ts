import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import {
	createNormalizedArtifact,
	saveUploadedArtifact,
} from '$lib/server/services/knowledge';
import { syncArtifactToHoncho } from '$lib/server/services/honcho';

const MAX_FILE_SIZE = 25 * 1024 * 1024;

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;

	let formData: FormData;
	try {
		formData = await event.request.formData();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const contentLength = event.request.headers.get('content-length');
		console.error('[KNOWLEDGE] Failed to parse multipart upload:', {
			userId: user.id,
			contentLength,
			message,
		});

		if (message.toLowerCase().includes('request body size exceeded')) {
			return json(
				{
					error: 'Upload exceeded the server request size limit. This deployment should allow files up to 25MB; if this persists, increase BODY_SIZE_LIMIT on the server.',
				},
				{ status: 413 }
			);
		}

		return json({ error: 'Invalid form data' }, { status: 400 });
	}

	const file = formData.get('file');
	const conversationId = formData.get('conversationId');
	if (!(file instanceof File)) {
		return json({ error: 'No file provided' }, { status: 400 });
	}
	if (typeof conversationId !== 'string' || !conversationId.trim()) {
		return json({ error: 'conversationId is required' }, { status: 400 });
	}
	if (file.size > MAX_FILE_SIZE) {
		return json({ error: 'File too large. Maximum size is 25MB.' }, { status: 400 });
	}

	const artifact = await saveUploadedArtifact({
		userId: user.id,
		conversationId,
		file,
	});

	let normalizedArtifact = null;
	let syncResult = await syncArtifactToHoncho({
		userId: user.id,
		conversationId,
		artifact,
		file,
	});

	if (!syncResult.uploaded) {
		normalizedArtifact = await createNormalizedArtifact({
			userId: user.id,
			conversationId,
			sourceArtifactId: artifact.id,
			sourceStoragePath: artifact.storagePath ?? '',
			sourceName: artifact.name,
			sourceMimeType: artifact.mimeType,
		});

		syncResult = await syncArtifactToHoncho({
			userId: user.id,
			conversationId,
			artifact,
			fallbackTextArtifact: normalizedArtifact,
		});
	}

	return json({
		artifact,
		normalizedArtifact,
		honcho: syncResult,
	});
};
