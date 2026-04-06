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

const TESSERACT_LANGUAGE_MAP: Record<string, string> = {
	en: 'eng',
	fr: 'fra',
	de: 'deu',
	es: 'spa',
	it: 'ita',
	pt: 'por',
	ru: 'rus',
	zh: 'chi_sim',
	'zh-cn': 'chi_sim',
	'zh-tw': 'chi_tra',
	ja: 'jpn',
	ko: 'kor',
	ar: 'ara',
	hi: 'hin',
	th: 'tha',
	vi: 'vie',
	hu: 'hun',
	nl: 'nld',
};

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

const IMAGE_EXTENSIONS = new Set([
	'.jpg',
	'.jpeg',
	'.jfif',
	'.png',
	'.gif',
	'.bmp',
	'.tiff',
	'.tif',
	'.webp',
	'.svg',
	'.heic',
	'.heif',
	'.avif',
]);

function isLiteParseCandidate(mimeType: string | null, extension: string): boolean {
	if (mimeType === 'application/pdf' || extension === '.pdf') return true;
	if (isImageMimeType(mimeType) || IMAGE_EXTENSIONS.has(extension)) {
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

function normalizeOcrLanguageProfile(raw: string, externalOcrServerEnabled: boolean): string {
	const normalized = raw
		.split(/[+,]/)
		.map((segment) => segment.trim().toLowerCase())
		.filter(Boolean)
		.filter((value, index, array) => array.indexOf(value) === index);

	if (normalized.length === 0) {
		return externalOcrServerEnabled ? 'hu+en+nl' : 'hun+eng+nld';
	}

	if (externalOcrServerEnabled) {
		return normalized.join('+');
	}

	return normalized.map((segment) => TESSERACT_LANGUAGE_MAP[segment] ?? segment).join('+');
}

export function resetDocumentExtractionExecutableCache(): void {
	parserCacheKey = null;
	parserInstance = null;
}

function getLiteParseConfig(): { parser: LiteParse; timeoutMs: number } {
	const config = getConfig();
	const externalOcrServerEnabled = Boolean(config.documentParserOcrServerUrl.trim());
	const normalizedLanguage = normalizeOcrLanguageProfile(
		config.documentParserOcrLanguage,
		externalOcrServerEnabled
	);

	const parserConfig: Partial<LiteParseConfig> = {
		ocrEnabled: config.documentParserOcrEnabled,
		ocrLanguage: normalizedLanguage,
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
	const startedAt = Date.now();

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
			console.info('[OCR_PIPELINE] finished_ocr', {
				filePath,
				durationMs: Date.now() - startedAt,
				timedOut: true,
				hasText: false,
			});
			return null;
		}

		const trimmed = result.text.trim();
		console.info('[OCR_PIPELINE] finished_ocr', {
			filePath,
			durationMs: Date.now() - startedAt,
			timedOut: false,
			hasText: trimmed.length > 0,
			textLength: trimmed.length,
		});
		return trimmed.length > 0 ? trimmed : null;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('[OCR_PIPELINE] finished_ocr_error', {
			filePath,
			durationMs: Date.now() - startedAt,
			message,
		});
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
