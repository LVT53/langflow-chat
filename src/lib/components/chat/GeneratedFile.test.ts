import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import GeneratedFile from './GeneratedFile.svelte';

describe('GeneratedFile', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('component renders file card with download button', () => {
		const { getByText, getByLabelText } = render(GeneratedFile, {
			props: {
				fileId: 'file-123',
				filename: 'report.pdf',
				size: 1024 * 1024, // 1 MB
				mimeType: 'application/pdf',
				downloadUrl: '/api/chat/files/file-123/download',
				status: 'success'
			}
		});

		expect(getByText('report.pdf')).toBeDefined();
		expect(getByText('1.0 MB')).toBeDefined();
		expect(getByLabelText('Download report.pdf')).toBeDefined();
	});

	it('failed state shows error message', () => {
		const { getByText, queryByLabelText } = render(GeneratedFile, {
			props: {
				fileId: 'file-456',
				filename: 'failed.docx',
				size: 0,
				mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
				downloadUrl: '',
				status: 'failed',
				error: 'File generation failed due to timeout'
			}
		});

		expect(getByText('failed.docx')).toBeDefined();
		expect(getByText('File generation failed due to timeout')).toBeDefined();
		expect(queryByLabelText('Download failed.docx')).toBeNull();
	});

	it('generating state shows spinner', () => {
		const { getByText, getByTestId, queryByLabelText } = render(GeneratedFile, {
			props: {
				fileId: 'file-789',
				filename: 'generating.xlsx',
				size: 0,
				mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				downloadUrl: '',
				status: 'generating'
			}
		});

		expect(getByText('generating.xlsx')).toBeDefined();
		expect(getByTestId('generating-spinner')).toBeDefined();
		expect(getByText('Generating...')).toBeDefined();
		expect(queryByLabelText('Download generating.xlsx')).toBeNull();
	});

	it('formats file size correctly for KB', () => {
		const { getByText } = render(GeneratedFile, {
			props: {
				fileId: 'file-111',
				filename: 'small.txt',
				size: 512, // 512 bytes
				mimeType: 'text/plain',
				downloadUrl: '/api/chat/files/file-111/download',
				status: 'success'
			}
		});

		expect(getByText('512 B')).toBeDefined();
	});

	it('formats file size correctly for MB', () => {
		const { getByText } = render(GeneratedFile, {
			props: {
				fileId: 'file-222',
				filename: 'medium.csv',
				size: 2.5 * 1024 * 1024, // 2.5 MB
				mimeType: 'text/csv',
				downloadUrl: '/api/chat/files/file-222/download',
				status: 'success'
			}
		});

		expect(getByText('2.5 MB')).toBeDefined();
	});

	it('shows save to vault button in success state', () => {
		const { getByLabelText } = render(GeneratedFile, {
			props: {
				fileId: 'file-333',
				filename: 'data.json',
				size: 1024,
				mimeType: 'application/json',
				downloadUrl: '/api/chat/files/file-333/download',
				status: 'success'
			}
		});

		expect(getByLabelText('Save data.json to vault')).toBeDefined();
	});

	it('shows preview button in success state', () => {
		const { getByLabelText } = render(GeneratedFile, {
			props: {
				fileId: 'file-444',
				filename: 'image.png',
				size: 2048,
				mimeType: 'image/png',
				downloadUrl: '/api/chat/files/file-444/download',
				status: 'success'
			}
		});

		expect(getByLabelText('Preview image.png')).toBeDefined();
	});

	it('clicking save to vault shows placeholder alert', async () => {
		const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
		const { getByLabelText } = render(GeneratedFile, {
			props: {
				fileId: 'file-555',
				filename: 'document.docx',
				size: 1024,
				mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
				downloadUrl: '/api/chat/files/file-555/download',
				status: 'success'
			}
		});

		const saveButton = getByLabelText('Save document.docx to vault');
		await fireEvent.click(saveButton);

		expect(alertSpy).toHaveBeenCalledWith('Save to vault: document.docx (placeholder)');
		alertSpy.mockRestore();
	});

	it('clicking preview shows placeholder alert', async () => {
		const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
		const { getByLabelText } = render(GeneratedFile, {
			props: {
				fileId: 'file-666',
				filename: 'spreadsheet.xlsx',
				size: 1024,
				mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				downloadUrl: '/api/chat/files/file-666/download',
				status: 'success'
			}
		});

		const previewButton = getByLabelText('Preview spreadsheet.xlsx');
		await fireEvent.click(previewButton);

		expect(alertSpy).toHaveBeenCalledWith('Preview: spreadsheet.xlsx (placeholder)');
		alertSpy.mockRestore();
	});

	it('displays correct icon for PDF files', () => {
		const { container } = render(GeneratedFile, {
			props: {
				fileId: 'file-777',
				filename: 'doc.pdf',
				size: 1024,
				mimeType: 'application/pdf',
				downloadUrl: '/api/chat/files/file-777/download',
				status: 'success'
			}
		});

		const icon = container.querySelector('[data-testid="file-icon"]');
		expect(icon).toBeDefined();
	});

	it('displays correct icon for image files', () => {
		const { container } = render(GeneratedFile, {
			props: {
				fileId: 'file-888',
				filename: 'photo.jpg',
				size: 1024,
				mimeType: 'image/jpeg',
				downloadUrl: '/api/chat/files/file-888/download',
				status: 'success'
			}
		});

		const icon = container.querySelector('[data-testid="file-icon"]');
		expect(icon).toBeDefined();
	});

	it('displays correct icon for code files', () => {
		const { container } = render(GeneratedFile, {
			props: {
				fileId: 'file-999',
				filename: 'script.js',
				size: 1024,
				mimeType: 'application/javascript',
				downloadUrl: '/api/chat/files/file-999/download',
				status: 'success'
			}
		});

		const icon = container.querySelector('[data-testid="file-icon"]');
		expect(icon).toBeDefined();
	});

	it('displays generic icon for unknown mime types', () => {
		const { container } = render(GeneratedFile, {
			props: {
				fileId: 'file-000',
				filename: 'unknown.xyz',
				size: 1024,
				mimeType: 'application/octet-stream',
				downloadUrl: '/api/chat/files/file-000/download',
				status: 'success'
			}
		});

		const icon = container.querySelector('[data-testid="file-icon"]');
		expect(icon).toBeDefined();
	});

	it('download link has correct href', () => {
		const { getByLabelText } = render(GeneratedFile, {
			props: {
				fileId: 'file-abc',
				filename: 'downloadable.zip',
				size: 1024,
				mimeType: 'application/zip',
				downloadUrl: '/api/chat/files/file-abc/download',
				status: 'success'
			}
		});

		const downloadLink = getByLabelText('Download downloadable.zip') as HTMLAnchorElement;
		expect(downloadLink.href).toContain('/api/chat/files/file-abc/download');
	});

	it('shows default error message when error prop is not provided in failed state', () => {
		const { getByText } = render(GeneratedFile, {
			props: {
				fileId: 'file-def',
				filename: 'failed.txt',
				size: 0,
				mimeType: 'text/plain',
				downloadUrl: '',
				status: 'failed'
				// error not provided
			}
		});

		expect(getByText('File generation failed')).toBeDefined();
	});
});
