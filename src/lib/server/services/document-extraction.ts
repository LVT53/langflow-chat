import { readFile } from 'fs/promises';
import { basename, extname } from 'path';
import { LiteParse, type LiteParseConfig } from '@llamaindex/liteparse';
import { getConfig } from '../config-store';

interface ExtractionResult {
	text: string | null;
	normalizedName: string;
	mimeType: string;
}

type ParseWithText = {
	text: string;
};

let parserCacheKey: string | null = null;
let parserInstance: LiteParse | null = null;

function decodeXmlEntities(value: string): string {
	return value
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

function stripMarkup(value: string): string {
	return decodeXmlEntities(
		value
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

function toNormalizedName(originalName: string): string {
	const stem = basename(originalName, extname(originalName));
	return `${stem || 'document'}.txt`;
}

function isImageMimeType(mimeType: string | null): boolean {
	return Boolean(mimeType?.startsWith('image/'));
}

function isLiteParseCandidate(mimeType: string | null, extension: string): boolean {
	if (mimeType === 'application/pdf' || extension === '.pdf') return true;
	if (isImageMimeType(mimeType) || ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp', '.svg'].includes(extension)) {
		return true;
	}

	if (
		mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
		mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
		mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
		mimeType === 'application/vnd.oasis.opendocument.text'
	) {
		return true;
	}

	return ['.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.odt', '.rtf'].includes(extension);
}

export function resetDocumentExtractionExecutableCache(): void {
	parserCacheKey = null;
	parserInstance = null;
}

function getLiteParseConfig(): { parser: LiteParse; timeoutMs: number } {
	const config = getConfig();
	const normalizedLanguage = config.documentParserOcrLanguage
		.split(/[+,]/)
		.map((segment) => segment.trim().toLowerCase())
		.filter(Boolean)
		.filter((value, index, array) => array.indexOf(value) === index)
		.join('+');

	const parserConfig: Partial<LiteParseConfig> = {
		ocrEnabled: config.documentParserOcrEnabled,
		ocrLanguage: normalizedLanguage || 'hu+en+nl',
		numWorkers: config.documentParserNumWorkers,
		maxPages: config.documentParserMaxPages,
		dpi: config.documentParserDpi,
		outputFormat: 'text',
	};

	if (config.documentParserOcrServerUrl.trim()) {
		parserConfig.ocrServerUrl = config.documentParserOcrServerUrl.trim();
	}

	const cacheKey = JSON.stringify(parserConfig);
	if (parserInstance && parserCacheKey === cacheKey) {
		return {
			parser: parserInstance,
			timeoutMs: config.documentParserTimeoutMs,
		};
	}

	parserInstance = new LiteParse(parserConfig);
	parserCacheKey = cacheKey;

	return {
		parser: parserInstance,
		timeoutMs: config.documentParserTimeoutMs,
	};
}

async function parseWithLiteParse(filePath: string): Promise<string | null> {
	const { parser, timeoutMs } = getLiteParseConfig();

	try {
		const parsePromise = parser.parse(filePath) as Promise<ParseWithText>;
		const timeoutPromise = new Promise<null>((resolve) => {
			setTimeout(() => resolve(null), timeoutMs);
		});

		const result: ParseWithText | null = await Promise.race([
			parsePromise.then((value) => value ?? null),
			timeoutPromise,
		]);

		if (!result || typeof result.text !== 'string') {
			return null;
		}

		const trimmed = result.text.trim();
		return trimmed.length > 0 ? trimmed : null;
	} catch {
		return null;
	}
}

export async function extractDocumentText(
	filePath: string,
	mimeType: string | null,
	originalName: string
): Promise<ExtractionResult> {
	const extension = extname(originalName).toLowerCase();
	const normalizedName = toNormalizedName(originalName);

	if (mimeType === 'text/html' || extension === '.html') {
		const html = await readFile(filePath, 'utf8').catch(() => '');
		return {
			text: stripMarkup(html),
			normalizedName,
			mimeType: 'text/plain',
		};
	}

	if (mimeType === 'application/json' || extension === '.json') {
		const raw = await readFile(filePath, 'utf8').catch(() => '');
		try {
			const parsed = JSON.parse(raw);
			return {
				text: JSON.stringify(parsed, null, 2),
				normalizedName,
				mimeType: 'text/plain',
			};
		} catch {
			return {
				text: raw.trim() || null,
				normalizedName,
				mimeType: 'text/plain',
			};
		}
	}

	if (
		mimeType?.startsWith('text/') ||
		mimeType === 'application/xml' ||
		mimeType === 'application/rtf' ||
		mimeType === 'application/javascript' ||
		mimeType === 'text/javascript' ||
		mimeType === 'text/x-python' ||
		mimeType === 'application/typescript' ||
		mimeType === 'application/yaml' ||
		mimeType === 'image/svg+xml' ||
		['.txt', '.md', '.csv', '.xml', '.rtf', '.css', '.js', '.py', '.ts', '.yaml', '.yml', '.svg'].includes(extension)
	) {
		const text = await readFile(filePath, 'utf8').catch(() => '');
		return {
			text: text.trim() || null,
			normalizedName,
			mimeType: 'text/plain',
		};
	}

	const text = isLiteParseCandidate(mimeType, extension)
		? await parseWithLiteParse(filePath)
		: null;

	return {
		text,
		normalizedName,
		mimeType: 'text/plain',
	};
}
