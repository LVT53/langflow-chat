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
	documentFamilyId?: string | null;
	documentLabel?: string | null;
	documentRole?: string | null;
	versionNumber?: number | null;
	originConversationId?: string | null;
	originAssistantMessageId?: string | null;
	sourceChatFileId?: string | null;
	filename?: string;
	size?: number;
	mimeType?: string;
	downloadUrl?: string;
	status?: 'generating' | 'success' | 'failed';
	error?: string;
	onOpen?: (document: unknown) => void;
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

	it('renders the file card with download action', () => {
		const { getByText, getByRole, getByLabelText, queryByText } = renderGeneratedFile();

		expect(getByText('report.pdf')).toBeInTheDocument();
		expect(getByText('1.0 MB')).toBeInTheDocument();
		expect(getByRole('button', { name: 'Preview report.pdf' })).toBeInTheDocument();
		expect(getByLabelText('Download report.pdf')).toBeInTheDocument();
		expect(queryByText('Preview')).toBeNull();
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

	it('opens the generated file preview fallback dialog when no workspace callback is provided', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
			new Response('preview text', {
				status: 200,
				headers: { 'Content-Type': 'text/plain' },
			})
		);

		renderGeneratedFile({
			filename: 'preview.txt',
			mimeType: 'text/plain',
			downloadUrl: '/api/chat/files/file-444/download',
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Preview preview.txt' }));

		await waitFor(() => {
			expect(screen.getByText('File Preview')).toBeInTheDocument();
			expect(screen.getByRole('dialog')).toBeInTheDocument();
			expect(screen.getByText('preview text')).toBeInTheDocument();
		});

		expect(global.fetch).toHaveBeenCalledWith('/api/chat/files/file-123/preview');
	});

	it('delegates preview opening to the workspace callback when provided', async () => {
		const onOpen = vi.fn();

		renderGeneratedFile({
			filename: 'workspace.txt',
			mimeType: 'text/plain',
			downloadUrl: '/api/chat/files/file-123/download',
			documentFamilyId: 'family-1',
			documentLabel: 'Client Brief',
			documentRole: 'proposal',
			versionNumber: 3,
			originConversationId: 'conv-origin',
			originAssistantMessageId: 'assistant-origin',
			sourceChatFileId: 'chat-file-origin',
			onOpen,
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Preview workspace.txt' }));

		expect(onOpen).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'file-123',
				source: 'chat_generated_file',
				filename: 'workspace.txt',
				title: 'Client Brief',
				documentFamilyId: 'family-1',
				documentLabel: 'Client Brief',
				documentRole: 'proposal',
				versionNumber: 3,
				originConversationId: 'conv-origin',
				originAssistantMessageId: 'assistant-origin',
				sourceChatFileId: 'chat-file-origin',
				previewUrl: '/api/chat/files/file-123/preview',
				downloadUrl: '/api/chat/files/file-123/download',
			})
		);
		expect(global.fetch).not.toHaveBeenCalled();
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
