import { describe, expect, it } from 'vitest';

import {
	getGenerateFileToolCode,
	getGenerateFileToolFilename,
	getGenerateFileToolLanguage,
	inferGeneratedFilenameFromToolInput,
} from './generate-file-tool';

describe('generate-file-tool helpers', () => {
	it('reads source_code when present', () => {
		const input = {
			source_code: 'const fs = require("fs"); fs.writeFileSync("/output/new.xlsx", "x")',
		};

		expect(getGenerateFileToolCode(input)).toContain('/output/new.xlsx');
		expect(inferGeneratedFilenameFromToolInput(input)).toBe('new.xlsx');
	});

	it('returns null when legacy code fields are passed without source_code', () => {
		const input = {
			python_code: 'with open("/output/new.txt", "w") as f: f.write("new")',
			code: 'with open("/output/old.txt", "w") as f: f.write("old")',
		};

		expect(getGenerateFileToolCode(input)).toBeNull();
		expect(inferGeneratedFilenameFromToolInput(input)).toBe('Generated file');
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
