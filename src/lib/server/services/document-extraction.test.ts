import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockParserParse = vi.fn();

class MockLiteParse {
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
		expect(mockParserParse).toHaveBeenCalledWith('/tmp/financial-model.xlsx');
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
});
