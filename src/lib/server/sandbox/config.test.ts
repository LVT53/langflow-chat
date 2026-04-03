import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Container } from 'dockerode';

// Mock dockerode
const mockContainer = {
	start: vi.fn().mockResolvedValue(undefined),
	stop: vi.fn().mockResolvedValue(undefined),
	remove: vi.fn().mockResolvedValue(undefined),
	exec: vi.fn().mockResolvedValue({
		start: vi.fn().mockResolvedValue(undefined),
	}),
	wait: vi.fn().mockResolvedValue({ StatusCode: 0 }),
};

const mockImageInspect = vi.fn().mockResolvedValue({ Id: 'image-1' });
const mockPull = vi.fn().mockResolvedValue({ on: vi.fn() });
const mockFollowProgress = vi.fn((_stream, onFinished: (err: Error | null, output?: unknown) => void) =>
	onFinished(null, [])
);

const mockDocker = {
	createContainer: vi.fn().mockResolvedValue(mockContainer),
	getContainer: vi.fn().mockReturnValue(mockContainer),
	getImage: vi.fn().mockReturnValue({
		inspect: mockImageInspect,
	}),
	pull: mockPull,
	modem: {
		followProgress: mockFollowProgress,
	},
};

vi.mock('dockerode', () => ({
	default: vi.fn().mockImplementation(function () {
		return mockDocker;
	}),
}));

// Import after mocking
const {
	createSandbox,
	destroySandbox,
	resetSandboxImageStateForTests,
	SANDBOX_TIMEOUT_MS,
	SANDBOX_MEMORY_MB,
	SANDBOX_MAX_FILE_MB,
} = await import('./config');

describe('sandbox config', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetSandboxImageStateForTests();
		mockImageInspect.mockResolvedValue({ Id: 'image-1' });
		mockPull.mockResolvedValue({ on: vi.fn() });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('configuration constants', () => {
		it('should have correct timeout value (60 seconds)', () => {
			expect(SANDBOX_TIMEOUT_MS).toBe(60000);
		});

		it('should have correct memory limit (1GB)', () => {
			expect(SANDBOX_MEMORY_MB).toBe(1024);
		});

		it('should have correct max file size (50MB)', () => {
			expect(SANDBOX_MAX_FILE_MB).toBe(50);
		});
	});

	describe('createSandbox', () => {
		it('should create a sandbox container with Python runtime', async () => {
			const sandbox = await createSandbox();

			expect(mockDocker.getImage).toHaveBeenCalledWith('python:3.11-slim');
			expect(mockImageInspect).toHaveBeenCalled();
			expect(mockDocker.createContainer).toHaveBeenCalledWith(
				expect.objectContaining({
					Image: expect.stringContaining('python'),
					Cmd: expect.arrayContaining(['python3']),
					HostConfig: expect.objectContaining({
						Memory: 1024 * 1024 * 1024, // 1GB in bytes
						NetworkMode: 'none', // No network access
						AutoRemove: true,
					}),
				})
			);
			expect(sandbox).toHaveProperty('container');
			expect(sandbox).toHaveProperty('execute');
			expect(sandbox).toHaveProperty('destroy');
		});

		it('should enforce resource limits on container', async () => {
			await createSandbox();

			const createCall = mockDocker.createContainer.mock.calls[0][0];
			expect(createCall.HostConfig).toMatchObject({
				Memory: 1024 * 1024 * 1024, // 1GB
				MemorySwap: 1024 * 1024 * 1024, // No swap
				CpuQuota: 100000, // 1 CPU core
				NetworkMode: 'none', // Isolated network
				AutoRemove: true,
			});
		});

		it('should disable network access for security', async () => {
			await createSandbox();

			const createCall = mockDocker.createContainer.mock.calls[0][0];
			expect(createCall.HostConfig.NetworkMode).toBe('none');
		});

		it('pulls the sandbox image when it is missing locally', async () => {
			mockImageInspect.mockRejectedValueOnce({
				statusCode: 404,
				json: { message: 'No such image: python:3.11-slim' },
			});

			await createSandbox();

			expect(mockPull).toHaveBeenCalledWith('python:3.11-slim');
			expect(mockFollowProgress).toHaveBeenCalled();
			expect(mockDocker.createContainer).toHaveBeenCalled();
		});
	});

	describe('sandbox execution', () => {
		it('should execute simple Python code', async () => {
			const mockExecInspect = vi.fn().mockResolvedValue({
				ExitCode: 0,
				Running: false,
			});

			const mockStream = {
				on: vi.fn().mockImplementation((event: string, handler: unknown) => {
					if (event === 'end') {
						setTimeout(() => (handler as () => void)(), 0);
					}
					return mockStream;
				}),
			};

			const mockExec = {
				start: vi.fn().mockResolvedValue(mockStream),
				inspect: mockExecInspect,
			};

			mockContainer.exec.mockResolvedValue(mockExec);

			const sandbox = await createSandbox();
			const result = await sandbox.execute('print("Hello, World!")');

			expect(mockContainer.exec).toHaveBeenCalledWith(
				expect.objectContaining({
					Cmd: ['python3', '-c', 'print("Hello, World!")'],
					AttachStdout: true,
					AttachStderr: true,
				})
			);
			expect(result.exitCode).toBe(0);
		});

		it('should enforce timeout limit', async () => {
			const sandbox = await createSandbox();
			
			// Verify timeout is configured
			const createCall = mockDocker.createContainer.mock.calls[0][0];
			expect(createCall.StopTimeout).toBe(60); // 60 seconds
		});
	});

	describe('destroySandbox', () => {
		it('should stop and remove container', async () => {
			const mockContainerInstance = {
				stop: vi.fn().mockResolvedValue(undefined),
				remove: vi.fn().mockResolvedValue(undefined),
			};

			await destroySandbox(mockContainerInstance as unknown as Container);

			expect(mockContainerInstance.stop).toHaveBeenCalled();
			expect(mockContainerInstance.remove).toHaveBeenCalled();
		});

		it('should handle already stopped containers gracefully', async () => {
			const mockContainerInstance = {
				stop: vi.fn().mockRejectedValue(new Error('Container already stopped')),
				remove: vi.fn().mockResolvedValue(undefined),
			};

			// Should not throw
			await expect(
				destroySandbox(mockContainerInstance as unknown as Container)
			).resolves.not.toThrow();
		});
	});

	describe('sandbox lifecycle', () => {
		it('can create and destroy sandbox', async () => {
			const sandbox = await createSandbox();
			expect(sandbox.container).toBeDefined();
			
			await sandbox.destroy();
			expect(mockContainer.stop).toHaveBeenCalled();
			expect(mockContainer.remove).toHaveBeenCalled();
		});
	});
});
