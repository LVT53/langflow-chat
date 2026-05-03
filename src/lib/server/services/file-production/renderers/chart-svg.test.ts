import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateGeneratedDocumentSource } from '../source-schema';
import { renderChartSvg } from './chart-svg';

function readChartBlock() {
	const fixture = JSON.parse(
		readFileSync(
			path.resolve('fixtures/file-production/standard-report/positive/chart-heavy-report.json'),
			'utf8'
		)
	) as { documentSource: unknown };
	const validation = validateGeneratedDocumentSource(fixture.documentSource);
	if (!validation.ok) {
		throw new Error(validation.code);
	}
	const chart = validation.source.blocks.find((block) => block.type === 'chart');
	if (!chart || chart.type !== 'chart') {
		throw new Error('Fixture chart block is missing.');
	}
	return chart;
}

describe('generated document chart SVG renderer', () => {
	it('renders deterministic accessible SVG for the first line-chart path', () => {
		const chart = readChartBlock();
		const first = renderChartSvg(chart);
		const second = renderChartSvg(chart);

		expect(first).toEqual(second);
		expect(first.svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
		expect(first.svg).toContain('role="img"');
		expect(first.svg).toContain('<title id="chart-title">Weekly active users</title>');
		expect(first.svg).toContain(
			'<desc id="chart-desc">Weekly active users rose from 1200 to 1630.</desc>'
		);
		expect(first.svg).toContain('<polyline');
		expect(first.svg).toContain('stroke="#B65F3D"');
		expect(first.svg).not.toContain('<script');
		expect(first.dataPointCount).toBe(3);
	});
});
