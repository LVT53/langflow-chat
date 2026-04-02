import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { getChatFile, readChatFileContent } from '$lib/server/services/chat-files';
import { getVault } from '$lib/server/services/knowledge/store/vaults';
import { createArtifact, createArtifactLink, fileExtension, knowledgeUserDir } from '$lib/server/services/knowledge/store/core';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

interface SaveToVaultRequest {
	conversationId: string;
	vaultId: string;
}

interface SaveToVaultResponse {
	artifactId: string;
	vaultId: string;
	vaultName: string;
	filename: string;
}

function validateRequest(body: unknown): { ok: true; value: SaveToVaultRequest } | { ok: false; error: string; status: number } {
	if (!body || typeof body !== 'object') {
		return { ok: false, error: 'Invalid request body', status: 400 };
	}

	const { conversationId, vaultId } = body as Record<string, unknown>;

	if (typeof conversationId !== 'string' || conversationId.trim().length === 0) {
		return { ok: false, error: 'conversationId is required', status: 400 };
	}

	if (typeof vaultId !== 'string' || vaultId.trim().length === 0) {
		return { ok: false, error: 'vaultId is required', status: 400 };
	}

	return {
		ok: true,
		value: {
			conversationId: conversationId.trim(),
			vaultId: vaultId.trim(),
		},
	};
}

export const POST: RequestHandler = async (event) => {
	try {
		requireAuth(event);
	} catch {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const user = event.locals.user!;
	const fileId = event.params.id;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const validation = validateRequest(body);
	if (validation.ok === false) {
		return json({ error: validation.error }, { status: validation.status });
	}

	const { conversationId, vaultId } = validation.value;

	const chatFile = await getChatFile(conversationId, fileId);
	if (!chatFile) {
		return json({ error: 'File not found' }, { status: 404 });
	}

	if (chatFile.userId !== user.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const vault = await getVault(user.id, vaultId);
	if (!vault) {
		return json({ error: 'Vault not found' }, { status: 404 });
	}

	const fileContent = await readChatFileContent(conversationId, fileId);
	if (!fileContent) {
		return json({ error: 'Failed to read file content' }, { status: 500 });
	}

	const extension = fileExtension(chatFile.filename);
	const artifactId = randomUUID();
	const userDir = knowledgeUserDir(user.id);
	await mkdir(userDir, { recursive: true });

	const fileName = extension ? `${artifactId}.${extension}` : artifactId;
	const storagePath = join('data', 'knowledge', user.id, fileName);
	const absolutePath = join(process.cwd(), storagePath);
	await writeFile(absolutePath, fileContent);

	const artifact = await createArtifact({
		id: artifactId,
		userId: user.id,
		conversationId: conversationId,
		vaultId: vaultId,
		type: 'generated_output',
		name: chatFile.filename,
		mimeType: chatFile.mimeType,
		extension,
		sizeBytes: chatFile.sizeBytes,
		storagePath,
		summary: `Generated file saved from chat: ${chatFile.filename}`,
		metadata: {
			source: 'chat_generated_file',
			originalFileId: fileId,
			conversationId,
		},
	});

	await createArtifactLink({
		userId: user.id,
		artifactId: artifact.id,
		linkType: 'attached_to_conversation',
		conversationId: conversationId,
	});

	const response: SaveToVaultResponse = {
		artifactId: artifact.id,
		vaultId: vault.id,
		vaultName: vault.name,
		filename: chatFile.filename,
	};

	return json(response);
};
