import { constants } from 'fs';
import { access, readFile } from 'fs/promises';
import { basename, delimiter, extname, join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const executableCache = new Map<string, Promise<string | null>>();

interface ExtractionResult {
	text: string | null;
	normalizedName: string;
	mimeType: string;
}

function decodeXmlEntities(value: string): string {
	return value
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

function stripMarkup(value: string): string {
	return decodeXmlEntities(
		value
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

function toNormalizedName(originalName: string): string {
	const stem = basename(originalName, extname(originalName));
	return `${stem || 'document'}.txt`;
}

function candidateExecutablePaths(command: string): string[] {
	if (command.includes('/') || command.includes('\\')) {
		return [command];
	}

	const pathEntries = (process.env.PATH ?? '')
		.split(delimiter)
		.map((entry) => entry.trim())
		.filter(Boolean);

	if (process.platform === 'win32') {
		const pathext = (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM')
			.split(';')
			.map((ext) => ext.trim())
			.filter(Boolean);

		return pathEntries.flatMap((entry) => [
			join(entry, command),
			...pathext.map((ext) => join(entry, `${command}${ext.toLowerCase()}`)),
		]);
	}

	return pathEntries.map((entry) => join(entry, command));
}

async function resolveExecutable(command: string): Promise<string | null> {
	const cached = executableCache.get(command);
	if (cached) return cached;

	const lookup = (async () => {
		for (const candidate of candidateExecutablePaths(command)) {
			try {
				await access(candidate, constants.X_OK);
				return candidate;
			} catch {
				// Keep looking until we find an executable on PATH.
			}
		}
		return null;
	})();

	executableCache.set(command, lookup);
	return lookup;
}

export function resetDocumentExtractionExecutableCache(): void {
	executableCache.clear();
}

async function execText(command: string, args: string[]): Promise<string | null> {
	try {
		const executable = await resolveExecutable(command);
		if (!executable) return null;
		const { stdout } = await execFileAsync(executable, args, { maxBuffer: 16 * 1024 * 1024 });
		const trimmed = stdout.trim();
		return trimmed.length > 0 ? trimmed : null;
	} catch {
		return null;
	}
}

async function extractOfficeXml(filePath: string, prefixes: string[]): Promise<string | null> {
	const listing = await execText('unzip', ['-Z1', filePath]);
	if (!listing) return null;

	const files = listing
		.split('\n')
		.map((item) => item.trim())
		.filter((item) => item.length > 0 && prefixes.some((prefix) => item.startsWith(prefix)));

	if (files.length === 0) return null;

	const chunks: string[] = [];
	for (const file of files) {
		const content = await execText('unzip', ['-p', filePath, file]);
		if (content) {
			chunks.push(stripMarkup(content));
		}
	}

	const text = chunks.join('\n\n').trim();
	return text.length > 0 ? text : null;
}

export async function extractDocumentText(
	filePath: string,
	mimeType: string | null,
	originalName: string
): Promise<ExtractionResult> {
	const extension = extname(originalName).toLowerCase();
	const normalizedName = toNormalizedName(originalName);

	if (mimeType === 'text/html' || extension === '.html') {
		const html = await readFile(filePath, 'utf8').catch(() => '');
		return {
			text: stripMarkup(html),
			normalizedName,
			mimeType: 'text/plain',
		};
	}

	if (mimeType === 'application/json' || extension === '.json') {
		const raw = await readFile(filePath, 'utf8').catch(() => '');
		try {
			const parsed = JSON.parse(raw);
			return {
				text: JSON.stringify(parsed, null, 2),
				normalizedName,
				mimeType: 'text/plain',
			};
		} catch {
			return {
				text: raw.trim() || null,
				normalizedName,
				mimeType: 'text/plain',
			};
		}
	}

	if (
		mimeType?.startsWith('text/') ||
		mimeType === 'application/xml' ||
		mimeType === 'application/rtf' ||
		mimeType === 'application/javascript' ||
		mimeType === 'text/javascript' ||
		mimeType === 'text/x-python' ||
		mimeType === 'application/typescript' ||
		mimeType === 'application/yaml' ||
		mimeType === 'image/svg+xml' ||
		['.txt', '.md', '.csv', '.xml', '.rtf', '.css', '.js', '.py', '.ts', '.yaml', '.yml', '.svg'].includes(extension)
	) {
		const text = await readFile(filePath, 'utf8').catch(() => '');
		return {
			text: text.trim() || null,
			normalizedName,
			mimeType: 'text/plain',
		};
	}

	if (mimeType === 'application/pdf' || extension === '.pdf') {
		const pdfText = await execText('pdftotext', ['-layout', filePath, '-']);
		if (pdfText) {
			return {
				text: pdfText,
				normalizedName,
				mimeType: 'text/plain',
			};
		}
	}

	if (
		mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
		extension === '.docx'
	) {
		const text = await extractOfficeXml(filePath, ['word/document.xml']);
		if (text) {
			return {
				text,
				normalizedName,
				mimeType: 'text/plain',
			};
		}
	}

	if (
		mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
		extension === '.pptx'
	) {
		const text = await extractOfficeXml(filePath, ['ppt/slides/slide']);
		if (text) {
			return {
				text,
				normalizedName,
				mimeType: 'text/plain',
			};
		}
	}

	if (
		mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
		extension === '.xlsx'
	) {
		const text = await extractOfficeXml(filePath, ['xl/sharedStrings.xml', 'xl/worksheets/sheet']);
		if (text) {
			return {
				text,
				normalizedName,
				mimeType: 'text/plain',
			};
		}
	}

	if (
		mimeType === 'application/vnd.oasis.opendocument.text' ||
		extension === '.odt'
	) {
		const text = await extractOfficeXml(filePath, ['content.xml']);
		if (text) {
			return {
				text,
				normalizedName,
				mimeType: 'text/plain',
			};
		}
	}

	const text = await execText('strings', [filePath]);
	return {
		text,
		normalizedName,
		mimeType: 'text/plain',
	};
}
