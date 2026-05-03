import path from 'node:path';

const EXTENSION_MIME_TYPES: Record<string, string[]> = {
	'.pdf': ['application/pdf'],
	'.txt': ['text/plain'],
	'.csv': ['text/csv', 'text/plain'],
	'.html': ['text/html'],
	'.json': ['application/json', 'text/json', 'text/plain'],
	'.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
	'.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
	'.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
	'.odt': ['application/vnd.oasis.opendocument.text'],
	'.zip': ['application/zip', 'application/x-zip-compressed'],
};

export function isGeneratedFileTypeAllowed(filename: string, mimeType: string | null): boolean {
	const extension = path.extname(filename).toLowerCase();
	if (!extension || !mimeType) {
		return true;
	}

	const allowedMimeTypes = EXTENSION_MIME_TYPES[extension];
	if (!allowedMimeTypes) {
		return true;
	}

	const normalizedMimeType = mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
	return allowedMimeTypes.includes(normalizedMimeType);
}
