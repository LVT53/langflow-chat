import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import FilePreview from './FilePreview.svelte';

vi.mock('mammoth', () => ({
	convertToHtml: vi.fn().mockResolvedValue({ value: '<p>Mock DOCX content</p>' }),
}));

vi.mock('exceljs', () => ({
	Workbook: class MockWorkbook {
		SheetNames = ['Sheet1'];
		Sheets = { Sheet1: {} };
		xlsx = {
			load: vi.fn().mockResolvedValue(undefined),
		};
		eachSheet(callback: (worksheet: MockWorksheet, sheetId: number) => void) {
			callback(
				{
					name: 'Sheet1',
					eachRow: (cb: (row: { eachCell: (cb2: (cell: { value: unknown }) => void) => void }) => void) => {
						cb({
							eachCell: (cellCb: (cell: { value: unknown }) => void) => {
								cellCb({ value: 'Header1' });
								cellCb({ value: 'Header2' });
							},
						});
						cb({
							eachCell: (cellCb: (cell: { value: unknown }) => void) => {
								cellCb({ value: 'Value1' });
								cellCb({ value: 'Value2' });
							},
						});
					},
				},
				1
			);
		}
	},
}));

vi.mock('pdfjs-dist', () => ({
	GlobalWorkerOptions: {
		workerSrc: '',
	},
	getDocument: vi.fn(() => ({
		promise: Promise.resolve({
			numPages: 1,
			getPage: vi.fn(async () => ({
				getViewport: vi.fn(({ scale }: { scale: number }) => ({
					width: 640 * scale,
					height: 480 * scale,
				})),
				render: vi.fn(() => ({
					promise: Promise.resolve(),
				})),
			})),
		}),
	})),
}));

interface MockWorksheet {
	name: string;
	eachRow: (callback: (row: { eachCell: (cb: (cell: { value: unknown }) => void) => void }) => void) => void;
}

