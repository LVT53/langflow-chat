import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../env', () => ({
	config: {
		translatorUrl: 'http://localhost:30002/v1',
		translatorApiKey: '',
		translatorModel: 'translategemma',
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

	it('uses the vllm-compatible chat/completions translate format', async () => {
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: 'Hello world.' } }]
			})
		} as Response);

		const { translateHungarianToEnglish } = await import('./translator');
		await translateHungarianToEnglish('Szia világ.');

		expect(fetch).toHaveBeenCalledWith(
			expect.stringContaining('/chat/completions'),
			expect.objectContaining({
				method: 'POST',
				body: expect.stringContaining('<<<source>>>hun_Latn')
			})
		);
		expect(fetch).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				body: expect.stringContaining('<<<target>>>eng_Latn')
			})
		);
		expect(fetch).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				body: expect.stringContaining('<<<text>>>Szia világ.')
			})
		);
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
		const flushed = await translator.flush();

		expect(first).toEqual([]);
		expect(second).toEqual([]);
		expect(flushed).toEqual(['Magyar első mondat. Magyar második mondat.']);
		expect(flushed.join('')).not.toContain('First sentence');
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('strips translation meta prefixes from model output', async () => {
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ text: 'rough translation: Magyar válasz.' }]
			})
		} as Response);

		const { translateEnglishToHungarian } = await import('./translator');
		const result = await translateEnglishToHungarian('Answer.');

		expect(result).toBe('Magyar válasz.');
	});

	it('groups short streaming sentences into one translation batch', async () => {
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ text: 'Magyar első. Magyar második.' }]
			})
		} as Response);

		const { StreamingHungarianTranslator } = await import('./translator');
		const translator = new StreamingHungarianTranslator();

		const first = await translator.addChunk('First short sentence. ');
		const second = await translator.addChunk('Second short sentence. ');

		expect(first).toEqual([]);
		expect(second).toEqual(['Magyar első. Magyar második.']);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('removes short english artifact lines from translation output', async () => {
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ text: 'Magyar bekezdés.\ntelephone.\nMásodik mondat.' }]
			})
		} as Response);

		const { translateEnglishToHungarian } = await import('./translator');
		const result = await translateEnglishToHungarian('Paragraph one.');

		expect(result).toBe('Magyar bekezdés.\nMásodik mondat.');
	});

	it('dedupes repeated adjacent paragraphs from translation output', async () => {
		const repeated =
			'Az Egyesült Államok egy föderális köztársaság, amely 50 államból áll.\n\nAz Egyesült Államok egy föderális köztársaság, amely 50 államból áll.';
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ text: repeated }]
			})
		} as Response);

		const { translateEnglishToHungarian } = await import('./translator');
		const result = await translateEnglishToHungarian('The United States is a federal republic.');

		expect(result).toBe('Az Egyesült Államok egy föderális köztársaság, amely 50 államból áll.');
	});
});
