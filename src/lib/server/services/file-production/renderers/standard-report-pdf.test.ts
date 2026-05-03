import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
	validateGeneratedDocumentSource,
	type GeneratedDocumentSource,
} from '../source-schema';
import { renderStandardReportPdf } from './standard-report-pdf';

function readFixtureSource(filename: string): GeneratedDocumentSource {
	const fixture = JSON.parse(
		readFileSync(
			path.resolve('fixtures/file-production/standard-report/positive', filename),
			'utf8'
		)
	) as { documentSource: unknown };
	const validation = validateGeneratedDocumentSource(fixture.documentSource);
	if (!validation.ok) {
		throw new Error(`${filename} did not validate: ${validation.code}`);
	}
	return validation.source;
}

describe('AlfyAI Standard Report PDF renderer', () => {
	it('renders core fixture documents as styled A4 PDFs with stable metadata', async () => {
		for (const filename of [
			'hungarian-report.json',
			'long-report.json',
			'short-report.json',
			'technical-note.json',
		]) {
			const source = readFixtureSource(filename);
			const rendered = await renderStandardReportPdf(source);

			expect(rendered.filename.endsWith('.pdf')).toBe(true);
			expect(rendered.mimeType).toBe('application/pdf');
			expect(rendered.content.subarray(0, 4).toString('ascii')).toBe('%PDF');
			expect(rendered.diagnostics).toMatchObject({
				template: 'alfyai_standard_report',
				pageFormat: 'A4',
				bodyFontPt: 11,
				marginMm: { top: 18, right: 16, bottom: 18, left: 16 },
				colors: {
					text: '#1B1815',
					secondaryText: '#6F6860',
					accent: '#B65F3D',
					pageBackground: '#FAF8F4',
				},
			});

			const pdfDoc = await PDFDocument.load(new Uint8Array(rendered.content));
			expect(pdfDoc.getTitle()).toBe(source.title);
			expect(pdfDoc.getAuthor()).toBe('AlfyAI');
			expect(pdfDoc.getCreator()).toBe('AlfyAI file production');
			expect(pdfDoc.getPageCount()).toBeGreaterThanOrEqual(1);
			const firstPage = pdfDoc.getPage(0);
			expect(firstPage.getWidth()).toBeCloseTo(595.28, 1);
			expect(firstPage.getHeight()).toBeCloseTo(841.89, 1);
		}
	});

	it('supports dividers and optional cover pages without accepting raw drawing commands', async () => {
		const validation = validateGeneratedDocumentSource({
			title: 'Covered report',
			subtitle: 'Safe source only',
			cover: { enabled: true, eyebrow: 'Internal', dateLabel: 'May 2026' },
			blocks: [
				{ type: 'heading', level: 2, text: 'Summary' },
				{ type: 'paragraph', text: '<script>alert("not markup")</script>' },
				{ type: 'divider' },
				{ type: 'quote', text: 'All content is drawn as text.', citation: 'Renderer contract' },
			],
		});

		expect(validation.ok).toBe(true);
		if (!validation.ok) return;

		const rendered = await renderStandardReportPdf(validation.source);
		const pdfDoc = await PDFDocument.load(new Uint8Array(rendered.content));
		expect(pdfDoc.getPageCount()).toBeGreaterThanOrEqual(2);
		expect(rendered.diagnostics.coverPage).toBe(true);
		expect(rendered.diagnostics.blockTypes).toEqual(['heading', 'paragraph', 'divider', 'quote']);
	});
});
