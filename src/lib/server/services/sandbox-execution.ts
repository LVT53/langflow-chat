import {
	createSandbox,
	executeSandboxCommand,
	SANDBOX_MAX_FILE_MB,
	SANDBOX_MAX_OUTPUT_FILES,
	SANDBOX_MAX_TOTAL_OUTPUT_MB,
	SANDBOX_TIMEOUT_MS,
	type SandboxLanguage,
} from '../sandbox/config';
import tar from 'tar-stream';
import path from 'path';
import type { Container } from 'dockerode';
import type { Readable } from 'stream';

export interface FileOutput {
	filename: string;
	mimeType: string;
	content: Buffer;
	sizeBytes: number;
}

export interface ExecutionResult {
	files: FileOutput[];
	stdout: string;
	stderr: string;
	exitCode?: number;
	error?: string;
}

const MIME_TYPES: Record<string, string> = {
	'.pdf': 'application/pdf',
	'.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'.xls': 'application/vnd.ms-excel',
	'.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.csv': 'text/csv',
	'.json': 'application/json',
	'.txt': 'text/plain',
	'.md': 'text/markdown',
	'.svg': 'image/svg+xml',
	'.html': 'text/html',
};

const OUTPUT_DIR = '/output';
const PYTHON_OUTPUT_INSPECTION_SCRIPT = `
import json
import os

root = ${JSON.stringify(OUTPUT_DIR)}
files = []
directories = []

if os.path.isdir(root):
    for current_root, dirnames, filenames in os.walk(root):
        rel_dir = os.path.relpath(current_root, root)
        directories.append('.' if rel_dir == '.' else rel_dir.replace(os.sep, '/'))
        for filename in filenames:
            full_path = os.path.join(current_root, filename)
            rel_path = os.path.relpath(full_path, root).replace(os.sep, '/')
            stat = os.stat(full_path)
            files.append({
                "path": full_path,
                "relativePath": rel_path,
                "sizeBytes": stat.st_size,
            })

print(json.dumps({
    "exists": os.path.exists(root),
    "isDir": os.path.isdir(root),
    "directories": directories,
    "files": files,
}))
`;

const JAVASCRIPT_OUTPUT_INSPECTION_SCRIPT = `
const fs = require('fs');
const path = require('path');

const root = ${JSON.stringify(OUTPUT_DIR)};
const files = [];
const directories = [];

function walk(currentRoot) {
	const relDir = path.relative(root, currentRoot).split(path.sep).join('/');
	directories.push(relDir === '' ? '.' : relDir);

	for (const entry of fs.readdirSync(currentRoot, { withFileTypes: true })) {
		const fullPath = path.join(currentRoot, entry.name);
		if (entry.isDirectory()) {
			walk(fullPath);
			continue;
		}

		if (!entry.isFile()) {
			continue;
		}

		const stat = fs.statSync(fullPath);
		const relPath = path.relative(root, fullPath).split(path.sep).join('/');
		files.push({
			path: fullPath,
			relativePath: relPath,
			sizeBytes: stat.size,
		});
	}
}

const exists = fs.existsSync(root);
const isDir = exists ? fs.statSync(root).isDirectory() : false;
if (isDir) {
	walk(root);
}

console.log(JSON.stringify({ exists, isDir, directories, files }));
`;

interface OutputInspectionFile {
	path: string;
	relativePath: string;
	sizeBytes: number;
}

interface OutputInspectionResult {
	exists: boolean;
	isDir: boolean;
	directories: string[];
	files: OutputInspectionFile[];
}

interface OutputReadbackFile {
	path: string;
	filename: string;
	sizeBytes: number;
	contentBase64: string;
}

function buildSandboxBootstrapCode(code: string, language: SandboxLanguage): string {
	if (language === 'javascript') {
		return `
const fs = require('fs');

(async () => {
	fs.mkdirSync(${JSON.stringify(OUTPUT_DIR)}, { recursive: true });
${code}
})().catch((error) => {
	console.error(error && error.stack ? error.stack : String(error));
	process.exit(1);
});
`;
	}

	return `
import os
os.makedirs('${OUTPUT_DIR}', exist_ok=True)

${code}
`;
}

