import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../env', () => ({
	config: {
		translategemmaUrl: 'http://localhost:30002/v1',
		translategemmaApiKey: '',
		translategemmaModel: 'translategemma',
		translationMaxTokens: 256,
		translationTemperature: 0.1
	}
}));

vi.stubGlobal('fetch', vi.fn());

describe('translator service', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it('restores protected placeholders in Hungarian input translation', async () => {
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ text: 'Open __URL_1__ and run __CODE_2__' }]
			})
		} as Response);

		const { translateHungarianToEnglish } = await import('./translator');
		const result = await translateHungarianToEnglish(
			'Nyisd meg https://example.com és futtasd `npm run build`'
		);

		expect(result).toContain('https://example.com');
		expect(result).toContain('`npm run build`');
	});

	it('preserves code blocks when translating English output to Hungarian', async () => {
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ text: 'Magyar szöveg.' }]
			})
		} as Response);

		const { translateEnglishToHungarian } = await import('./translator');
		const result = await translateEnglishToHungarian(
			'Hello world.\n```ts\nconst answer = 42;\n```\nMore text.'
		);

		expect(result).toContain('```ts\nconst answer = 42;\n```');
		expect(result).toContain('Magyar szöveg.');
	});

	it('retries hallucinated Hungarian output with a stricter prompt', async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					choices: [{ text: 'Kérlek, add meg a szöveget.' }]
				})
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					choices: [{ text: 'Valódi fordítás.' }]
				})
			} as Response);

		const { translateEnglishToHungarian } = await import('./translator');
		const result = await translateEnglishToHungarian('Translate this sentence.');

		expect(result).toContain('Valódi fordítás.');
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('preserves surrounding whitespace when translating English output', async () => {
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ text: 'Magyar szöveg.' }]
			})
		} as Response);

		const { translateEnglishToHungarian } = await import('./translator');
		const result = await translateEnglishToHungarian('Hello world.  \nNext line.');

		expect(result).toContain('Magyar szöveg.  \n');
	});

	it('falls back when the translation output contains a broken non-latin script', async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					choices: [{ text: 'සමහරවිට' }]
				})
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					choices: [{ text: '' }]
				})
			} as Response);

		const { translateEnglishToHungarian } = await import('./translator');
		const result = await translateEnglishToHungarian('Maybe.');

		expect(result).toContain('Maybe.');
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('does not flush incomplete prose fragments during streaming translation', async () => {
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ text: 'Lezárt fordítás.' }]
			})
		} as Response);

		const { StreamingHungarianTranslator } = await import('./translator');
		const translator = new StreamingHungarianTranslator();
		const longFragment = `${'word '.repeat(80).trim()}`;

		const partial = await translator.addChunk(longFragment);
		const flushed = await translator.flush();

		expect(partial).toEqual([]);
		expect(flushed).toEqual(['Lezárt fordítás.']);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('defers failed streaming sentence translation instead of leaking raw English', async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					choices: [{ text: '' }]
				})
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					choices: [{ text: 'Magyar első mondat. Magyar második mondat.' }]
				})
			} as Response);

		const { StreamingHungarianTranslator } = await import('./translator');
		const translator = new StreamingHungarianTranslator();

		const first = await translator.addChunk('First sentence. ');
		const second = await translator.addChunk('Second sentence.');

		expect(first).toEqual([]);
		expect(second).toEqual(['Magyar első mondat. Magyar második mondat.']);
		expect(second.join('')).not.toContain('First sentence');
		expect(fetch).toHaveBeenCalledTimes(2);
	});
});
