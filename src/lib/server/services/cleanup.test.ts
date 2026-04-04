import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockState,
	mockDeletedConversations,
	mockDeleteAllChatFilesForConversation,
	mockDeleteConversationHonchoState,
	mockDeleteAllPersonaMemoryStateForUser,
	mockHardDeleteArtifactsForUser,
	mockListConversationOwnedArtifacts,
	mockArtifactHasReferencesOutsideConversation,
	mockGetSourceArtifactIdForNormalizedArtifact,
} = vi.hoisted(() => {
	return {
		mockState: {
			conversationRow: { id: 'conv-1' } as { id: string } | null,
		},
		mockDeletedConversations: [] as string[],
		mockDeleteAllChatFilesForConversation: vi.fn(() => Promise.resolve(0)),
		mockDeleteConversationHonchoState: vi.fn(() => Promise.resolve(undefined)),
		mockDeleteAllPersonaMemoryStateForUser: vi.fn(() => Promise.resolve(undefined)),
		mockHardDeleteArtifactsForUser: vi.fn(() => Promise.resolve(undefined)),
		mockListConversationOwnedArtifacts: vi.fn(() => Promise.resolve([])),
		mockArtifactHasReferencesOutsideConversation: vi.fn(() => Promise.resolve(false)),
		mockGetSourceArtifactIdForNormalizedArtifact: vi.fn(() => Promise.resolve(null)),
	};
});

vi.mock('$lib/server/db', () => ({
	db: {
		select: vi.fn(() => {
			let tableName = '';
			return {
				from: vi.fn((table: { __name?: string }) => {
					tableName = table.__name ?? '';
					return {
						where: vi.fn(() => {
							if (tableName === 'artifacts') {
								return Promise.resolve([]);
							}
							return {
								limit: vi.fn(async () =>
									mockState.conversationRow ? [mockState.conversationRow] : []
								),
							};
						}),
					};
				}),
			};
		}),
		delete: vi.fn(() => ({
			where: vi.fn((condition: { value?: string }[] | { value?: string }) => {
				const values = Array.isArray(condition) ? condition : [condition];
				const conversationId =
					values.find((entry) => entry?.value === 'conv-1')?.value ?? 'conv-1';
				mockDeletedConversations.push(conversationId);
				return Promise.resolve(undefined);
			}),
		})),
		transaction: vi.fn((callback: (tx: any) => void) => {
			const tx = {
				delete: vi.fn(() => ({
					where: vi.fn(() => undefined),
				})),
			};
			callback(tx);
			return Promise.resolve(undefined);
		}),
	},
}));

vi.mock('$lib/server/db/schema', () => ({
	conversations: {
		__name: 'conversations',
		id: { name: 'id' },
		userId: { name: 'userId' },
	},
	artifacts: {
		__name: 'artifacts',
		id: { name: 'id' },
		userId: { name: 'userId' },
	},
	conversationContextStatus: { userId: { name: 'userId' } },
	conversationTaskStates: { userId: { name: 'userId' } },
	conversationWorkingSetItems: { userId: { name: 'userId' } },
	memoryProjects: { userId: { name: 'userId' } },
	personaMemoryAttributions: { userId: { name: 'userId' } },
	users: {},
}));

vi.mock('drizzle-orm', () => ({
	and: vi.fn((...conditions: unknown[]) => conditions),
	eq: vi.fn((field: { name: string }, value: string) => ({ field: field.name, value })),
}));

vi.mock('./auth', () => ({
	verifyPassword: vi.fn(),
}));

vi.mock('./knowledge', () => ({
	artifactHasReferencesOutsideConversation: mockArtifactHasReferencesOutsideConversation,
	getSourceArtifactIdForNormalizedArtifact: mockGetSourceArtifactIdForNormalizedArtifact,
	hardDeleteArtifactsForUser: mockHardDeleteArtifactsForUser,
	listConversationOwnedArtifacts: mockListConversationOwnedArtifacts,
}));

vi.mock('./honcho', () => ({
	deleteAllHonchoStateForUser: vi.fn(),
	deleteConversationHonchoState: mockDeleteConversationHonchoState,
}));

vi.mock('./chat-files', () => ({
	deleteAllChatFilesForConversation: mockDeleteAllChatFilesForConversation,
}));

vi.mock('./messages', () => ({
	clearMessageEvidenceForUser: vi.fn(),
}));

vi.mock('./persona-memory', () => ({
	deleteAllPersonaMemoryStateForUser: mockDeleteAllPersonaMemoryStateForUser,
}));

describe('cleanup service', () => {
	beforeEach(() => {
		mockState.conversationRow = { id: 'conv-1' };
		mockDeletedConversations.length = 0;
		vi.clearAllMocks();
	});

	it('deletes generated chat files when deleting a conversation', async () => {
		const { deleteConversationWithCleanup } = await import('./cleanup');

		const result = await deleteConversationWithCleanup('user-1', 'conv-1');

		expect(result).toEqual({
			deletedArtifactIds: [],
			preservedArtifactIds: [],
		});
		expect(mockDeleteConversationHonchoState).toHaveBeenCalledWith('user-1', 'conv-1');
		expect(mockDeleteAllChatFilesForConversation).toHaveBeenCalledWith('conv-1');
		expect(mockDeletedConversations).toContain('conv-1');
	});

	it('does not try to clean up chat files when the conversation is missing', async () => {
		const { deleteConversationWithCleanup } = await import('./cleanup');
		mockState.conversationRow = null;

		const result = await deleteConversationWithCleanup('user-1', 'conv-1');

		expect(result).toBeNull();
		expect(mockDeleteAllChatFilesForConversation).not.toHaveBeenCalled();
		expect(mockDeleteConversationHonchoState).not.toHaveBeenCalled();
	});

	it('clears local persona memory state during a full knowledge reset', async () => {
		const { resetKnowledgeBaseState } = await import('./cleanup');

		await resetKnowledgeBaseState('user-1');

		expect(mockDeleteAllPersonaMemoryStateForUser).toHaveBeenCalledWith('user-1');
	});
});
