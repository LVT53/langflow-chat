import { createSandbox, SANDBOX_MAX_FILE_MB, SANDBOX_MAX_OUTPUT_FILES, SANDBOX_MAX_TOTAL_OUTPUT_MB, SANDBOX_TIMEOUT_MS } from '../sandbox/config';
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
		let extractionError: string | undefined;
		try {
			files = await extractFilesFromContainer(sandbox.container);
		} catch (error) {
			extractionError = error instanceof Error ? error.message : String(error);
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
