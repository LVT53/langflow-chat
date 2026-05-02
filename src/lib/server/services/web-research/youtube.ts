export interface YouTubeTranscriptSnippet {
	text: string;
	start: number;
	duration: number;
}

export interface YouTubeTranscriptResult {
	videoId: string;
	title: string | null;
	language: string;
	languageCode: string;
	isGenerated: boolean;
	isTranslated: boolean;
	snippetCount: number;
	text: string;
}

interface YouTubeCaptionTrack {
	baseUrl?: string;
	name?: {
		simpleText?: string;
		runs?: Array<{ text?: string }>;
	};
	languageCode?: string;
	kind?: string;
	isTranslatable?: boolean;
}

interface YouTubePlayerResponse {
	videoDetails?: {
		title?: string;
	};
	captions?: {
		playerCaptionsTracklistRenderer?: {
			captionTracks?: YouTubeCaptionTrack[];
			translationLanguages?: Array<{ languageCode?: string }>;
		};
	};
}

const YOUTUBE_HOST_RE = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const DEFAULT_TRANSCRIPT_LANGUAGES = ["en"];
const DEFAULT_TRANSCRIPT_TIMEOUT_MS = 12_000;

function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string): string {
	return value.replace(
		/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|#39);/gi,
		(entity, rawEntity: string) => {
			const normalizedEntity = rawEntity.toLowerCase();
			if (normalizedEntity === "amp") return "&";
			if (normalizedEntity === "lt") return "<";
			if (normalizedEntity === "gt") return ">";
			if (normalizedEntity === "quot") return '"';
			if (normalizedEntity === "apos" || normalizedEntity === "#39") return "'";
			if (normalizedEntity.startsWith("#x")) {
				const parsed = Number.parseInt(normalizedEntity.slice(2), 16);
				return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : entity;
			}
			if (normalizedEntity.startsWith("#")) {
				const parsed = Number.parseInt(normalizedEntity.slice(1), 10);
				return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : entity;
			}
			return entity;
		},
	);
}

function stripTranscriptMarkup(value: string): string {
	return normalizeWhitespace(
		decodeHtmlEntities(
			value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, ""),
		),
	);
}

export function extractYouTubeVideoId(value: string): string | null {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return null;
	}

	const host = url.hostname.toLowerCase().replace(/^www\./, "");
	if (!YOUTUBE_HOST_RE.test(host)) return null;

	const directVideoId = url.searchParams.get("v")?.trim();
	if (directVideoId && VIDEO_ID_RE.test(directVideoId)) {
		return directVideoId;
	}

	const pathParts = url.pathname.split("/").filter(Boolean);
	if (host === "youtu.be") {
		const candidate = pathParts[0]?.trim();
		return candidate && VIDEO_ID_RE.test(candidate) ? candidate : null;
	}

	const videoPathPrefixes = new Set(["embed", "shorts", "live", "v"]);
	if (pathParts.length >= 2 && videoPathPrefixes.has(pathParts[0])) {
		const candidate = pathParts[1]?.trim();
		return candidate && VIDEO_ID_RE.test(candidate) ? candidate : null;
	}

	return null;
}

export function isYouTubeVideoUrl(value: string): boolean {
	return extractYouTubeVideoId(value) !== null;
}

export function canonicalYouTubeUrl(videoId: string): string {
	return `https://youtube.com/watch?v=${videoId}`;
}

function extractJsonObjectAfterMarker(
	html: string,
	marker: string,
): string | null {
	const markerIndex = html.indexOf(marker);
	if (markerIndex < 0) return null;

	const startIndex = html.indexOf("{", markerIndex);
	if (startIndex < 0) return null;

	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let index = startIndex; index < html.length; index += 1) {
		const char = html[index];
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (char === "\\") {
				escaped = true;
			} else if (char === '"') {
				inString = false;
			}
			continue;
		}

		if (char === '"') {
			inString = true;
			continue;
		}
		if (char === "{") depth += 1;
		if (char === "}") {
			depth -= 1;
			if (depth === 0) return html.slice(startIndex, index + 1);
		}
	}

	return null;
}

function extractPlayerResponse(html: string): YouTubePlayerResponse | null {
	const rawJson = extractJsonObjectAfterMarker(html, "ytInitialPlayerResponse");
	if (!rawJson) return null;

	try {
		return JSON.parse(rawJson) as YouTubePlayerResponse;
	} catch {
		return null;
	}
}

