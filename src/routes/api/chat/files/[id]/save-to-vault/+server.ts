import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import {
	getChatFile,
	getSavedVaultForChatFile,
	readChatFileContent,
} from '$lib/server/services/chat-files';
import { getVault } from '$lib/server/services/knowledge/store/vaults';
import {
	createNormalizedArtifact,
	saveUploadedArtifact,
} from '$lib/server/services/knowledge';

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

	const existingSavedVault = await getSavedVaultForChatFile(user.id, fileId);
	if (existingSavedVault) {
		const response: SaveToVaultResponse = {
			artifactId: existingSavedVault.artifactId,
			vaultId: existingSavedVault.vaultId,
			vaultName: existingSavedVault.vaultName,
			filename: existingSavedVault.filename,
		};

		return json(response);
	}

	const fileContent = await readChatFileContent(conversationId, fileId);
	if (!fileContent) {
		return json({ error: 'Failed to read file content' }, { status: 500 });
	}

	const uploadResult = await saveUploadedArtifact({
		userId: user.id,
		conversationId,
		vaultId,
		file: new File([fileContent], chatFile.filename, {
			type: chatFile.mimeType ?? 'application/octet-stream',
		}),
		metadata: {
			uploadSource: 'chat_generated_file',
			originalChatFileId: fileId,
			originalConversationId: conversationId,
		},
	});

	const artifact = uploadResult.artifact;
	if (!uploadResult.normalizedArtifact && artifact.storagePath) {
		await createNormalizedArtifact({
			userId: user.id,
			conversationId,
			sourceArtifactId: artifact.id,
			sourceStoragePath: artifact.storagePath,
			sourceName: artifact.name,
			sourceMimeType: artifact.mimeType,
		});
	}

	const response: SaveToVaultResponse = {
		artifactId: artifact.id,
		vaultId: vault.id,
		vaultName: vault.name,
		filename: artifact.name,
	};

	return json(response);
};
