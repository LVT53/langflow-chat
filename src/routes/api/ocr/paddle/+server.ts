import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	PaddleAdapterHttpError,
	callPaddleOcrAdapter,
} from '$lib/server/services/ocr/paddle-adapter';
import { getConfig } from '$lib/server/config-store';

function normalizeLanguage(raw: string): string {
	return raw
		.split(/[+,]/)
		.map((segment) => segment.trim().toLowerCase())
		.filter(Boolean)
		.filter((value, index, array) => array.indexOf(value) === index)
		.join('+') || 'hu+en+nl';
}

function coerceToFile(value: FormDataEntryValue | null): File | null {
	if (typeof value !== 'object' || value === null) {
		return null;
	}

	if ('arrayBuffer' in value && typeof value.arrayBuffer === 'function') {
		const maybeFile = value as File;
		const name = typeof maybeFile.name === 'string' && maybeFile.name.trim() ? maybeFile.name : 'upload.bin';
		const type = typeof maybeFile.type === 'string' ? maybeFile.type : 'application/octet-stream';
		if (typeof maybeFile.name === 'string') {
			return maybeFile;
		}
		return new File([value as BlobPart], name, { type });
	}

	return null;
}

function mapLanguageForPaddleBackend(language: string): string {
	const normalized = normalizeLanguage(language);
	if (normalized.includes('hu') || normalized.includes('nl')) {
		return 'latin';
	}
	if (normalized.includes('en')) {
		return 'en';
	}
	return normalized;
}

export const POST: RequestHandler = async ({ request }) => {
	const config = getConfig();
	const formData = await request.formData().catch(() => null);
	if (!formData) {
		return json({ error: 'Invalid form data' }, { status: 400 });
	}

	const file = coerceToFile(formData.get('file'));
	if (!file) {
		return json({ error: 'Missing file' }, { status: 400 });
	}

	const languageRaw = formData.get('language');
	const requestedLanguage =
		typeof languageRaw === 'string' && languageRaw.trim()
			? languageRaw.trim()
			: config.documentParserOcrLanguage;
	const backendLanguage = mapLanguageForPaddleBackend(requestedLanguage);
	const backendEndpoint = config.documentParserPaddleBackendUrl.trim();

	if (!backendEndpoint) {
		return json(
			{ error: 'DOCUMENT_PARSER_PADDLE_BACKEND_URL is not configured' },
			{ status: 500 }
		);
	}

	try {
		const response = await callPaddleOcrAdapter({
			file,
			language: backendLanguage,
			endpoint: backendEndpoint,
		});

		return json(response);
	} catch (error) {
		if (error instanceof PaddleAdapterHttpError) {
			return json(
				{
					error: error.message,
					upstreamStatus: error.status,
					upstreamBody: error.body,
				},
				{ status: 502 }
			);
		}

		const message = error instanceof Error ? error.message : String(error);
		return json({ error: `Paddle OCR proxy failed: ${message}` }, { status: 500 });
	}
};
