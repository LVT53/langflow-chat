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
});
