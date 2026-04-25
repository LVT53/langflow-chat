import { describe, expect, it } from 'vitest';

import { buildOutboundSystemPrompt } from './langflow';

describe('buildOutboundSystemPrompt', () => {
	it('keeps always-on date, generated-file, and image-search guidance with custom prompts', () => {
		const prompt = buildOutboundSystemPrompt({
			basePrompt: 'Custom system prompt',
			inputValue: 'Create a downloadable PDF with photos of Amsterdam.',
			modelDisplayName: 'Provider Model',
		});

		expect(prompt).toContain('[MODEL: Provider Model]');
		expect(prompt).toContain('Time-sensitive search workflow');
		expect(prompt).toContain('Generated file workflow');
		expect(prompt).toContain('If the user asks for a downloadable file');
		expect(prompt).toContain('Image search workflow');
		expect(prompt).toContain('image_search');
	});
});
