import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import KnowledgePage from './+page.svelte';

describe('Knowledge page', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('renders the library immediately without blocking on memory fetch', () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		const { getByText, unmount } = render(KnowledgePage, {
			data: {
				documents: [],
				results: [],
				workflows: [],
				honchoEnabled: true,
				userDisplayName: 'Test User',
			},
		});

		expect(getByText('Knowledge Base')).toBeDefined();
		expect(fetchSpy).not.toHaveBeenCalled();
		unmount();
	});

	it('loads memory when the memory tab is opened', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
			ok: true,
			json: async () => ({
				personaMemories: [],
				taskMemories: [],
				projectMemories: [],
				summary: {
					personaCount: 3,
					taskCount: 2,
					projectCount: 1,
					overview: 'Knows the user prefers concise responses.',
				},
			}),
		} as Response);

		const { getAllByText, getByRole, getByText, unmount } = render(KnowledgePage, {
			data: {
				documents: [],
				results: [],
				workflows: [],
				honchoEnabled: true,
				userDisplayName: 'Test User',
			},
		});

		await fireEvent.click(getByRole('button', { name: /memory profile/i }));

		expect(fetchSpy).toHaveBeenCalledWith('/api/knowledge/memory');
		await waitFor(() => {
			expect(getByText('Memory Overview')).toBeDefined();
			expect(getAllByText('Knows the user prefers concise responses.').length).toBeGreaterThan(0);
		});
		unmount();
	});

	it('shows persona memories in a modal table with readable actor labels', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue({
			ok: true,
			json: async () => ({
				personaMemories: [
					{
						id: 'p1',
						content: 'Prefers short answers.',
						scope: 'self',
						sessionId: 'session-1',
						conversationId: 'session-1',
						conversationTitle: null,
						createdAt: Date.now(),
					},
					{
						id: 'p2',
						content: 'Seems to enjoy precise design critiques.',
						scope: 'assistant_about_user',
						sessionId: null,
						conversationId: null,
						conversationTitle: null,
						createdAt: Date.now(),
					},
				],
				taskMemories: [],
				projectMemories: [],
				summary: {
					personaCount: 2,
					taskCount: 0,
					projectCount: 0,
					overview: 'Knows the user prefers concise responses.',
				},
			}),
		} as Response);

		const { getByRole, queryByText, unmount } = render(KnowledgePage, {
			data: {
				documents: [],
				results: [],
				workflows: [],
				honchoEnabled: true,
				userDisplayName: 'Test User',
			},
		});

		await fireEvent.click(getByRole('button', { name: /memory profile/i }));
		await waitFor(() => {
			expect(getByRole('button', { name: /manage persona memory/i })).toBeDefined();
		});

		await fireEvent.click(getByRole('button', { name: /manage persona memory/i }));

		await waitFor(() => {
			expect(getByRole('dialog')).toBeDefined();
			expect(getByRole('dialog')).toHaveTextContent('Test User');
			expect(getByRole('dialog')).toHaveTextContent('AlfyAI');
		});
		expect(queryByText('Self conclusion')).toBeNull();
		unmount();
	});

	it('shows a visible pending state while removing a document and only removes it after confirmation', async () => {
		let resolveDelete: ((value: Response) => void) | null = null;
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
			const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
			if (url.endsWith('/api/knowledge/doc-1') && init?.method === 'DELETE') {
				return new Promise((resolve) => {
					resolveDelete = resolve as (value: Response) => void;
				});
			}
			if (url.endsWith('/api/knowledge')) {
				return Promise.resolve(
					{
						ok: true,
						json: async () => ({
							documents: [],
							results: [],
							workflows: [],
						}),
					} as Response
				);
			}
			return Promise.reject(new Error(`Unexpected fetch: ${url}`));
		});

		const document = {
			id: 'doc-1',
			displayArtifactId: 'doc-1',
			promptArtifactId: 'doc-1-normalized',
			familyArtifactIds: ['doc-1', 'doc-1-normalized'],
			name: 'recipe.pdf',
			mimeType: 'application/pdf',
			sizeBytes: 1024,
			conversationId: 'conv-1',
			summary: 'Dinner recipe',
			normalizedAvailable: true,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};

		const { getByRole, getByText, queryByText, unmount } = render(KnowledgePage, {
			data: {
				documents: [document],
				results: [],
				workflows: [],
				honchoEnabled: true,
				userDisplayName: 'Test User',
			},
		});

		await fireEvent.click(getByRole('button', { name: /manage documents/i }));
		await fireEvent.click(getByRole('button', { name: 'Remove' }));

		await waitFor(() => {
			expect(getByText(/Removing 1 item from the Knowledge Base/i)).toBeDefined();
			expect(getByText('recipe.pdf')).toBeDefined();
		});

		resolveDelete?.({
			ok: true,
			json: async () => ({
				success: true,
				deletedArtifactIds: ['doc-1'],
				message: 'Removed from the Knowledge Base.',
			}),
		} as Response);

		await waitFor(() => {
			expect(queryByText('recipe.pdf')).toBeNull();
		});
		expect(fetchSpy).toHaveBeenCalledWith('/api/knowledge');
		unmount();
	});
});
