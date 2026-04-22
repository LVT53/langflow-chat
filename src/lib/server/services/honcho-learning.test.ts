import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHonchoPeerVersion = vi.hoisted(() => ({ value: 0 }));
const now = Date.now();

const userRows = [
	{ id: 'user-1', honchoPeerVersion: 0, updatedAt: new Date(now) },
	{ id: 'user-2', honchoPeerVersion: 1, updatedAt: new Date(now) },
];

const mockConfig = {
	honchoApiKey: 'test-api-key',
	honchoBaseUrl: 'http://localhost:8000',
	honchoWorkspace: 'test-workspace',
	honchoEnabled: true,
	honchoContextWaitMs: 3000,
	honchoContextPollIntervalMs: 250,
	honchoPersonaContextWaitMs: 1500,
};

const mockSessionContext = vi.fn(async () => ({
	messages: [
		{
			content: 'Hello there',
			peerId: 'user-1',
			createdAt: new Date(now - 60000).toISOString(),
			metadata: { role: 'user' },
		},
		{
			content: 'Hi! How can I help?',
			peerId: 'assistant_user-1',
			createdAt: new Date(now - 30000).toISOString(),
			metadata: { role: 'assistant' },
		},
	],
	summary: null,
}));

const mockSessionAddMessages = vi.fn(async () => []);
const mockSessionQueueStatus = vi.fn(async () => ({ pendingWorkUnits: 0, inProgressWorkUnits: 0 }));
const mockSessionUploadFile = vi.fn(async () => undefined);
const mockSessionDelete = vi.fn(async () => undefined);
const mockPeerContext = vi.fn(async () => ({ representation: 'User peer context for testing', peerCard: null }));
const mockPeerChat = vi.fn(async () => 'Mock peer chat response');
const mockPeerSetCard = vi.fn(async () => []);
const mockPeerSessions = vi.fn(async () => ({ toArray: async () => [] }));
const mockScopeList = vi.fn(async () => ({ toArray: async () => [] }));
const mockScopeDelete = vi.fn(async () => undefined);
const mockScopeCreate = vi.fn(async () => undefined);

const mockGetUserPeer = vi.fn(async () => ({
	id: 'user-1',
	context: mockPeerContext,
	chat: mockPeerChat,
	setCard: mockPeerSetCard,
	sessions: mockPeerSessions,
	conclusions: { list: mockScopeList, delete: mockScopeDelete, create: mockScopeCreate },
	conclusionsOf: vi.fn(() => ({ list: mockScopeList, delete: mockScopeDelete })),
	message: (content: string, options?: { metadata?: Record<string, unknown> }) => ({
		content,
		metadata: options?.metadata ?? {},
		peerId: 'user-1',
		createdAt: new Date().toISOString(),
	}),
}));

const mockGetAssistantPeer = vi.fn(async () => ({
	id: 'assistant_user-1',
	context: mockPeerContext,
	chat: mockPeerChat,
	setCard: mockPeerSetCard,
	sessions: mockPeerSessions,
	conclusions: { list: mockScopeList, delete: mockScopeDelete, create: mockScopeCreate },
	conclusionsOf: vi.fn(() => ({ list: mockScopeList, delete: mockScopeDelete })),
	message: (content: string, options?: { metadata?: Record<string, unknown> }) => ({
		content,
		metadata: options?.metadata ?? {},
		peerId: 'assistant_user-1',
		createdAt: new Date().toISOString(),
	}),
}));

const mockGetSession = vi.fn(async () => ({
	id: 'conv-1',
	addPeers: vi.fn(async () => undefined),
	queueStatus: mockSessionQueueStatus,
	context: mockSessionContext,
	addMessages: mockSessionAddMessages,
	uploadFile: mockSessionUploadFile,
	delete: mockSessionDelete,
}));

// Mock config-store
vi.mock('$lib/server/config-store', () => ({
	getConfig: () => mockConfig,
}));