function buildInspectionCommand(language: SandboxLanguage): string[] {
	if (language === 'javascript') {
		return ['node', '-e', JAVASCRIPT_OUTPUT_INSPECTION_SCRIPT];
	}

	return ['python3', '-c', PYTHON_OUTPUT_INSPECTION_SCRIPT];
}

function buildReadbackCommand(
	language: SandboxLanguage,
	inspectionFiles: OutputInspectionFile[]
): string[] {
	if (language === 'javascript') {
		const readbackScript = `
const fs = require('fs');
const path = require('path');

const paths = JSON.parse(${JSON.stringify(JSON.stringify(inspectionFiles.map((file) => file.path)))});
const files = paths.map((filePath) => {
	const content = fs.readFileSync(filePath);
	return {
		path: filePath,
		filename: path.basename(filePath),
		sizeBytes: content.length,
		contentBase64: content.toString('base64'),
	};
});

console.log(JSON.stringify({ files }));
`;

		return ['node', '-e', readbackScript];
	}

	const readbackScript = `
import base64
import json
import os

paths = json.loads(${JSON.stringify(JSON.stringify(inspectionFiles.map((file) => file.path)))})
files = []

for path in paths:
    with open(path, 'rb') as handle:
        content = handle.read()
    files.append({
        "path": path,
        "filename": os.path.basename(path),
        "sizeBytes": len(content),
        "contentBase64": base64.b64encode(content).decode('ascii'),
    })

print(json.dumps({"files": files}))
`;

	return ['python3', '-c', readbackScript];
}

function getMimeType(filename: string): string {
	const ext = path.extname(filename).toLowerCase();
	return MIME_TYPES[ext] || 'application/octet-stream';
}

function isPathTraversalAttempt(name: string): boolean {
	return (
		name.includes('..') ||
		path.isAbsolute(name) ||
		name.includes('\0') ||
		name.includes('\x00')
	);
}

function isDangerousEntryType(header: tar.Headers): boolean {
	return (
		header.type === 'symlink' ||
		header.type === 'link' ||
		header.type === 'block-device' ||
		header.type === 'character-device' ||
		header.type === 'fifo'
	);
}

function isExtractableFileEntry(header: tar.Headers): boolean {
	return header.type === 'file' || header.type === 'contiguous-file' || header.type == null;
}

function finishSkippedEntry(stream: Readable, next: (error?: unknown) => void): void {
	let done = false;

	const complete = (error?: unknown) => {
		if (done) return;
		done = true;
		next(error);
	};

	stream.once('end', () => complete());
	stream.once('close', () => complete());
	stream.once('error', (error) => complete(error));
	stream.resume();
}

