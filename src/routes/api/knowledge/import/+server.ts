import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { getVault } from '$lib/server/services/knowledge/store/vaults';
import { importObsidianVault, importNotionExport } from '$lib/server/services/knowledge/import';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

type ImportType = 'obsidian' | 'notion';

interface ImportRequest {
	conversationId: string;
	vaultId: string;
	type: ImportType;
}

function validateImportType(value: unknown): value is ImportType {
	return value === 'obsidian' || value === 'notion';
}

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;

	let formData: FormData;
	try {
		formData = await event.request.formData();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('[KNOWLEDGE IMPORT] Failed to parse multipart upload:', {
			userId: user.id,
			message,
		});
		return json({ error: 'Invalid form data' }, { status: 400 });
	}

	const file = formData.get('file');
	const conversationId = formData.get('conversationId');
	const vaultId = formData.get('vaultId');
	const importType = formData.get('type');

	if (!(file instanceof File)) {
		return json({ error: 'No file provided' }, { status: 400 });
	}

	if (typeof conversationId !== 'string' || !conversationId.trim()) {
		return json({ error: 'conversationId is required' }, { status: 400 });
	}

	if (typeof vaultId !== 'string' || !vaultId.trim()) {
		return json({ error: 'vaultId is required' }, { status: 400 });
	}

	if (!validateImportType(importType)) {
		return json(
			{ error: 'Invalid import type. Must be "obsidian" or "notion"' },
			{ status: 400 }
		);
	}

	if (file.size > MAX_FILE_SIZE) {
		return json({ error: 'File too large. Maximum size is 100MB.' }, { status: 400 });
	}

	const vault = await getVault(user.id, vaultId);
	if (!vault) {
		return json({ error: 'Vault not found or access denied' }, { status: 400 });
	}

	const arrayBuffer = await file.arrayBuffer();
	const zipBuffer = Buffer.from(arrayBuffer);

	const result =
		importType === 'obsidian'
			? await importObsidianVault(user.id, conversationId, vaultId, zipBuffer)
			: await importNotionExport(user.id, conversationId, vaultId, zipBuffer);

	return json({
		imported: result.imported,
		failed: result.failed,
		errors: result.errors,
		artifacts: result.artifacts.map((a) => ({
			id: a.id,
			name: a.name,
			originalPath: a.metadata?.originalPath ?? null,
			sizeBytes: a.sizeBytes,
		})),
	});
};