function captionTrackName(track: YouTubeCaptionTrack): string {
	if (track.name?.simpleText) return track.name.simpleText;
	const runText = track.name?.runs
		?.map((run) => run.text)
		.filter((text): text is string => Boolean(text))
		.join("");
	return runText || track.languageCode || "Unknown";
}

function normalizeLanguageCode(value: string): string {
	return value.toLowerCase().replace("_", "-");
}

function languageMatches(
	track: YouTubeCaptionTrack,
	languageCode: string,
): boolean {
	const trackCode = normalizeLanguageCode(track.languageCode ?? "");
	const wantedCode = normalizeLanguageCode(languageCode);
	if (!trackCode || !wantedCode) return false;
	return (
		trackCode === wantedCode ||
		trackCode.split("-")[0] === wantedCode.split("-")[0]
	);
}

function chooseCaptionTrack(params: {
	tracks: YouTubeCaptionTrack[];
	languages: string[];
}): YouTubeCaptionTrack | null {
	const usableTracks = params.tracks.filter((track) => track.baseUrl);
	if (usableTracks.length === 0) return null;

	for (const language of params.languages) {
		const manualTrack = usableTracks.find(
			(track) => track.kind !== "asr" && languageMatches(track, language),
		);
		if (manualTrack) return manualTrack;

		const generatedTrack = usableTracks.find(
			(track) => track.kind === "asr" && languageMatches(track, language),
		);
		if (generatedTrack) return generatedTrack;
	}

	return (
		usableTracks.find((track) => track.kind !== "asr") ??
		usableTracks.find((track) => track.kind === "asr") ??
		null
	);
}

function shouldTranslateTrack(params: {
	track: YouTubeCaptionTrack;
	languages: string[];
	translationLanguages: Array<{ languageCode?: string }>;
}): string | null {
	const preferredLanguage =
		params.languages[0] ?? DEFAULT_TRANSCRIPT_LANGUAGES[0];
	if (languageMatches(params.track, preferredLanguage)) return null;
	if (!params.track.isTranslatable) return null;
	const targetAvailable = params.translationLanguages.some(
		(language) =>
			typeof language.languageCode === "string" &&
			normalizeLanguageCode(language.languageCode) ===
				normalizeLanguageCode(preferredLanguage),
	);
	return targetAvailable ? preferredLanguage : null;
}

function parseJsonTranscript(value: string): YouTubeTranscriptSnippet[] {
	const data = JSON.parse(value) as {
		events?: Array<{
			tStartMs?: number;
			dDurationMs?: number;
			segs?: Array<{ utf8?: string }>;
		}>;
	};

	const snippets: YouTubeTranscriptSnippet[] = [];
	for (const event of data.events ?? []) {
		const text = normalizeWhitespace(
			(event.segs ?? [])
				.map((segment) => segment.utf8 ?? "")
				.join("")
				.replace(/\n/g, " "),
		);
		if (!/[a-z0-9]/i.test(text)) continue;
		snippets.push({
			text,
			start: Math.max(0, (event.tStartMs ?? 0) / 1000),
			duration: Math.max(0, (event.dDurationMs ?? 0) / 1000),
		});
	}
	return snippets;
}

function parseXmlTranscript(value: string): YouTubeTranscriptSnippet[] {
	const snippets: YouTubeTranscriptSnippet[] = [];
	const textElementRe = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
	const attrRe = /\b(start|dur)="([^"]*)"/gi;

	for (const match of value.matchAll(textElementRe)) {
		const attrs = match[1] ?? "";
		const rawText = match[2] ?? "";
		const parsedAttrs = new Map<string, string>();
		attrRe.lastIndex = 0;
		for (const attrMatch of attrs.matchAll(attrRe)) {
			parsedAttrs.set(attrMatch[1], decodeHtmlEntities(attrMatch[2]));
		}

		const text = stripTranscriptMarkup(rawText);
		if (!/[a-z0-9]/i.test(text)) continue;
		snippets.push({
			text,
			start: Math.max(
				0,
				Number.parseFloat(parsedAttrs.get("start") ?? "0") || 0,
			),
			duration: Math.max(
				0,
				Number.parseFloat(parsedAttrs.get("dur") ?? "0") || 0,
			),
		});
	}

	return snippets;
}