async function extractFilesFromContainer(container: Container): Promise<FileOutput[]> {
	const files: FileOutput[] = [];
	const maxFileSizeBytes = SANDBOX_MAX_FILE_MB * 1024 * 1024;
	const maxTotalBytes = SANDBOX_MAX_TOTAL_OUTPUT_MB * 1024 * 1024;
	let totalBytes = 0;

	try {
		const archiveStream = await container.getArchive({ path: OUTPUT_DIR });
		console.info('[FILE_GENERATE] Reading sandbox output archive', {
			containerId: container.id,
			outputDir: OUTPUT_DIR,
		});

		return new Promise((resolve, reject) => {
			const extract = tar.extract();

			extract.on('entry', (header, stream, next) => {
				const name = header.name;
				const type = header.type ?? 'file';

				console.info('[FILE_GENERATE] Sandbox archive entry', {
					containerId: container.id,
					name,
					type,
					sizeBytes: header.size ?? null,
				});

				// SECURITY: Reject dangerous entry types (symlinks, hardlinks, devices)
				if (isDangerousEntryType(header)) {
					console.warn('[FILE_GENERATE] Skipping sandbox archive entry', {
						containerId: container.id,
						name,
						type,
						reason: 'dangerous-entry-type',
					});
					finishSkippedEntry(stream, next);
					return;
				}

				// SECURITY: Reject non-file entries (directories, pax headers, long-path metadata, etc.)
				if (!isExtractableFileEntry(header)) {
					console.info('[FILE_GENERATE] Skipping sandbox archive entry', {
						containerId: container.id,
						name,
						type,
						reason: 'non-file-entry',
					});
					finishSkippedEntry(stream, next);
					return;
				}

				// SECURITY: Reject path traversal attempts
				if (isPathTraversalAttempt(name)) {
					console.warn('[FILE_GENERATE] Skipping sandbox archive entry', {
						containerId: container.id,
						name,
						type,
						reason: 'path-traversal',
					});
					finishSkippedEntry(stream, next);
					return;
				}

				// SECURITY: Check max files limit
				if (files.length >= SANDBOX_MAX_OUTPUT_FILES) {
					console.warn('[FILE_GENERATE] Skipping sandbox archive entry', {
						containerId: container.id,
						name,
						type,
						reason: 'max-files-limit',
						maxFiles: SANDBOX_MAX_OUTPUT_FILES,
					});
					finishSkippedEntry(stream, next);
					return;
				}

				// Read file into memory (not to disk)
				const chunks: Buffer[] = [];
				let fileSize = 0;

				stream.on('data', (chunk: Buffer) => {
					fileSize += chunk.length;
					// SECURITY: Enforce per-file size limit during streaming
					if (fileSize <= maxFileSizeBytes) {
						chunks.push(chunk);
					}
				});

				stream.on('end', () => {
					// SECURITY: Skip files that exceed per-file size limit
					if (fileSize > maxFileSizeBytes) {
						console.warn('[FILE_GENERATE] Skipping sandbox archive entry', {
							containerId: container.id,
							name,
							type,
							reason: 'max-file-size-limit',
							sizeBytes: fileSize,
							maxFileSizeBytes,
						});
						return next();
					}

					const content = Buffer.concat(chunks);

					// SECURITY: Check total output size limit
					if (totalBytes + content.length > maxTotalBytes) {
						console.warn('[FILE_GENERATE] Skipping sandbox archive entry', {
							containerId: container.id,
							name,
							type,
							reason: 'max-total-size-limit',
							sizeBytes: content.length,
							totalBytes,
							maxTotalBytes,
						});
						return next();
					}

					totalBytes += content.length;

					// Extract just the filename (basename) to avoid any path components
					const filename = path.basename(name);

					files.push({
						filename,
						mimeType: getMimeType(filename),
						content,
						sizeBytes: content.length,
					});

					console.info('[FILE_GENERATE] Accepted sandbox archive file', {
						containerId: container.id,
						name,
						filename,
						sizeBytes: content.length,
					});

					next();
				});

				stream.on('error', (error) => {
					console.warn('[FILE_GENERATE] Sandbox archive entry read failed', {
						containerId: container.id,
						name,
						type,
						error,
					});
					next();
				});
			});

			extract.on('finish', () => {
				console.info('[FILE_GENERATE] Finished reading sandbox output archive', {
					containerId: container.id,
					fileCount: files.length,
					files: files.map((file) => ({
						filename: file.filename,
						sizeBytes: file.sizeBytes,
						mimeType: file.mimeType,
					})),
				});
				resolve(files);
			});
			extract.on('error', (err: Error) => reject(err));

			archiveStream.on('error', (err: Error) => reject(err));
			archiveStream.pipe(extract);
		});
	} catch (error) {
		console.error('[FILE_GENERATE] Failed to read sandbox output archive', {
			containerId: container.id,
			outputDir: OUTPUT_DIR,
			error,
		});
		throw error;
	}
}

