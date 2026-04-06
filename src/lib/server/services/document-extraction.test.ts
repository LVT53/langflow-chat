import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockParserParse = vi.fn();
let lastLiteParseConfig: Record<string, unknown> | null = null;

class MockLiteParse {
	constructor(config?: Record<string, unknown>) {
		lastLiteParseConfig = config ?? null;
	}

	parse = mockParserParse;
}

vi.mock('@llamaindex/liteparse', () => ({
	LiteParse: MockLiteParse,
}));

const configStub = {
	documentParserOcrEnabled: true,
	documentParserOcrServerUrl: '',
	documentParserOcrLanguage: 'en',
	documentParserNumWorkers: 4,
	documentParserMaxPages: 1000,
	documentParserDpi: 150,
	documentParserTimeoutMs: 120000,
};

vi.mock('../config-store', () => ({
	getConfig: () => configStub,
}));

describe('document extraction', () => {
	let tempDir: string | null = null;

	beforeEach(() => {
		vi.clearAllMocks();
		tempDir = null;
		lastLiteParseConfig = null;
		configStub.documentParserOcrServerUrl = '';
	});

	afterEach(async () => {
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it('returns null instead of throwing when parser cannot extract document text', async () => {
		mockParserParse.mockRejectedValueOnce(new Error('boom'));

		const { extractDocumentText, resetDocumentExtractionExecutableCache } = await import('./document-extraction');
		resetDocumentExtractionExecutableCache();

		const result = await extractDocumentText(
			'/tmp/portfolio.docx',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'portfolio.docx',
		);

		expect(result).toEqual({
			text: null,
			normalizedName: 'portfolio.txt',
			mimeType: 'text/plain',
		});
	});

	it('uses liteparse for office extraction candidates', async () => {
		mockParserParse.mockResolvedValueOnce({ text: 'Recovered spreadsheet text' });

		const { extractDocumentText, resetDocumentExtractionExecutableCache } = await import('./document-extraction');
		resetDocumentExtractionExecutableCache();

		const result = await extractDocumentText(
			'/tmp/financial-model.xlsx',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'financial-model.xlsx',
		);

		expect(result).toEqual({
			text: 'Recovered spreadsheet text',
			normalizedName: 'financial-model.txt',
			mimeType: 'text/plain',
		});
		expect(lastLiteParseConfig?.ocrServerUrl).toBeUndefined();
		expect(lastLiteParseConfig?.ocrLanguage).toBe('eng');
		expect(mockParserParse).toHaveBeenCalledWith('/tmp/financial-model.xlsx');
	});

	it('passes configured OCR server URL to Liteparse when explicitly set', async () => {
		configStub.documentParserOcrServerUrl = 'http://127.0.0.1:3000/api/ocr/paddle';
		configStub.documentParserOcrLanguage = 'hu+en+nl';
		mockParserParse.mockResolvedValueOnce({ text: 'Remote OCR text' });

		const { extractDocumentText, resetDocumentExtractionExecutableCache } = await import('./document-extraction');
		resetDocumentExtractionExecutableCache();

		await extractDocumentText('/tmp/scan.pdf', 'application/pdf', 'scan.pdf');

		expect(lastLiteParseConfig?.ocrServerUrl).toBe('http://127.0.0.1:3000/api/ocr/paddle');
		expect(lastLiteParseConfig?.ocrLanguage).toBe('hu+en+nl');
	});

	it('uses Tesseract-friendly defaults when OCR language profile is empty', async () => {
		configStub.documentParserOcrLanguage = '';
		mockParserParse.mockResolvedValueOnce({ text: 'Recovered scan text' });

		const { extractDocumentText, resetDocumentExtractionExecutableCache } = await import('./document-extraction');
		resetDocumentExtractionExecutableCache();

		await extractDocumentText('/tmp/scan.pdf', 'application/pdf', 'scan.pdf');

		expect(lastLiteParseConfig?.ocrLanguage).toBe('hun+eng+nld');
	});

	it('extracts html without liteparse by stripping markup', async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'doc-extract-html-'));
		const htmlPath = join(tempDir, 'report.html');
		await writeFile(htmlPath, '<h1>Portfolio</h1><p>Strong growth</p>', 'utf8');

		const { extractDocumentText } = await import('./document-extraction');

		const result = await extractDocumentText(htmlPath, 'text/html', 'report.html');

		expect(result).toEqual({
			text: 'Portfolio Strong growth',
			normalizedName: 'report.txt',
			mimeType: 'text/plain',
		});
		expect(mockParserParse).not.toHaveBeenCalled();
	});

	it('treats SVG files as text-extractable content without liteparse', async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'doc-extract-svg-'));
		const svgPath = join(tempDir, 'diagram.svg');
		await writeFile(svgPath, '<svg><text>Hello Diagram</text></svg>', 'utf8');

		const { extractDocumentText } = await import('./document-extraction');

		const result = await extractDocumentText(svgPath, 'image/svg+xml', 'diagram.svg');

		expect(result).toEqual({
			text: '<svg><text>Hello Diagram</text></svg>',
			normalizedName: 'diagram.txt',
			mimeType: 'text/plain',
		});
		expect(mockParserParse).not.toHaveBeenCalled();
	});

	it('extracts ODT text through liteparse engine', async () => {
		mockParserParse.mockResolvedValueOnce({ text: 'Hello from ODT' });

		const { extractDocumentText, resetDocumentExtractionExecutableCache } = await import('./document-extraction');
		resetDocumentExtractionExecutableCache();

		const result = await extractDocumentText(
			'/tmp/generated.odt',
			'application/vnd.oasis.opendocument.text',
			'generated.odt',
		);

		expect(result).toEqual({
			text: 'Hello from ODT',
			normalizedName: 'generated.txt',
			mimeType: 'text/plain',
		});
		expect(mockParserParse).toHaveBeenCalledWith('/tmp/generated.odt');
	});

	it('treats HEIC files as liteparse OCR candidates', async () => {
		mockParserParse.mockResolvedValueOnce({ text: 'Recovered photo text' });

		const { extractDocumentText, resetDocumentExtractionExecutableCache } = await import('./document-extraction');
		resetDocumentExtractionExecutableCache();

		const result = await extractDocumentText('/tmp/photo.heic', 'image/heic', 'photo.heic');

		expect(result).toEqual({
			text: 'Recovered photo text',
			normalizedName: 'photo.txt',
			mimeType: 'text/plain',
		});
		expect(mockParserParse).toHaveBeenCalledWith('/tmp/photo.heic');
	});
});
