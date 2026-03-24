import { getConfig } from '../config-store';

const INPUT_ABBREVIATIONS = new Set([
	'dr.',
	'kb.',
	'pl.',
	'stb.',
	'ill.',
	'ld.',
	'vö.',
	'sz.',
	'tel.',
	'fax.',
	'bp.',
	'krt.',
	'u.',
	'br.',
	'özv.',
	'ifj.',
	'id.',
	'mr.',
	'mrs.',
	'ms.',
	'prof.',
	'jr.',
	'sr.',
	'st.',
	'vs.',
	'etc.',
	'i.e.',
	'e.g.',
	'a.m.',
	'p.m.',
	'u.s.',
	'u.k.',
	'no.',
	'vol.',
	'dept.',
	'approx.',
	'incl.',
	'corp.',
	'ltd.',
	'inc.'
]);

const OUTPUT_ABBREVIATIONS = new Set([
	'mr.',
	'mrs.',
	'ms.',
	'dr.',
	'prof.',
	'jr.',
	'sr.',
	'st.',
	'vs.',
	'etc.',
	'i.e.',
	'e.g.',
	'a.m.',
	'p.m.',
	'u.s.',
	'u.k.',
	'no.',
	'vol.',
	'dept.',
	'approx.',
	'incl.',
	'corp.',
	'ltd.',
	'inc.',
	'fig.',
	'eq.',
	'ref.',
	'sec.',
	'ch.',
	'pt.',
	'gen.',
	'gov.',
	'sgt.',
	'cpl.',
	'pvt.',
	'rev.',
	'hon.',
	'pres.'
]);

const HALLUCINATION_PATTERNS = [
	'kérlek, add meg',
	'add meg a szöveget',
	'amit le kell fordítanom',
	'kérem a szöveget',
	'adja meg a szöveget',
	'rendben, kérem',
	'rendben, adja meg',
	'a fordítás a következő',
	'itt a fordítás',
	'kérem, adja meg'
];

const CODE_LINE_PATTERNS = new RegExp(
	[
		'^\\s*(?:def |class |import |from \\w+ import |if __name__|print\\(|return |yield |raise |async def |await )',
		'^\\s*(?:function |const |let |var |=>|module\\.exports|export (?:default |const |function ))',
		'^\\s*(?:#include|using namespace|public |private |protected |void |int |float |double |char |bool |string )',
		'^\\s*(?:SELECT |INSERT INTO |UPDATE |DELETE FROM |CREATE TABLE |ALTER TABLE |DROP TABLE |FROM |WHERE |JOIN )',
		'^\\s*(?:#!/bin/|echo \\$|export |chmod |mkdir |cd |ls |grep |awk |sed )',
		'^\\s*(?:<html|<div|<span|<head|<body|<!DOCTYPE|<\\?php|<\\?xml)',
		'^\\s*(?:fn |pub fn |let mut |impl |func |fmt\\.Print|package main)',
		'^\\s*(?:require [\'"]|puts |def \\w+|end$)',
		'^\\s*(?:try:|except |catch\\s*\\(|finally:|else:|elif |switch\\s*\\(|case .+:)',
		'^\\s*\\w+\\s*=\\s*(?:\\[|\\{|lambda |\\w+\\()',
		'.*[{};]\\s*$',
		'^\\s*(?://|/\\*|\\*|#(?!!))\\s*\\S'
	].join('|'),
	'm'
);

