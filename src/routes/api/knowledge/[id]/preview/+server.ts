import { readFile } from 'fs/promises';
import { join } from 'path';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { getArtifactForUser } from '$lib/server/services/knowledge';
import { getSourceArtifactIdForNormalizedArtifact } from '$lib/server/services/knowledge/store/core';
import { getPreviewContentType } from '$lib/utils/file-preview';
import { createJsonErrorResponse } from '$lib/server/api/responses';
import {
	getChatFileByUser,
	readChatFileContentByUser,
} from '$lib/server/services/chat-files';
/**
 * GET /api/knowledge/[id]/preview
 * 
 * Returns the file content for preview purposes.
 * Handles both storagePath-based files and contentText-based artifacts.
 * Authenticates the user and verifies artifact ownership.
 */
export const GET: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const artifactId = event.params.id;

	// Get artifact and verify ownership
	let artifact = await getArtifactForUser(user.id, artifactId);
	if (!artifact) {
		return createJsonErrorResponse('Artifact not found', 404);
	}

	// Resolve normalized_document to source_document for binary preview
	if (artifact.type === 'normalized_document' && artifact.contentText) {
		const sourceArtifactId = await getSourceArtifactIdForNormalizedArtifact(user.id, artifact.id);
		if (sourceArtifactId) {
			const sourceArtifact = await getArtifactForUser(user.id, sourceArtifactId);
			if (sourceArtifact && sourceArtifact.storagePath) {
				artifact = sourceArtifact;
			}
		}
	}

	// Resolve generated_output artifacts with linked chat files to the binary source
	if (artifact.type === 'generated_output' && !artifact.storagePath) {
		const sourceChatFileId =
			typeof artifact.metadata?.sourceChatFileId === 'string' && artifact.metadata.sourceChatFileId.trim()
				? artifact.metadata.sourceChatFileId.trim()
				: null;
		if (sourceChatFileId) {
			const chatFile = await getChatFileByUser(sourceChatFileId, user.id);
			if (chatFile) {
				const fileContent = await readChatFileContentByUser(sourceChatFileId, user.id);
				if (fileContent) {
					return new Response(new Uint8Array(fileContent), {
						status: 200,
						headers: {
							'Content-Type': getPreviewContentType(chatFile.filename, chatFile.mimeType),
							'Content-Length': fileContent.length.toString(),
							'Content-Disposition': `inline; filename="${encodeURIComponent(artifact.name || chatFile.filename)}"`,
							'Cache-Control': 'private, max-age=3600',
						},
					});
				}
			}
		}
	}


	// Determine content type
	const safeName = artifact.name || 'document';
	const previewName =
		safeName.includes('.') || !artifact.extension
			? safeName
			: `${safeName}.${artifact.extension}`;
	const contentType = getPreviewContentType(previewName, artifact.mimeType);

	// Handle contentText-based artifacts (normalized_document, generated_output)
	if (artifact.contentText) {
		const textBuffer = Buffer.from(artifact.contentText, 'utf-8');
		return new Response(textBuffer, {
			status: 200,
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Content-Length': textBuffer.length.toString(),
				'Content-Disposition': `inline; filename="${encodeURIComponent(safeName)}"`,
				'Cache-Control': 'private, max-age=3600',
			},
		});
	}

	// Handle storagePath-based artifacts (source_document)
	if (!artifact.storagePath) {
		return createJsonErrorResponse('File not available for preview', 404);
	}

	// Path traversal guard - prevent directory traversal attacks
	if (artifact.storagePath.includes('..') || artifact.storagePath.startsWith('/')) {
		console.error('[PREVIEW] Path traversal attempt blocked:', {
			userId: user.id,
			artifactId,
			storagePath: artifact.storagePath,
		});
		return new Response(
			JSON.stringify({ error: 'Invalid path' }),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			}
		);
	}

	try {
		// Read file from storage
		const filePath = join(process.cwd(), artifact.storagePath);
		const fileBuffer = await readFile(filePath);

		// Return file with appropriate headers
		return new Response(fileBuffer, {
			status: 200,
			headers: {
				'Content-Type': contentType,
				'Content-Length': fileBuffer.length.toString(),
				'Content-Disposition': `inline; filename="${encodeURIComponent(safeName)}"`,
				'Cache-Control': 'private, max-age=3600',
			},
		});
	} catch (error: any) {
		console.error('[PREVIEW] Failed to read file:', {
			userId: user.id,
			artifactId,
			storagePath: artifact.storagePath,
			error: error.message || error,
		});

		if (error.code === 'ENOENT') {
			return createJsonErrorResponse('File not found on disk', 404);
		}

		return createJsonErrorResponse('Failed to read file', 500);
	}
};
