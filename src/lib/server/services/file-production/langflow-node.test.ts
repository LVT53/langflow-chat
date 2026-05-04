import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const nodeSource = () =>
	readFileSync(resolve(process.cwd(), 'langflow_nodes/file_production_tool.py'), 'utf8');

describe('Langflow File Production tool node', () => {
	it('exposes produce_file as the model-facing tool contract', () => {
		const source = nodeSource();

		expect(source).toContain('display_name = "File Production"');
		expect(source).toContain('method="produce_file"');
		expect(source).toContain('def produce_file(self) -> Data:');
		expect(source).toContain('/api/chat/files/produce');

		for (const field of [
			'idempotencyKey',
			'requestTitle',
			'requestedOutputs',
			'sourceMode',
			'documentIntent',
			'templateHint',
			'documentSource',
			'program',
		]) {
			expect(source).toContain(`name="${field}"`);
		}

		expect(source).not.toMatch(/name="conversationId"/);
		expect(source).not.toMatch(/name="outputs"/);
		expect(source).not.toContain('getattr(self, "outputs"');
		expect(source).not.toContain('method="generate_file"');
		expect(source).not.toContain('method="export_document"');
		expect(source).not.toContain('/api/chat/files/generate');
		expect(source).not.toContain('/api/chat/files/export');
	});
});