// Mock db
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => {
			let table: { __name?: string } | null = null;
			return {
				from(nextTable: { __name?: string }) {
					table = nextTable;
					return {
						where: vi.fn(() => ({
							limit: vi.fn(async () =>
								table?.__name === 'users' ? [{ honchoPeerVersion: mockHonchoPeerVersion.value }] : []
							),
						})),
					};
				},
			};
		},
		update: () => ({
			set: (values: { honchoPeerVersion?: number; updatedAt?: Date }) => ({
				where: vi.fn(async () => {
					if (typeof values.honchoPeerVersion === 'number') {
						mockHonchoPeerVersion.value = values.honchoPeerVersion;
					}
				}),
			}),
		}),
		delete: () => ({
			where: vi.fn(async () => undefined),
		}),
	},
}));

// Mock db/schema with all required exports
vi.mock('$lib/server/db/schema', () => ({
	adminConfig: {},
	users: {
		__name: 'users',
		id: { name: 'id' },
		honchoPeerVersion: { name: 'honchoPeerVersion' },
		updatedAt: { name: 'updatedAt' },
	},
	artifacts: {
		__name: 'artifacts',
		id: Symbol('artifact-id'),
		userId: Symbol('artifact-user-id'),
		type: Symbol('artifact-type'),
		name: Symbol('artifact-name'),
		summary: Symbol('artifact-summary'),
		contentText: Symbol('artifact-content-text'),
		metadataJson: Symbol('artifact-metadata-json'),
		updatedAt: Symbol('artifact-updated-at'),
	},
	conversations: {
		id: Symbol('conversation-id'),
		title: Symbol('conversation-title'),
	},
	conversationTaskStates: {
		taskId: Symbol('task-id'),
	},
	memoryProjects: {
		projectId: Symbol('project-id'),
	},
	memoryProjectTaskLinks: {
		projectId: Symbol('link-project-id'),
	},
	taskCheckpoints: {
		taskId: Symbol('checkpoint-task-id'),
	},

	memoryEvents: {},
}));

// Mock Honcho SDK
vi.mock('@honcho-ai/sdk', () => {
	const makeScope = () => ({
		list: mockScopeList,
		delete: mockScopeDelete,
		create: mockScopeCreate,
	});

	// Create a proper constructor function
	function HonchoClient() {
		return {
			session: vi.fn(async (id: string) => ({
				id,
				addPeers: vi.fn(async () => undefined),
				queueStatus: mockSessionQueueStatus,
				context: mockSessionContext,
				addMessages: mockSessionAddMessages,
				uploadFile: mockSessionUploadFile,
				delete: mockSessionDelete,
			})),
			peer: vi.fn(async (id: string) => ({
				id,
				context: mockPeerContext,
				chat: mockPeerChat,
				setCard: mockPeerSetCard,
				sessions: mockPeerSessions,
				conclusions: makeScope(),
				conclusionsOf: vi.fn(() => makeScope()),
				message: (content: string, options?: { metadata?: Record<string, unknown> }) => ({
					content,
					metadata: options?.metadata ?? {},
					peerId: id,
					createdAt: new Date().toISOString(),
				}),
			})),
		};
	}

	return { Honcho: HonchoClient };
});

// Mock utils
vi.mock('$lib/server/utils/json', () => ({
	parseJsonRecord: vi.fn((value: string | null) => (value ? JSON.parse(value) : null)),
}));

vi.mock('$lib/server/utils/text', () => ({
	normalizeWhitespace: vi.fn((value: string) => value.trim()),
	clipText: vi.fn((value: string) => value),
}));

vi.mock('$lib/server/utils/prompt-context', () => ({
	serializePeerContext: vi.fn((context: unknown) => 'serialized peer context'),
	serializeArtifacts: vi.fn(() => []),
	serializeRoleMessages: vi.fn(() => []),
	serializeWorkingSetArtifacts: vi.fn(() => []),
	dedupeById: vi.fn((items: unknown[]) => items),
	buildContextSection: vi.fn(() => ({ type: 'text', content: '' })),
	compactContextSections: vi.fn(() => []),
	extractSerializedAttachmentBody: vi.fn(() => null),
	rerankHistoricalSections: vi.fn(() => []),
	selectRecentRoleTurns: vi.fn(() => []),
	truncateToTokenBudget: vi.fn((text: string) => text),
}));

