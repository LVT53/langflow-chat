import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/services/translator', () => ({
	translateEnglishToHungarian: vi.fn(async (value: string) => `HU:${value}`),
	translateHungarianToEnglish: vi.fn(async (value: string) => `EN:${value}`),
}));

describe('chat-turn execute', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('strips thinking and preserve tags from non-stream response text', async () => {
		const { buildSendResponseText } = await import('./execute');

		const result = await buildSendResponseText({
			responseText:
				'<thinking>Internal reasoning</thinking>\n<preserve>terminal fresh send ok</preserve>',
			sourceLanguage: 'en',
			translationEnabled: false,
		});

		expect(result).toBe('\nterminal fresh send ok');
	});

	it('translates only the visible response text for Hungarian output', async () => {
		const { buildSendResponseText } = await import('./execute');
		const { translateEnglishToHungarian } = await import('$lib/server/services/translator');

		const result = await buildSendResponseText({
			responseText:
				'<thinking>Internal reasoning</thinking><preserve>Visible answer</preserve>',
			sourceLanguage: 'hu',
			translationEnabled: true,
		});

		expect(translateEnglishToHungarian).toHaveBeenCalledWith('Visible answer');
		expect(result).toBe('HU:Visible answer');
	});
});
