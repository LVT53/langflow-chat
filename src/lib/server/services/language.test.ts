import { describe, expect, it } from 'vitest';
import { detectLanguage } from './language';

describe('detectLanguage', () => {
	it('defaults empty input to English', () => {
		expect(detectLanguage('')).toBe('en');
	});

	it('uses the old short-input fallback for Hungarian short words', () => {
		expect(detectLanguage('Szia')).toBe('hu');
		expect(detectLanguage('igen')).toBe('hu');
		expect(detectLanguage('hello')).toBe('en');
	});

	it('detects accented Hungarian text as Hungarian', () => {
		expect(detectLanguage('Kérlek írj egy rövid emailt.')).toBe('hu');
	});

	it('detects mixed Hungarian prompts without accents', () => {
		expect(detectLanguage('Irj egy angol emailt')).toBe('hu');
		expect(detectLanguage('Valaszolj angolul egy rovid levelben')).toBe('hu');
	});

	it('keeps plain English prompts as English', () => {
		expect(detectLanguage('Write a short email in English')).toBe('en');
		expect(detectLanguage('Hello, tell me about artificial intelligence')).toBe('en');
	});
});
