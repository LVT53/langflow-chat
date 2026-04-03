import { describe, expect, it } from 'vitest';

import {
	getGenerateFileToolCode,
	getGenerateFileToolFilename,
	inferGeneratedFilenameFromToolInput,
} from './generate-file-tool';

describe('generate-file-tool helpers', () => {
	it('prefers python_code over code', () => {
		const input = {
			python_code: 'with open("/output/new.txt", "w") as f: f.write("new")',
			code: 'with open("/output/old.txt", "w") as f: f.write("old")',
		};

		expect(getGenerateFileToolCode(input)).toContain('/output/new.txt');
		expect(inferGeneratedFilenameFromToolInput(input)).toBe('new.txt');
	});

	it('falls back to the legacy code field', () => {
		const input = {
			code: 'with open("/output/legacy.txt", "w") as f: f.write("legacy")',
		};

		expect(getGenerateFileToolCode(input)).toContain('/output/legacy.txt');
		expect(inferGeneratedFilenameFromToolInput(input)).toBe('legacy.txt');
	});

	it('uses the explicit filename when present', () => {
		const input = {
			python_code: 'print("hello")',
			filename: 'report.txt',
		};

		expect(getGenerateFileToolFilename(input)).toBe('report.txt');
		expect(inferGeneratedFilenameFromToolInput(input)).toBe('report.txt');
	});
});