const LONG_INPUT_SPLIT_THRESHOLD = 500;
const MAX_BUFFER_LENGTH = 900;
const FIRST_FLUSH_MAX = 260;
const CLOSING_PUNCTUATION = new Set([')', ']', '}', '"', "'", '\u201d', '\u2019']);
const STREAM_GROUP_MIN_SENTENCES = 2;
const STREAM_GROUP_MIN_LENGTH = 240;
const META_PREFIX_PATTERNS = [
	/^\s*(?:rough|literal|direct|close|draft)\s+translation\s*:\s*/i,
	/^\s*translation\s*:\s*/i,
	/^\s*translated\s+text\s*:\s*/i,
	/^\s*rough\s+draft\s*[:.-]?\s*/i,
	/^\s*transzlatása\s*:\s*/i,
	/^\s*transzláció\s*:\s*/i,
	/^\s*fordítás\s*:\s*/i
];
const SHORT_ENGLISH_ARTIFACT = /^[A-Za-z][A-Za-z' -]{0,24}[.!?]$/;

type PlaceholderMap = Record<string, string>;
type TranslationFallbackMode = 'original' | 'null';
type TranslateGemmaLanguageCode = 'eng_Latn' | 'hun_Latn';

function buildHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};

	const config = getConfig();
	if (config.translatorApiKey) {
		headers.Authorization = `Bearer ${config.translatorApiKey}`;
	}

	return headers;
}

function buildTranslateGemmaContent(
	sourceLanguage: TranslateGemmaLanguageCode,
	targetLanguage: TranslateGemmaLanguageCode,
	text: string
): string {
	return [
		`<<<source>>>${sourceLanguage}`,
		`<<<target>>>${targetLanguage}`,
		`<<<text>>>${text.trim()}`
	].join('\n');
}

async function requestTranslation(
	text: string,
	sourceLanguage: TranslateGemmaLanguageCode,
	targetLanguage: TranslateGemmaLanguageCode
): Promise<string | null> {
	const config = getConfig();
	const response = await fetch(`${config.translatorUrl}/chat/completions`, {
		method: 'POST',
		headers: buildHeaders(),
		body: JSON.stringify({
			model: config.translatorModel,
			messages: [
				{
					role: 'user',
					content: buildTranslateGemmaContent(sourceLanguage, targetLanguage, text)
				}
			],
			max_tokens: config.translationMaxTokens,
			temperature: config.translationTemperature,
			stream: false
		})
	});

	if (!response.ok) {
		throw new Error(`TranslateGemma error: ${response.status} ${response.statusText}`);
	}

	const json = await response.json();
	const translated =
		json.choices?.[0]?.message?.content ??
		json.choices?.[0]?.text ??
		(json.choices?.[0]?.message?.content?.[0]?.text as string | undefined);
	if (typeof translated !== 'string') {
		return null;
	}

	const normalized = translated.trim();
	return normalized || null;
}

function restorePlaceholders(text: string, placeholders: PlaceholderMap): string {
	let restored = text;
	for (const [key, original] of Object.entries(placeholders)) {
		if (restored.includes(key)) {
			restored = restored.replaceAll(key, original);
		} else {
			restored = `${restored}\n${original}`;
		}
	}
	return restored;
}

function detectAndProtectRawCode(text: string, placeholders: PlaceholderMap, counter: { value: number }) {
	const lines = text.split('\n');
	const result: string[] = [];
	let codeBlock: string[] = [];
	let codeScore = 0;

	const flushCode = () => {
		if (codeScore >= 2 && codeBlock.length >= 2) {
			const key = `__CODE_${++counter.value}__`;
			placeholders[key] = codeBlock.join('\n');
			result.push(key);
		} else {
			result.push(...codeBlock);
		}
		codeBlock = [];
		codeScore = 0;
	};

	for (const line of lines) {
		const isCodeLine = CODE_LINE_PATTERNS.test(line);
		const isIndented = line.startsWith('    ') || line.startsWith('\t');
		const isEmpty = !line.trim();

		if (isCodeLine || (isIndented && codeBlock.length > 0)) {
			codeBlock.push(line);
			if (isCodeLine) {
				codeScore += 1;
			}
			continue;
		}

		if (isEmpty && codeBlock.length > 0) {
			codeBlock.push(line);
			continue;
		}

		if (codeBlock.length > 0) {
			flushCode();
		}
		result.push(line);
	}

	if (codeBlock.length > 0) {
		flushCode();
	}

	return result.join('\n');
}

