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
import { getConfig } from '$lib/server/config-store';

const MULTIPART_OVERHEAD_ALLOWANCE_BYTES = 1024 * 1024;
const MAX_FILE_SIZE_MB = () => Math.round(getConfig().maxFileUploadSize / (1024 * 1024));

function parseContentLength(value: string | null): number | null {
	if (!value) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function uploadBodyLimitMessage() {
	return `Upload exceeded the server request body size limit of ${MAX_FILE_SIZE_MB()}MB. Try uploading a smaller file or increase BODY_SIZE_LIMIT for this deployment.`;
}

function uploadInterruptedMessage() {
	return 'Upload was interrupted before the server received the complete file. Try again; if it keeps happening, the server or reverse proxy may be closing large uploads before AlfyAI receives them.';
}

function errorStatus(error: unknown): number | null {
	if (typeof error !== 'object' || error === null || !('status' in error)) return null;
	const status = Number((error as { status?: unknown }).status);
	return Number.isInteger(status) ? status : null;
}

function errorName(error: unknown): string | null {
	if (typeof error !== 'object' || error === null || !('name' in error)) return null;
	const name = (error as { name?: unknown }).name;
	return typeof name === 'string' ? name : null;
}

function isBodySizeLimitError(error: unknown, message: string) {
	return (
		errorStatus(error) === 413 ||
		/body size exceeded|content-length of .* exceeds limit|payload too large/i.test(message)
	);
}

function isUploadAbortError(error: unknown, message: string) {
	return errorName(error) === 'AbortError' || /\baborted\b|operation was aborted|client prematurely closed/i.test(message);
}

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const traceId = createAttachmentTraceId('upload');
	const contentLength = parseContentLength(event.request.headers.get('content-length'));
	const maxBodySize = getConfig().maxFileUploadSize + MULTIPART_OVERHEAD_ALLOWANCE_BYTES;

	if (contentLength !== null && contentLength > maxBodySize) {
		console.warn('[KNOWLEDGE] Multipart upload exceeded app body allowance before parsing:', {
			userId: user.id,
			contentLength,
			maxBodySize,
		});
		return json(
			{
				error: uploadBodyLimitMessage(),
				code: 'upload_body_too_large',
				errorKey: 'knowledge.uploadBodyTooLarge',
			},
			{ status: 413 }
		);
	}

	let formData: FormData;
	try {
		formData = await event.request.formData();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('[KNOWLEDGE] Failed to parse multipart upload:', {
			userId: user.id,
			contentLength,
			name: errorName(error),
			status: errorStatus(error),
			message,
		});

		if (isBodySizeLimitError(error, message)) {
			return json(
				{
					error: uploadBodyLimitMessage(),
					code: 'upload_body_too_large',
					errorKey: 'knowledge.uploadBodyTooLarge',
				},
				{ status: 413 }
			);
		}

		if (isUploadAbortError(error, message)) {
			return json(
				{
					error: uploadInterruptedMessage(),
					code: 'upload_aborted',
					errorKey: 'knowledge.uploadAborted',
				},
				{ status: 400 }
			);
		}

		return json({ error: 'Invalid form data', code: 'invalid_form_data' }, { status: 400 });
	}

	const file = formData.get('file');
	const conversationIdValue = formData.get('conversationId');

	if (!(file instanceof File)) {
		return json({ error: 'No file provided' }, { status: 400 });
	}
	if (file.size > getConfig().maxFileUploadSize) {
		return json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE_MB()}MB.` }, { status: 400 });
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
