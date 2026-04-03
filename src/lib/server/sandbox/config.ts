import Docker from 'dockerode';
import type { Container, Exec, ExecInspectInfo } from 'dockerode';
import { PassThrough } from 'stream';

export const SANDBOX_TIMEOUT_MS = 60000;
export const SANDBOX_MEMORY_MB = 1024;
export const SANDBOX_MAX_FILE_MB = 50;
export const SANDBOX_MAX_OUTPUT_FILES = 20;
export const SANDBOX_MAX_TOTAL_OUTPUT_MB = 50;

const SANDBOX_IMAGE = 'python:3.11-slim';
const SANDBOX_EXEC_POLL_MS = 25;
let sandboxImageReady = false;
let sandboxImagePullPromise: Promise<void> | null = null;
let sandboxWarmupStarted = false;

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

function isDockerodeStatusError(error: unknown): error is { statusCode?: number; json?: { message?: string } } {
	return typeof error === 'object' && error !== null;
}

async function hasSandboxImage(): Promise<boolean> {
	try {
		await docker.getImage(SANDBOX_IMAGE).inspect();
		return true;
	} catch (error) {
		if (isDockerodeStatusError(error) && error.statusCode === 404) {
			return false;
		}
		throw error;
	}
}

async function pullSandboxImage(): Promise<void> {
	console.info('[FILE_GENERATE] Sandbox image missing locally; pulling base image', {
		image: SANDBOX_IMAGE,
	});
	const stream = await docker.pull(SANDBOX_IMAGE);

	await new Promise<void>((resolve, reject) => {
		const modem = docker.modem as {
			followProgress: (
				stream: NodeJS.ReadableStream,
				onFinished: (error: Error | null, output: unknown) => void
			) => void;
		};

		modem.followProgress(stream, (error) => {
			if (error) {
				reject(error);
				return;
			}
			console.info('[FILE_GENERATE] Sandbox image pull completed', {
				image: SANDBOX_IMAGE,
			});
			resolve();
		});
	});
}

async function ensureSandboxImage(): Promise<void> {
	if (sandboxImageReady) return;
	if (sandboxImagePullPromise) {
		await sandboxImagePullPromise;
		return;
	}

	sandboxImagePullPromise = (async () => {
		if (await hasSandboxImage()) {
			sandboxImageReady = true;
			return;
		}

		await pullSandboxImage();
		sandboxImageReady = true;
	})().finally(() => {
		sandboxImagePullPromise = null;
	});

	await sandboxImagePullPromise;
}

export function resetSandboxImageStateForTests(): void {
	sandboxImageReady = false;
	sandboxImagePullPromise = null;
	sandboxWarmupStarted = false;
}

export function prewarmSandboxImageInBackground(): void {
	if (sandboxImageReady || sandboxImagePullPromise || sandboxWarmupStarted) {
		return;
	}

	sandboxWarmupStarted = true;
	console.info('[FILE_GENERATE] Scheduling sandbox image warmup', {
		image: SANDBOX_IMAGE,
	});

	void ensureSandboxImage()
		.then(() => {
			console.info('[FILE_GENERATE] Sandbox image warmup ready', {
				image: SANDBOX_IMAGE,
			});
		})
		.catch((error) => {
			sandboxWarmupStarted = false;
			console.warn('[FILE_GENERATE] Sandbox image warmup failed', {
				image: SANDBOX_IMAGE,
				error,
			});
		});
}

async function waitForExecToFinish(exec: Exec): Promise<ExecInspectInfo> {
	while (true) {
		const inspect = await exec.inspect();
		if (inspect.Running === false && inspect.ExitCode !== null) {
			console.info('[FILE_GENERATE] Sandbox exec completed', {
				execId: inspect.ID,
				containerId: inspect.ContainerID,
				exitCode: inspect.ExitCode,
			});
			return inspect;
		}

		await new Promise((resolve) => setTimeout(resolve, SANDBOX_EXEC_POLL_MS));
	}
}

function waitForExecStream(stream: NodeJS.ReadableStream): Promise<void> {
	return new Promise((resolve, reject) => {
		let settled = false;

		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			if (error) {
				reject(error);
				return;
			}
			resolve();
		};

		stream.once('end', () => finish());
		stream.once('close', () => finish());
		stream.once('error', (error: Error) => finish(error));
	});
}

export async function executeSandboxCommand(container: Container, cmd: string[]): Promise<SandboxResult> {
	const exec = await container.exec({
		Cmd: cmd,
		AttachStdout: true,
		AttachStderr: true,
	});

	const stream = await exec.start({
		hijack: false,
		stdin: false,
	});

	let stdout = '';
	let stderr = '';
	const stdoutStream = new PassThrough();
	const stderrStream = new PassThrough();
	stdoutStream.on('data', (chunk: Buffer | string) => {
		stdout += chunk.toString('utf-8');
	});
	stderrStream.on('data', (chunk: Buffer | string) => {
		stderr += chunk.toString('utf-8');
	});

	const modem = (container.modem ?? docker.modem) as {
		demuxStream: (
			stream: NodeJS.ReadableStream,
			stdout: NodeJS.WritableStream,
			stderr: NodeJS.WritableStream
		) => void;
	};
	modem.demuxStream(stream, stdoutStream, stderrStream);

	try {
		const [inspect] = await Promise.all([waitForExecToFinish(exec), waitForExecStream(stream)]);
		return {
			stdout: stdout.trim(),
			stderr: stderr.trim(),
			exitCode: inspect.ExitCode ?? -1,
		};
	} finally {
		stdoutStream.end();
		stderrStream.end();
	}
}

export async function createSandbox(): Promise<Sandbox> {
	await ensureSandboxImage();

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
		return executeSandboxCommand(container, ['python3', '-c', code]);
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
		await container.kill({ signal: 'SIGKILL' });
	} catch {
		// Container may already be stopped
	}

	try {
		await container.remove({ force: true });
	} catch {
		// Container may already be removed
	}
}
