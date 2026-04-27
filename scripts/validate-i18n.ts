#!/usr/bin/env npx tsx
/**
 * i18n Translation Quality Validator
 *
 * Usage: npx tsx scripts/validate-i18n.ts
 *
 * Checks:
 * 1. Missing keys (EN has, HU doesn't)
 * 2. Untranslated text (EN/HU values are identical)
 * 3. Very similar text (likely copy-paste not translated)
 * 4. Empty HU values
 * 5. Parameter ({name}) mismatches between EN and HU
 * 6. Same-character ratio (if HU looks suspiciously like EN)
 *
 * Exit codes:
 *   0 = no issues
 *   1 = issues found
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const I18N_PATH = path.resolve('src/lib/i18n.ts');

// --- Parse i18n.ts ---

function parseI18n(content: string) {
	const en: Record<string, string> = {};
	const hu: Record<string, string> = {};

	// Extract block content between matching braces for a key prefix
	function extractBracedBlock(text: string, startIdx: number): string {
		let depth = 0;
		let start = text.indexOf('{', startIdx);
		if (start === -1) return '';
		depth = 1;
		let i = start + 1;
		while (depth > 0 && i < text.length) {
			if (text[i] === '{') depth++;
			else if (text[i] === '}') depth--;
			i++;
		}
		return text.slice(start + 1, i - 1);
	}

	const enIdx = content.search(/\ben\s*:/);
	const huIdx = content.search(/\bhu\s*:/);
	if (enIdx === -1) throw new Error('Could not find en: block');
	if (huIdx === -1) throw new Error('Could not find hu: block');

	const enBlock = extractBracedBlock(content, enIdx);
	const huBlock = extractBracedBlock(content, huIdx);

	function extractKeyValues(block: string, target: Record<string, string>) {
		// Match lines like: keyName: "value" or "key.name": `value` or keyName: `value`
		const regex = /(?:["'])?([\w.]+)(?:["'])?\s*:\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`]*)`)/g;
		let match;
		while ((match = regex.exec(block)) !== null) {
			const key = match[1];
			const value = (match[2] ?? match[3] ?? '').trim();
			if (key && value !== undefined) {
				target[key] = value;
			}
		}
	}

	extractKeyValues(enBlock, en);
	extractKeyValues(huBlock, hu);

	return { en, hu };
}

function levenshtein(a: string, b: string): number {
	const m = a.length;
	const n = b.length;
	const dp: number[][] = [];
	for (let i = 0; i <= m; i++) {
		dp[i] = [i];
	}
	for (let j = 0; j <= n; j++) {
		dp[0][j] = j;
	}
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			dp[i][j] = Math.min(
				dp[i - 1][j] + 1,
				dp[i][j - 1] + 1,
				dp[i - 1][j - 1] + cost,
			);
		}
	}
	return dp[m][n];
}

function similarity(a: string, b: string): number {
	if (a.length === 0 && b.length === 0) return 1;
	if (a.length === 0 || b.length === 0) return 0;
	const dist = levenshtein(a.toLowerCase(), b.toLowerCase());
	const maxLen = Math.max(a.length, b.length);
	return 1 - dist / maxLen;
}

function extractParams(value: string): Set<string> {
	const params = new Set<string>();
	let cleanValue = value;
	const icuPattern = /\{(\w+),\s*\w+,/g;
	let icuMatch;
	while ((icuMatch = icuPattern.exec(cleanValue)) !== null) {
		let depth = 1;
		let end = icuMatch.index + icuMatch[0].length;
		while (depth > 0 && end < cleanValue.length) {
			if (cleanValue[end] === '{') depth++;
			else if (cleanValue[end] === '}') depth--;
			end++;
		}
		const prefix = cleanValue.slice(0, icuMatch.index);
		const suffix = cleanValue.slice(end);
		cleanValue = prefix + '{' + icuMatch[1] + '}' + suffix;
		icuPattern.lastIndex = 0;
	}
	const regex = /\{(\w+)\}/g;
	let match;
	while ((match = regex.exec(cleanValue)) !== null) {
		params.add(match[1]);
	}
	return params;
}

// --- Main validation ---

function validate() {
	const content = fs.readFileSync(I18N_PATH, 'utf-8');
	const { en, hu } = parseI18n(content);

	const issues: string[] = [];
	let warnings = 0;
	let errors = 0;

	const enKeys = new Set(Object.keys(en));
	const huKeys = new Set(Object.keys(hu));

	// Check 1: Missing Hungarian keys
	for (const key of enKeys) {
		if (!huKeys.has(key)) {
			issues.push(`[ERROR] Missing HU key: "${key}" (EN: "${en[key]}")`);
			errors++;
		}
	}

	// Check 2: Extra HU keys (not in EN)
	for (const key of huKeys) {
		if (!enKeys.has(key)) {
			issues.push(`[WARN] Extra HU key (no EN equivalent): "${key}" (HU: "${hu[key]}")`);
			warnings++;
		}
	}

	// Check 3-6: For keys in both languages
	for (const key of enKeys) {
		if (!huKeys.has(key)) continue;

		const enVal = en[key].trim();
		const huVal = hu[key].trim();
		const sim = similarity(enVal, huVal);

		// Check: empty HU
		if (huVal === '') {
			issues.push(`[ERROR] Empty HU translation for key "${key}" (EN: "${enVal}")`);
			errors++;
			continue;
		}

		// Check: identical strings (not translated)
		if (enVal === huVal) {
			issues.push(`[WARN] Untranslated key "${key}" — HU equals EN: "${enVal}"`);
			warnings++;
			continue;
		}

		// Check: very similar strings (likely copy-paste minor edit)
		if (sim > 0.85 && enVal.length > 10) {
			issues.push(
				`[WARN] Suspiciously similar (${(sim * 100).toFixed(0)}% match) key "${key}": EN="${enVal}" / HU="${huVal}"`,
			);
			warnings++;
		}

		// Check: parameter mismatch
		const enParams = extractParams(enVal);
		const huParams = extractParams(huVal);
		if (enParams.size !== huParams.size || ![...enParams].every((p) => huParams.has(p))) {
			issues.push(
				`[ERROR] Parameter mismatch for key "${key}": EN params=[${[...enParams].join(',')}] HU params=[${[...huParams].join(',')}]`,
			);
			errors++;
		}
	}

	// --- Output ---
	console.log(`\n📊 i18n Translation Quality Report`);
	console.log(`   ${'='.repeat(40)}`);
	console.log(`   Total EN keys: ${enKeys.size}`);
	console.log(`   Total HU keys: ${huKeys.size}`);
	console.log(`   Missing HU keys: ${[...enKeys].filter(k => !huKeys.has(k)).length}`);
	console.log(`   Coverage: ${((huKeys.size / enKeys.size) * 100).toFixed(1)}%`);
	console.log(`   ${'='.repeat(40)}\n`);

	if (issues.length === 0) {
		console.log('✅ No issues found — translations look clean!');
		return 0;
	}

	console.log(`Found ${errors} error(s) and ${warnings} warning(s):\n`);
	for (const issue of issues) {
		console.log(`  ${issue}`);
	}

	return errors > 0 ? 1 : 0;
}

process.exit(validate());
