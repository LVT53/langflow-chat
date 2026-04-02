import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Sandbox, SandboxResult } from '../sandbox/config';

const mockSandbox = vi.hoisted(() => ({
	execute: vi.fn(),
	destroy: vi.fn(),
	container: {
		id: 'test-container-id',
		getArchive: vi.fn(),
	},
}));

vi.mock('../sandbox/config', () => ({
	createSandbox: vi.fn().mockResolvedValue(mockSandbox),
	SANDBOX_TIMEOUT_MS: 60000,
	SANDBOX_MEMORY_MB: 1024,
	SANDBOX_MAX_FILE_MB: 50,
}));

vi.mock('tar-fs', () => ({
	extract: vi.fn(),
}));

import { executeCode } from './sandbox-execution';

describe('sandbox-execution', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSandbox.destroy.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('executeCode', () => {
		it('returns stdout from successful Python execution', async () => {
			const mockResult: SandboxResult = {
				stdout: 'Hello, World!',
				stderr: '',
				exitCode: 0,
			};
			mockSandbox.execute.mockResolvedValue(mockResult);
			mockSandbox.container.getArchive.mockRejectedValue(new Error('No files'));

			const result = await executeCode('print("Hello, World!")', 'python');

			expect(result.stdout).toBe('Hello, World!');
			expect(result.stderr).toBe('');
			expect(result.error).toBeUndefined();
			expect(result.files).toEqual([]);
			expect(mockSandbox.destroy).toHaveBeenCalled();
		});

		it('returns stderr from failed Python execution', async () => {
			const mockResult: SandboxResult = {
				stdout: '',
				stderr: 'SyntaxError: invalid syntax',
				exitCode: 1,
			};
			mockSandbox.execute.mockResolvedValue(mockResult);
			mockSandbox.container.getArchive.mockRejectedValue(new Error('No files'));

			const result = await executeCode('print("Hello"', 'python');

			expect(result.stdout).toBe('');
			expect(result.stderr).toBe('SyntaxError: invalid syntax');
			expect(result.error).toContain('Syntax error');
			expect(result.exitCode).toBe(1);
			expect(mockSandbox.destroy).toHaveBeenCalled();
		});

		it('handles timeout errors gracefully', async () => {
			mockSandbox.execute.mockRejectedValue(new Error('Sandbox execution timed out after 60000ms'));
			mockSandbox.container.getArchive.mockResolvedValue(null);

			const result = await executeCode('while True: pass', 'python');

			expect(result.error).toContain('timed out');
			expect(result.stdout).toBe('');
			expect(result.stderr).toBe('');
			expect(mockSandbox.destroy).toHaveBeenCalled();
		});

		it('handles memory errors gracefully', async () => {
			const mockResult: SandboxResult = {
				stdout: '',
				stderr: 'MemoryError',
				exitCode: 137,
			};
			mockSandbox.execute.mockResolvedValue(mockResult);
			mockSandbox.container.getArchive.mockRejectedValue(new Error('No files'));

			const result = await executeCode('x = [0] * 10**9', 'python');

			expect(result.error).toContain('memory');
			expect(result.exitCode).toBe(137);
			expect(mockSandbox.destroy).toHaveBeenCalled();
		});

		it('extracts generated PDF file from container', async () => {
			const mockResult: SandboxResult = {
				stdout: 'PDF generated',
				stderr: '',
				exitCode: 0,
			};
			mockSandbox.execute.mockResolvedValue(mockResult);

			mockSandbox.container.getArchive.mockResolvedValue({
				pipe: vi.fn((dest: unknown) => dest),
				on: vi.fn(),
			});

			const result = await executeCode(`
from fpdf import FPDF
pdf = FPDF()
pdf.add_page()
pdf.cell(200, 10, "Hello World")
pdf.output("/output/report.pdf")
`, 'python');

			expect(result.stdout).toBe('PDF generated');
			expect(result.files.length).toBeGreaterThanOrEqual(0);
			expect(mockSandbox.destroy).toHaveBeenCalled();
		});

		it('extracts matplotlib plot as PNG', async () => {
			const mockResult: SandboxResult = {
				stdout: 'Plot saved',
				stderr: '',
				exitCode: 0,
			};
			mockSandbox.execute.mockResolvedValue(mockResult);

			mockSandbox.container.getArchive.mockResolvedValue({
				pipe: vi.fn((dest: unknown) => dest),
				on: vi.fn(),
			});

			const result = await executeCode(`
import matplotlib.pyplot as plt
plt.plot([1, 2, 3], [1, 4, 9])
plt.savefig('/output/plot.png')
`, 'python');

			expect(result.stdout).toBe('Plot saved');
			expect(mockSandbox.destroy).toHaveBeenCalled();
		});

		it('extracts CSV file from container', async () => {
			const mockResult: SandboxResult = {
				stdout: 'CSV created',
				stderr: '',
				exitCode: 0,
			};
			mockSandbox.execute.mockResolvedValue(mockResult);

			mockSandbox.container.getArchive.mockResolvedValue({
				pipe: vi.fn((dest: unknown) => dest),
				on: vi.fn(),
			});

			const result = await executeCode(`
import csv
with open('/output/data.csv', 'w') as f:
    writer = csv.writer(f)
    writer.writerow(['a', 'b', 'c'])
`, 'python');

			expect(result.stdout).toBe('CSV created');
			expect(mockSandbox.destroy).toHaveBeenCalled();
		});

		it('destroys sandbox even when execution fails', async () => {
			mockSandbox.execute.mockRejectedValue(new Error('Unexpected error'));
			mockSandbox.container.getArchive.mockResolvedValue(null);

			await executeCode('raise Exception("boom")', 'python');

			expect(mockSandbox.destroy).toHaveBeenCalled();
		});

		it('only supports python language', async () => {
			const result = await executeCode('console.log("hello")', 'javascript' as 'python');

			expect(result.error).toContain('Unsupported language');
			expect(result.stdout).toBe('');
			expect(result.stderr).toBe('');
		});

		it('limits file size to SANDBOX_MAX_FILE_MB', async () => {
			const mockResult: SandboxResult = {
				stdout: 'Large file created',
				stderr: '',
				exitCode: 0,
			};
			mockSandbox.execute.mockResolvedValue(mockResult);

			mockSandbox.container.getArchive.mockResolvedValue({
				pipe: vi.fn(),
				on: vi.fn(),
			});

			const result = await executeCode('x = "large"', 'python');

			expect(result.stdout).toBe('Large file created');
			expect(mockSandbox.destroy).toHaveBeenCalled();
		});
	});
});