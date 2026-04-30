import { describe, it, expect } from 'vitest';
import { normalizeAssistantOutput } from './normalizer';

describe('normalizeAssistantOutput', () => {
	it('strips <thinking> blocks from text', () => {
		const result = normalizeAssistantOutput(
			'<thinking>Internal reasoning</thinking>Visible text'
		);
		expect(result).toBe('Visible text');
	});

	it('treats unclosed thinking blocks as thinking content', () => {
		const result = normalizeAssistantOutput(
			'Before <thinking>unclosed thinking and <thinking>more'
		);
		expect(result).toBe('Before');
	});

	it('passes through text with no tags unchanged', () => {
		const result = normalizeAssistantOutput('Plain text response');
		expect(result).toBe('Plain text response');
	});

	it('handles empty string', () => {
		const result = normalizeAssistantOutput('');
		expect(result).toBe('');
	});

	it('strips tool-call markers from text', () => {
		const result = normalizeAssistantOutput(
			'Before text\u0002TOOL_START\u001f{"name":"search"}\u0003during search\u0002TOOL_END\u001f{"name":"search","outputSummary":"done"}\u0003After text'
		);
		expect(result).toBe('Before textduring searchAfter text');
	});

	it('strips <preserve> tags from text', () => {
		const result = normalizeAssistantOutput(
			'Normal text <preserve>Protected content</preserve> More text'
		);
		expect(result).toBe('Normal text Protected content More text');
	});

	it('strips thinking, tool markers, and preserve tags combined', () => {
		const result = normalizeAssistantOutput(
			'<thinking>reason</thinking>' +
			'\u0002TOOL_START\u001f{"name":"calc"}\u0003' +
			'<preserve>hello</preserve>'
		);
		expect(result).toBe('hello');
	});

	it('handles whitespace-only input', () => {
		const result = normalizeAssistantOutput('   \n\t  ');
		expect(result).toBe('');
	});
});