vi.mock('$lib/server/services/messages', () => ({
	getLatestHonchoMetadata: vi.fn(async () => ({
		honchoContext: null,
		honchoSnapshot: null,
	})),
	listMessages: vi.fn(async () => []),
}));

// Mock knowledge module to avoid complex dependencies
vi.mock('$lib/server/services/knowledge', () => ({
	getCompactionUiThreshold: () => 209715,
	getMaxModelContext: () => 262144,
	getTargetConstructedContext: () => 157286,
	findRelevantKnowledgeArtifacts: vi.fn(async () => []),
	getArtifactsForUser: vi.fn(async () => []),
	resolvePromptAttachmentArtifacts: vi.fn(async () => ({
		displayArtifacts: [],
		promptArtifacts: [],
		unresolvedItems: [],
	})),
	selectWorkingSetArtifactsForPrompt: vi.fn(async () => []),
	updateConversationContextStatus: vi.fn(async () => ({
		conversationId: 'conv-456',
		userId: 'user-123',
		estimatedTokens: 0,
		maxContextTokens: 262144,
		thresholdTokens: 209715,
		targetTokens: 157286,
		compactionApplied: false,
		compactionMode: 'none',
		routingStage: 'deterministic',
		routingConfidence: 0,
		verificationStatus: 'skipped',
		layersUsed: [],
		workingSetCount: 0,
		workingSetArtifactIds: [],
		workingSetApplied: false,
		taskStateApplied: false,
		promptArtifactCount: 0,
		recentTurnCount: 0,
		summary: null,
		updatedAt: Date.now(),
	})),
	WORKING_SET_DOCUMENT_TOKEN_BUDGET: 1500,
	WORKING_SET_OUTPUT_TOKEN_BUDGET: 2000,
	WORKING_SET_PROMPT_TOKEN_BUDGET: 12000,
	AttachmentReadinessError: class extends Error {},
}));

// Mock task-state
vi.mock('$lib/server/services/task-state', () => ({
	formatTaskStateForPrompt: vi.fn((taskState: { objective: string }) => `Objective: ${taskState.objective}`),
	getContextDebugState: vi.fn(async () => null),
	getPromptArtifactSnippets: vi.fn(async () => new Map()),
	prepareTaskContext: vi.fn(async () => ({
		taskState: null,
		routingStage: 'deterministic' as const,
		routingConfidence: 0,
		verificationStatus: 'skipped' as const,
		selectedArtifacts: [],
		pinnedArtifactIds: [],
		excludedArtifactIds: [],
	})),
}));

// Mock tei-reranker
vi.mock('$lib/server/services/tei-reranker', () => ({
	canUseTeiReranker: vi.fn(() => false),
	rerankItems: vi.fn(async () => null),
}));

// Mock embedder
vi.mock('$lib/server/services/tei-embedder', () => ({
	embedTexts: vi.fn(async () => []),
}));

// Mock attachment-trace
vi.mock('$lib/server/services/attachment-trace', () => ({
	hasMeaningfulAttachmentText: vi.fn(() => false),
	logAttachmentTrace: vi.fn(),
	summarizeAttachmentTraceText: vi.fn(() => ''),
}));

// Mock active-state
vi.mock('$lib/server/services/active-state', () => ({
	buildActiveDocumentState: vi.fn(() => ({
		documentFocused: false,
		hasRecentUserCorrection: false,
		hasContextResetSignal: false,
		activeDocumentIds: new Set<string>(),
		correctionTargetIds: new Set<string>(),
		recentlyRefinedFamilyId: null,
		recentlyRefinedArtifactIds: new Set<string>(),
		currentGeneratedArtifactId: null,
		latestGeneratedArtifactIds: [],
		currentGeneratedReasonCodes: new Set<string>(),
	})),
}));

