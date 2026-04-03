export function getGenerateFileToolCode(input: Record<string, unknown>): string | null {
	const pythonCode =
		typeof input.python_code === 'string' && input.python_code.trim().length > 0
			? input.python_code
			: null;
	if (pythonCode) {
		return pythonCode;
	}

	const code =
		typeof input.code === 'string' && input.code.trim().length > 0 ? input.code : null;
	return code;
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
