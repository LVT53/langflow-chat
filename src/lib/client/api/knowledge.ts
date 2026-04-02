import type {
	ArtifactSummary,
	KnowledgeDocumentItem,
	KnowledgeMemoryOverviewPayload,
	KnowledgeMemoryPayload,
	KnowledgeUploadResponse,
	WorkCapsule,
} from '$lib/types';
import { requestJson } from './http';

export type KnowledgeLibrary = {
	documents: KnowledgeDocumentItem[];
	results: ArtifactSummary[];
	workflows: WorkCapsule[];
};

export type KnowledgeMemoryActionPayload =
	| { action: 'forget_persona_memory'; clusterId?: string; conclusionId?: string }
	| { action: 'forget_all_persona_memory' }
	| { action: 'forget_task_memory'; taskId: string }
	| { action: 'forget_focus_continuity'; continuityId: string }
	| { action: 'forget_project_memory'; projectId: string };

export type KnowledgeBulkAction =
	| 'forget_all_documents'
	| 'forget_all_results'
	| 'forget_all_workflows'
	| 'forget_everything';

type KnowledgeActionResult = {
	success?: boolean;
	deletedArtifactIds?: string[];
	message?: string;
	error?: string;
};

type KnowledgeDeleteResult = {
	success?: boolean;
	deletedArtifactIds?: string[];
	message?: string;
	error?: string;
};

export async function fetchKnowledgeLibrary(): Promise<KnowledgeLibrary> {
	const payload = await requestJson<Partial<KnowledgeLibrary>>(
		'/api/knowledge',
		undefined,
		'Failed to refresh the Knowledge Base.'
	);

	return {
		documents: Array.isArray(payload.documents) ? payload.documents : [],
		results: Array.isArray(payload.results) ? payload.results : [],
		workflows: Array.isArray(payload.workflows) ? payload.workflows : [],
	};
}

export async function fetchKnowledgeMemory(): Promise<KnowledgeMemoryPayload> {
	return requestJson<KnowledgeMemoryPayload>(
		'/api/knowledge/memory',
		undefined,
		'Failed to load memory profile.'
	);
}

export async function fetchKnowledgeMemoryOverview(
	options: { force?: boolean } = {}
): Promise<KnowledgeMemoryOverviewPayload> {
	const query = options.force ? '?force=1' : '';
	return requestJson<KnowledgeMemoryOverviewPayload>(
		`/api/knowledge/memory/overview${query}`,
		undefined,
		'Failed to refresh the live memory overview.'
	);
}

export async function submitKnowledgeMemoryAction(
	payload: KnowledgeMemoryActionPayload
): Promise<KnowledgeMemoryPayload> {
	return requestJson<KnowledgeMemoryPayload>(
		'/api/knowledge/memory/actions',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		},
		'Failed to update memory profile.'
	);
}

export async function submitKnowledgeBulkAction(
	action: KnowledgeBulkAction
): Promise<KnowledgeActionResult> {
	return requestJson<KnowledgeActionResult>(
		'/api/knowledge/actions',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ action }),
		},
		'Failed to update the Knowledge Base.'
	);
}

export async function deleteKnowledgeArtifact(id: string): Promise<KnowledgeDeleteResult> {
	return requestJson<KnowledgeDeleteResult>(
		`/api/knowledge/${id}`,
		{
			method: 'DELETE',
		},
		'Failed to remove artifact.'
	);
}

export async function uploadKnowledgeAttachment(
	file: File,
	conversationId: string,
	vaultId?: string | null
): Promise<KnowledgeUploadResponse> {
	const formData = new FormData();
	formData.append('file', file);
	formData.append('conversationId', conversationId);
	if (vaultId) {
		formData.append('vaultId', vaultId);
	}

	return requestJson<KnowledgeUploadResponse>(
		'/api/knowledge/upload',
		{
			method: 'POST',
			body: formData,
		},
		'Failed to upload attachment.'
	);
}

export interface Vault {
	id: string;
	userId: string;
	name: string;
	color: string | null;
	sortOrder: number;
	createdAt: number;
	updatedAt: number;
}

export interface StorageQuota {
	totalStorageUsed: number;
	totalFiles: number;
	storageLimit: number;
	usagePercent: number;
	isWarning: boolean;
	warningThreshold: number;
	vaults: Array<{
		vaultId: string;
		vaultName: string;
		fileCount: number;
		storageUsed: number;
	}>;
}

export async function fetchVaults(): Promise<Vault[]> {
	const payload = await requestJson<{ vaults: Vault[] }>(
		'/api/knowledge/vaults',
		undefined,
		'Failed to load vaults.'
	);
	return payload.vaults ?? [];
}

export async function createVault(name: string, color?: string): Promise<Vault> {
	return requestJson<Vault>(
		'/api/knowledge/vaults',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ name, color }),
		},
		'Failed to create vault.'
	);
}

export async function renameVault(id: string, name: string): Promise<Vault> {
	return requestJson<Vault>(
		`/api/knowledge/vaults/${id}`,
		{
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ name }),
		},
		'Failed to rename vault.'
	);
}

export async function deleteVault(id: string): Promise<void> {
	await requestJson<void>(
		`/api/knowledge/vaults/${id}`,
		{
			method: 'DELETE',
		},
		'Failed to delete vault.'
	);
}

export async function fetchStorageQuota(): Promise<StorageQuota> {
	return requestJson<StorageQuota>(
		'/api/knowledge/storage-quota',
		undefined,
		'Failed to load storage quota.'
	);
}