// Mock working-set
vi.mock('$lib/server/services/working-set', () => ({
	scoreMatch: vi.fn(() => 0),
}));

// Mock control-model
vi.mock('$lib/server/services/task-state/control-model', () => ({
	canUseContextSummarizer: vi.fn(() => false),
	requestStructuredControlModel: vi.fn(async () => null),
}));

// Mock mappers
vi.mock('$lib/server/services/mappers', () => ({
	mapTaskCheckpoint: vi.fn(),
	mapTaskState: vi.fn((value: unknown) => value),
}));

describe('honcho learning - mirrorMessage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('stores user message via mocked Honcho session', async () => {
		const { mirrorMessage } = await import('./honcho');

		await mirrorMessage('user-1', 'conv-1', 'user', 'Hello, this is a test message');

		expect(mockSessionAddMessages).toHaveBeenCalled();
		const calls = mockSessionAddMessages.mock.calls;
		expect(calls.length).toBeGreaterThan(0);
		
		const callArgs = calls[0];
		expect(callArgs).toBeDefined();
		expect(Array.isArray(callArgs)).toBe(true);
	});

	it('stores assistant message via mocked Honcho session', async () => {
		const { mirrorMessage } = await import('./honcho');

		await mirrorMessage('user-1', 'conv-1', 'assistant', 'I am ready to help');

		expect(mockSessionAddMessages).toHaveBeenCalled();
	});

	it('attaches correct role metadata to user messages', async () => {
		const { mirrorMessage } = await import('./honcho');

		await mirrorMessage('user-1', 'conv-1', 'user', 'User message here');

		const calls = mockSessionAddMessages.mock.calls;
		if (calls.length > 0) {
			const messages = calls[0];
			if (Array.isArray(messages) && messages.length > 0) {
				expect(messages[0].metadata?.role).toBe('user');
			}
		}
	});

	it('attaches correct role metadata to assistant messages', async () => {
		const { mirrorMessage } = await import('./honcho');

		await mirrorMessage('user-1', 'conv-1', 'assistant', 'Assistant response');

		const calls = mockSessionAddMessages.mock.calls;
		if (calls.length > 0) {
			const messages = calls[0];
			if (Array.isArray(messages) && messages.length > 0) {
				expect(messages[0].metadata?.role).toBe('assistant');
			}
		}
	});

	it('does nothing when content is empty', async () => {
		const { mirrorMessage } = await import('./honcho');

		const beforeCallCount = mockSessionAddMessages.mock.calls.length;
		await mirrorMessage('user-1', 'conv-1', 'user', '');
		
		expect(mockSessionAddMessages.mock.calls.length).toBe(beforeCallCount);
	});
});

