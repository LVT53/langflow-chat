import { getConfig } from '$lib/server/config-store';

export interface LiteparseOcrResultItem {
	text: string;
	bbox: [number, number, number, number];
	confidence: number;
}

export interface LiteparseOcrResponse {
	results: LiteparseOcrResultItem[];
}

export interface PaddleBlockLike {
	text?: unknown;
	block_content?: unknown;
	bbox?: unknown;
	block_bbox?: unknown;
	confidence?: unknown;
	score?: unknown;
}

function toNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function normalizeAxisAlignedBbox(raw: unknown): [number, number, number, number] | null {
	if (!Array.isArray(raw) || raw.length === 0) return null;

	if (raw.length === 4 && raw.every((entry) => toNumber(entry) !== null)) {
		const x1 = toNumber(raw[0])!;
		const y1 = toNumber(raw[1])!;
		const x2 = toNumber(raw[2])!;
		const y2 = toNumber(raw[3])!;
		return [x1, y1, x2, y2];
	}

	const points = raw
		.map((entry) => {
			if (!Array.isArray(entry) || entry.length < 2) return null;
			const x = toNumber(entry[0]);
			const y = toNumber(entry[1]);
			if (x === null || y === null) return null;
			return { x, y };
		})
		.filter((entry): entry is { x: number; y: number } => Boolean(entry));

	if (points.length === 0) return null;

	const xs = points.map((point) => point.x);
	const ys = points.map((point) => point.y);
	return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function mapPaddleResponseToLiteparseOcr(payload: unknown): LiteparseOcrResponse {
	if (!payload || typeof payload !== 'object') {
		return { results: [] };
	}

	const record = payload as Record<string, unknown>;
	const candidates: PaddleBlockLike[] = [];

	const topLevelResults = record.results;
	if (Array.isArray(topLevelResults)) {
		for (const item of topLevelResults) {
			if (item && typeof item === 'object') candidates.push(item as PaddleBlockLike);
		}
	}

	const parsingResList = record.parsing_res_list;
	if (Array.isArray(parsingResList)) {
		for (const item of parsingResList) {
			if (item && typeof item === 'object') candidates.push(item as PaddleBlockLike);
		}
	}

	const results: LiteparseOcrResultItem[] = [];
	for (const item of candidates) {
		const textCandidate =
			typeof item.text === 'string'
				? item.text
				: typeof item.block_content === 'string'
					? item.block_content
					: null;

		if (!textCandidate || !textCandidate.trim()) continue;

		const bbox = normalizeAxisAlignedBbox(item.bbox ?? item.block_bbox);
		if (!bbox) continue;

		const confidence =
			toNumber(item.confidence) ?? toNumber(item.score) ?? 1;

		results.push({
			text: textCandidate,
			bbox,
			confidence: Math.max(0, Math.min(1, confidence)),
		});
	}

	return { results };
}

export async function callPaddleOcrAdapter(params: {
	file: File;
	language: string;
	signal?: AbortSignal;
}): Promise<LiteparseOcrResponse> {
	const config = getConfig();
	const endpoint = config.documentParserOcrServerUrl.trim();
	if (!endpoint) {
		return { results: [] };
	}

	const body = new FormData();
	body.append('file', params.file, params.file.name);
	body.append('language', params.language);

	const response = await fetch(endpoint, {
		method: 'POST',
		body,
		signal: params.signal,
	});

	if (!response.ok) {
		throw new Error(`Paddle OCR adapter failed: ${response.status} ${response.statusText}`);
	}

	const json = (await response.json().catch(() => null)) as unknown;
	return mapPaddleResponseToLiteparseOcr(json);
}
