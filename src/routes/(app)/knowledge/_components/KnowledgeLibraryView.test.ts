import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import KnowledgeLibraryView from './KnowledgeLibraryView.svelte';

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

describe('KnowledgeLibraryView', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	it('scopes the explorer to the active vault and allows clearing the scope', async () => {
		const onSelectVault = vi.fn();

		render(KnowledgeLibraryView, {
			props: {
				vaults,
				activeVaultId: 'vault-1',
				documents,
				results: [],
				workflows: [],
				quota: null,
				onOpenLibraryModal: vi.fn(),
				onSelectVault,
			},
		});

		expect(screen.getByText('Budget.pdf')).toBeInTheDocument();
		expect(screen.queryByText('Plan.docx')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: /show all vaults/i }));

		expect(onSelectVault).toHaveBeenCalledWith(null);
	});

	it('opens the AI view modal for a vault document', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
			new Response(
				JSON.stringify({
					artifact: {
						contentText: 'Budget model text',
					},
				}),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}
			)
		);

		render(KnowledgeLibraryView, {
			props: {
				vaults,
				activeVaultId: 'vault-1',
				documents,
				results: [],
				workflows: [],
				quota: null,
				onOpenLibraryModal: vi.fn(),
				onSelectVault: vi.fn(),
			},
		});

		await fireEvent.click(screen.getByRole('button', { name: /ai view/i }));

		await waitFor(() => {
			expect(screen.getByText('Budget model text')).toBeInTheDocument();
		});

		expect(global.fetch).toHaveBeenCalledWith('/api/knowledge/normalized-1');
	});
});