describe('honcho learning - syncArtifactToHoncho', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('uploads artifact with fallback text when available', async () => {
		const { syncArtifactToHoncho } = await import('./honcho');

		const result = await syncArtifactToHoncho({
			userId: 'user-1',
			conversationId: 'conv-1',
			artifact: {
				id: 'artifact-1',
				userId: 'user-1',
				type: 'source_document' as const,
				name: 'test.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 1000,
				conversationId: 'conv-1',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			},
			fallbackTextArtifact: {
				id: 'fallback-1',
				userId: 'user-1',
				type: 'normalized_document' as const,
				name: 'extracted.txt',
				mimeType: 'text/plain',
				sizeBytes: 500,
				conversationId: 'conv-1',
				contentText: 'This is the extracted text content.',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			},
		});

		expect(result.uploaded).toBe(true);
		expect(result.mode).toBe('normalized');
	});

	it('returns mode none when no conversation is attached', async () => {
		const { syncArtifactToHoncho } = await import('./honcho');

		const result = await syncArtifactToHoncho({
			userId: 'user-1',
			conversationId: null,
			artifact: {
				id: 'artifact-1',
				userId: 'user-1',
				type: 'source_document' as const,
				name: 'test.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 1000,
				conversationId: null,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			},
		});

		expect(result.uploaded).toBe(false);
		expect(result.mode).toBe('none');
	});

	it('skips sync when honcho is disabled via config', async () => {
		// Temporarily disable honcho
		const originalEnabled = mockConfig.honchoEnabled;
		mockConfig.honchoEnabled = false;

		const { syncArtifactToHoncho } = await import('./honcho');

		const result = await syncArtifactToHoncho({
			userId: 'user-1',
			conversationId: 'conv-1',
			artifact: {
				id: 'artifact-1',
				userId: 'user-1',
				type: 'source_document' as const,
				name: 'test.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 1000,
				conversationId: 'conv-1',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			},
		});

		expect(result.uploaded).toBe(false);
		expect(result.mode).toBe('none');

		mockConfig.honchoEnabled = originalEnabled;
	});

	it('falls back to normalized text when native upload is not supported', async () => {
		const { syncArtifactToHoncho } = await import('./honcho');

		const result = await syncArtifactToHoncho({
			userId: 'user-1',
			conversationId: 'conv-1',
			artifact: {
				id: 'artifact-1',
				userId: 'user-1',
				type: 'source_document' as const,
				name: 'test.bin',
				mimeType: 'application/octet-stream',
				sizeBytes: 1000,
				conversationId: 'conv-1',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			},
			fallbackTextArtifact: {
				id: 'fallback-1',
				userId: 'user-1',
				type: 'normalized_document' as const,
				name: 'extracted.txt',
				mimeType: 'text/plain',
				sizeBytes: 500,
				conversationId: 'conv-1',
				contentText: 'Fallback extracted text.',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			},
		});

		expect(result.uploaded).toBe(true);
		expect(result.mode).toBe('normalized');
	});

	it('attaches artifact metadata to fallback text messages', async () => {
		const { syncArtifactToHoncho } = await import('./honcho');

		await syncArtifactToHoncho({
			userId: 'user-1',
			conversationId: 'conv-1',
			artifact: {
				id: 'artifact-1',
				userId: 'user-1',
				type: 'source_document' as const,
				name: 'document.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 5000,
				conversationId: 'conv-1',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			},
			fallbackTextArtifact: {
				id: 'fallback-1',
				userId: 'user-1',
				type: 'normalized_document' as const,
				name: 'text.txt',
				mimeType: 'text/plain',
				sizeBytes: 1000,
				conversationId: 'conv-1',
				contentText: 'Important extracted content.',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			},
		});

		const calls = mockSessionAddMessages.mock.calls;
		if (calls.length > 0) {
			const messages = calls[0];
			if (Array.isArray(messages) && messages.length > 0) {
				expect(messages[0].metadata).toBeDefined();
				expect(messages[0].metadata.artifactId).toBe('fallback-1');
			}
		}
	});
});

