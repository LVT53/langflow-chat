import { describe, expect, it } from 'vitest';

import {
	getGenerateFileToolCode,
	getGenerateFileToolFilename,
	getGenerateFileToolLanguage,
	inferGeneratedFilenameFromToolInput,
} from './generate-file-tool';

describe('generate-file-tool helpers', () => {
	it('prefers source_code over python_code and code', () => {
		const input = {
			source_code: 'const fs = require("fs"); fs.writeFileSync("/output/new.xlsx", "x")',
			python_code: 'with open("/output/old.txt", "w") as f: f.write("old")',
			code: 'legacy',
		};

		expect(getGenerateFileToolCode(input)).toContain('/output/new.xlsx');
		expect(inferGeneratedFilenameFromToolInput(input)).toBe('new.xlsx');
	});

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
			source_code: 'console.log("hello")',
			filename: 'report.txt',
		};

		expect(getGenerateFileToolFilename(input)).toBe('report.txt');
		expect(inferGeneratedFilenameFromToolInput(input)).toBe('report.txt');
	});

	it('defaults language to python and reads javascript explicitly', () => {
		expect(getGenerateFileToolLanguage({})).toBe('python');
		expect(getGenerateFileToolLanguage({ language: 'javascript' })).toBe('javascript');
	});
});
