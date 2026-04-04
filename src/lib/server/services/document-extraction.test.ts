import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmod, mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('document extraction', () => {
	let previousPath = process.env.PATH ?? '';
	let tempDir: string | null = null;

	beforeEach(() => {
		vi.resetModules();
		previousPath = process.env.PATH ?? '';
		tempDir = null;
	});

	afterEach(async () => {
		process.env.PATH = previousPath;
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it('returns null instead of throwing when no external extractor exists', async () => {
		process.env.PATH = '';

		const { extractDocumentText, resetDocumentExtractionExecutableCache } = await import('./document-extraction');
		resetDocumentExtractionExecutableCache();

		const result = await extractDocumentText(
			'/tmp/portfolio.docx',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'portfolio.docx'
		);

		expect(result).toEqual({
			text: null,
			normalizedName: 'portfolio.txt',
			mimeType: 'text/plain',
		});
	});

	it('falls back to strings when office extraction is unavailable', async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'doc-extract-'));
		const stringsPath = join(tempDir, 'strings');
		await writeFile(stringsPath, '#!/bin/sh\necho "Recovered spreadsheet text"\n', 'utf8');
		await chmod(stringsPath, 0o755);

		process.env.PATH = tempDir;

		const { extractDocumentText, resetDocumentExtractionExecutableCache } = await import('./document-extraction');
		resetDocumentExtractionExecutableCache();

		const result = await extractDocumentText(
			'/tmp/financial-model.xlsx',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'financial-model.xlsx'
		);

		expect(result).toEqual({
			text: 'Recovered spreadsheet text',
			normalizedName: 'financial-model.txt',
			mimeType: 'text/plain',
		});
	});

	it('extracts html without requiring platform-specific binaries', async () => {
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
	});

	it('treats SVG files as text-extractable content', async () => {
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
	});

	it('extracts ODT text through the OpenDocument content.xml payload', async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'doc-extract-odt-'));
		const unzipPath = join(tempDir, 'unzip');
		await writeFile(
			unzipPath,
			`#!/bin/sh
if [ "$1" = "-Z1" ]; then
  echo "content.xml"
  exit 0
fi
if [ "$1" = "-p" ] && [ "$3" = "content.xml" ]; then
  echo '<office:document-content><office:body><office:text><text:p>Hello from ODT</text:p></office:text></office:body></office:document-content>'
  exit 0
fi
exit 1
`,
			'utf8'
		);
		await chmod(unzipPath, 0o755);

		process.env.PATH = tempDir;

		const { extractDocumentText, resetDocumentExtractionExecutableCache } = await import('./document-extraction');
		resetDocumentExtractionExecutableCache();

		const result = await extractDocumentText(
			'/tmp/generated.odt',
			'application/vnd.oasis.opendocument.text',
			'generated.odt'
		);

		expect(result).toEqual({
			text: 'Hello from ODT',
			normalizedName: 'generated.txt',
			mimeType: 'text/plain',
		});
	});
});
