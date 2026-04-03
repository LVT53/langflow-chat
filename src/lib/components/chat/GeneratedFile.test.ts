import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import GeneratedFile from './GeneratedFile.svelte';

const baseProps = {
	fileId: 'file-123',
	conversationId: 'conv-1',
	filename: 'report.pdf',
	size: 1024 * 1024,
	mimeType: 'application/pdf',
	downloadUrl: '/api/chat/files/file-123/download',
	status: 'success' as const,
};

type GeneratedFileTestProps = {
	fileId?: string;
	conversationId?: string;
	filename?: string;
	size?: number;
	mimeType?: string;
	downloadUrl?: string;
	status?: 'generating' | 'success' | 'failed';
	error?: string;
	savedVaultName?: string | null;
	vaults?: Array<{ id: string; name: string; color: string | null }>;
};

function renderGeneratedFile(props: GeneratedFileTestProps = {}) {
	return render(GeneratedFile, {
		props: {
			...baseProps,
			...props,
		},
	});
}

describe('GeneratedFile', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	it('renders the file card with download and save actions', () => {
		const { getByText, getByLabelText } = renderGeneratedFile();

		expect(getByText('report.pdf')).toBeInTheDocument();
		expect(getByText('1.0 MB')).toBeInTheDocument();
		expect(getByLabelText('Download report.pdf')).toBeInTheDocument();
		expect(getByLabelText('Save report.pdf to vault')).toBeInTheDocument();
	});

	it('shows a failed state with the provided error', () => {
		const { getByText, queryByLabelText } = renderGeneratedFile({
			filename: 'failed.docx',
			size: 0,
			mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			downloadUrl: '',
			status: 'failed',
			error: 'File generation failed due to timeout',
		});

		expect(getByText('failed.docx')).toBeInTheDocument();
		expect(getByText('File generation failed due to timeout')).toBeInTheDocument();
		expect(queryByLabelText('Download failed.docx')).toBeNull();
	});

	it('shows a spinner while generating', () => {
		const { getByText, getByTestId, queryByLabelText } = renderGeneratedFile({
			filename: 'generating.xlsx',
			size: 0,
			mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			downloadUrl: '',
			status: 'generating',
		});

		expect(getByText('generating.xlsx')).toBeInTheDocument();
		expect(getByTestId('generating-spinner')).toBeInTheDocument();
		expect(getByTestId('generating-progress')).toBeInTheDocument();
		expect(getByText('Generating...')).toBeInTheDocument();
		expect(queryByLabelText('Download generating.xlsx')).toBeNull();
	});

	it('formats small files in bytes', () => {
		const { getByText } = renderGeneratedFile({
			filename: 'small.txt',
			size: 512,
			mimeType: 'text/plain',
			downloadUrl: '/api/chat/files/file-111/download',
		});

		expect(getByText('512 B')).toBeInTheDocument();
	});

	it('does not render the old placeholder preview action', () => {
		const { queryByLabelText } = renderGeneratedFile({
			filename: 'image.png',
			mimeType: 'image/png',
			downloadUrl: '/api/chat/files/file-444/download',
		});

		expect(queryByLabelText('Preview image.png')).toBeNull();
	});

	it('loads vaults on demand and opens the picker', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					vaults: [
						{
							id: 'vault-1',
							userId: 'user-1',
							name: 'Reports',
							color: '#0f766e',
							sortOrder: 0,
							createdAt: 0,
							updatedAt: 0,
						},
					],
				}),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}
			)
		);

		renderGeneratedFile({
			filename: 'document.docx',
			mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			downloadUrl: '/api/chat/files/file-555/download',
		});

		await fireEvent.click(screen.getByLabelText('Save document.docx to vault'));

		await waitFor(() => {
			expect(screen.getByTestId('vault-picker-modal')).toBeInTheDocument();
			expect(screen.getByText('Reports')).toBeInTheDocument();
		});

		expect(global.fetch).toHaveBeenCalledWith('/api/knowledge/vaults');
	});

	it('submits the save-to-vault request and shows saved status', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					artifactId: 'artifact-1',
					vaultId: 'vault-1',
					vaultName: 'Reports',
					filename: 'report.pdf',
				}),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}
			)
		);

		renderGeneratedFile({
			vaults: [{ id: 'vault-1', name: 'Reports', color: '#0f766e' }],
		});

		await fireEvent.click(screen.getByLabelText('Save report.pdf to vault'));
		await fireEvent.click(screen.getByText('Reports'));
		await fireEvent.click(screen.getByTestId('vault-picker-save'));

		await waitFor(() => {
			expect(screen.getByText('Saved to Vault: Reports')).toBeInTheDocument();
		});

		expect(global.fetch).toHaveBeenCalledWith('/api/chat/files/file-123/save-to-vault', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ conversationId: 'conv-1', vaultId: 'vault-1' }),
		});
	});

	it('preserves the download URL on the anchor', () => {
		renderGeneratedFile({
			filename: 'downloadable.zip',
			mimeType: 'application/zip',
			downloadUrl: '/api/chat/files/file-abc/download',
		});

		const downloadLink = screen.getByLabelText('Download downloadable.zip') as HTMLAnchorElement;
		expect(downloadLink.href).toContain('/api/chat/files/file-abc/download');
	});

	it('falls back to the default failed message when none is provided', () => {
		renderGeneratedFile({
			filename: 'failed.txt',
			size: 0,
			mimeType: 'text/plain',
			downloadUrl: '',
			status: 'failed',
		});

		expect(screen.getByText('File generation failed')).toBeInTheDocument();
	});
});
