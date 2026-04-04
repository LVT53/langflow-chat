import type {
	ArtifactSummary,
	FocusContinuityItem,
	KnowledgeDocumentItem,
	PersonaMemoryItem,
	TaskMemoryItem,
	WorkCapsule,
} from '$lib/types';
import type { KnowledgeBulkAction } from '$lib/client/api/knowledge';

export type KnowledgeTab = 'library' | 'memory';
export type MemoryModal = 'persona' | 'focus' | null;
export type LibraryModal = 'documents' | 'results' | 'workflows' | null;
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
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(timestamp);
}

export function getPersonaRowKey(memory: PersonaMemoryItem, index: number): string {
	return `${memory.state}:${memory.id}:${index}`;
}

export function formatArtifactSize(sizeBytes: number | null | undefined): string {
	if (!sizeBytes) return 'Unknown size';
	return `${Math.ceil(sizeBytes / 1024)} KB`;
}

export function formatDocumentKind(document: KnowledgeDocumentItem): string {
	if (document.documentOrigin === 'generated') return 'Generated document';
	return document.normalizedAvailable ? 'Indexed document' : 'Source-only document';
}

export function formatDocumentLifecycleStatus(document: KnowledgeDocumentItem): string | null {
	return document.documentFamilyStatus === 'historical' ? 'Historical' : null;
}

export function getLibraryBulkAction(kind: Exclude<LibraryModal, null>): KnowledgeBulkAction {
	if (kind === 'documents') return 'forget_all_documents';
	if (kind === 'results') return 'forget_all_results';
	return 'forget_all_workflows';
}

export function getLibraryBulkKey(kind: Exclude<LibraryModal, null>): string {
	return `forget-all-${kind}`;
}

export function getLibraryBulkLabel(kind: Exclude<LibraryModal, null>): string {
	if (kind === 'documents') return 'Forget all documents';
	if (kind === 'results') return 'Forget all results';
	return 'Forget all workflows';
}

export function getLibraryBulkConfirmation(kind: Exclude<LibraryModal, null>): string {
	if (kind === 'documents') {
		return 'Forget all documents from the Knowledge Base? This removes uploaded files and their normalized text artifacts.';
	}
	if (kind === 'results') {
		return 'Forget all saved results from the Knowledge Base?';
	}
	return 'Forget all workflows from the Knowledge Base?';
}

export function getLibraryItemCount(
	kind: Exclude<LibraryModal, null>,
	params: {
		documents: KnowledgeDocumentItem[];
		results: ArtifactSummary[];
		workflows: WorkCapsule[];
	}
): number {
	if (kind === 'documents') return params.documents.length;
	if (kind === 'results') return params.results.length;
	return params.workflows.length;
}

export function getFocusContinuityItemCount(params: {
	taskMemories: TaskMemoryItem[];
	focusContinuities: FocusContinuityItem[];
}): number {
	return params.taskMemories.length + params.focusContinuities.length;
}
