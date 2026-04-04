export function getGenerateFileToolCode(input: Record<string, unknown>): string | null {
	const sourceCode =
		typeof input.source_code === 'string' && input.source_code.trim().length > 0
			? input.source_code
			: null;
	return sourceCode;
}

export function getGenerateFileToolLanguage(input: Record<string, unknown>): 'python' | 'javascript' {
	return input.language === 'javascript' ? 'javascript' : 'python';
}

export function getGenerateFileToolFilename(input: Record<string, unknown>): string | null {
	return typeof input.filename === 'string' && input.filename.trim().length > 0
		? input.filename.trim()
		: null;
}

export function inferGeneratedFilenameFromToolInput(input: Record<string, unknown>): string {
	const explicitFilename = getGenerateFileToolFilename(input);
	if (explicitFilename) {
		return explicitFilename;
	}

	const code = getGenerateFileToolCode(input) ?? '';
	const match = code.match(/\/output\/([^\s"'`)\]}]+)/);
	if (!match?.[1]) {
		return 'Generated file';
	}

	const rawName = match[1].split('/').at(-1)?.trim();
	return rawName && rawName.length > 0 ? rawName : 'Generated file';
}
