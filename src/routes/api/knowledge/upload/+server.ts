import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import {
	createNormalizedArtifact,
	resolvePromptAttachmentArtifacts,
	saveUploadedArtifact,
} from '$lib/server/services/knowledge';
import { syncArtifactToHoncho } from '$lib/server/services/honcho';
import {
	createAttachmentTraceId,
	logAttachmentTrace,
} from '$lib/server/services/attachment-trace';
import { getConversation } from '$lib/server/services/conversations';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const traceId = createAttachmentTraceId('upload');

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
					error: 'Upload exceeded the server request size limit. This deployment should allow files up to 100MB; if this persists, increase BODY_SIZE_LIMIT on the server.',
				},
				{ status: 413 }
			);
		}

		return json({ error: 'Invalid form data' }, { status: 400 });
	}

	const file = formData.get('file');
	const conversationIdValue = formData.get('conversationId');

	if (!(file instanceof File)) {
		return json({ error: 'No file provided' }, { status: 400 });
	}
	if (file.size > MAX_FILE_SIZE) {
		return json({ error: 'File too large. Maximum size is 100MB.' }, { status: 400 });
	}

	let conversationId: string | null = null;
	if (typeof conversationIdValue === 'string' && conversationIdValue.trim()) {
		conversationId = conversationIdValue.trim();
	}

	if (conversationId) {
		const conversation = await getConversation(user.id, conversationId);
		if (!conversation) {
			return json({ error: 'Conversation not found or access denied' }, { status: 400 });
		}
	}

	const uploadResult = await saveUploadedArtifact({
		userId: user.id,
		conversationId,
		file,
	});
	const artifact = uploadResult.artifact;

	let normalizedArtifact = uploadResult.normalizedArtifact;
	if (!normalizedArtifact && artifact.storagePath) {
		normalizedArtifact = await createNormalizedArtifact({
			userId: user.id,
			conversationId,
			sourceArtifactId: artifact.id,
			sourceStoragePath: artifact.storagePath,
			sourceName: artifact.name,
			sourceMimeType: artifact.mimeType,
		});
	}

	let syncResult: Awaited<ReturnType<typeof syncArtifactToHoncho>> = {
		uploaded: false,
		mode: 'none',
	};
	syncResult = await syncArtifactToHoncho({
		userId: user.id,
		conversationId,
		artifact,
		file,
	});

	if (!syncResult.uploaded) {
		syncResult = await syncArtifactToHoncho({
			userId: user.id,
			conversationId,
			artifact,
			fallbackTextArtifact: normalizedArtifact,
		});
	}

	const resolvedAttachment = await resolvePromptAttachmentArtifacts(user.id, [artifact.id]);
	const resolvedItem = resolvedAttachment.items[0];
	const promptReady = resolvedItem?.promptReady ?? false;
	const readinessError = resolvedItem
		? resolvedItem.readinessError
		: 'This file could not be prepared for chat. Remove it or upload a supported text-readable document.';

	logAttachmentTrace('upload_result', {
		traceId,
		userId: user.id,
		conversationId,
		sourceArtifactId: artifact.id,
		normalizedArtifactId: normalizedArtifact?.id ?? null,
		promptReady,
		promptArtifactId: resolvedItem?.promptArtifact?.id ?? null,
		extractionTextLength: resolvedItem?.contentLength ?? 0,
		chunkCount: resolvedItem?.chunkCount ?? 0,
		contentHash: resolvedItem?.contentHash ?? null,
	});

	return json({
		artifact,
		normalizedArtifact,
		honcho: syncResult,
		promptReady,
		promptArtifactId: promptReady ? resolvedItem?.promptArtifact?.id ?? null : null,
		readinessError,
		renameInfo: uploadResult.renameInfo,
	});
};
