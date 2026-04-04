import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildAssistantEvidenceSummary } from './message-evidence.js';
import type { ArtifactSummary, ContextDebugState, TaskState } from '$lib/types';

vi.mock('$lib/server/env', () => ({
	getConfig: () => ({
		LANGFLOW_API_URL: 'http://localhost:7860',
		LANGFLOW_API_KEY: 'test-key',
		SESSION_SECRET: 'test-secret',
	}),
	getDatabasePath: () => './data/test.db',
}));

vi.mock('$lib/server/config-store', () => ({
	getMaxModelContext: () => 262144,
	getCompactionUIThreshold: () => 209715,
	getTargetConstructedContext: () => 157286,
}));

const mockGetArtifactsForUser = vi.hoisted(() => vi.fn());
const mockResolveArtifactFamilyKeys = vi.hoisted(() => vi.fn());
const mockGetVault = vi.hoisted(() => vi.fn());
const mockCanUseTeiReranker = vi.hoisted(() => vi.fn(() => false));
const mockRerankItems = vi.hoisted(() => vi.fn());

vi.mock('./knowledge.js', () => ({
	getArtifactsForUser: mockGetArtifactsForUser,
}));

vi.mock('./evidence-family.js', () => ({
	resolveArtifactFamilyKeys: mockResolveArtifactFamilyKeys,
}));

vi.mock('./knowledge/store/vaults.js', () => ({
	getVault: mockGetVault,
}));

vi.mock('./tei-reranker.js', () => ({
	canUseTeiReranker: mockCanUseTeiReranker,
	rerankItems: mockRerankItems,
}));

