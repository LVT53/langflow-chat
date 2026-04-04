import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockState,
	mockDeletedConversations,
	mockDeleteAllChatFilesForConversation,
	mockDeleteAllChatFilesForUser,
	mockDeleteConversationHonchoState,
	mockDeleteAllHonchoStateForUser,
	mockRotateHonchoPeerIdentity,
	mockDeleteAllPersonaMemoryStateForUser,
	mockClearKnowledgeMemoryRuntimeStateForUser,
	mockHardDeleteArtifactsForUser,
	mockListConversationOwnedArtifacts,
	mockArtifactHasReferencesOutsideConversation,
	mockBuildArtifactVisibilityCondition,
	mockGetArtifactOwnershipScope,
	mockGetSourceArtifactIdForNormalizedArtifact,
} = vi.hoisted(() => {
	return {
		mockState: {
			conversationRow: { id: 'conv-1' } as { id: string } | null,
			artifactRows: [] as Array<{ id: string }>,
		},
		mockDeletedConversations: [] as string[],
		mockDeleteAllChatFilesForConversation: vi.fn(() => Promise.resolve(0)),
		mockDeleteAllChatFilesForUser: vi.fn(() => Promise.resolve(0)),
		mockDeleteConversationHonchoState: vi.fn(() => Promise.resolve(undefined)),
		mockDeleteAllHonchoStateForUser: vi.fn(() => Promise.resolve(undefined)),
		mockRotateHonchoPeerIdentity: vi.fn(() => Promise.resolve(1)),
		mockDeleteAllPersonaMemoryStateForUser: vi.fn(() => Promise.resolve(undefined)),
		mockClearKnowledgeMemoryRuntimeStateForUser: vi.fn(() => undefined),
		mockHardDeleteArtifactsForUser: vi.fn(() => Promise.resolve(undefined)),
		mockListConversationOwnedArtifacts: vi.fn(() => Promise.resolve([])),
		mockArtifactHasReferencesOutsideConversation: vi.fn(() => Promise.resolve(false)),
		mockBuildArtifactVisibilityCondition: vi.fn(() => ({ field: 'visibility', value: 'user-1' })),
		mockGetArtifactOwnershipScope: vi.fn(() =>
			Promise.resolve({ conversationIds: new Set<string>(), vaultIds: new Set<string>() })
		),
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
								return Promise.resolve(mockState.artifactRows);
							}
							if (tableName === 'users') {
								return Promise.resolve([{ id: 'user-1', passwordHash: 'hash' }]);
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
					where: vi.fn(() => ({
						run: vi.fn(() => undefined),
					})),
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
	conversationDrafts: { userId: { name: 'userId' } },
	conversationTaskStates: { userId: { name: 'userId' } },
	conversationWorkingSetItems: { userId: { name: 'userId' } },
	chatGeneratedFiles: { userId: { name: 'userId' } },
	knowledgeVaults: { userId: { name: 'userId' } },
	memoryEvents: { userId: { name: 'userId' } },
	memoryProjectTaskLinks: { userId: { name: 'userId' } },
	memoryProjects: { userId: { name: 'userId' } },
	messageAnalytics: { userId: { name: 'userId' } },
	personaMemoryAttributions: { userId: { name: 'userId' } },
	projects: { userId: { name: 'userId' } },
	semanticEmbeddings: { userId: { name: 'userId' } },
	sessions: { userId: { name: 'userId' } },
	taskCheckpoints: { userId: { name: 'userId' } },
	taskStateEvidenceLinks: { userId: { name: 'userId' } },
	users: { __name: 'users', id: { name: 'id' } },
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
	buildArtifactVisibilityCondition: mockBuildArtifactVisibilityCondition,
	getArtifactOwnershipScope: mockGetArtifactOwnershipScope,
	getSourceArtifactIdForNormalizedArtifact: mockGetSourceArtifactIdForNormalizedArtifact,
	hardDeleteArtifactsForUser: mockHardDeleteArtifactsForUser,
	listConversationOwnedArtifacts: mockListConversationOwnedArtifacts,
}));

