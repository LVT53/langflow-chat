import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import DocumentWorkspace from './DocumentWorkspace.svelte';

describe('DocumentWorkspace', () => {
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
});
