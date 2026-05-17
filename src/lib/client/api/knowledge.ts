import type {
	ArtifactSummary,
	KnowledgeDocumentItem,
	KnowledgeMemoryOverviewPayload,
	KnowledgeMemoryPayload,
	KnowledgeUploadResponse,
	WorkCapsule,
} from '$lib/types';
import { requestJson, requestVoid, type FetchLike } from './http';
import { _unwrapList } from './_utils';

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

const UPLOAD_INTERRUPTED_MESSAGE =
	'Upload was interrupted before it completed. Try again; if it keeps happening, the server or reverse proxy may be closing large uploads before AlfyAI receives them.';

function errorName(error: unknown): string {
	return typeof error === 'object' && error !== null && 'name' in error && typeof (error as { name?: unknown }).name === 'string'
		? (error as { name: string }).name
		: '';
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isUploadTransportAbort(error: unknown): boolean {
	const name = errorName(error);
	const message = errorMessage(error);
	return (
		name === 'AbortError' ||
		/\baborted\b|operation was aborted|failed to fetch|load failed|networkerror|network request failed|fetch failed/i.test(message)
	);
}

export async function fetchKnowledgeLibrary(): Promise<KnowledgeLibrary> {
	const payload = await requestJson<Partial<KnowledgeLibrary>>(
		'/api/knowledge',
		undefined,
		'Failed to refresh the Knowledge Base.'
	);

	return {
		documents: _unwrapList<KnowledgeDocumentItem>(payload, 'documents'),
		results: _unwrapList<ArtifactSummary>(payload, 'results'),
		workflows: _unwrapList<WorkCapsule>(payload, 'workflows'),
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
	conversationId?: string | null,
	fetchImpl: FetchLike = fetch
): Promise<KnowledgeUploadResponse> {
	const formData = new FormData();
	formData.append('file', file);
	if (conversationId) {
		formData.append('conversationId', conversationId);
	}

	try {
		return await requestJson<KnowledgeUploadResponse>(
			'/api/knowledge/upload',
			{
				method: 'POST',
				body: formData,
			},
			'Failed to upload attachment.',
			fetchImpl
		);
	} catch (error) {
		if (isUploadTransportAbort(error)) {
			throw new Error(UPLOAD_INTERRUPTED_MESSAGE);
		}
		throw error;
	}
}

export async function recordDocumentWorkspaceOpen(artifactId: string): Promise<void> {
	await requestVoid(
		'/api/knowledge/documents/behavior',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				action: 'workspace_opened',
				artifactId,
			}),
		},
		'Failed to record document workspace behavior.'
	);
}
