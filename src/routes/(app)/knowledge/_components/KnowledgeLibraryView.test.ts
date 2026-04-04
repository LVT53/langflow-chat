import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import KnowledgeLibraryView from './KnowledgeLibraryView.svelte';
import { uploadKnowledgeAttachment } from '$lib/client/api/knowledge';

vi.mock('$lib/client/api/knowledge', async () => {
	const actual = await vi.importActual<typeof import('$lib/client/api/knowledge')>(
		'$lib/client/api/knowledge'
	);

	return {
		...actual,
		uploadKnowledgeAttachment: vi.fn(),
	};
});

const mockUploadKnowledgeAttachment = vi.mocked(uploadKnowledgeAttachment);

const vaults = [
	{
		id: 'vault-1',
		userId: 'user-1',
		name: 'Research',
		color: '#C15F3C',
		sortOrder: 0,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	},
	{
		id: 'vault-2',
		userId: 'user-1',
		name: 'Ops',
		color: '#3B82F6',
		sortOrder: 1,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	},
];

const documents = [
	{
		id: 'doc-1',
		displayArtifactId: 'source-1',
		promptArtifactId: 'normalized-1',
		familyArtifactIds: ['source-1', 'normalized-1'],
		name: 'Budget.pdf',
		mimeType: 'application/pdf',
		sizeBytes: 1024,
		conversationId: null,
		vaultId: 'vault-1',
		summary: 'Quarterly budget',
		normalizedAvailable: true,
		documentFamilyId: 'family-budget',
		documentLabel: 'Quarterly Budget',
		documentRole: 'report',
		versionNumber: 2,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	},
	{
		id: 'doc-2',
		displayArtifactId: 'source-2',
		promptArtifactId: 'normalized-2',
		familyArtifactIds: ['source-2', 'normalized-2'],
		name: 'Plan.docx',
		mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		sizeBytes: 2048,
		conversationId: null,
		vaultId: 'vault-2',
		summary: 'Operating plan',
		normalizedAvailable: true,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	},
];

const quota = {
	totalStorageUsed: 3072,
	totalFiles: 2,
	storageLimit: 1073741824,
	usagePercent: 0,
	isWarning: false,
	warningThreshold: 80,
	vaults: [
		{ vaultId: 'vault-1', vaultName: 'Research', fileCount: 1, storageUsed: 1024 },
		{ vaultId: 'vault-2', vaultName: 'Ops', fileCount: 1, storageUsed: 2048 },
	],
};

describe('KnowledgeLibraryView', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUploadKnowledgeAttachment.mockResolvedValue({
			artifact: { id: 'artifact-1', name: 'Budget.pdf' },
		} as any);
	});

	it('renders the vault list inside the Vaults panel and allows clearing the scope', async () => {
		const onSelectVault = vi.fn();

		render(KnowledgeLibraryView, {
			props: {
				vaults,
				activeVaultId: 'vault-1',
				documents,
				results: [],
				workflows: [],
				quota,
				onOpenLibraryModal: vi.fn(),
				onSelectVault,
			},
		});

		const vaultPanel = screen.getByRole('region', { name: /vaults/i });
		expect(within(vaultPanel).getByText('Research')).toBeInTheDocument();
		expect(within(vaultPanel).getByText('Ops')).toBeInTheDocument();
		expect(screen.getByText('Budget.pdf')).toBeInTheDocument();
		expect(screen.queryByText('Plan.docx')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: /all vaults/i }));

		expect(onSelectVault).toHaveBeenCalledWith(null);
	});

	it('renames a vault from the Vaults panel', async () => {
		const onRenameVault = vi.fn();

		render(KnowledgeLibraryView, {
			props: {
				vaults,
				activeVaultId: 'vault-1',
				documents,
				results: [],
				workflows: [],
				quota,
				onOpenLibraryModal: vi.fn(),
				onSelectVault: vi.fn(),
				onRenameVault,
			},
		});

		await fireEvent.click(screen.getByRole('button', { name: /rename research vault/i }));

		const input = screen.getByDisplayValue('Research');
		await fireEvent.input(input, { target: { value: 'Research Notes' } });
		await fireEvent.keyDown(input, { key: 'Enter' });

		expect(onRenameVault).toHaveBeenCalledWith({
			id: 'vault-1',
			name: 'Research Notes',
		});
	});

	it('uploads dropped files to the targeted vault row', async () => {
		const onSelectVault = vi.fn();
		const onUploadToVault = vi.fn();

		render(KnowledgeLibraryView, {
			props: {
				vaults,
				activeVaultId: 'vault-1',
				documents,
				results: [],
				workflows: [],
				quota,
				onOpenLibraryModal: vi.fn(),
				onSelectVault,
				onUploadToVault,
			},
		});

		const opsRow = screen.getByText('Ops').closest('[role="button"]');
		const file = new File(['report'], 'report.txt', { type: 'text/plain' });

		await fireEvent.drop(opsRow!, {
			dataTransfer: {
				types: ['Files'],
				files: [file],
				dropEffect: 'copy',
			},
		});

		await waitFor(() => {
			expect(mockUploadKnowledgeAttachment).toHaveBeenCalledWith(file, null, 'vault-2');
		});
		expect(onSelectVault).toHaveBeenCalledWith('vault-2');
		expect(onUploadToVault).toHaveBeenCalledWith({
			vaultId: 'vault-2',
			response: {
				artifact: { id: 'artifact-1', name: 'Budget.pdf' },
			},
		});
	});

	it('emits a workspace document when opening AI view for a vault document', async () => {
		const onOpenDocument = vi.fn();

		render(KnowledgeLibraryView, {
			props: {
				vaults,
				activeVaultId: 'vault-1',
				documents,
				results: [],
				workflows: [],
				quota,
				onOpenLibraryModal: vi.fn(),
				onSelectVault: vi.fn(),
				onOpenDocument,
			},
		});

		await fireEvent.click(screen.getByRole('button', { name: /ai view/i }));

		await waitFor(() => {
			expect(onOpenDocument).toHaveBeenCalledWith({
				id: 'artifact:normalized-1',
				source: 'knowledge_artifact',
				filename: 'Budget.pdf',
				title: 'Quarterly Budget',
				documentFamilyId: 'family-budget',
				documentLabel: 'Quarterly Budget',
				documentRole: 'report',
				versionNumber: 2,
				originConversationId: null,
				originAssistantMessageId: null,
				sourceChatFileId: null,
				mimeType: 'application/pdf',
				artifactId: 'normalized-1',
				conversationId: null,
			});
		});
	});
});
