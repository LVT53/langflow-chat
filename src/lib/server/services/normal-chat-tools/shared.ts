import { createHash } from "node:crypto";

import type { ToolCallEntry } from "$lib/types";

// ── Record helper ──────────────────────────────────────────────

export function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// ── Text helpers ───────────────────────────────────────────────

export function truncateText(
	value: string | null | undefined,
	maxLength: number,
): string {
	const text = value ?? "";
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength).trimEnd()}...`;
}

// ── Stable serialization ───────────────────────────────────────

export function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(",")}]`;
	}
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value) ?? "undefined";
}

export function shortHash(value: unknown): string {
	return createHash("sha256")
		.update(stableStringify(value))
		.digest("hex")
		.slice(0, 12);
}

// ── Metadata ───────────────────────────────────────────────────

export function sanitizeMetadata(
	metadata: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> {
	return Object.fromEntries(
		Object.entries(metadata).filter(
			([, value]) =>
				["string", "number", "boolean"].includes(typeof value) ||
				value === null,
		),
	);
}

export function optionalScalarMetadata(
	value: string | number | boolean | null | undefined,
): string | number | boolean | null | undefined {
	return value === undefined ? undefined : value;
}

// ── Tool call recorder ─────────────────────────────────────────

export interface ToolCallRecorder {
	record(entry: ToolCallEntry): ToolCallEntry;
	getEntries(): ToolCallEntry[];
}

export function recordToolCallEntry(
	entries: ToolCallEntry[],
	entry: ToolCallEntry,
): ToolCallEntry {
	const normalized: ToolCallEntry = {
		...entry,
		input: { ...entry.input },
		outputSummary: entry.outputSummary ?? null,
		metadata: entry.metadata ? { ...entry.metadata } : undefined,
	};
	entries.push(normalized);
	return normalized;
}

export function createToolCallRecorder(
	initialEntries: ToolCallEntry[] = [],
): ToolCallRecorder {
	const entries = initialEntries;
	return {
		record(entry) {
			return recordToolCallEntry(entries, entry);
		},
		getEntries() {
			return [...entries];
		},
	};
}

// ── Timeout ────────────────────────────────────────────────────

export const TOOL_TIMEOUTS_MS: Record<string, number> = {
	research_web: 60_000,
	memory_context: 15_000,
	image_search: 30_000,
	produce_file: 30_000,
};

export async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	toolName: string,
): Promise<T> {
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			reject(new Error(`${toolName} timed out after ${timeoutMs}ms`));
		}, timeoutMs);
	});

	try {
		return await Promise.race([promise, timeout]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}