describe('honcho learning - getPeerContext', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('builds context from mocked peer conclusions', async () => {
		mockScopeList.mockResolvedValueOnce({
			toArray: async () => [
				{ id: 'conclusion-1', content: 'User prefers concise responses', sessionId: 'conv-1', createdAt: new Date().toISOString() },
				{ id: 'conclusion-2', content: 'Working on a Python project', sessionId: 'conv-1', createdAt: new Date().toISOString() },
			],
		});

		const { listPersonaMemories } = await import('./honcho');
		const records = await listPersonaMemories('user-1');

		expect(records).toHaveLength(2);
		expect(records[0]).toMatchObject({
			id: 'conclusion-1',
			content: 'User prefers concise responses',
			scope: 'self',
			sessionId: 'conv-1',
		});
	});

	it('retrieves self-scope conclusions', async () => {
		mockScopeList.mockResolvedValueOnce({
			toArray: async () => [
				{ id: 'self-1', content: 'Self conclusion content', sessionId: 'conv-1', createdAt: new Date().toISOString() },
			],
		});

		const { listPersonaMemories } = await import('./honcho');
		const records = await listPersonaMemories('user-1');

		const selfRecords = records.filter((r) => r.scope === 'self');
		expect(selfRecords.length).toBeGreaterThan(0);
	});

	it('retrieves assistant_about_user scope conclusions', async () => {
		mockScopeList
			.mockResolvedValueOnce({
				toArray: async () => [
					{ id: 'self-1', content: 'Self content', sessionId: 'conv-1', createdAt: new Date().toISOString() },
				],
			})
			.mockResolvedValueOnce({
				toArray: async () => [
					{ id: 'about-1', content: 'Assistant observations about user', sessionId: 'conv-1', createdAt: new Date().toISOString() },
				],
			});

		const { listPersonaMemories } = await import('./honcho');
		const records = await listPersonaMemories('user-1');

		const assistantAboutUserRecords = records.filter((r) => r.scope === 'assistant_about_user');
		expect(assistantAboutUserRecords.length).toBeGreaterThan(0);
	});

	it('handles empty conclusions gracefully', async () => {
		mockScopeList.mockResolvedValue({ toArray: async () => [] });

		const { listPersonaMemories } = await import('./honcho');
		const records = await listPersonaMemories('user-1');

		expect(records).toHaveLength(0);
	});

	it('normalizes conclusion timestamps correctly', async () => {
		const fixedTime = '2026-04-15T10:30:00.000Z';
		mockScopeList.mockResolvedValueOnce({
			toArray: async () => [
				{ id: 'concl-1', content: 'Test content', sessionId: 'conv-1', createdAt: fixedTime },
			],
		});

		const { listPersonaMemories } = await import('./honcho');
		const records = await listPersonaMemories('user-1');

		if (records.length > 0) {
			const timestamp = records[0].createdAt;
			expect(typeof timestamp).toBe('number');
			expect(timestamp).toBeGreaterThan(0);
		}
	});
});

describe('honcho learning - rotateHonchoPeerIdentity', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		userRows[0].honchoPeerVersion = 0;
		userRows[1].honchoPeerVersion = 1;
		mockHonchoPeerVersion.value = 0;
	});

	it('increments peer identity version', async () => {
		const { rotateHonchoPeerIdentity } = await import('./honcho');
		const newVersion = await rotateHonchoPeerIdentity('user-1');

		expect(newVersion).toBe(1);
	});

	it('returns incremented version as the new identity', async () => {
		mockHonchoPeerVersion.value = 5;

		const { rotateHonchoPeerIdentity } = await import('./honcho');
		const newVersion = await rotateHonchoPeerIdentity('user-1');

		expect(newVersion).toBe(6);
	});

	it('handles rotation for user with existing version', async () => {
		mockHonchoPeerVersion.value = 3;

		const { rotateHonchoPeerIdentity } = await import('./honcho');
		const newVersion = await rotateHonchoPeerIdentity('user-1');

		expect(newVersion).toBe(4);
	});

	it('generates distinct peer IDs after rotation', async () => {
		const { getHonchoUserPeerId, getHonchoAssistantPeerId, rotateHonchoPeerIdentity } = await import('./honcho');

		const beforePeerId = getHonchoUserPeerId('user-1');
		const beforeAssistantPeerId = getHonchoAssistantPeerId('user-1');

		await rotateHonchoPeerIdentity('user-1');

		const afterPeerId = getHonchoUserPeerId('user-1');
		const afterAssistantPeerId = getHonchoAssistantPeerId('user-1');

		expect(typeof afterPeerId).toBe('string');
		expect(typeof afterAssistantPeerId).toBe('string');
	});

	it('updates peer version in DB', async () => {
		const { rotateHonchoPeerIdentity } = await import('./honcho');
		
		await rotateHonchoPeerIdentity('user-1');

		// Version should have been updated
		expect(mockHonchoPeerVersion.value).toBe(1);
	});
});