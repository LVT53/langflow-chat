export type GeneratedDocumentBlock =
	| { type: 'heading'; level: 1 | 2 | 3; text: string }
	| { type: 'paragraph'; text: string }
	| { type: 'list'; style: 'bullet' | 'numbered'; items: string[] }
	| { type: 'callout'; tone: 'info' | 'warning' | 'tip' | 'note'; title?: string | null; text: string }
	| { type: 'code'; language?: string | null; text: string }
	| { type: 'quote'; text: string; citation?: string | null }
	| { type: 'pageBreak' };

export interface GeneratedDocumentSource {
	version: 1;
	template: 'alfyai_standard_report';
	title: string;
	subtitle?: string | null;
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

function normalizeBlock(block: unknown): GeneratedDocumentBlock | null {
	if (!isRecord(block) || typeof block.type !== 'string') return null;

	switch (block.type) {
		case 'heading': {
			const text = cleanText(block.text);
			const level = block.level === 1 || block.level === 2 || block.level === 3 ? block.level : null;
			return text && level ? { type: 'heading', level, text } : null;
		}
		case 'paragraph': {
			const text = cleanText(block.text);
			return text ? { type: 'paragraph', text } : null;
		}
		case 'list': {
			const style = block.style === 'numbered' ? 'numbered' : 'bullet';
			const items = Array.isArray(block.items)
				? block.items.map(cleanText).filter((item): item is string => Boolean(item))
				: [];
			return items.length > 0 ? { type: 'list', style, items } : null;
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
			return text ? { type: 'callout', tone, title, text } : null;
		}
		case 'code': {
			const text = typeof block.text === 'string' && block.text.trim() ? block.text.trimEnd() : null;
			const language = cleanText(block.language);
			return text ? { type: 'code', language, text } : null;
		}
		case 'quote': {
			const text = cleanText(block.text);
			const citation = cleanText(block.citation);
			return text ? { type: 'quote', text, citation } : null;
		}
		case 'pageBreak':
			return { type: 'pageBreak' };
		default:
			return null;
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
		if (!normalized) {
			return {
				ok: false,
				code: 'unsupported_document_block',
				message: 'Generated document source contains an unsupported block.',
			};
		}
		blocks.push(normalized);
	}

	return {
		ok: true,
		source: {
			version: 1,
			template: 'alfyai_standard_report',
			title,
			subtitle: cleanText(value.subtitle),
			blocks,
		},
	};
}

export function buildGeneratedDocumentProjection(source: GeneratedDocumentSource): string {
	const lines: string[] = [source.title];
	if (source.subtitle) {
		lines.push(source.subtitle);
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
			case 'pageBreak':
				lines.push('[Page break]');
				break;
		}
	}

	return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
