import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import KnowledgePage from './+page.svelte';

describe('Knowledge page', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
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
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('renders the library immediately without prefetching the memory profile', async () => {
		vi.useFakeTimers();
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
		await vi.advanceTimersByTimeAsync(500);
		expect(fetchSpy).not.toHaveBeenCalled();
		unmount();
	});

	it('loads memory when the memory tab is opened', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
			ok: true,
			json: async () => ({
				personaMemories: [],
				taskMemories: [],
				focusContinuities: [],
				summary: {
					personaCount: 3,
					taskCount: 2,
					focusContinuityCount: 1,
					overview: 'Knows the user prefers concise responses.',
					overviewSource: 'honcho_live',
					overviewStatus: 'ready',
					overviewUpdatedAt: Date.now(),
					overviewLastAttemptAt: Date.now(),
					durablePersonaCount: 3,
				},
			}),
		} as Response);

		const { getAllByText, getByRole, getByText, queryByText, unmount } = render(KnowledgePage, {
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
			expect(getByRole('button', { name: /manage persona memory/i })).toBeDefined();
			expect(getByRole('button', { name: /manage focus continuity/i })).toBeDefined();
		});
		expect(queryByText(/memory signal/i)).toBeNull();
		unmount();
	});

	it('shows persona memories in a modal table with readable actor labels', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue({
			ok: true,
			json: async () => ({
				personaMemories: [
					{
						id: 'p1',
						canonicalText: 'Prefers short answers.',
						memoryClass: 'stable_preference',
						state: 'active',
						salienceScore: 72,
						sourceCount: 1,
						conversationTitles: [],
						firstSeenAt: Date.now(),
						lastSeenAt: Date.now(),
						pinned: false,
						members: [
							{
								id: 'c1',
								content: 'Prefers short answers.',
								scope: 'self',
								sessionId: 'session-1',
								conversationTitle: null,
								createdAt: Date.now(),
							},
						],
					},
					{
						id: 'p2',
						canonicalText: 'Seems to enjoy precise design critiques.',
						memoryClass: 'long_term_context',
						state: 'active',
						salienceScore: 68,
						sourceCount: 1,
						conversationTitles: [],
						firstSeenAt: Date.now(),
						lastSeenAt: Date.now(),
						pinned: false,
						members: [
							{
								id: 'c2',
								content: 'Seems to enjoy precise design critiques.',
								scope: 'assistant_about_user',
								sessionId: null,
								conversationTitle: null,
								createdAt: Date.now(),
							},
						],
					},
				],
				taskMemories: [],
				focusContinuities: [],
				summary: {
					personaCount: 2,
					taskCount: 0,
					focusContinuityCount: 0,
					overview: 'Knows the user prefers concise responses.',
					overviewSource: 'honcho_live',
					overviewStatus: 'ready',
					overviewUpdatedAt: Date.now(),
					overviewLastAttemptAt: Date.now(),
					durablePersonaCount: 2,
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

	it('still opens the persona memory modal when duplicate memory ids are returned', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue({
			ok: true,
			json: async () => ({
				personaMemories: [
					{
						id: 'dup-1',
						canonicalText: 'Prefers concise replies.',
						memoryClass: 'stable_preference',
						state: 'active',
						salienceScore: 74,
						sourceCount: 2,
						conversationTitles: ['Chat A'],
						firstSeenAt: Date.now() - 1_000,
						lastSeenAt: Date.now(),
						pinned: false,
						members: [
							{
								id: 'dup-1-a',
								content: 'Prefers concise replies.',
								scope: 'self',
								sessionId: 'session-1',
								conversationTitle: 'Chat A',
								createdAt: Date.now(),
							},
							{
								id: 'dup-1-b',
								content: 'Prefers concise replies.',
								scope: 'self',
								sessionId: 'session-1',
								conversationTitle: 'Chat A',
								createdAt: Date.now() - 1_000,
							},
						],
					},
					{
						id: 'dup-1',
						canonicalText: 'Prefers concise replies.',
						memoryClass: 'stable_preference',
						state: 'active',
						salienceScore: 74,
						sourceCount: 1,
						conversationTitles: ['Chat A'],
						firstSeenAt: Date.now() - 1_000,
						lastSeenAt: Date.now() - 1_000,
						pinned: false,
						members: [
							{
								id: 'dup-1-c',
								content: 'Prefers concise replies.',
								scope: 'self',
								sessionId: 'session-1',
								conversationTitle: 'Chat A',
								createdAt: Date.now() - 1_000,
							},
						],
					},
				],
				taskMemories: [],
				focusContinuities: [],
				summary: {
					personaCount: 2,
					taskCount: 0,
					focusContinuityCount: 0,
					overview: 'Knows the user prefers concise responses.',
					overviewSource: 'honcho_live',
					overviewStatus: 'ready',
					overviewUpdatedAt: Date.now(),
					overviewLastAttemptAt: Date.now(),
					durablePersonaCount: 2,
				},
			}),
		} as Response);

		const { getByRole, unmount } = render(KnowledgePage, {
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
			expect(getByRole('dialog')).toHaveTextContent('Prefers concise replies.');
		});

		unmount();
	});

	it('defaults the persona filter to the first non-empty state', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue({
			ok: true,
			json: async () => ({
				personaMemories: [
					{
						id: 'dormant-1',
						canonicalText: 'Used sourdough last month.',
						memoryClass: 'situational_context',
						state: 'dormant',
						salienceScore: 44,
						sourceCount: 1,
						conversationTitles: ['Cooking'],
						firstSeenAt: Date.now() - 100_000,
						lastSeenAt: Date.now() - 50_000,
						pinned: false,
						members: [
							{
								id: 'member-1',
								content: 'Used sourdough last month.',
								scope: 'self',
								sessionId: 'session-1',
								conversationTitle: 'Cooking',
								createdAt: Date.now() - 50_000,
							},
						],
					},
				],
				taskMemories: [],
				focusContinuities: [],
				summary: {
					personaCount: 1,
					taskCount: 0,
					focusContinuityCount: 0,
					overview: 'Knows past cooking context.',
					overviewSource: 'honcho_live',
					overviewStatus: 'ready',
					overviewUpdatedAt: Date.now(),
					overviewLastAttemptAt: Date.now(),
					durablePersonaCount: 1,
				},
			}),
		} as Response);

		const { getByRole, findByText, unmount } = render(KnowledgePage, {
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

		expect(await findByText('Used sourdough last month.')).toBeDefined();
		expect(getByRole('button', { name: /dormant \(1\)/i })).toBeDefined();
		unmount();
	});

	it('labels local overview fallbacks honestly when live Honcho text is unavailable', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue({
			ok: true,
			json: async () => ({
				personaMemories: [
					{
						id: 'pref-1',
						canonicalText: 'Prefers concise responses.',
						memoryClass: 'stable_preference',
						state: 'active',
						salienceScore: 82,
						sourceCount: 2,
						conversationTitles: [],
						firstSeenAt: Date.now() - 1_000,
						lastSeenAt: Date.now(),
						pinned: false,
						members: [],
					},
					{
						id: 'ctx-1',
						canonicalText: 'Builds AI chat tools with Langflow.',
						memoryClass: 'long_term_context',
						state: 'active',
						salienceScore: 74,
						sourceCount: 2,
						conversationTitles: [],
						firstSeenAt: Date.now() - 2_000,
						lastSeenAt: Date.now() - 500,
						pinned: false,
						members: [],
					},
				],
				taskMemories: [],
				focusContinuities: [],
				summary: {
					personaCount: 2,
					taskCount: 0,
					focusContinuityCount: 0,
					overview:
						'### Stable Preferences\n- Prefers concise responses.\n\n### Long-Term Context\n- Builds AI chat tools with Langflow.',
					overviewSource: 'persona_fallback',
					overviewStatus: 'refreshing',
					overviewUpdatedAt: null,
					overviewLastAttemptAt: Date.now(),
					durablePersonaCount: 2,
				},
			}),
		} as Response);

		const { getByRole, getByText, unmount } = render(KnowledgePage, {
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
			expect(
				getByText(/showing a local durable-memory fallback while the live honcho overview is unavailable/i)
			).toBeDefined();
			expect(getByText('Prefers concise responses.')).toBeDefined();
		});
		unmount();
	});

	it('polls the overview-only endpoint until a live Honcho overview arrives', async () => {
		vi.useFakeTimers();
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
			const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
			if (url.endsWith('/api/knowledge/memory')) {
				return Promise.resolve({
					ok: true,
					json: async () => ({
						personaMemories: [],
						taskMemories: [],
						focusContinuities: [],
						summary: {
							personaCount: 2,
							taskCount: 0,
							focusContinuityCount: 0,
							overview:
								'### Stable Preferences\n- Prefers concise responses.\n\n### Long-Term Context\n- Builds AI chat tools with Langflow.',
							overviewSource: 'persona_fallback',
							overviewStatus: 'refreshing',
							overviewUpdatedAt: null,
							overviewLastAttemptAt: Date.now(),
							durablePersonaCount: 2,
						},
					}),
				} as Response);
			}
			if (url.endsWith('/api/knowledge/memory/overview')) {
				return Promise.resolve({
					ok: true,
					json: async () => ({
						summary: {
							personaCount: 2,
							taskCount: 0,
							focusContinuityCount: 0,
							overview: 'Live Honcho Overview',
							overviewSource: 'honcho_live',
							overviewStatus: 'ready',
							overviewUpdatedAt: Date.now(),
							overviewLastAttemptAt: Date.now(),
							durablePersonaCount: 2,
						},
					}),
				} as Response);
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		const { getByRole, getByText, queryByText, unmount } = render(KnowledgePage, {
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
			expect(getByText(/showing a local durable-memory fallback/i)).toBeDefined();
		});

		await vi.advanceTimersByTimeAsync(0);
		await waitFor(() => {
			expect(getByText('Live Honcho Overview')).toBeDefined();
		});

		await vi.advanceTimersByTimeAsync(25_000);
		expect(fetchSpy.mock.calls.filter(([url]) => String(url).includes('/api/knowledge/memory/overview'))).toHaveLength(1);
		expect(queryByText(/showing a local durable-memory fallback/i)).toBeNull();
		unmount();
	});

	it('uses the force overview endpoint when retrying the live overview', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
			const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
			if (url.endsWith('/api/knowledge/memory')) {
				return Promise.resolve({
					ok: true,
					json: async () => ({
						personaMemories: [],
						taskMemories: [],
						focusContinuities: [],
						summary: {
							personaCount: 205,
							taskCount: 0,
							focusContinuityCount: 0,
							overview: null,
							overviewSource: null,
							overviewStatus: 'temporarily_unavailable',
							overviewUpdatedAt: null,
							overviewLastAttemptAt: Date.now(),
							durablePersonaCount: 18,
						},
					}),
				} as Response);
			}
			if (url.endsWith('/api/knowledge/memory/overview?force=1')) {
				return Promise.resolve({
					ok: true,
					json: async () => ({
						summary: {
							personaCount: 205,
							taskCount: 0,
							focusContinuityCount: 0,
							overview: 'Recovered live overview',
							overviewSource: 'honcho_live',
							overviewStatus: 'ready',
							overviewUpdatedAt: Date.now(),
							overviewLastAttemptAt: Date.now(),
							durablePersonaCount: 18,
						},
					}),
				} as Response);
			}
			if (url.endsWith('/api/knowledge/memory/overview')) {
				return Promise.resolve({
					ok: true,
					json: async () => ({
						summary: {
							personaCount: 205,
							taskCount: 0,
							focusContinuityCount: 0,
							overview: null,
							overviewSource: null,
							overviewStatus: 'temporarily_unavailable',
							overviewUpdatedAt: null,
							overviewLastAttemptAt: Date.now(),
							durablePersonaCount: 18,
						},
					}),
				} as Response);
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		const { getByRole, getByText, unmount } = render(KnowledgePage, {
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
			expect(
				getByText(/durable persona memory exists, but the live honcho overview is temporarily unavailable right now/i)
			).toBeDefined();
		});

		await waitFor(() => {
			expect(getByRole('button', { name: /retry live overview/i })).toBeEnabled();
		});
		await fireEvent.click(getByRole('button', { name: /retry live overview/i }));
		await waitFor(() => {
			expect(getByText('Recovered live overview')).toBeDefined();
		});
		expect(fetchSpy).toHaveBeenCalledWith('/api/knowledge/memory/overview?force=1');
		unmount();
	});

	it('does not claim durable memory is missing when only the live overview is unavailable', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue({
			ok: true,
			json: async () => ({
				personaMemories: [],
				taskMemories: [],
				focusContinuities: [],
				summary: {
					personaCount: 205,
					taskCount: 0,
					focusContinuityCount: 0,
					overview: null,
					overviewSource: null,
					overviewStatus: 'temporarily_unavailable',
					overviewUpdatedAt: null,
					overviewLastAttemptAt: Date.now(),
					durablePersonaCount: 18,
				},
			}),
		} as Response);

		const { getByRole, getByText, queryByText, unmount } = render(KnowledgePage, {
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
			expect(
				getByText(/durable persona memory exists, but the live honcho overview is temporarily unavailable right now/i)
			).toBeDefined();
		});
		expect(
			queryByText(/not enough durable persona memory yet to render a useful overview/i)
		).toBeNull();
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