function extractInputPlaceholders(text: string): { cleaned: string; placeholders: PlaceholderMap } {
	const placeholders: PlaceholderMap = {};
	const counter = { value: 0 };
	const makeKey = (prefix: string) => `__${prefix}_${++counter.value}__`;

	let cleaned = text;
	cleaned = cleaned.replace(/```[\s\S]*?```/g, (match) => {
		const key = makeKey('CODE');
		placeholders[key] = match;
		return key;
	});

	cleaned = cleaned.replace(/`[^`\n]+`/g, (match) => {
		const key = makeKey('CODE');
		placeholders[key] = match;
		return key;
	});

	cleaned = cleaned.replace(/https?:\/\/\S+/g, (match) => {
		const key = makeKey('URL');
		placeholders[key] = match;
		return key;
	});

	cleaned = detectAndProtectRawCode(cleaned, placeholders, counter);

	return { cleaned, placeholders };
}

function splitHungarianSentences(text: string): string[] {
	const sentences: string[] = [];
	let current = '';
	let index = 0;

	while (index < text.length) {
		current += text[index];

		if (['.', '!', '?'].includes(text[index])) {
			const nextIsBoundary = index + 1 >= text.length || /\s/.test(text[index + 1]);

			if (nextIsBoundary && text[index] === '.') {
				const words = current.trimEnd().split(/\s+/);
				const lastWord = words[words.length - 1]?.toLowerCase();
				if (lastWord && INPUT_ABBREVIATIONS.has(lastWord)) {
					index += 1;
					continue;
				}

				if (index > 0 && /\d/.test(text[index - 1] ?? '')) {
					let nextIndex = index + 1;
					while (nextIndex < text.length && /\s/.test(text[nextIndex])) {
						nextIndex += 1;
					}
					if (nextIndex < text.length && /\d/.test(text[nextIndex])) {
						index += 1;
						continue;
					}
				}
			}

			if (nextIsBoundary) {
				while (index + 1 < text.length && /\s/.test(text[index + 1])) {
					index += 1;
					current += text[index];
				}
				sentences.push(current);
				current = '';
			}
		}

		index += 1;
	}

	if (current.trim()) {
		sentences.push(current);
	}

	return sentences.length > 0 ? sentences : [text];
}

function extractBlocks(text: string): { blocks: PlaceholderMap; textWithPlaceholders: string } {
	const blocks: PlaceholderMap = {};
	let counter = 0;

	const placeholder = (content: string) => {
		const key = `__BLOCK_${++counter}__`;
		blocks[key] = content;
		return `\n${key}\n`;
	};

	let updated = text.replace(/<preserve>(.*?)<\/preserve>/gs, (_, content: string) =>
		placeholder(content)
	);

	updated = updated.replace(/```[^\n]*\n.*?(?:\n```)(?=\s|$|[^\w`])/gs, (match) =>
		placeholder(match)
	);

	updated = updated.replace(/```[^\n]*\n.*?```/gs, (match) => placeholder(match));
	updated = updated.replace(/\n{3,}/g, '\n\n');

	return { blocks, textWithPlaceholders: updated };
}

function splitAroundBlocks(text: string, blocks: PlaceholderMap): string[] {
	const keys = Object.keys(blocks);
	if (keys.length === 0) {
		return [text];
	}

	const pattern = new RegExp(`(${keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`);
	return text.split(pattern);
}

