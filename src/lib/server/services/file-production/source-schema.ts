export type GeneratedDocumentBlock =
	| { type: 'heading'; level: 1 | 2 | 3; text: string }
	| { type: 'paragraph'; text: string }
	| { type: 'list'; style: 'bullet' | 'numbered'; items: string[] }
	| { type: 'callout'; tone: 'info' | 'warning' | 'tip' | 'note'; title?: string | null; text: string }
	| { type: 'code'; language?: string | null; text: string }
	| { type: 'quote'; text: string; citation?: string | null }
	| { type: 'divider' }
	| GeneratedDocumentTableBlock
	| GeneratedDocumentChartBlock
	| GeneratedDocumentImageBlock
	| { type: 'pageBreak' };

export type GeneratedDocumentScalar = string | number | boolean | null;

export interface GeneratedDocumentTableColumn {
	key: string;
	label: string;
	kind: 'text' | 'number' | 'currency' | 'percent' | 'date' | 'boolean';
}

export interface GeneratedDocumentTableBlock {
	type: 'table';
	title?: string | null;
	caption?: string | null;
	columns: GeneratedDocumentTableColumn[];
	rows: Record<string, GeneratedDocumentScalar>[];
}

export type GeneratedDocumentChartType =
	| 'bar'
	| 'stackedBar'
	| 'line'
	| 'area'
	| 'pie'
	| 'scatter'
	| 'donut';

export interface GeneratedDocumentChartBlock {
	type: 'chart';
	chartType: GeneratedDocumentChartType;
	title?: string | null;
	caption?: string | null;
	altText?: string | null;
	xKey?: string | null;
	yKey?: string | null;
	labelKey?: string | null;
	valueKey?: string | null;
	seriesKey?: string | null;
	radiusKey?: string | null;
	units?: string | null;
	data: Record<string, GeneratedDocumentScalar>[];
}

export type GeneratedDocumentImageSource =
	| { kind: 'https'; url: string }
	| { kind: 'artifact'; artifactId: string }
	| { kind: 'generated_file'; fileId: string }
	| { kind: 'data'; mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; data: string };

export interface GeneratedDocumentImageBlock {
	type: 'image';
	source: GeneratedDocumentImageSource;
	altText: string;
	caption?: string | null;
	critical?: boolean;
}

export interface GeneratedDocumentSource {
	version: 1;
	template: 'alfyai_standard_report';
	title: string;
	subtitle?: string | null;
	cover?: { enabled: true; eyebrow?: string | null; dateLabel?: string | null };
	blocks: GeneratedDocumentBlock[];
}