vi.mock('./honcho', () => ({
	deleteAllHonchoStateForUser: mockDeleteAllHonchoStateForUser,
	deleteConversationHonchoState: mockDeleteConversationHonchoState,
	rotateHonchoPeerIdentity: mockRotateHonchoPeerIdentity,
}));

vi.mock('./chat-files', () => ({
	deleteAllChatFilesForConversation: mockDeleteAllChatFilesForConversation,
	deleteAllChatFilesForUser: mockDeleteAllChatFilesForUser,
}));

vi.mock('./messages', () => ({
	clearMessageEvidenceForUser: vi.fn(),
}));

vi.mock('./persona-memory', () => ({
	deleteAllPersonaMemoryStateForUser: mockDeleteAllPersonaMemoryStateForUser,
}));

vi.mock('./memory', () => ({
	clearKnowledgeMemoryRuntimeStateForUser: mockClearKnowledgeMemoryRuntimeStateForUser,
}));

describe('cleanup service', () => {
	beforeEach(() => {
		mockState.conversationRow = { id: 'conv-1' };
		mockState.artifactRows = [];
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

		expect(mockClearKnowledgeMemoryRuntimeStateForUser).toHaveBeenCalledWith('user-1');
		expect(mockDeleteAllPersonaMemoryStateForUser).toHaveBeenCalledWith('user-1');
		expect(mockRotateHonchoPeerIdentity).toHaveBeenCalledWith('user-1');
	});

	it('resets account state without deleting the account itself', async () => {
		const { resetUserAccountStateWithCleanup } = await import('./cleanup');
		const { verifyPassword } = await import('./auth');

		(verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);

		const result = await resetUserAccountStateWithCleanup('user-1', 'secret');

		expect(result).toEqual({ status: 'reset' });
		expect(mockClearKnowledgeMemoryRuntimeStateForUser).toHaveBeenCalledWith('user-1');
		expect(mockDeleteAllPersonaMemoryStateForUser).toHaveBeenCalledWith('user-1');
		expect(mockDeleteAllHonchoStateForUser).toHaveBeenCalledWith('user-1');
		expect(mockRotateHonchoPeerIdentity).toHaveBeenCalledWith('user-1');
		expect(mockDeleteAllChatFilesForUser).toHaveBeenCalledWith('user-1');
	});

	it('removes artifacts linked through owned conversations even when artifact userId drifted', async () => {
		const { resetUserAccountStateWithCleanup } = await import('./cleanup');
		const { verifyPassword } = await import('./auth');

		mockState.artifactRows = [{ id: 'artifact-user-owned' }, { id: 'artifact-conv-owned' }];
		mockGetArtifactOwnershipScope.mockResolvedValue({
			conversationIds: new Set(['conv-owned']),
			vaultIds: new Set<string>(),
		});
		(verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);

		await resetUserAccountStateWithCleanup('user-1', 'secret');

		expect(mockHardDeleteArtifactsForUser).toHaveBeenCalledWith('user-1', [
			'artifact-user-owned',
			'artifact-conv-owned',
		]);
	});

	it('fully deletes user-scoped files and memory before deleting the account', async () => {
		const { deleteUserAccountWithCleanup } = await import('./cleanup');
		const { verifyPassword } = await import('./auth');

		(verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);

		const result = await deleteUserAccountWithCleanup('user-1', 'secret');

		expect(result).toEqual({ status: 'deleted' });
		expect(mockDeleteAllPersonaMemoryStateForUser).toHaveBeenCalledWith('user-1');
		expect(mockDeleteAllHonchoStateForUser).toHaveBeenCalledWith('user-1');
		expect(mockDeleteAllChatFilesForUser).toHaveBeenCalledWith('user-1');
	});
});
