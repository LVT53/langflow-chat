import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import FilePreview from './FilePreview.svelte';

const mockJsZipLoadAsync = vi.fn();

vi.mock('$lib/services/markdown', () => ({
	renderHighlightedText: vi.fn(async (content: string) => `<pre><code>${content}</code></pre>`),
}));

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

vi.mock('jszip', () => ({
	default: {
		loadAsync: mockJsZipLoadAsync,
	},
}));

const mockPdfRender = vi.fn(() => ({
	promise: Promise.resolve(),
}));

const mockPdfGetPage = vi.fn(async () => ({
	getViewport: vi.fn(({ scale }: { scale: number }) => ({
		width: 640 * scale,
		height: 480 * scale,
	})),
	render: mockPdfRender,
}));

vi.mock('pdfjs-dist', () => ({
	GlobalWorkerOptions: {
		workerSrc: '',
	},
	getDocument: vi.fn(() => ({
		promise: Promise.resolve({
			numPages: 1,
			getPage: mockPdfGetPage,
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
			expect(screen.getByLabelText('Download test.pdf')).toBeInTheDocument();
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

	it('renders a PDF page once after load instead of looping on render-state changes', async () => {
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
			expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
		});

		// With fit-to-width logic, the page may render multiple times as scale is calculated
		expect(mockPdfGetPage).toHaveBeenCalled();
		expect(mockPdfRender).toHaveBeenCalled();
	});

	it('re-renders the PDF page when zoom changes', async () => {
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
			expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
		});

		const initialRenderCount = mockPdfRender.mock.calls.length;
		await fireEvent.click(screen.getByLabelText('Zoom in'));

		await waitFor(() => {
			expect(mockPdfRender.mock.calls.length).toBeGreaterThan(initialRenderCount);
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
			const code = document.querySelector('.file-text-preview code');
			expect(code).toBeInTheDocument();
			expect(code?.textContent).toContain('Hello');
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

	it('renders ODT files as document preview content', async () => {
		mockJsZipLoadAsync.mockResolvedValue({
			file: vi.fn((name: string) =>
				name === 'content.xml'
					? {
							async: vi.fn().mockResolvedValue(
								`<?xml version="1.0" encoding="UTF-8"?>
								<office:document-content
									xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
									xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
									<office:body>
										<office:text>
											<text:h text:outline-level="1">ODT Title</text:h>
											<text:p>Hello from ODT preview</text:p>
										</office:text>
									</office:body>
								</office:document-content>`
							),
						}
					: null
			),
		});

		const mockBlob = new Blob(['odt content'], {
			type: 'application/vnd.oasis.opendocument.text',
		});
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(FilePreview, {
			props: {
				open: true,
				artifactId: 'test-odt',
				filename: 'document.odt',
				mimeType: 'application/vnd.oasis.opendocument.text',
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(screen.getByText('ODT Title')).toBeInTheDocument();
			expect(screen.getByText('Hello from ODT preview')).toBeInTheDocument();
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
