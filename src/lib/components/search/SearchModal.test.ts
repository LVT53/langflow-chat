import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import SearchModal from './SearchModal.svelte';
import { conversations } from '$lib/stores/conversations';
import { projects } from '$lib/stores/projects';
import { currentConversationId, sidebarOpen } from '$lib/stores/ui';
import { searchVaultFiles } from '$lib/client/api/knowledge';
import { goto } from '$app/navigation';

vi.mock('svelte/transition', () => ({
	fade: () => ({
		delay: 0,
		duration: 0,
		css: () => '',
	}),
}));

vi.mock('$app/environment', () => ({
	browser: true,
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
}));

vi.mock('$lib/client/api/knowledge', () => ({
	searchVaultFiles: vi.fn(),
}));

describe('SearchModal', () => {
	const mockSearchVaultFiles = searchVaultFiles as ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		Object.defineProperty(window, 'matchMedia', {
			writable: true,
			value: vi.fn().mockImplementation(() => ({
				matches: false,
				media: '',
				onchange: null,
				addListener: vi.fn(),
				removeListener: vi.fn(),
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				dispatchEvent: vi.fn(),
			})),
		});

		conversations.set([
			{
				id: 'conv-1',
				title: 'Release notes',
				projectId: 'project-1',
				updatedAt: Date.now(),
			},
		]);
		projects.set([
			{
				id: 'project-1',
				name: 'Launch',
				sortOrder: 0,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			},
		]);
		currentConversationId.set('conv-1');
		sidebarOpen.set(true);
	});

	it('shows vault file results alongside conversations and routes vault AI view into knowledge workspace', async () => {
		mockSearchVaultFiles.mockResolvedValue([
			{
				id: 'doc-1',
				displayArtifactId: 'source-1',
				promptArtifactId: 'normalized-1',
				name: 'Vault brief.txt',
				mimeType: 'text/plain',
				vaultId: 'vault-1',
				vaultName: 'Research',
				summary: 'Brief summary',
				snippet: 'Important extracted text',
				normalizedAvailable: true,
				updatedAt: Date.now(),
			},
		]);
		const onClose = vi.fn();

		render(SearchModal, {
			props: {
				isOpen: true,
				onClose,
			},
		});

		await waitFor(() => {
			expect(screen.getByText('Vault brief.txt')).toBeInTheDocument();
			expect(screen.getByText('Release notes')).toBeInTheDocument();
		});

		const vaultResult = screen.getByText('Vault brief.txt').closest('button');
		expect(vaultResult).not.toBeNull();

		await fireEvent.click(vaultResult!);

		expect(goto).toHaveBeenCalledWith(
			'/knowledge?open_artifact=normalized-1&open_filename=Vault+brief.txt&open_mime=text%2Fplain'
		);
		expect(onClose).toHaveBeenCalled();
		expect(mockSearchVaultFiles).toHaveBeenCalledWith('', 6);
	});
});
