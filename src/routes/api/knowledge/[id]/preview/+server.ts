import { readFile } from 'fs/promises';
import { join } from 'path';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { getArtifactForUser } from '$lib/server/services/knowledge';

/**
 * GET /api/knowledge/[id]/preview
 * 
 * Returns the binary file content for preview purposes.
 * Authenticates the user and verifies artifact ownership.
 */
export const GET: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const artifactId = event.params.id;

	// Get artifact and verify ownership
	const artifact = await getArtifactForUser(user.id, artifactId);
	if (!artifact) {
		return new Response(JSON.stringify({ error: 'Artifact not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	// Check if artifact has a storage path
	if (!artifact.storagePath) {
		return new Response(
			JSON.stringify({ error: 'File not available for preview' }),
			{
				status: 404,
				headers: { 'Content-Type': 'application/json' },
			}
		);
	}

	try {
		// Read file from storage
		const filePath = join(process.cwd(), artifact.storagePath);
		const fileBuffer = await readFile(filePath);

		// Determine content type
		const contentType = artifact.mimeType || getContentTypeFromExtension(artifact.extension);

		// Return file with appropriate headers
		return new Response(fileBuffer, {
			status: 200,
			headers: {
				'Content-Type': contentType,
				'Content-Length': fileBuffer.length.toString(),
				'Content-Disposition': `inline; filename="${encodeURIComponent(artifact.name)}"`,
				'Cache-Control': 'private, max-age=3600',
			},
		});
	} catch (error) {
		console.error('[PREVIEW] Failed to read file:', {
			userId: user.id,
			artifactId,
			storagePath: artifact.storagePath,
			error,
		});

		return new Response(
			JSON.stringify({ error: 'Failed to read file' }),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			}
		);
	}
};

/**
 * Get content type from file extension
 */
function getContentTypeFromExtension(extension: string | null): string {
	if (!extension) return 'application/octet-stream';

	const ext = extension.toLowerCase();
	const mimeTypes: Record<string, string> = {
		// Documents
		pdf: 'application/pdf',
		docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		doc: 'application/msword',
		xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		xls: 'application/vnd.ms-excel',
		pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
		ppt: 'application/vnd.ms-powerpoint',
		// Images
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		gif: 'image/gif',
		webp: 'image/webp',
		svg: 'image/svg+xml',
		// Text
		txt: 'text/plain',
		md: 'text/markdown',
		html: 'text/html',
		css: 'text/css',
		js: 'application/javascript',
		json: 'application/json',
		// Archives
		zip: 'application/zip',
	};

	return mimeTypes[ext] || 'application/octet-stream';
}
