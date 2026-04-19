import type {
	FocusContinuityItem,
	KnowledgeDocumentItem,
	PersonaMemoryItem,
	TaskMemoryItem,
} from '$lib/types';
import type { KnowledgeBulkAction } from '$lib/client/api/knowledge';
import { formatRoundedKilobytes } from '$lib/utils/format';
import { formatMediumDateTime } from '$lib/utils/time';

export type KnowledgeTab = 'library' | 'memory';
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

export function formatArtifactSize(sizeBytes: number | null | undefined): string {
	return formatRoundedKilobytes(sizeBytes);
}

export function formatDocumentKind(document: KnowledgeDocumentItem): string {
	if (document.documentOrigin === 'generated') return 'Generated document';
	return document.normalizedAvailable ? 'Indexed document' : 'Source-only document';
}

export function formatDocumentLifecycleStatus(document: KnowledgeDocumentItem): string | null {
	return document.documentFamilyStatus === 'historical' ? 'Historical' : null;
}

export function getLibraryBulkAction(_kind: Exclude<LibraryModal, null>): KnowledgeBulkAction {
	return 'forget_all_documents';
}

export function getLibraryBulkKey(_kind: Exclude<LibraryModal, null>): string {
	return 'forget-all-documents';
}

export function getLibraryBulkLabel(_kind: Exclude<LibraryModal, null>): string {
	return 'Forget all documents';
}

export function getLibraryBulkConfirmation(_kind: Exclude<LibraryModal, null>): string {
	return 'Forget all documents from the Knowledge Base? This removes uploaded files and their normalized text artifacts.';
}

export function getLibraryItemCount(
	_kind: Exclude<LibraryModal, null>,
	params: {
		documents: KnowledgeDocumentItem[];
	}
): number {
	return params.documents.length;
}

export function getFocusContinuityItemCount(params: {
	taskMemories: TaskMemoryItem[];
	focusContinuities: FocusContinuityItem[];
}): number {
	return params.taskMemories.length + params.focusContinuities.length;
}