describe('FilePreview', () => {
	const mockOnClose = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	it('renders nothing when closed', () => {
		const { container } = render(FilePreview, {
			props: {
				open: false,
				artifactId: 'test-123',
				filename: 'test.pdf',
				mimeType: 'application/pdf',
				onClose: mockOnClose,
			},
		});

		expect(container.innerHTML.trim()).toBe('<!---->');
	});

	it('shows loading state when opening', () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));

		render(FilePreview, {
			props: {
				open: true,
				artifactId: 'test-123',
				filename: 'test.pdf',
				mimeType: 'application/pdf',
				onClose: mockOnClose,
			},
		});

		expect(screen.getByText('Loading preview...')).toBeInTheDocument();
		expect(document.querySelector('.spinner')).toBeInTheDocument();
	});

	it('shows error state when file not found', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: false,
			status: 404,
		});

		render(FilePreview, {
			props: {
				open: true,
				artifactId: 'test-123',
				filename: 'test.pdf',
				mimeType: 'application/pdf',
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(screen.getByText('File not found')).toBeInTheDocument();
		});
	});

	it('shows error state on fetch failure', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

		render(FilePreview, {
			props: {
				open: true,
				artifactId: 'test-123',
				filename: 'test.pdf',
				mimeType: 'application/pdf',
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(screen.getByText('Network error')).toBeInTheDocument();
		});
	});

	it('closes on backdrop click', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));

		render(FilePreview, {
			props: {
				open: true,
				artifactId: 'test-123',
				filename: 'test.pdf',
				mimeType: 'application/pdf',
				onClose: mockOnClose,
			},
		});

		const backdrop = screen.getByRole('presentation');
		await fireEvent.click(backdrop);

		expect(mockOnClose).toHaveBeenCalled();
	});

	it('closes on close button click', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));

		render(FilePreview, {
			props: {
				open: true,
				artifactId: 'test-123',
				filename: 'test.pdf',
				mimeType: 'application/pdf',
				onClose: mockOnClose,
			},
		});

		const closeButton = screen.getByLabelText('Close file preview');
		await fireEvent.click(closeButton);

		expect(mockOnClose).toHaveBeenCalled();
	});

	it('shows unsupported message for unknown file types', async () => {
		const mockBlob = new Blob(['content'], { type: 'application/octet-stream' });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(FilePreview, {
			props: {
				open: true,
				artifactId: 'test-123',
				filename: 'test.unknown',
				mimeType: 'application/octet-stream',
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(screen.getByText('Preview not available for this file type')).toBeInTheDocument();
		});
	});

	it('displays filename in header', () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));

		render(FilePreview, {
			props: {
				open: true,
				artifactId: 'test-123',
				filename: 'document.pdf',
				mimeType: 'application/pdf',
				onClose: mockOnClose,
			},
		});

		expect(screen.getByText('document.pdf')).toBeInTheDocument();
		expect(screen.getByText('File Preview')).toBeInTheDocument();
	});

	it('shows download button when content is loaded', async () => {
		const mockBlob = new Blob(['PDF content'], { type: 'application/pdf' });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(FilePreview, {
			props: {
				open: true,
				artifactId: 'test-123',
				filename: 'test.pdf',
				mimeType: 'application/pdf',
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(screen.getByText('Download')).toBeInTheDocument();
		});
	});

	it('detects PDF file type correctly', async () => {
		const mockBlob = new Blob(['PDF content'], { type: 'application/pdf' });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(FilePreview, {
			props: {
				open: true,
				artifactId: 'test-123',
				filename: 'document.pdf',
				mimeType: 'application/pdf',
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			const canvas = document.querySelector('canvas');
			expect(canvas).toBeInTheDocument();
			expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
		});
	});

	it('detects image file type correctly', async () => {
		const mockBlob = new Blob(['image data'], { type: 'image/png' });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(FilePreview, {
			props: {
				open: true,
				artifactId: 'test-123',
				filename: 'image.png',
				mimeType: 'image/png',
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			const img = document.querySelector('img');
			expect(img).toBeInTheDocument();
		});
	});

	it('detects DOCX file type correctly', async () => {
		const mockBlob = new Blob(['docx content'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(FilePreview, {
			props: {
				open: true,
				artifactId: 'test-123',
				filename: 'document.docx',
				mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(screen.getByText('Mock DOCX content')).toBeInTheDocument();
		});
	});

	it('detects XLSX file type correctly', async () => {
		const mockBlob = new Blob(['xlsx content'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(FilePreview, {
			props: {
				open: true,
				artifactId: 'test-123',
				filename: 'spreadsheet.xlsx',
				mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			const table = document.querySelector('.xlsx-table');
			expect(table).toBeInTheDocument();
		});
	});

	it('treats XML as text preview content', async () => {
		const mockBlob = new Blob(['<root><item>Hello</item></root>'], { type: 'application/xml' });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(FilePreview, {
			props: {
				open: true,
				artifactId: 'test-xml',
				filename: 'data.xml',
				mimeType: 'application/xml',
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(screen.getByText('<root><item>Hello</item></root>')).toBeInTheDocument();
		});
	});

	it('treats RTF as text preview content', async () => {
		const mockBlob = new Blob(['{\\rtf1\\ansi Hello world}'], { type: 'application/rtf' });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(FilePreview, {
			props: {
				open: true,
				artifactId: 'test-rtf',
				filename: 'document.rtf',
				mimeType: 'application/rtf',
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(screen.getByText('{\\rtf1\\ansi Hello world}')).toBeInTheDocument();
		});
	});

	it('shows retry button on error', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

		render(FilePreview, {
			props: {
				open: true,
				artifactId: 'test-123',
				filename: 'test.pdf',
				mimeType: 'application/pdf',
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(screen.getByText('Retry')).toBeInTheDocument();
		});
	});

	it('closes on Escape key', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));

		render(FilePreview, {
			props: {
				open: true,
				artifactId: 'test-123',
				filename: 'test.pdf',
				mimeType: 'application/pdf',
				onClose: mockOnClose,
			},
		});

		await fireEvent.keyDown(window, { key: 'Escape' });

		expect(mockOnClose).toHaveBeenCalled();
	});
});