describe('message-evidence vault integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('buildArtifactGroups', () => {
		it('should include vault artifacts in evidence summary', async () => {
			const userId = 'user-1';
			const vaultId = 'vault-1';
			const artifactId = 'artifact-1';

			const vaultArtifact: ArtifactSummary = {
				id: artifactId,
				type: 'source_document',
				retrievalClass: 'durable',
				name: 'Vault Document.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 1024,
				conversationId: null,
				vaultId: vaultId,
				summary: 'A document from the vault',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};

			const contextDebug: ContextDebugState = {
				activeTaskId: null,
				activeTaskObjective: null,
				taskLocked: false,
				routingStage: 'deterministic',
				routingConfidence: 100,
				verificationStatus: 'skipped',
				selectedEvidence: [
					{
						artifactId: artifactId,
						name: 'Vault Document.pdf',
						artifactType: 'source_document',
						sourceType: 'document',
						role: 'selected',
						origin: 'system',
						confidence: 95,
						reason: 'Retrieved from vault',
					},
				],
				selectedEvidenceBySource: [{ sourceType: 'document', count: 1 }],
				pinnedEvidence: [],
				excludedEvidence: [],
			};

			mockGetArtifactsForUser.mockResolvedValue([vaultArtifact]);
			mockResolveArtifactFamilyKeys.mockResolvedValue(new Map([[artifactId, `document:${artifactId}`]]));
			mockGetVault.mockResolvedValue({
				id: vaultId,
				userId: userId,
				name: 'Research Papers',
				color: '#3B82F6',
				sortOrder: 0,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});

			const result = await buildAssistantEvidenceSummary({
				userId,
				message: 'Test message',
				taskState: null,
				contextDebug,
				currentAttachments: [],
			});

			expect(result).not.toBeNull();
			expect(result?.groups).toHaveLength(1);
			expect(result?.groups[0].sourceType).toBe('document');
			expect(result?.groups[0].items).toHaveLength(1);

			const item = result?.groups[0].items[0];
			expect(item?.channels).toContain('vault');
			expect(item?.vaultName).toBe('Research Papers');
		});

		it('should display vault channel indicator in evidence UI', async () => {
			const userId = 'user-1';
			const vaultId = 'vault-1';
			const artifactId = 'artifact-1';

			const vaultArtifact: ArtifactSummary = {
				id: artifactId,
				type: 'source_document',
				retrievalClass: 'durable',
				name: 'Vault File.md',
				mimeType: 'text/markdown',
				sizeBytes: 512,
				conversationId: null,
				vaultId: vaultId,
				summary: 'Markdown file from vault',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};

			const contextDebug: ContextDebugState = {
				activeTaskId: null,
				activeTaskObjective: null,
				taskLocked: false,
				routingStage: 'deterministic',
				routingConfidence: 100,
				verificationStatus: 'skipped',
				selectedEvidence: [
					{
						artifactId: artifactId,
						name: 'Vault File.md',
						artifactType: 'source_document',
						sourceType: 'document',
						role: 'selected',
						origin: 'system',
						confidence: 90,
						reason: 'Retrieved from vault',
					},
				],
				selectedEvidenceBySource: [{ sourceType: 'document', count: 1 }],
				pinnedEvidence: [],
				excludedEvidence: [],
			};

			mockGetArtifactsForUser.mockResolvedValue([vaultArtifact]);
			mockResolveArtifactFamilyKeys.mockResolvedValue(new Map([[artifactId, `document:${artifactId}`]]));
			mockGetVault.mockResolvedValue({
				id: vaultId,
				userId: userId,
				name: 'Notes',
				color: '#10B981',
				sortOrder: 1,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});

			const result = await buildAssistantEvidenceSummary({
				userId,
				message: 'Test message',
				taskState: null,
				contextDebug,
				currentAttachments: [],
			});

			const item = result?.groups[0].items[0];
			expect(item?.channels).toBeDefined();
			expect(item?.channels).toContain('vault');
			expect(item?.vaultName).toBe('Notes');
		});

		it('should handle non-vault artifacts without vault channel', async () => {
			const userId = 'user-1';
			const artifactId = 'artifact-2';

			const nonVaultArtifact: ArtifactSummary = {
				id: artifactId,
				type: 'source_document',
				retrievalClass: 'durable',
				name: 'Regular Document.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 2048,
				conversationId: 'conv-1',
				vaultId: null,
				summary: 'A regular document',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};

			const contextDebug: ContextDebugState = {
				activeTaskId: null,
				activeTaskObjective: null,
				taskLocked: false,
				routingStage: 'deterministic',
				routingConfidence: 100,
				verificationStatus: 'skipped',
				selectedEvidence: [
					{
						artifactId: artifactId,
						name: 'Regular Document.pdf',
						artifactType: 'source_document',
						sourceType: 'document',
						role: 'selected',
						origin: 'system',
						confidence: 85,
						reason: 'Retrieved from conversation',
					},
				],
				selectedEvidenceBySource: [{ sourceType: 'document', count: 1 }],
				pinnedEvidence: [],
				excludedEvidence: [],
			};

			mockGetArtifactsForUser.mockResolvedValue([nonVaultArtifact]);
			mockResolveArtifactFamilyKeys.mockResolvedValue(new Map([[artifactId, `document:${artifactId}`]]));

			const result = await buildAssistantEvidenceSummary({
				userId,
				message: 'Test message',
				taskState: null,
				contextDebug,
				currentAttachments: [],
			});

			const item = result?.groups[0].items[0];
			expect(item?.channels).toBeDefined();
			expect(item?.channels).not.toContain('vault');
			expect(item?.vaultName).toBeUndefined();
		});

		it('should handle missing vault gracefully', async () => {
			const userId = 'user-1';
			const vaultId = 'vault-missing';
			const artifactId = 'artifact-3';

			const vaultArtifact: ArtifactSummary = {
				id: artifactId,
				type: 'source_document',
				retrievalClass: 'durable',
				name: 'Orphan Vault File.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 1024,
				conversationId: null,
				vaultId: vaultId,
				summary: 'File with missing vault',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};

			const contextDebug: ContextDebugState = {
				activeTaskId: null,
				activeTaskObjective: null,
				taskLocked: false,
				routingStage: 'deterministic',
				routingConfidence: 100,
				verificationStatus: 'skipped',
				selectedEvidence: [
					{
						artifactId: artifactId,
						name: 'Orphan Vault File.pdf',
						artifactType: 'source_document',
						sourceType: 'document',
						role: 'selected',
						origin: 'system',
						confidence: 80,
						reason: 'Retrieved from vault',
					},
				],
				selectedEvidenceBySource: [{ sourceType: 'document', count: 1 }],
				pinnedEvidence: [],
				excludedEvidence: [],
			};

			mockGetArtifactsForUser.mockResolvedValue([vaultArtifact]);
			mockResolveArtifactFamilyKeys.mockResolvedValue(new Map([[artifactId, `document:${artifactId}`]]));
			mockGetVault.mockResolvedValue(null); // Vault not found

			const result = await buildAssistantEvidenceSummary({
				userId,
				message: 'Test message',
				taskState: null,
				contextDebug,
				currentAttachments: [],
			});

			const item = result?.groups[0].items[0];
			expect(item?.channels).toContain('vault');
			expect(item?.vaultName).toBe('Unknown Vault');
		});

		it('should handle current turn attachments from vault', async () => {
			const userId = 'user-1';
			const vaultId = 'vault-1';
			const artifactId = 'artifact-4';

			const vaultAttachment: ArtifactSummary = {
				id: artifactId,
				type: 'source_document',
				retrievalClass: 'durable',
				name: 'Attached Vault File.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 3072,
				conversationId: null,
				vaultId: vaultId,
				summary: 'Attached from vault',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};

			mockGetArtifactsForUser.mockResolvedValue([vaultAttachment]);
			mockResolveArtifactFamilyKeys.mockResolvedValue(new Map([[artifactId, `document:${artifactId}`]]));
			mockGetVault.mockResolvedValue({
				id: vaultId,
				userId: userId,
				name: 'Project Files',
				color: '#F59E0B',
				sortOrder: 2,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});

			const result = await buildAssistantEvidenceSummary({
				userId,
				message: 'Test message',
				taskState: null,
				contextDebug: null,
				currentAttachments: [vaultAttachment],
			});

			expect(result).not.toBeNull();
			expect(result?.groups).toHaveLength(1);

			const item = result?.groups[0].items[0];
			expect(item?.channels).toContain('attached');
			expect(item?.channels).toContain('vault');
			expect(item?.vaultName).toBe('Project Files');
			expect(item?.currentTurnAttachment).toBe(false);
		});

		it('should handle mixed vault and non-vault artifacts', async () => {
			const userId = 'user-1';
			const vaultId = 'vault-1';
			const vaultArtifactId = 'artifact-vault';
			const regularArtifactId = 'artifact-regular';

			const vaultArtifact: ArtifactSummary = {
				id: vaultArtifactId,
				type: 'source_document',
				retrievalClass: 'durable',
				name: 'Vault Doc.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 1024,
				conversationId: null,
				vaultId: vaultId,
				summary: 'From vault',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};

			const regularArtifact: ArtifactSummary = {
				id: regularArtifactId,
				type: 'source_document',
				retrievalClass: 'durable',
				name: 'Regular Doc.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 2048,
				conversationId: 'conv-1',
				vaultId: null,
				summary: 'Regular document',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};

			const contextDebug: ContextDebugState = {
				activeTaskId: null,
				activeTaskObjective: null,
				taskLocked: false,
				routingStage: 'deterministic',
				routingConfidence: 100,
				verificationStatus: 'skipped',
				selectedEvidence: [
					{
						artifactId: vaultArtifactId,
						name: 'Vault Doc.pdf',
						artifactType: 'source_document',
						sourceType: 'document',
						role: 'selected',
						origin: 'system',
						confidence: 95,
						reason: 'Retrieved from vault',
					},
					{
						artifactId: regularArtifactId,
						name: 'Regular Doc.pdf',
						artifactType: 'source_document',
						sourceType: 'document',
						role: 'selected',
						origin: 'system',
						confidence: 90,
						reason: 'Retrieved from conversation',
					},
				],
				selectedEvidenceBySource: [{ sourceType: 'document', count: 2 }],
				pinnedEvidence: [],
				excludedEvidence: [],
			};

			mockGetArtifactsForUser.mockResolvedValue([vaultArtifact, regularArtifact]);
			mockResolveArtifactFamilyKeys.mockResolvedValue(
				new Map([
					[vaultArtifactId, `document:${vaultArtifactId}`],
					[regularArtifactId, `document:${regularArtifactId}`],
				])
			);
			mockGetVault.mockResolvedValue({
				id: vaultId,
				userId: userId,
				name: 'Research',
				color: '#8B5CF6',
				sortOrder: 0,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});

			const result = await buildAssistantEvidenceSummary({
				userId,
				message: 'Test message',
				taskState: null,
				contextDebug,
				currentAttachments: [],
			});

			expect(result?.groups[0].items).toHaveLength(2);

			const vaultItem = result?.groups[0].items.find((i) => i.id === vaultArtifactId);
			expect(vaultItem?.channels).toContain('vault');
			expect(vaultItem?.vaultName).toBe('Research');

			const regularItem = result?.groups[0].items.find((i) => i.id === regularArtifactId);
			expect(regularItem?.channels).not.toContain('vault');
			expect(regularItem?.vaultName).toBeUndefined();
		});
	});
});
