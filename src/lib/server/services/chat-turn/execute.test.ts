import { describe, expect, it } from 'vitest';
import { normalizeAssistantOutput } from './normalizer';

describe('chat-turn execute', () => {
	it('strips thinking and preserve tags from non-stream response text', () => {
		const result = normalizeAssistantOutput(
			'<thinking>Internal reasoning</thinking>\n<preserve>terminal fresh send ok</preserve>'
		);
		expect(result).toBe('terminal fresh send ok');
	});

	it('strips tool-call markers from text', () => {
		const result = normalizeAssistantOutput(
			'Before\u0002TOOL_START\u001f{"name":"search"}\u0003searching\u0002TOOL_END\u001f{}\u0003After'
		);
		expect(result).toBe('BeforesearchingAfter');
	});
});
