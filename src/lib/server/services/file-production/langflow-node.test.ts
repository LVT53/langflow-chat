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
		expect(source).toContain('"alfyai_standard_report"');
		expect(source).toContain('"level":2');

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
		expect(source).toContain('"requestedOutputs": requested_outputs');
		expect(source).toContain('getattr(self, "conversation_id", "")');
		expect(source).toContain('getattr(self, "conversationId", "")');
	});

	it('does not leak internal job identifiers or queue state into model-facing success text', () => {
		const source = nodeSource();

		expect(source).toContain('File production request accepted');
		expect(source).not.toContain('File production job {job.get');
		expect(source).not.toContain("job.get('id', 'unknown')");
		expect(source).not.toContain("job.get('status', 'queued')");
	});

	it('keeps JSON text inputs aligned with the Langflow tool schema', () => {
		const source = nodeSource();

		expect(source).toContain('name="program"');
		expect(source).toContain('JSON-encoded object with language, sourceCode, and optional filename');
		expect(source).toContain('program must be a JSON-encoded object when sourceMode is program.');
		expect(source).toContain('name="documentSource"');
		expect(source).toContain('JSON-encoded object using the AlfyAI Standard Report source shape');
		expect(source).toContain('documentSource must be a JSON-encoded object when sourceMode is document_source.');
		expect(source).toContain('name="requestedOutputs"');
		expect(source).toContain('requestedOutputs must be a non-empty JSON-encoded array.');
	});
});
