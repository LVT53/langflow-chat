import type {
	DocumentWorkspaceItem,
	FocusContinuityItem,
	KnowledgeDocumentItem,
	PersonaMemoryItem,
	TaskMemoryItem,
} from '$lib/types';
import type { KnowledgeBulkAction } from '$lib/client/api/knowledge';
import { formatMediumDateTime } from '$lib/utils/time';

export type MemoryModal = 'persona' | 'focus' | null;
export type LibraryModal = 'documents' | null;
export type PersonaMemoryFilter = 'active' | 'dormant' | 'archived';
export type FocusContinuityView = 'tasks' | 'across_chats';

export const personaMemoryFilters: PersonaMemoryFilter[] = ['active', 'dormant', 'archived'];

export function getDefaultPersonaMemoryFilter(memories: PersonaMemoryItem[]): PersonaMemoryFilter {
	if (memories.some((memory) => memory.state === 'active')) return 'active';
	if (memories.some((memory) => memory.state === 'dormant')) return 'dormant';
	if (memories.some((memory) => memory.state === 'archived')) return 'archived';
	return 'active';
}

export function getPrimaryPersonaScope(memory: PersonaMemoryItem): 'self' | 'assistant_about_user' {
	return memory.members[0]?.scope ?? 'self';
}

export function formatPersonaActor(memory: PersonaMemoryItem, userDisplayName: string): string {
	return getPrimaryPersonaScope(memory) === 'assistant_about_user' ? 'AlfyAI' : userDisplayName;
}

export function formatPersonaOrigin(memory: PersonaMemoryItem): string {
	const scope = getPrimaryPersonaScope(memory);
	const sourceLabel = scope === 'assistant_about_user' ? 'Assistant inference' : 'Direct memory';
	return `${sourceLabel} · ${memory.sourceCount} source${memory.sourceCount === 1 ? '' : 's'}`;
}

export function formatPersonaSource(memory: PersonaMemoryItem): string {
	if (memory.conversationTitles.length > 0) {
		return memory.conversationTitles.join(', ');
	}
	if (memory.members.some((member) => Boolean(member.sessionId))) {
		return 'Conversation memory';
	}
	return 'General memory';
}

export function formatPersonaClass(memoryClass: PersonaMemoryItem['memoryClass']): string {
	if (memoryClass === 'short_term_constraint') return 'short-term constraint';
	if (memoryClass === 'active_project_context') return 'active project context';
	return memoryClass.replace(/_/g, ' ');
}

export function formatMemoryTimestamp(timestamp: number): string {
	return formatMediumDateTime(timestamp);
}

export function getPersonaRowKey(memory: PersonaMemoryItem, index: number): string {
	return `${memory.state}:${memory.id}:${index}`;
}

export function getLibraryBulkAction(): KnowledgeBulkAction {
	return 'forget_all_documents';
}

export function getLibraryBulkKey(): string {
	return 'forget-all-documents';
}

export function getLibraryBulkLabel(): string {
	return 'Forget all documents';
}

export function getLibraryBulkConfirmation(): string {
	return 'Forget all documents from the Knowledge Base? This removes uploaded files and their normalized text artifacts.';
}

export function getLibraryItemCount(params: {
	documents: KnowledgeDocumentItem[];
}): number {
	return params.documents.length;
}

export function getFocusContinuityItemCount(params: {
	taskMemories: TaskMemoryItem[];
	focusContinuities: FocusContinuityItem[];
}): number {
	return params.taskMemories.length + params.focusContinuities.length;
}

// Workspace document helpers

export function toWorkspaceDocument(document: KnowledgeDocumentItem): DocumentWorkspaceItem {
	const artifactId = document.promptArtifactId ?? document.displayArtifactId;
	return {
		id: `artifact:${artifactId}`,
		source: 'knowledge_artifact',
		filename: document.name,
		title: document.documentLabel ?? document.name,
		documentFamilyId: document.documentFamilyId ?? null,
		documentFamilyStatus: document.documentFamilyStatus ?? null,
		documentLabel: document.documentLabel ?? null,
		documentRole: document.documentRole ?? null,
		versionNumber: document.versionNumber ?? null,
		originConversationId: document.originConversationId ?? null,
		originAssistantMessageId: document.originAssistantMessageId ?? null,
		sourceChatFileId: document.sourceChatFileId ?? null,
		mimeType: document.mimeType,
		artifactId,
		conversationId: document.conversationId,
	};
}

export function getWorkspaceMetadataForArtifact(
	documents: KnowledgeDocumentItem[],
	artifactId: string
): Pick<
	DocumentWorkspaceItem,
	| 'documentFamilyId'
	| 'documentFamilyStatus'
	| 'documentLabel'
	| 'documentRole'
	| 'versionNumber'
	| 'title'
> | null {
	const matchingDocument =
		documents.find(
			(document) =>
				document.promptArtifactId === artifactId || document.displayArtifactId === artifactId
		) ?? null;
	if (!matchingDocument) {
		return null;
	}

	return {
		title: matchingDocument.documentLabel ?? matchingDocument.name,
		documentFamilyId: matchingDocument.documentFamilyId ?? null,
		documentFamilyStatus: matchingDocument.documentFamilyStatus ?? null,
		documentLabel: matchingDocument.documentLabel ?? null,
		documentRole: matchingDocument.documentRole ?? null,
		versionNumber: matchingDocument.versionNumber ?? null,
	};
}