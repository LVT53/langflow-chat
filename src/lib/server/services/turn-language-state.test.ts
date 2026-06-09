import { describe, expect, it } from 'vitest';

import {
	buildTurnLanguageState,
	detectShortHungarianFollowUp,
	normalizeHungarianRetrievalTerms,
	resolveExplicitResponseLanguage
} from './turn-language-state';

describe('detectShortHungarianFollowUp', () => {
	it('recognizes short multi-token Hungarian follow-ups', () => {
		expect(detectShortHungarianFollowUp('mi ez?')).toBe(true);
		expect(detectShortHungarianFollowUp('ez mi?')).toBe(true);
		expect(detectShortHungarianFollowUp('nem kell')).toBe(true);
	});

	it('does not treat English short inputs as Hungarian', () => {
		expect(detectShortHungarianFollowUp('no')).toBe(false);
		expect(detectShortHungarianFollowUp('ok')).toBe(false);
	});
});

describe('resolveExplicitResponseLanguage', () => {
	it('detects explicit English output requests from Hungarian instructions', () => {
		expect(resolveExplicitResponseLanguage('Írj egy angol emailt erről.')).toBe('en');
		expect(resolveExplicitResponseLanguage('Answer in English: mit jelent ez?')).toBe('en');
	});

	it('detects explicit Hungarian output requests without matching topic mentions', () => {
		expect(resolveExplicitResponseLanguage('Write this in Hungarian.')).toBe('hu');
		expect(resolveExplicitResponseLanguage('Kérlek válaszolj magyarul.')).toBe('hu');
		expect(resolveExplicitResponseLanguage('Write a report about the Hungarian parliament.')).toBeNull();
	});
});

describe('normalizeHungarianRetrievalTerms', () => {
	it('keeps accented terms and adds suffix-stripped variants', () => {
		const terms = normalizeHungarianRetrievalTerms(
			'Keress rá a korábbi beszélgetéseimben a kerékpár biztosításra.'
		);
		expect(terms).toEqual(expect.arrayContaining(['kerékpár', 'biztosításra', 'biztosítás']));
	});
});

describe('buildTurnLanguageState', () => {
	it('separates Hungarian user language from explicit English response language', () => {
		const state = buildTurnLanguageState('Írj egy angol emailt erről a dokumentumról.');
		expect(state.userLanguage).toBe('hu');
		expect(state.explicitResponseLanguage).toBe('en');
		expect(state.responseLanguage).toBe('en');
		expect(state.retrievalQueries.normalized).toContain('dokumentum');
	});

	it('keeps Hungarian response language when no output override is present', () => {
		const state = buildTurnLanguageState('Mit mond ez a fájl a felmondási időről?');
		expect(state.userLanguage).toBe('hu');
		expect(state.explicitResponseLanguage).toBeNull();
		expect(state.responseLanguage).toBe('hu');
		expect(state.retrievalQueries.normalized).toContain('felmondási');
		expect(state.retrievalQueries.normalized).toContain('idő');
	});

	it('uses the short Hungarian override for short follow-ups', () => {
		const state = buildTurnLanguageState('mi ez?');
		expect(state.userLanguage).toBe('hu');
		expect(state.responseLanguage).toBe('hu');
		expect(state.detectionReasons).toContain('short_hungarian_follow_up');
	});
});
