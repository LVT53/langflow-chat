import { createSandbox, SANDBOX_MAX_FILE_MB } from '../sandbox/config';
import tar from 'tar-fs';
import { PassThrough } from 'stream';
import { promisify } from 'util';
import path from 'path';

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

async function extractFilesFromContainer(container: { getArchive: (opts: { path: string }) => Promise<NodeJS.ReadableStream> }): Promise<FileOutput[]> {
	const files: FileOutput[] = [];
	const maxFileSizeBytes = SANDBOX_MAX_FILE_MB * 1024 * 1024;

	try {
		const archiveStream = await container.getArchive({ path: OUTPUT_DIR });
		
		return new Promise((resolve, reject) => {
			const extractStream = tar.extract('/', {
				mapStream: (fileStream, header) => {
					const chunks: Buffer[] = [];
					let totalSize = 0;

					fileStream.on('data', (chunk: Buffer) => {
						totalSize += chunk.length;
						if (totalSize <= maxFileSizeBytes) {
							chunks.push(chunk);
						}
					});

					fileStream.on('end', () => {
						if (totalSize > maxFileSizeBytes) {
							return;
						}

						const name = header.name;
						if (name && !name.endsWith('/')) {
							const filename = path.basename(name);
							const content = Buffer.concat(chunks);
							
							files.push({
								filename,
								mimeType: getMimeType(filename),
								content,
								sizeBytes: content.length,
							});
						}
					});

					return fileStream;
				},
			});

			archiveStream.on('error', (err: Error) => {
				reject(err);
			});

			extractStream.on('error', (err: Error) => {
				reject(err);
			});

			extractStream.on('finish', () => {
				resolve(files);
			});

			archiveStream.pipe(extractStream);
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

		const result = await sandbox.execute(wrappedCode);
		
		let files: FileOutput[] = [];
		try {
			files = await extractFilesFromContainer(sandbox.container);
		} catch {
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