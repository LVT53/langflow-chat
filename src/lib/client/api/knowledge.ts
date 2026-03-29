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
	conversationId: string
): Promise<KnowledgeUploadResponse> {
	const formData = new FormData();
	formData.append('file', file);
	formData.append('conversationId', conversationId);

	return requestJson<KnowledgeUploadResponse>(
		'/api/knowledge/upload',
		{
			method: 'POST',
			body: formData,
		},
		'Failed to upload attachment.'
	);
}