function formatTimestamp(seconds: number): string {
	const wholeSeconds = Math.max(0, Math.floor(seconds));
	const minutes = Math.floor(wholeSeconds / 60);
	const remainingSeconds = wholeSeconds % 60;
	return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatTranscriptText(snippets: YouTubeTranscriptSnippet[]): string {
	const paragraphs: string[] = [];
	let paragraphStart = snippets[0]?.start ?? 0;
	let current = "";
	let previousEnd = 0;

	const flush = () => {
		if (!current) return;
		paragraphs.push(`[${formatTimestamp(paragraphStart)}] ${current}`);
		current = "";
	};

	for (const snippet of snippets) {
		const text = normalizeWhitespace(snippet.text);
		if (!text) continue;
		const gap = snippet.start - previousEnd;
		if (current && (current.length + text.length > 1100 || gap > 12)) {
			flush();
			paragraphStart = snippet.start;
		}
		if (!current) paragraphStart = snippet.start;
		current = `${current} ${text}`.trim();
		previousEnd = snippet.start + snippet.duration;
	}
	flush();

	return paragraphs.join("\n\n");
}

async function fetchWithTimeout(
	fetchImpl: typeof fetch,
	input: string,
	init: RequestInit,
	timeoutMs: number,
): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetchImpl(input, {
			...init,
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timeout);
	}
}

function buildWatchUrl(videoId: string): string {
	const url = new URL(canonicalYouTubeUrl(videoId));
	url.searchParams.set("hl", "en");
	url.searchParams.set("bpctr", "9999999999");
	url.searchParams.set("has_verified", "1");
	return url.toString();
}

function youtubeRequestHeaders(): HeadersInit {
	return {
		Accept:
			"text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
		"Accept-Language": "en-US,en;q=0.9",
		"User-Agent":
			"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
	};
}

async function fetchCaptionSnippets(params: {
	track: YouTubeCaptionTrack;
	translateTo: string | null;
	fetch: typeof fetch;
	timeoutMs: number;
}): Promise<YouTubeTranscriptSnippet[]> {
	if (!params.track.baseUrl) return [];

	const captionUrl = new URL(params.track.baseUrl);
	captionUrl.searchParams.set("fmt", "json3");
	if (params.translateTo) {
		captionUrl.searchParams.set("tlang", params.translateTo);
	}

	const response = await fetchWithTimeout(
		params.fetch,
		captionUrl.toString(),
		{ method: "GET", headers: youtubeRequestHeaders() },
		params.timeoutMs,
	);
	if (!response.ok) {
		throw new Error(`caption_fetch_failed_${response.status}`);
	}

	const body = await response.text();
	try {
		const snippets = parseJsonTranscript(body);
		if (snippets.length > 0) return snippets;
	} catch {
		// YouTube may still return XML despite a JSON format hint.
	}

	return parseXmlTranscript(body);
}

export async function fetchYouTubeTranscript(params: {
	url: string;
	fetch: typeof fetch;
	languages?: string[];
	timeoutMs?: number;
}): Promise<YouTubeTranscriptResult | null> {
	const videoId = extractYouTubeVideoId(params.url);
	if (!videoId) return null;

	const response = await fetchWithTimeout(
		params.fetch,
		buildWatchUrl(videoId),
		{ method: "GET", headers: youtubeRequestHeaders() },
		params.timeoutMs ?? DEFAULT_TRANSCRIPT_TIMEOUT_MS,
	);
	if (!response.ok) {
		throw new Error(`watch_fetch_failed_${response.status}`);
	}

	const html = await response.text();
	const playerResponse = extractPlayerResponse(html);
	const trackList =
		playerResponse?.captions?.playerCaptionsTracklistRenderer ?? null;
	const tracks = trackList?.captionTracks ?? [];
	if (tracks.length === 0) {
		throw new Error("transcript_unavailable");
	}

	const languages = params.languages?.length
		? params.languages
		: DEFAULT_TRANSCRIPT_LANGUAGES;
	const track = chooseCaptionTrack({ tracks, languages });
	if (!track) {
		throw new Error("transcript_unavailable");
	}

	const translateTo = shouldTranslateTrack({
		track,
		languages,
		translationLanguages: trackList?.translationLanguages ?? [],
	});
	const snippets = await fetchCaptionSnippets({
		track,
		translateTo,
		fetch: params.fetch,
		timeoutMs: params.timeoutMs ?? DEFAULT_TRANSCRIPT_TIMEOUT_MS,
	});
	if (snippets.length === 0) {
		throw new Error("transcript_empty");
	}

	return {
		videoId,
		title: playerResponse?.videoDetails?.title ?? null,
		language: translateTo
			? `Translated to ${translateTo}`
			: captionTrackName(track),
		languageCode: translateTo ?? track.languageCode ?? "",
		isGenerated: track.kind === "asr",
		isTranslated: Boolean(translateTo),
		snippetCount: snippets.length,
		text: formatTranscriptText(snippets),
	};
}
