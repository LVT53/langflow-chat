import type { GeneratedDocumentChartBlock } from '../source-schema';

const CHART_THEME = {
	text: '#1B1815',
	secondaryText: '#6F6860',
	accent: '#B65F3D',
	rule: '#DED6CB',
	panel: '#FAF8F4',
} as const;

export interface RenderedChartSvg {
	svg: string;
	width: number;
	height: number;
	dataPointCount: number;
	chartType: GeneratedDocumentChartBlock['chartType'];
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function numberValue(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function labelValue(value: unknown): string {
	return value === null || value === undefined ? '' : String(value);
}

function niceTicks(min: number, max: number): number[] {
	if (min === max) {
		return [min - 1, min, min + 1];
	}
	const span = max - min;
	const rawStep = span / 4;
	const magnitude = 10 ** Math.floor(Math.log10(rawStep));
	const normalized = rawStep / magnitude;
	const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
	const start = Math.floor(min / step) * step;
	const end = Math.ceil(max / step) * step;
	const ticks: number[] = [];
	for (let value = start; value <= end + step / 2; value += step) {
		ticks.push(Number(value.toFixed(6)));
	}
	return ticks;
}

export function renderChartSvg(
	chart: GeneratedDocumentChartBlock,
	options: { width?: number; height?: number } = {}
): RenderedChartSvg {
	if (chart.chartType !== 'line' && chart.chartType !== 'area') {
		throw new Error(`Chart SVG renderer does not yet support ${chart.chartType} charts.`);
	}
	if (!chart.xKey || !chart.yKey) {
		throw new Error('Line charts require xKey and yKey.');
	}

	const width = options.width ?? 640;
	const height = options.height ?? 360;
	const margin = { top: 54, right: 28, bottom: 54, left: 68 };
	const plotWidth = width - margin.left - margin.right;
	const plotHeight = height - margin.top - margin.bottom;
	const rows = chart.data
		.map((row) => ({
			label: labelValue(row[chart.xKey!]),
			value: numberValue(row[chart.yKey!]),
		}))
		.filter((row): row is { label: string; value: number } => row.value !== null);

	if (rows.length === 0) {
		throw new Error('Chart data has no numeric values.');
	}

	const values = rows.map((row) => row.value);
	const minValue = Math.min(0, ...values);
	const maxValue = Math.max(...values);
	const ticks = niceTicks(minValue, maxValue);
	const scaleY = (value: number) => {
		const tickMin = ticks[0];
		const tickMax = ticks[ticks.length - 1];
		return margin.top + plotHeight - ((value - tickMin) / (tickMax - tickMin || 1)) * plotHeight;
	};
	const scaleX = (index: number) =>
		margin.left + (rows.length === 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
	const points = rows
		.map((row, index) => `${scaleX(index).toFixed(1)},${scaleY(row.value).toFixed(1)}`)
		.join(' ');
	const areaPoints =
		chart.chartType === 'area'
			? `${margin.left.toFixed(1)},${(margin.top + plotHeight).toFixed(1)} ${points} ${(margin.left + plotWidth).toFixed(1)},${(margin.top + plotHeight).toFixed(1)}`
			: null;
	const title = chart.title ?? 'Chart';
	const description = chart.altText ?? chart.caption ?? title;
	const unitLabel = chart.units ? ` (${chart.units})` : '';
	const xLabels = rows.map((row, index) => {
		const x = scaleX(index);
		return `<text x="${x.toFixed(1)}" y="${height - 22}" text-anchor="middle" font-size="10" fill="${CHART_THEME.secondaryText}">${escapeXml(row.label)}</text>`;
	});
	const yGrid = ticks.map((tick) => {
		const y = scaleY(tick);
		return [
			`<line x1="${margin.left}" y1="${y.toFixed(1)}" x2="${margin.left + plotWidth}" y2="${y.toFixed(1)}" stroke="${CHART_THEME.rule}" stroke-width="1"/>`,
			`<text x="${margin.left - 10}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="${CHART_THEME.secondaryText}">${escapeXml(new Intl.NumberFormat('en-US').format(tick))}</text>`,
		].join('');
	});
	const markers = rows.map((row, index) => {
		const x = scaleX(index);
		const y = scaleY(row.value);
		return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${CHART_THEME.accent}"><title>${escapeXml(`${row.label}: ${row.value}${unitLabel}`)}</title></circle>`;
	});

	return {
		width,
		height,
		dataPointCount: rows.length,
		chartType: chart.chartType,
		svg: [
			`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="chart-title chart-desc">`,
			`<title id="chart-title">${escapeXml(title)}</title>`,
			`<desc id="chart-desc">${escapeXml(description)}</desc>`,
			`<rect x="0" y="0" width="${width}" height="${height}" rx="0" fill="${CHART_THEME.panel}"/>`,
			`<text x="${margin.left}" y="28" font-size="16" font-weight="700" fill="${CHART_THEME.text}">${escapeXml(title)}</text>`,
			chart.caption
				? `<text x="${margin.left}" y="46" font-size="11" fill="${CHART_THEME.secondaryText}">${escapeXml(chart.caption)}</text>`
				: '',
			`<text x="${margin.left - 44}" y="${margin.top - 18}" font-size="10" fill="${CHART_THEME.secondaryText}">${escapeXml(chart.units ?? '')}</text>`,
			...yGrid,
			`<line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${margin.left + plotWidth}" y2="${margin.top + plotHeight}" stroke="${CHART_THEME.secondaryText}" stroke-width="1"/>`,
			`<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" stroke="${CHART_THEME.secondaryText}" stroke-width="1"/>`,
			...(areaPoints
				? [`<polygon points="${areaPoints}" fill="${CHART_THEME.accent}" opacity="0.16"/>`]
				: []),
			`<polyline points="${points}" fill="none" stroke="${CHART_THEME.accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
			...markers,
			...xLabels,
			'</svg>',
		]
			.filter(Boolean)
			.join(''),
	};
}
