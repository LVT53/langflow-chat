import { describe, expect, it } from 'vitest';
import { determineTeiWinningMode } from './tei-observability';

describe('tei-observability', () => {
	it('prefers deterministic authority over ranking signals', () => {
		expect(
			determineTeiWinningMode({
				deterministic: true,
				lexicalScore: 9,
				semanticScore: 0.8,
				rerankScore: 0.7,
			})
		).toBe('deterministic');
	});

	it('orders rerank above semantic above lexical', () => {
		expect(determineTeiWinningMode({ lexicalScore: 4 })).toBe('lexical');
		expect(determineTeiWinningMode({ lexicalScore: 0, semanticScore: 0.4 })).toBe('semantic');
		expect(
			determineTeiWinningMode({ lexicalScore: 0, semanticScore: 0.4, rerankScore: 0.5 })
		).toBe('rerank');
	});
});