function classifyError(stderr: string, exitCode: number): string | undefined {
	if (exitCode === 137 || stderr.includes('MemoryError') || stderr.includes('OutOfMemoryError')) {
		return 'Execution failed: memory limit exceeded';
	}

	if (stderr.includes('SyntaxError') || stderr.includes('IndentationError')) {
		return `Syntax error: ${stderr}`;
	}

	if (stderr.includes('ImportError') || stderr.includes('ModuleNotFoundError')) {
		return `Import error: ${stderr}`;
	}

	if (stderr.includes('Cannot find module') || stderr.includes('ERR_MODULE_NOT_FOUND')) {
		return `Import error: ${stderr}`;
	}

	if (exitCode !== 0 && exitCode !== undefined) {
		return `Execution failed with exit code ${exitCode}`;
	}

	return undefined;
}

async function inspectOutputDirectory(
	container: Container,
	language: SandboxLanguage
): Promise<OutputInspectionResult | null> {
	const inspection = await executeSandboxCommand(container, buildInspectionCommand(language));

	if (inspection.exitCode !== 0) {
		console.warn('[FILE_GENERATE] In-container output inspection failed', {
			containerId: container.id,
			exitCode: inspection.exitCode,
			stdoutPreview: inspection.stdout || null,
			stderrPreview: inspection.stderr || null,
		});
		return null;
	}

	if (!inspection.stdout) {
		console.warn('[FILE_GENERATE] In-container output inspection returned no stdout', {
			containerId: container.id,
			stderrPreview: inspection.stderr || null,
		});
		return null;
	}

	try {
		const parsed = JSON.parse(inspection.stdout) as OutputInspectionResult;
		console.info('[FILE_GENERATE] In-container output inspection completed', {
			containerId: container.id,
			exists: parsed.exists,
			isDir: parsed.isDir,
			directories: parsed.directories,
			fileCount: parsed.files.length,
			files: parsed.files,
		});
		return parsed;
	} catch (error) {
		console.warn('[FILE_GENERATE] In-container output inspection parse failed', {
			containerId: container.id,
			stdoutPreview: inspection.stdout.slice(0, 500),
			stderrPreview: inspection.stderr || null,
			error,
		});
		return null;
	}
}

async function readFilesFromInsideContainer(
	container: Container,
	language: SandboxLanguage,
	inspectionFiles: OutputInspectionFile[]
): Promise<FileOutput[]> {
	const readback = await executeSandboxCommand(container, buildReadbackCommand(language, inspectionFiles));

	if (readback.exitCode !== 0) {
		throw new Error(readback.stderr || `In-container file read failed with exit code ${readback.exitCode}`);
	}

	if (!readback.stdout) {
		throw new Error('In-container file read returned no stdout');
	}

	let parsed: { files: OutputReadbackFile[] };
	try {
		parsed = JSON.parse(readback.stdout) as { files: OutputReadbackFile[] };
	} catch (error) {
		throw new Error(
			`In-container file read returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`
		);
	}

	const files: FileOutput[] = [];
	const maxFileSizeBytes = SANDBOX_MAX_FILE_MB * 1024 * 1024;
	const maxTotalBytes = SANDBOX_MAX_TOTAL_OUTPUT_MB * 1024 * 1024;
	let totalBytes = 0;

	for (const file of parsed.files) {
		if (files.length >= SANDBOX_MAX_OUTPUT_FILES) {
			console.warn('[FILE_GENERATE] Skipping in-container output file', {
				containerId: container.id,
				path: file.path,
				reason: 'max-files-limit',
				maxFiles: SANDBOX_MAX_OUTPUT_FILES,
			});
			break;
		}

		const content = Buffer.from(file.contentBase64, 'base64');
		if (content.length !== file.sizeBytes) {
			console.warn('[FILE_GENERATE] Skipping in-container output file', {
				containerId: container.id,
				path: file.path,
				reason: 'size-mismatch',
				reportedSizeBytes: file.sizeBytes,
				decodedSizeBytes: content.length,
			});
			continue;
		}

		if (content.length > maxFileSizeBytes) {
			console.warn('[FILE_GENERATE] Skipping in-container output file', {
				containerId: container.id,
				path: file.path,
				reason: 'max-file-size-limit',
				sizeBytes: content.length,
				maxFileSizeBytes,
			});
			continue;
		}

		if (totalBytes + content.length > maxTotalBytes) {
			console.warn('[FILE_GENERATE] Skipping in-container output file', {
				containerId: container.id,
				path: file.path,
				reason: 'max-total-size-limit',
				sizeBytes: content.length,
				totalBytes,
				maxTotalBytes,
			});
			continue;
		}

		totalBytes += content.length;
		const filename = path.basename(file.filename);

		files.push({
			filename,
			mimeType: getMimeType(filename),
			content,
			sizeBytes: content.length,
		});
	}

	console.info('[FILE_GENERATE] In-container fallback file read completed', {
		containerId: container.id,
		fileCount: files.length,
		files: files.map((file) => ({
			filename: file.filename,
			sizeBytes: file.sizeBytes,
			mimeType: file.mimeType,
		})),
	});

	return files;
}

