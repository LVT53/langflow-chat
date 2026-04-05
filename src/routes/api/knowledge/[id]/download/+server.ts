import { json } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { getArtifactForUser } from '$lib/server/services/knowledge';

export const GET: RequestHandler = async (event) => {
	try {
		requireAuth(event);
	} catch {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const user = event.locals.user!;
	const artifactId = event.params.id;

	const artifact = await getArtifactForUser(user.id, artifactId);
	if (!artifact) {
		return json({ error: 'Artifact not found' }, { status: 404 });
	}

	const safeName = artifact.name || 'document';
	const downloadName =
		safeName.includes('.') || !artifact.extension
			? safeName
			: `${safeName}.${artifact.extension}`;

	if (artifact.contentText) {
		const textBuffer = Buffer.from(artifact.contentText, 'utf-8');
		return new Response(textBuffer, {
			status: 200,
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Content-Length': textBuffer.length.toString(),
				'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
				'Cache-Control': 'private, no-store',
			},
		});
	}

	if (!artifact.storagePath) {
		return json({ error: 'File not available for download' }, { status: 404 });
	}

	try {
		const filePath = join(process.cwd(), artifact.storagePath);
		const fileBuffer = await readFile(filePath);

		return new Response(fileBuffer, {
			status: 200,
			headers: {
				'Content-Type': artifact.mimeType || 'application/octet-stream',
				'Content-Length': fileBuffer.length.toString(),
				'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
				'Cache-Control': 'private, no-store',
			},
		});
	} catch (error: any) {
		console.error('[DOWNLOAD] Failed to read file:', {
			userId: user.id,
			artifactId,
			storagePath: artifact.storagePath,
			error: error.message || error,
		});

		if (error.code === 'ENOENT') {
			return json({ error: 'File not found on disk' }, { status: 404 });
		}

		return json({ error: 'Failed to read file' }, { status: 500 });
	}
};
