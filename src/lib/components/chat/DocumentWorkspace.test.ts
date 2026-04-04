import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import DocumentWorkspace from './DocumentWorkspace.svelte';

vi.mock('$lib/services/markdown', () => ({
	renderHighlightedText: vi.fn(async (content: string) => `<pre><code>${content}</code></pre>`),
}));

describe('DocumentWorkspace', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	it('shows version history for the active document family and switches to an open version', async () => {
		const onSelectDocument = vi.fn();
		const onOpenDocument = vi.fn();

		render(DocumentWorkspace, {
			props: {
				open: true,
				documents: [
					{
						id: 'doc-v2',
						source: 'knowledge_artifact',
						filename: 'brief-v2.pdf',
						title: 'Client Brief',
						documentFamilyId: 'family-brief',
						documentFamilyStatus: 'historical',
						documentLabel: 'Client Brief',
						documentRole: 'brief',
						versionNumber: 2,
						mimeType: 'application/pdf',
						artifactId: null,
					},
					{
						id: 'doc-v1',
						source: 'knowledge_artifact',
						filename: 'brief-v1.pdf',
						title: 'Client Brief',
						documentFamilyId: 'family-brief',
						documentLabel: 'Client Brief',
						documentRole: 'brief',
						versionNumber: 1,
						mimeType: 'application/pdf',
						artifactId: null,
					},
				],
				availableDocuments: [],
				activeDocumentId: 'doc-v2',
				onSelectDocument,
				onOpenDocument,
				onCloseDocument: vi.fn(),
				onCloseWorkspace: vi.fn(),
			},
		});

		const desktopWorkspace = screen.getByRole('complementary', { name: /document workspace/i });
		expect(within(desktopWorkspace).getByText('Version History')).toBeInTheDocument();
		expect(within(desktopWorkspace).getByText('Brief • v2')).toBeInTheDocument();
		expect(within(desktopWorkspace).getByText('Historical')).toBeInTheDocument();
		expect(within(desktopWorkspace).getByText('Latest')).toBeInTheDocument();
		expect(within(desktopWorkspace).getByText('Current')).toBeInTheDocument();

		await fireEvent.click(within(desktopWorkspace).getByRole('button', { name: /v1/i }));

		expect(onSelectDocument).toHaveBeenCalledWith('doc-v1');
		expect(onOpenDocument).not.toHaveBeenCalled();
	});

	it('opens a related family version that is not already tabbed', async () => {
		const onSelectDocument = vi.fn();
		const onOpenDocument = vi.fn();

		render(DocumentWorkspace, {
			props: {
				open: true,
				documents: [
					{
						id: 'doc-v2',
						source: 'knowledge_artifact',
						filename: 'brief-v2.pdf',
						title: 'Client Brief',
						documentFamilyId: 'family-brief',
						documentLabel: 'Client Brief',
						documentRole: 'brief',
						versionNumber: 2,
						mimeType: 'application/pdf',
						artifactId: null,
					},
				],
				availableDocuments: [
					{
						id: 'doc-v3',
						source: 'knowledge_artifact',
						filename: 'brief-v3.pdf',
						title: 'Client Brief',
						documentFamilyId: 'family-brief',
						documentLabel: 'Client Brief',
						documentRole: 'brief',
						versionNumber: 3,
						mimeType: 'application/pdf',
						artifactId: 'artifact-v3',
					},
				],
				activeDocumentId: 'doc-v2',
				onSelectDocument,
				onOpenDocument,
				onCloseDocument: vi.fn(),
				onCloseWorkspace: vi.fn(),
			},
		});

		const desktopWorkspace = screen.getByRole('complementary', { name: /document workspace/i });
		await fireEvent.click(within(desktopWorkspace).getByRole('button', { name: /v3/i }));

		expect(onOpenDocument).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'doc-v3',
				documentFamilyId: 'family-brief',
				versionNumber: 3,
			})
		);
		expect(onSelectDocument).not.toHaveBeenCalled();
	});

	it('renders a source-message action for documents with origin metadata', async () => {
		const onJumpToSource = vi.fn();

		render(DocumentWorkspace, {
			props: {
				open: true,
				documents: [
					{
						id: 'doc-v2',
						source: 'knowledge_artifact',
						filename: 'brief-v2.pdf',
						title: 'Client Brief',
						documentFamilyId: 'family-brief',
						documentLabel: 'Client Brief',
						documentRole: 'brief',
						versionNumber: 2,
						originConversationId: 'conv-1',
						originAssistantMessageId: 'assistant-1',
						mimeType: 'application/pdf',
						artifactId: null,
					},
				],
				availableDocuments: [],
				activeDocumentId: 'doc-v2',
				onSelectDocument: vi.fn(),
				onOpenDocument: vi.fn(),
				onJumpToSource,
				onCloseDocument: vi.fn(),
				onCloseWorkspace: vi.fn(),
			},
		});

		const desktopWorkspace = screen.getByRole('complementary', { name: /document workspace/i });
		await fireEvent.click(
			within(desktopWorkspace).getByRole('button', { name: /view source message/i })
		);

		expect(onJumpToSource).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'doc-v2',
				originConversationId: 'conv-1',
				originAssistantMessageId: 'assistant-1',
			})
		);
	});

	it('renders compare mode for text family documents and loads both versions', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: string | URL | Request) => {
			const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
			if (url.includes('artifact-v2')) {
				return {
					ok: true,
					text: () => Promise.resolve('Title\nCurrent draft\nShared ending'),
				};
			}
			if (url.includes('artifact-v1')) {
				return {
					ok: true,
					text: () => Promise.resolve('Title\nPrevious draft\nShared ending'),
				};
			}

			throw new Error(`Unexpected fetch: ${url}`);
		});

		render(DocumentWorkspace, {
			props: {
				open: true,
				documents: [
					{
						id: 'doc-v2',
						source: 'knowledge_artifact',
						filename: 'brief-v2.md',
						title: 'Client Brief',
						documentFamilyId: 'family-brief',
						documentLabel: 'Client Brief',
						documentRole: 'brief',
						versionNumber: 2,
						mimeType: 'text/markdown',
						artifactId: 'artifact-v2',
					},
				],
				availableDocuments: [
					{
						id: 'doc-v1',
						source: 'knowledge_artifact',
						filename: 'brief-v1.md',
						title: 'Client Brief',
						documentFamilyId: 'family-brief',
						documentLabel: 'Client Brief',
						documentRole: 'brief',
						versionNumber: 1,
						mimeType: 'text/markdown',
						artifactId: 'artifact-v1',
					},
				],
				activeDocumentId: 'doc-v2',
				onSelectDocument: vi.fn(),
				onOpenDocument: vi.fn(),
				onCloseDocument: vi.fn(),
				onCloseWorkspace: vi.fn(),
			},
		});

		const desktopWorkspace = screen.getByRole('complementary', { name: /document workspace/i });
		await fireEvent.click(
			within(desktopWorkspace).getByRole('button', { name: /compare versions/i })
		);

		await waitFor(() => {
			expect(within(desktopWorkspace).getByText('Compare Versions')).toBeInTheDocument();
			expect(
				within(desktopWorkspace).getByText(/1 changed.*0 added.*0 removed/i)
			).toBeInTheDocument();
			expect(within(desktopWorkspace).getAllByText('Current').length).toBeGreaterThan(0);
			expect(within(desktopWorkspace).getByText('Compared')).toBeInTheDocument();
		});

		expect(global.fetch).toHaveBeenCalledWith('/api/knowledge/artifact-v2/preview');
		expect(global.fetch).toHaveBeenCalledWith('/api/knowledge/artifact-v1/preview');
	});
});
