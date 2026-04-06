export type PreviewFileType =
	| 'pdf'
	| 'docx'
	| 'xlsx'
	| 'pptx'
	| 'odt'
	| 'image'
	| 'text'
	| 'unsupported';

const TEXT_EXTENSIONS = new Set([
	'txt',
	'md',
	'csv',
	'json',
	'html',
	'xml',
	'rtf',
	'css',
	'js',
	'py',
	'ts',
	'yaml',
	'yml',
	'sh',
	'bash',
	'zsh',
]);

const IMAGE_EXTENSIONS = new Set([
	'jpg',
	'jpeg',
	'jfif',
	'png',
	'gif',
	'webp',
	'svg',
	'bmp',
	'tif',
	'tiff',
	'heic',
	'heif',
	'avif',
]);

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
	pdf: 'application/pdf',
	doc: 'application/msword',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	xls: 'application/vnd.ms-excel',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	ppt: 'application/vnd.ms-powerpoint',
	pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	odt: 'application/vnd.oasis.opendocument.text',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	gif: 'image/gif',
	webp: 'image/webp',
	svg: 'image/svg+xml',
	bmp: 'image/bmp',
	tif: 'image/tiff',
	tiff: 'image/tiff',
	heic: 'image/heic',
	heif: 'image/heif',
	avif: 'image/avif',
	txt: 'text/plain',
	md: 'text/markdown',
	csv: 'text/csv',
	html: 'text/html',
	css: 'text/css',
	js: 'application/javascript',
	json: 'application/json',
	xml: 'application/xml',
	rtf: 'application/rtf',
	py: 'text/x-python',
	ts: 'application/typescript',
	yaml: 'application/yaml',
	yml: 'application/yaml',
	sh: 'application/x-sh',
	bash: 'application/x-sh',
	zsh: 'application/x-sh',
	zip: 'application/zip',
};

function getExtension(name: string): string | null {
	const ext = name.split('.').pop()?.toLowerCase().trim();
	return ext ? ext : null;
}

export function getPreviewContentType(filename: string, mimeType: string | null): string {
	if (mimeType) return mimeType;
	const ext = getExtension(filename);
	if (!ext) return 'application/octet-stream';
	return EXTENSION_CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

export function determinePreviewFileType(
	mimeType: string | null,
	filename: string
): PreviewFileType {
	const ext = getExtension(filename);
	const mime = mimeType?.toLowerCase() ?? null;

	if (!mime) {
		if (ext === 'pdf') return 'pdf';
		if (ext === 'docx') return 'docx';
		if (ext === 'xlsx') return 'xlsx';
		if (ext === 'pptx') return 'pptx';
		if (ext === 'odt') return 'odt';
		if (ext && IMAGE_EXTENSIONS.has(ext)) return 'image';
		if (ext && TEXT_EXTENSIONS.has(ext)) return 'text';
		return 'unsupported';
	}

	if (mime.includes('pdf')) return 'pdf';
	if (mime.includes('wordprocessingml')) return 'docx';
	if (mime.includes('spreadsheetml')) return 'xlsx';
	if (mime.includes('presentationml')) return 'pptx';
	if (mime === 'application/vnd.oasis.opendocument.text') return 'odt';
	if (mime.startsWith('image/')) return 'image';
	if (
		mime.startsWith('text/') ||
		mime === 'application/json' ||
		mime === 'application/csv' ||
		mime === 'application/xml' ||
		mime === 'application/rtf' ||
		mime === 'application/javascript' ||
		mime === 'text/javascript' ||
		mime === 'text/x-python' ||
		mime === 'application/typescript' ||
		mime === 'application/yaml'
	) {
		return 'text';
	}

	if (ext && TEXT_EXTENSIONS.has(ext)) return 'text';
	return 'unsupported';
}

export function isPreviewableFile(mimeType: string | null, filename: string): boolean {
	return determinePreviewFileType(mimeType, filename) !== 'unsupported';
}

export function getPreviewLanguage(
	mimeType: string | null,
	filename: string
): string | undefined {
	const ext = getExtension(filename);

	if (ext === 'py') return 'python';
	if (ext === 'js') return 'javascript';
	if (ext === 'ts') return 'typescript';
	if (ext === 'json') return 'json';
	if (ext === 'html') return 'html';
	if (ext === 'css') return 'css';
	if (ext === 'md') return 'markdown';
	if (ext === 'xml' || ext === 'svg') return 'xml';
	if (ext === 'yaml' || ext === 'yml') return 'yaml';
	if (ext === 'sh' || ext === 'bash' || ext === 'zsh') return 'bash';

	const mime = mimeType?.toLowerCase() ?? null;
	if (mime === 'application/json') return 'json';
	if (mime === 'application/xml') return 'xml';
	if (mime === 'text/html') return 'html';
	if (mime === 'text/css') return 'css';
	if (mime === 'application/javascript' || mime === 'text/javascript') return 'javascript';
	if (mime === 'text/markdown') return 'markdown';
	if (mime === 'text/x-python') return 'python';
	if (mime === 'application/typescript') return 'typescript';
	if (mime === 'application/yaml') return 'yaml';

	return undefined;
}
