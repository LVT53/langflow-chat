import { createSandbox, SANDBOX_MAX_FILE_MB, SANDBOX_MAX_OUTPUT_FILES, SANDBOX_MAX_TOTAL_OUTPUT_MB, SANDBOX_TIMEOUT_MS } from '../sandbox/config';
import tar from 'tar-stream';
import path from 'path';
import type { Container } from 'dockerode';

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
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.csv': 'text/csv',
	'.json': 'application/json',
	'.txt': 'text/plain',
	'.html': 'text/html',
};

const OUTPUT_DIR = '/output';

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

async function extractFilesFromContainer(container: Container): Promise<FileOutput[]> {
	const files: FileOutput[] = [];
	const maxFileSizeBytes = SANDBOX_MAX_FILE_MB * 1024 * 1024;
	const maxTotalBytes = SANDBOX_MAX_TOTAL_OUTPUT_MB * 1024 * 1024;
	let totalBytes = 0;

	try {
		const archiveStream = await container.getArchive({ path: OUTPUT_DIR });

		return new Promise((resolve, reject) => {
			const extract = tar.extract();

			extract.on('entry', (header, stream, next) => {
				// SECURITY: Reject non-file entries (directories, symlinks, devices, etc.)
				if (header.type !== 'file') {
					stream.resume();
					return next();
				}

				// SECURITY: Reject dangerous entry types (symlinks, hardlinks, devices)
				if (isDangerousEntryType(header)) {
					stream.resume();
					return next();
				}

				const name = header.name;

				// SECURITY: Reject path traversal attempts
				if (isPathTraversalAttempt(name)) {
					stream.resume();
					return next();
				}

				// SECURITY: Check max files limit
				if (files.length >= SANDBOX_MAX_OUTPUT_FILES) {
					stream.resume();
					return next();
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
						return next();
					}

					const content = Buffer.concat(chunks);

					// SECURITY: Check total output size limit
					if (totalBytes + content.length > maxTotalBytes) {
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

					next();
				});

				stream.on('error', () => {
					// Skip files with read errors
					next();
				});
			});

			extract.on('finish', () => resolve(files));
			extract.on('error', (err: Error) => reject(err));

			archiveStream.on('error', (err: Error) => reject(err));
			archiveStream.pipe(extract);
		});
	} catch {
		return [];
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

	if (exitCode !== 0 && exitCode !== undefined) {
		return `Execution failed with exit code ${exitCode}`;
	}

	return undefined;
}

export async function executeCode(code: string, language: 'python'): Promise<ExecutionResult> {
	if (language !== 'python') {
		return {
			files: [],
			stdout: '',
			stderr: '',
			error: `Unsupported language: ${language}. Only 'python' is supported.`,
		};
	}

	const sandbox = await createSandbox();

	try {
		const wrappedCode = `
import os
os.makedirs('${OUTPUT_DIR}', exist_ok=True)

${code}
`;

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

		let files: FileOutput[] = [];
		try {
			files = await extractFilesFromContainer(sandbox.container);
		} catch {
			// File extraction failed, continue without files
		}

		const error = classifyError(result.stderr, result.exitCode);

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