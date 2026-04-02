import Docker from 'dockerode';
import type { Container } from 'dockerode';

export const SANDBOX_TIMEOUT_MS = 60000;
export const SANDBOX_MEMORY_MB = 1024;
export const SANDBOX_MAX_FILE_MB = 50;
export const SANDBOX_MAX_OUTPUT_FILES = 20;
export const SANDBOX_MAX_TOTAL_OUTPUT_MB = 50;

const SANDBOX_IMAGE = 'python:3.11-slim';

export interface Sandbox {
	container: Container;
	execute: (code: string) => Promise<SandboxResult>;
	destroy: () => Promise<void>;
}

export interface SandboxResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

const docker = new Docker();

export async function createSandbox(): Promise<Sandbox> {
	const memoryBytes = SANDBOX_MEMORY_MB * 1024 * 1024;

	const container = await docker.createContainer({
		Image: SANDBOX_IMAGE,
		Cmd: ['python3', '-c', 'import sys; sys.stdin.read()'],
		Tty: false,
		OpenStdin: true,
		StdinOnce: false,
		StopTimeout: SANDBOX_TIMEOUT_MS / 1000,
		// SECURITY: Run as non-root user (UID 1000, GID 1000)
		User: '1000:1000',
		HostConfig: {
			Memory: memoryBytes,
			MemorySwap: memoryBytes,
			CpuQuota: 100000,
			NetworkMode: 'none',
			AutoRemove: true,
			ReadonlyRootfs: true,
			SecurityOpt: ['no-new-privileges:true'],
			// SECURITY: Drop all Linux capabilities
			CapDrop: ['ALL'],
			// SECURITY: Ensure container is not privileged
			Privileged: false,
			// SECURITY: Limit number of processes (fork bomb protection)
			PidsLimit: 100,
			// SECURITY: Writable tmpfs for output and temp (since rootfs is readonly and we run as non-root)
			Tmpfs: {
				'/output': 'rw,size=100m,mode=1777',
				'/tmp': 'rw,size=50m,mode=1777',
			},
		},
		Labels: {
			'alfyai.sandbox': 'true',
			'alfyai.sandbox.version': '1',
		},
	});

	await container.start();

	async function execute(code: string): Promise<SandboxResult> {
		const exec = await container.exec({
			Cmd: ['python3', '-c', code],
			AttachStdout: true,
			AttachStderr: true,
		});

		const stream = await exec.start({
			hijack: false,
			stdin: false,
		});

		let stdout = '';
		let stderr = '';

		return new Promise((resolve, reject) => {
			stream.on('data', (chunk: Buffer) => {
				const header = chunk[0];
				const payload = chunk.slice(8).toString('utf-8');
				
				if (header === 1) {
					stdout += payload;
				} else if (header === 2) {
					stderr += payload;
				}
			});

			stream.on('end', async () => {
				try {
					const inspect = await exec.inspect();
					resolve({
						stdout: stdout.trim(),
						stderr: stderr.trim(),
						exitCode: inspect.ExitCode ?? -1,
					});
				} catch (error) {
					reject(error);
				}
			});

			stream.on('error', (error: Error) => {
				reject(error);
			});
		});
	}

	async function destroy(): Promise<void> {
		await destroySandbox(container);
	}

	return {
		container,
		execute,
		destroy,
	};
}

export async function destroySandbox(container: Container): Promise<void> {
	try {
		await container.stop({ t: 10 });
	} catch {
		// Container may already be stopped
	}

	try {
		await container.remove({ force: true });
	} catch {
		// Container may already be removed
	}
}
