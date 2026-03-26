export function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

export function clipText(value: string, maxLength: number): string {
	const normalized = normalizeWhitespace(value);
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function clipNullableText(
	value: string | null | undefined,
	maxLength: number
): string | null {
	const normalized = value ? normalizeWhitespace(value) : '';
	if (!normalized) return null;
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
