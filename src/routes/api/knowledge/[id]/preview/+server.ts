import { readFile } from 'fs/promises';
import { join } from 'path';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { getArtifactForUser } from '$lib/server/services/knowledge';
import { getPreviewContentType } from '$lib/utils/file-preview';

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
		const previewName =
			artifact.name.includes('.') || !artifact.extension
				? artifact.name
				: `${artifact.name}.${artifact.extension}`;
		const contentType = getPreviewContentType(previewName, artifact.mimeType);

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
