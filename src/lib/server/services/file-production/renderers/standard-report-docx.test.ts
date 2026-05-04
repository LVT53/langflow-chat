import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { validateGeneratedDocumentSource } from '../source-schema';
import { renderStandardReportDocx } from './standard-report-docx';

describe('AlfyAI Standard Report DOCX renderer', () => {
	it('renders the same source model into a valid DOCX package', async () => {
		const validation = validateGeneratedDocumentSource({
			version: 1,
			template: 'alfyai_standard_report',
			title: 'DOCX report',
			blocks: [
				{ type: 'heading', level: 2, text: 'Summary' },
				{ type: 'paragraph', text: 'Revenue increased by 12%.' },
				{
					type: 'table',
					title: 'Small table',
					columns: [{ key: 'region', label: 'Region', kind: 'text' }],
					rows: [{ region: 'Central Europe' }],
				},
			],
		});
		expect(validation.ok).toBe(true);
		if (!validation.ok) return;

		const rendered = await renderStandardReportDocx(validation.source);
		const zip = await JSZip.loadAsync(rendered.content);
		const documentXml = await zip.file('word/document.xml')?.async('string');

		expect(rendered.filename).toBe('docx-report.docx');
		expect(rendered.mimeType).toBe(
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
		);
		expect(rendered.content.subarray(0, 2).toString('ascii')).toBe('PK');
		expect(documentXml).toContain('DOCX report');
		expect(documentXml).toContain('Revenue increased by 12%.');
		expect(documentXml).toContain('Central Europe');
	});
});