function extractTerms(sentence: string): { protectedText: string; terms: PlaceholderMap } {
	const terms: PlaceholderMap = {};
	let counter = 0;

	const mark = (matchText: string) => {
		const key = `[T${++counter}]`;
		terms[key] = matchText;
		return key;
	};

	let protectedText = sentence;
	protectedText = protectedText.replace(/`[^`\n]+`/g, (match) => mark(match));
	protectedText = protectedText.replace(/\[[A-Z][^\]]*\]/g, (match) => mark(match));
	protectedText = protectedText.replace(/https?:\/\/\S+/g, (match) => mark(match));

	return { protectedText, terms };
}

function isHallucination(text: string): boolean {
	const lower = text.toLowerCase();
	return HALLUCINATION_PATTERNS.some((pattern) => lower.includes(pattern));
}

function sanitizeTranslationOutput(text: string): string {
	let sanitized = text;

	for (const pattern of META_PREFIX_PATTERNS) {
		sanitized = sanitized.replace(pattern, '');
	}

	sanitized = sanitized.replace(
		/(^|[\n\r]\s*)(?:rough|literal|close|draft)\s+translation\s*:\s*/gi,
		'$1'
	);
	sanitized = sanitized.replace(/(^|[\n\r]\s*)rough\s+draft\.?\s*/gi, '$1');
	sanitized = sanitized.replace(/(^|[\n\r]\s*)transzlatása\s*:\s*/gi, '$1');
	sanitized = sanitized.replace(/(^|[\n\r]\s*)transzláció\s*:\s*/gi, '$1');
	sanitized = removeShortEnglishArtifacts(sanitized);
	sanitized = dedupeAdjacentParagraphs(sanitized);
	sanitized = sanitized.replace(/[ \t]{2,}/g, ' ');
	sanitized = sanitized.replace(/\n{3,}/g, '\n\n');

	return sanitized.trim();
}

function removeShortEnglishArtifacts(text: string): string {
	return text
		.split('\n')
		.filter((line) => {
			const trimmed = line.trim();
			if (!trimmed) {
				return true;
			}

			if (!SHORT_ENGLISH_ARTIFACT.test(trimmed)) {
				return true;
			}

			return /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(trimmed);
		})
		.join('\n')
		.replace(/\s+([.!?])/g, '$1');
}

function normalizeParagraphForComparison(paragraph: string): string {
	return paragraph
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

function dedupeAdjacentParagraphs(text: string): string {
	const paragraphs = text.split(/\n\s*\n/);
	const deduped: string[] = [];

	for (const paragraph of paragraphs) {
		const trimmed = paragraph.trim();
		if (!trimmed) {
			continue;
		}

		const normalized = normalizeParagraphForComparison(trimmed);
		const previous = deduped[deduped.length - 1];
		if (previous) {
			const previousNormalized = normalizeParagraphForComparison(previous);
			if (
				normalized === previousNormalized ||
				(normalized.length > 120 &&
					previousNormalized.length > 120 &&
					(normalized.includes(previousNormalized) || previousNormalized.includes(normalized)))
			) {
				continue;
			}
		}

		deduped.push(trimmed);
	}

	return deduped.join('\n\n');
}

function hasBrokenTargetScript(text: string): boolean {
	const letters = Array.from(text.matchAll(/\p{L}/gu), (match) => match[0]);
	if (letters.length === 0) {
		return false;
	}

	const nonLatinLetters = letters.filter((letter) => !/\p{Script=Latin}/u.test(letter));
	return nonLatinLetters.length / letters.length > 0.15;
}

async function translateHungarianSegment(text: string): Promise<string> {
	try {
		const translated = await requestTranslation(text, 'hun_Latn', 'eng_Latn');
		if (!translated) {
			return text;
		}
		if (translated.length > text.length * 5) {
			return `${translated.slice(0, text.length * 3)}…`;
		}
		return translated;
	} catch {
		return text;
	}
}

async function translateEnglishSentenceInternal(
	sentence: string,
	options: { fallbackMode?: TranslationFallbackMode } = {}
): Promise<string | null> {
	const fallbackMode = options.fallbackMode ?? 'original';
	if (!sentence.trim()) {
		return sentence;
	}

	const leadingWhitespace = sentence.match(/^\s*/)?.[0] ?? '';
	const trailingWhitespace = sentence.match(/\s*$/)?.[0] ?? '';
	const coreSentence = sentence.slice(
		leadingWhitespace.length,
		sentence.length - trailingWhitespace.length
	);
	const { protectedText, terms } = extractTerms(coreSentence);

	let translated: string | null;
	try {
		translated = await requestTranslation(protectedText, 'eng_Latn', 'hun_Latn');
	} catch {
		return fallbackMode === 'null' ? null : sentence;
	}

	if (!translated) {
		return fallbackMode === 'null' ? null : sentence;
	}

	translated = sanitizeTranslationOutput(translated);

	if (
		!translated ||
		isHallucination(translated) ||
		hasBrokenTargetScript(translated) ||
		translated.length > protectedText.length * 3
	) {
		try {
			translated = await requestTranslation(protectedText, 'eng_Latn', 'hun_Latn');
		} catch {
			return fallbackMode === 'null' ? null : sentence;
		}

		if (translated) {
			translated = sanitizeTranslationOutput(translated);
		}

		if (
			!translated ||
			isHallucination(translated) ||
			hasBrokenTargetScript(translated) ||
			translated.length > protectedText.length * 3
		) {
			return fallbackMode === 'null' ? null : sentence;
		}
	}

	for (const key of Object.keys(terms)) {
		if (!translated.includes(key)) {
			translated = `${translated.trimEnd()} ${key}`;
		}
	}

	for (const [key, original] of Object.entries(terms)) {
		translated = translated.replaceAll(key, original);
	}

	return `${leadingWhitespace}${translated.trim()}${trailingWhitespace}`;
}

async function translateEnglishProse(text: string): Promise<string> {
	const buffer = new SentenceBuffer(MAX_BUFFER_LENGTH, FIRST_FLUSH_MAX);
	const translatedParts: string[] = [];
	const tokens = text.match(/\s+|\S+/g) ?? [text];

	for (const token of tokens) {
		for (const segment of buffer.addToken(token)) {
			translatedParts.push((await translateEnglishSentenceInternal(segment)) ?? segment);
		}
	}

	const remaining = buffer.flushRemaining();
	if (remaining) {
		translatedParts.push((await translateEnglishSentenceInternal(remaining)) ?? remaining);
	}

	return translatedParts.join('');
}

export async function translateHungarianToEnglish(text: string): Promise<string> {
	const { cleaned, placeholders } = extractInputPlaceholders(text);
	const translated =
		cleaned.length > LONG_INPUT_SPLIT_THRESHOLD
			? (
					await Promise.all(
						splitHungarianSentences(cleaned).map((segment) => translateHungarianSegment(segment.trim()))
					)
				).join(' ')
			: await translateHungarianSegment(cleaned);

	return Object.keys(placeholders).length > 0
		? restorePlaceholders(translated, placeholders)
		: translated;
}

export async function translateEnglishToHungarian(text: string): Promise<string> {
	const { blocks, textWithPlaceholders } = extractBlocks(text);
	if (Object.keys(blocks).length === 0) {
		return translateEnglishProse(text);
	}

	const parts = splitAroundBlocks(textWithPlaceholders, blocks);
	const translatedParts: string[] = [];

	for (const part of parts) {
		if (part in blocks) {
			if (
				translatedParts.length > 0 &&
				!translatedParts[translatedParts.length - 1].endsWith('\n')
			) {
				translatedParts.push('\n');
			}
			translatedParts.push(blocks[part]);
			translatedParts.push('\n');
			continue;
		}

		if (part.trim()) {
			translatedParts.push(await translateEnglishProse(part));
		} else {
			translatedParts.push(part);
		}
	}

	return translatedParts.join('');
}

export class SentenceBuffer {
	private buffer = '';
	private readonly maxLength: number;
	private readonly firstFlushMax: number;
	private isFirstFlush = true;

	constructor(maxLength = MAX_BUFFER_LENGTH, firstFlushMax = FIRST_FLUSH_MAX) {
		this.maxLength = maxLength;
		this.firstFlushMax = firstFlushMax;
	}

	addToken(token: string): string[] {
		this.buffer += token;
		return this.checkFlush();
	}

	flushRemaining(): string | null {
		if (this.buffer.trim()) {
			const remaining = this.buffer;
			this.buffer = '';
			return remaining;
		}
		return null;
	}

	private checkFlush(): string[] {
		const segments: string[] = [];

		if (this.buffer.length >= this.maxLength) {
			segments.push(this.buffer);
			this.buffer = '';
			this.isFirstFlush = false;
			return segments;
		}

		if (this.isFirstFlush) {
			const sentence = this.extractSentence();
			if (sentence) {
				segments.push(sentence);
				this.isFirstFlush = false;
				return segments;
			}

			if (this.buffer.length >= this.firstFlushMax) {
				const lastSpace = this.buffer.lastIndexOf(' ', this.firstFlushMax);
				if (lastSpace > 20) {
					segments.push(this.buffer.slice(0, lastSpace + 1));
					this.buffer = this.buffer.slice(lastSpace + 1);
				} else {
					segments.push(this.buffer);
					this.buffer = '';
				}
				this.isFirstFlush = false;
				return segments;
			}

			return segments;
		}

		const sentence = this.extractSentence();
		if (sentence) {
			segments.push(sentence);
		}

		return segments;
	}

	private extractSentence(): string | null {
		for (let index = 0; index < this.buffer.length; index += 1) {
			const char = this.buffer[index];
			if (!['.', '!', '?'].includes(char)) continue;

			let afterIndex = index + 1;
			while (
				afterIndex < this.buffer.length &&
				CLOSING_PUNCTUATION.has(this.buffer[afterIndex] ?? '')
			) {
				afterIndex += 1;
			}
			if (afterIndex < this.buffer.length && !/\s/.test(this.buffer[afterIndex])) {
				continue;
			}

			if (char === '.') {
				const words = this.buffer.slice(0, index + 1).split(/\s+/);
				const lastWord = words[words.length - 1]?.toLowerCase();
				if (lastWord && OUTPUT_ABBREVIATIONS.has(lastWord)) {
					continue;
				}
				if (index > 0 && /\d/.test(this.buffer[index - 1] ?? '')) {
					let nextIndex = afterIndex;
					while (nextIndex < this.buffer.length && this.buffer[nextIndex] === ' ') {
						nextIndex += 1;
					}
					if (nextIndex < this.buffer.length && /\d/.test(this.buffer[nextIndex] ?? '')) {
						continue;
					}
				}
			}

			let splitPos = afterIndex;
			while (splitPos < this.buffer.length && /\s/.test(this.buffer[splitPos])) {
				splitPos += 1;
			}

			const sentence = this.buffer.slice(0, splitPos);
			this.buffer = this.buffer.slice(splitPos);
			return sentence;
		}

		return null;
	}
}

export class StreamingHungarianTranslator {
	private proseBuffer = '';
	private insideFence = false;
	private insidePreserve = false;
	private deferredTranslation = '';
	private pendingSegments: string[] = [];
	private readonly sentenceBuffer = new SentenceBuffer(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);

	async addChunk(chunk: string): Promise<string[]> {
		const outputs: string[] = [];
		this.proseBuffer += chunk;

		while (this.proseBuffer.length > 0) {
			if (this.insideFence) {
				const endIndex = this.proseBuffer.indexOf('```');
				if (endIndex === -1) {
					return outputs;
				}

				const block = this.proseBuffer.slice(0, endIndex + 3);
				this.proseBuffer = this.proseBuffer.slice(endIndex + 3);
				this.insideFence = false;
				outputs.push(block);
				continue;
			}

			if (this.insidePreserve) {
				const endIndex = this.proseBuffer.indexOf('</preserve>');
				if (endIndex === -1) {
					return outputs;
				}

				const block = this.proseBuffer.slice(0, endIndex + '</preserve>'.length);
				this.proseBuffer = this.proseBuffer.slice(endIndex + '</preserve>'.length);
				this.insidePreserve = false;
				const preservedContent = block.replaceAll('<preserve>', '').replaceAll('</preserve>', '');
				outputs.push(`\`\`\`\n${preservedContent}\n\`\`\``);
				continue;
			}

			const fenceIndex = this.proseBuffer.indexOf('```');
			const preserveIndex = this.proseBuffer.indexOf('<preserve>');
			const nextBoundary = [fenceIndex, preserveIndex]
				.filter((value) => value >= 0)
				.sort((a, b) => a - b)[0];

			if (nextBoundary === undefined) {
				outputs.push(...(await this.translateAvailableProse()));
				break;
			}

			const prose = this.proseBuffer.slice(0, nextBoundary);
			this.proseBuffer = this.proseBuffer.slice(nextBoundary);
			if (prose) {
				this.proseBuffer = prose + this.proseBuffer;
				outputs.push(...(await this.translateAvailableProse(nextBoundary)));
				continue;
			}

			if (this.proseBuffer.startsWith('```')) {
				this.insideFence = true;
				this.proseBuffer = this.proseBuffer.slice(3);
				outputs.push('```');
				continue;
			}

			if (this.proseBuffer.startsWith('<preserve>')) {
				this.insidePreserve = true;
				this.proseBuffer = this.proseBuffer.slice('<preserve>'.length);
			}
		}

		return outputs;
	}

	private async translateAvailableProse(limit?: number): Promise<string[]> {
		const outputs: string[] = [];
		const prose = limit === undefined ? this.proseBuffer : this.proseBuffer.slice(0, limit);
		const remainder = limit === undefined ? '' : this.proseBuffer.slice(limit);

		for (const token of prose.match(/\s+|\S+/g) ?? []) {
			for (const segment of this.sentenceBuffer.addToken(token)) {
				this.pendingSegments.push(segment);
				outputs.push(...(await this.flushStableSegments()));
			}
		}

		this.proseBuffer = remainder;
		return outputs;
	}

	async flush(): Promise<string[]> {
		const outputs: string[] = [];
		if (this.proseBuffer.trim()) {
			for (const token of this.proseBuffer.match(/\s+|\S+/g) ?? [this.proseBuffer]) {
				for (const segment of this.sentenceBuffer.addToken(token)) {
					this.pendingSegments.push(segment);
				}
			}
		}

		outputs.push(...(await this.flushStableSegments(true)));

		const remaining = `${this.deferredTranslation}${this.pendingSegments.join('')}${this.sentenceBuffer.flushRemaining() ?? ''}`;
		if (remaining) {
			outputs.push((await translateEnglishSentenceInternal(remaining)) ?? remaining);
		}

		this.deferredTranslation = '';
		this.pendingSegments = [];
		this.proseBuffer = '';
		return outputs;
	}

	private async flushStableSegments(force = false): Promise<string[]> {
		const outputs: string[] = [];

		while (this.pendingSegments.length > 0) {
			const combinedPending = this.pendingSegments.join('');
			if (
				!force &&
				this.pendingSegments.length < STREAM_GROUP_MIN_SENTENCES &&
				combinedPending.trim().length < STREAM_GROUP_MIN_LENGTH
			) {
				break;
			}

			const segmentCount =
				force || combinedPending.trim().length >= STREAM_GROUP_MIN_LENGTH
					? this.pendingSegments.length
					: STREAM_GROUP_MIN_SENTENCES;
			const group = this.pendingSegments.splice(0, segmentCount).join('');
			const candidate = `${this.deferredTranslation}${group}`;
			const translated = await translateEnglishSentenceInternal(candidate, {
				fallbackMode: 'null'
			});
			if (translated === null) {
				this.deferredTranslation = candidate;
				continue;
			}

			this.deferredTranslation = '';
			outputs.push(translated);
		}

		return outputs;
	}
}
