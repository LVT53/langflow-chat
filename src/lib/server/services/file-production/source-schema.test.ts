import { describe, expect, it } from 'vitest';
import {
	buildGeneratedDocumentProjection,
	validateGeneratedDocumentSource,
} from './source-schema';

describe('generated document source schema', () => {
	it('accepts semantic v1 blocks and creates a deterministic projection', () => {
		const result = validateGeneratedDocumentSource({
			title: 'Quarterly report',
			subtitle: 'Executive summary',
			blocks: [
				{ type: 'heading', level: 2, text: 'Revenue' },
				{ type: 'paragraph', text: 'Revenue increased by 12%.' },
				{ type: 'list', style: 'bullet', items: ['EMEA grew fastest', 'Churn improved'] },
				{ type: 'callout', tone: 'note', title: 'Readout', text: 'Numbers are preliminary.' },
			],
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.source).toMatchObject({
			version: 1,
			template: 'alfyai_standard_report',
			title: 'Quarterly report',
		});
		expect(buildGeneratedDocumentProjection(result.source)).toBe(
			[
				'Quarterly report',
				'Executive summary',
				'',
				'## Revenue',
				'Revenue increased by 12%.',
				'- EMEA grew fastest',
				'- Churn improved',
				'Note: Readout',
				'Numbers are preliminary.',
			].join('\n')
		);
	});

	it('rejects raw HTML blocks instead of preserving arbitrary markup', () => {
		const result = validateGeneratedDocumentSource({
			title: 'Unsafe report',
			blocks: [{ type: 'rawHtml', html: '<script>alert(1)</script>' }],
		});

		expect(result).toMatchObject({
			ok: false,
			code: 'unsupported_document_block',
		});
	});

	it('requires chart title, caption, units, and alt text for accessible chart blocks', () => {
		const result = validateGeneratedDocumentSource({
			title: 'Incomplete chart report',
			blocks: [
				{
					type: 'chart',
					chartType: 'line',
					xKey: 'week',
					yKey: 'users',
					data: [{ week: '2026-W01', users: 1200 }],
				},
			],
		});

		expect(result).toMatchObject({
			ok: false,
			code: 'unsupported_chart_data',
		});
	});
});