export async function executeCode(code: string, language: SandboxLanguage): Promise<ExecutionResult> {
	if (language !== 'python' && language !== 'javascript') {
		return {
			files: [],
			stdout: '',
			stderr: '',
			error: `Unsupported language: ${language}. Supported languages are 'python' and 'javascript'.`,
		};
	}

	const sandbox = await createSandbox(language);

	try {
		const wrappedCode = buildSandboxBootstrapCode(code, language);

		const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
			const timeoutId = setTimeout(async () => {
				// SECURITY: Kill the container on timeout, not just reject
				try {
					await sandbox.container.kill({ signal: 'SIGKILL' });
				} catch {
					// Container may already be stopped
				}
				reject(new Error(`Sandbox execution timed out after ${SANDBOX_TIMEOUT_MS}ms`));
			}, SANDBOX_TIMEOUT_MS);

			sandbox.execute(wrappedCode)
				.then((res) => {
					clearTimeout(timeoutId);
					resolve(res);
				})
				.catch((err) => {
					clearTimeout(timeoutId);
					reject(err);
				});
		});

		const outputInspection =
			result.exitCode === 0 ? await inspectOutputDirectory(sandbox.container, language) : null;

		let files: FileOutput[] = [];
		let extractionError: string | undefined;
		try {
			files = await extractFilesFromContainer(sandbox.container);
			if (files.length === 0 && (outputInspection?.files.length ?? 0) > 0) {
				console.warn('[FILE_GENERATE] Archive extraction missed in-container output files; falling back to in-container read', {
					containerId: sandbox.container.id,
					fileCount: outputInspection?.files.length ?? 0,
					files: outputInspection?.files ?? [],
				});
				files = await readFilesFromInsideContainer(
					sandbox.container,
					language,
					outputInspection?.files ?? []
				);
			}
		} catch (error) {
			extractionError = error instanceof Error ? error.message : String(error);
		}

		if (!extractionError && files.length === 0 && (outputInspection?.files.length ?? 0) > 0) {
			extractionError = 'Generated files were visible inside the sandbox but could not be collected';
		}

		const error = classifyError(result.stderr, result.exitCode) ??
			(extractionError ? `Failed to collect generated files: ${extractionError}` : undefined);

		return {
			files,
			stdout: result.stdout,
			stderr: result.stderr,
			exitCode: result.exitCode,
			error,
		};
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);

		if (errorMessage.includes('timed out')) {
			return {
				files: [],
				stdout: '',
				stderr: '',
				error: 'Execution timed out',
			};
		}

		return {
			files: [],
			stdout: '',
			stderr: '',
			error: `Execution failed: ${errorMessage}`,
		};
	} finally {
		await sandbox.destroy();
	}
}