export type GeneratedDocumentSourceValidationResult =
	| { ok: true; source: GeneratedDocumentSource }
	| { ok: false; code: string; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function cleanText(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.replace(/\s+/g, ' ').trim();
	return trimmed.length > 0 ? trimmed : null;
}

function cleanKey(value: unknown): string | null {
	const text = cleanText(value);
	return text && /^[A-Za-z0-9_.-]+$/.test(text) ? text : null;
}

function isScalar(value: unknown): value is GeneratedDocumentScalar {
	return (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	);
}

function normalizeScalarRecord(value: unknown): Record<string, GeneratedDocumentScalar> | null {
	if (!isRecord(value)) return null;

	const normalized: Record<string, GeneratedDocumentScalar> = {};
	for (const [key, cellValue] of Object.entries(value)) {
		if (key === 'colspan' || key === 'rowspan') return null;
		if (!isScalar(cellValue)) return null;
		normalized[key] = typeof cellValue === 'string' ? cellValue.replace(/\s+/g, ' ').trim() : cellValue;
	}
	return normalized;
}

type BlockNormalizationResult =
	| { ok: true; block: GeneratedDocumentBlock }
	| { ok: false; code: string; message: string };

function normalizeTableBlock(block: Record<string, unknown>): BlockNormalizationResult {
	const columns = Array.isArray(block.columns)
		? block.columns
				.map((column) => {
					if (!isRecord(column)) return null;
					const key = cleanKey(column.key);
					const label = cleanText(column.label);
					const kind =
						column.kind === 'number' ||
						column.kind === 'currency' ||
						column.kind === 'percent' ||
						column.kind === 'date' ||
						column.kind === 'boolean'
							? column.kind
							: 'text';
					return key && label ? { key, label, kind } : null;
				})
				.filter((column): column is GeneratedDocumentTableColumn => Boolean(column))
		: [];
	const rows = Array.isArray(block.rows)
		? block.rows.map(normalizeScalarRecord).filter((row): row is Record<string, GeneratedDocumentScalar> =>
				Boolean(row)
			)
		: [];

	if (
		columns.length === 0 ||
		rows.length === 0 ||
		!Array.isArray(block.rows) ||
		rows.length !== block.rows.length
	) {
		return {
			ok: false,
			code: 'unsupported_table_structure',
			message: 'Generated document source contains an unsupported table structure.',
		};
	}

	return {
		ok: true,
		block: {
			type: 'table',
			title: cleanText(block.title),
			caption: cleanText(block.caption),
			columns,
			rows,
		},
	};
}

function normalizeChartBlock(block: Record<string, unknown>): BlockNormalizationResult {
	const chartType =
		block.chartType === 'bar' ||
		block.chartType === 'stackedBar' ||
		block.chartType === 'line' ||
		block.chartType === 'area' ||
		block.chartType === 'pie' ||
		block.chartType === 'scatter' ||
		block.chartType === 'donut'
			? block.chartType
			: null;

	if (!chartType) {
		return {
			ok: false,
			code: 'unsupported_chart_type',
			message: 'Generated document source contains an unsupported chart type.',
		};
	}

	const data = Array.isArray(block.data)
		? block.data.map(normalizeScalarRecord).filter((row): row is Record<string, GeneratedDocumentScalar> =>
				Boolean(row)
			)
		: [];
	if (data.length === 0 || !Array.isArray(block.data) || data.length !== block.data.length) {
		return {
			ok: false,
			code: 'unsupported_chart_data',
			message: 'Generated document source contains unsupported chart data.',
		};
	}

	const xKey = cleanKey(block.xKey);
	const yKey = cleanKey(block.yKey);
	const labelKey = cleanKey(block.labelKey);
	const valueKey = cleanKey(block.valueKey);
	const title = cleanText(block.title);
	const caption = cleanText(block.caption);
	const altText = cleanText(block.altText);
	const units = cleanText(block.units);
	if (!title || !caption || !altText || !units) {
		return {
			ok: false,
			code: 'unsupported_chart_data',
			message: 'Generated document charts require title, caption, units, and alt text.',
		};
	}
	if ((chartType === 'pie' || chartType === 'donut') && !(labelKey && valueKey)) {
		return {
			ok: false,
			code: 'unsupported_chart_data',
			message: 'Pie-style charts require labelKey and valueKey fields.',
		};
	}
	if (chartType !== 'pie' && chartType !== 'donut' && !(xKey && yKey)) {
		return {
			ok: false,
			code: 'unsupported_chart_data',
			message: 'Generated document charts require xKey and yKey fields.',
		};
	}
	if (chartType === 'stackedBar' && !cleanKey(block.seriesKey)) {
		return {
			ok: false,
			code: 'unsupported_chart_data',
			message: 'Stacked bar charts require a seriesKey field.',
		};
	}

	return {
		ok: true,
		block: {
			type: 'chart',
			chartType,
			title,
			caption,
			altText,
			xKey,
			yKey,
			labelKey,
			valueKey,
			seriesKey: cleanKey(block.seriesKey),
			radiusKey: cleanKey(block.radiusKey),
			units,
			data,
		},
	};
}

function normalizeImageBlock(block: Record<string, unknown>): BlockNormalizationResult {
	if (!isRecord(block.source)) {
		return {
			ok: false,
			code: 'image_limit_exceeded',
			message: 'Generated document image source is invalid.',
		};
	}

	let source: GeneratedDocumentImageSource | null = null;
	if (block.source.kind === 'https') {
		const url = cleanText(block.source.url);
		source = url && url.startsWith('https://') ? { kind: 'https', url } : null;
	} else if (block.source.kind === 'artifact') {
		const artifactId = cleanText(block.source.artifactId);
		source = artifactId ? { kind: 'artifact', artifactId } : null;
	} else if (block.source.kind === 'generated_file') {
		const fileId = cleanText(block.source.fileId);
		source = fileId ? { kind: 'generated_file', fileId } : null;
	} else if (block.source.kind === 'data') {
		const mimeType =
			block.source.mimeType === 'image/png' ||
			block.source.mimeType === 'image/jpeg' ||
			block.source.mimeType === 'image/webp'
				? block.source.mimeType
				: null;
		const data = typeof block.source.data === 'string' && block.source.data.length > 0 ? block.source.data : null;
		source = mimeType && data ? { kind: 'data', mimeType, data } : null;
	}

	const altText = cleanText(block.altText);
	if (!source || !altText) {
		return {
			ok: false,
			code: 'image_limit_exceeded',
			message: 'Generated document image source is invalid.',
		};
	}

	return {
		ok: true,
		block: {
			type: 'image',
			source,
			altText,
			caption: cleanText(block.caption),
			critical: block.critical === true,
		},
	};
}

function normalizeBlock(block: unknown): BlockNormalizationResult {
	if (!isRecord(block) || typeof block.type !== 'string') {
		return {
			ok: false,
			code: 'unsupported_document_block',
			message: 'Generated document source contains an unsupported block.',
		};
	}

	switch (block.type) {
		case 'heading': {
			const text = cleanText(block.text);
			const level = block.level === 1 || block.level === 2 || block.level === 3 ? block.level : null;
			return text && level
				? { ok: true, block: { type: 'heading', level, text } }
				: {
						ok: false,
						code: 'unsupported_document_block',
						message: 'Generated document source contains an unsupported block.',
					};
		}
		case 'paragraph': {
			const text = cleanText(block.text);
			return text
				? { ok: true, block: { type: 'paragraph', text } }
				: {
						ok: false,
						code: 'unsupported_document_block',
						message: 'Generated document source contains an unsupported block.',
					};
		}
		case 'list': {
			const style = block.style === 'numbered' ? 'numbered' : 'bullet';
			const items = Array.isArray(block.items)
				? block.items.map(cleanText).filter((item): item is string => Boolean(item))
				: [];
			return items.length > 0
				? { ok: true, block: { type: 'list', style, items } }
				: {
						ok: false,
						code: 'unsupported_document_block',
						message: 'Generated document source contains an unsupported block.',
					};
		}
		case 'callout': {
			const text = cleanText(block.text);
			const title = cleanText(block.title);
			const tone =
				block.tone === 'info' ||
				block.tone === 'warning' ||
				block.tone === 'tip' ||
				block.tone === 'note'
					? block.tone
					: 'note';
			return text
				? { ok: true, block: { type: 'callout', tone, title, text } }
				: {
						ok: false,
						code: 'unsupported_document_block',
						message: 'Generated document source contains an unsupported block.',
					};
		}
		case 'code': {
			const text = typeof block.text === 'string' && block.text.trim() ? block.text.trimEnd() : null;
			const language = cleanText(block.language);
			return text
				? { ok: true, block: { type: 'code', language, text } }
				: {
						ok: false,
						code: 'unsupported_document_block',
						message: 'Generated document source contains an unsupported block.',
					};
		}
		case 'quote': {
			const text = cleanText(block.text);
			const citation = cleanText(block.citation);
			return text
				? { ok: true, block: { type: 'quote', text, citation } }
				: {
						ok: false,
						code: 'unsupported_document_block',
						message: 'Generated document source contains an unsupported block.',
					};
		}
		case 'divider':
			return { ok: true, block: { type: 'divider' } };
		case 'table':
			return normalizeTableBlock(block);
		case 'chart':
			return normalizeChartBlock(block);
		case 'image':
			return normalizeImageBlock(block);
		case 'pageBreak':
			return { ok: true, block: { type: 'pageBreak' } };
		default:
			return {
				ok: false,
				code: 'unsupported_document_block',
				message: 'Generated document source contains an unsupported block.',
			};
	}
}

export function validateGeneratedDocumentSource(
	value: unknown
): GeneratedDocumentSourceValidationResult {
	if (!isRecord(value)) {
		return {
			ok: false,
			code: 'invalid_document_source',
			message: 'Generated document source must be an object.',
		};
	}

	const title = cleanText(value.title);
	if (!title) {
		return {
			ok: false,
			code: 'invalid_document_source',
			message: 'Generated document source requires a title.',
		};
	}

	if (!Array.isArray(value.blocks)) {
		return {
			ok: false,
			code: 'invalid_document_source',
			message: 'Generated document source requires blocks.',
		};
	}

	const blocks: GeneratedDocumentBlock[] = [];
	for (const block of value.blocks) {
		const normalized = normalizeBlock(block);
		if (!normalized.ok) {
			return {
				ok: false,
				code: normalized.code,
				message: normalized.message,
			};
		}
		blocks.push(normalized.block);
	}
	const cover =
		isRecord(value.cover) && value.cover.enabled === true
			? {
					enabled: true as const,
					eyebrow: cleanText(value.cover.eyebrow),
					dateLabel: cleanText(value.cover.dateLabel),
				}
			: undefined;

	return {
		ok: true,
		source: {
			version: 1,
			template: 'alfyai_standard_report',
			title,
			subtitle: cleanText(value.subtitle),
			...(cover ? { cover } : {}),
			blocks,
		},
	};
}

export function buildGeneratedDocumentProjection(source: GeneratedDocumentSource): string {
	const lines: string[] = [source.title];
	if (source.subtitle) {
		lines.push(source.subtitle);
	}
	if (source.cover) {
		lines.push(source.cover.eyebrow ? `Cover: ${source.cover.eyebrow}` : 'Cover');
		if (source.cover.dateLabel) lines.push(source.cover.dateLabel);
	}
	lines.push('');

	for (const block of source.blocks) {
		switch (block.type) {
			case 'heading':
				lines.push(`${'#'.repeat(block.level)} ${block.text}`);
				break;
			case 'paragraph':
				lines.push(block.text);
				break;
			case 'list':
				block.items.forEach((item, index) => {
					lines.push(block.style === 'numbered' ? `${index + 1}. ${item}` : `- ${item}`);
				});
				break;
			case 'callout': {
				const label = block.tone.charAt(0).toUpperCase() + block.tone.slice(1);
				lines.push(block.title ? `${label}: ${block.title}` : `${label}:`);
				lines.push(block.text);
				break;
			}
			case 'code':
				lines.push(block.language ? `Code (${block.language}):` : 'Code:');
				lines.push(block.text);
				break;
			case 'quote':
				lines.push(block.citation ? `> ${block.text} -- ${block.citation}` : `> ${block.text}`);
				break;
			case 'divider':
				lines.push('---');
				break;
			case 'table':
				if (block.title) lines.push(`Table: ${block.title}`);
				lines.push(block.columns.map((column) => column.label).join(' | '));
				block.rows.forEach((row) => {
					lines.push(block.columns.map((column) => String(row[column.key] ?? '')).join(' | '));
				});
				if (block.caption) lines.push(`Caption: ${block.caption}`);
				break;
			case 'chart': {
				const label = block.title ? `${block.chartType}: ${block.title}` : block.chartType;
				lines.push(`Chart: ${label}`);
				if (block.altText) lines.push(`Alt text: ${block.altText}`);
				if (block.caption) lines.push(`Caption: ${block.caption}`);
				lines.push(`Data points: ${block.data.length}`);
				break;
			}
			case 'image':
				lines.push(`Image: ${block.altText}`);
				if (block.caption) lines.push(`Caption: ${block.caption}`);
				break;
			case 'pageBreak':
				lines.push('[Page break]');
				break;
		}
	}

	return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
