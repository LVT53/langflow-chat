import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import {
	translationState,
	initSettings,
	setTranslationState,
	toggleTranslationState,
	type TranslationState
} from './settings';

describe('settings store', () => {
	let localStorageMock: Record<string, string> = {};

	beforeEach(() => {
		// Reset store to default
		translationState.set('enabled');
		localStorageMock = {};

		// Mock localStorage
		vi.stubGlobal('localStorage', {
			getItem: vi.fn((key: string) => localStorageMock[key] || null),
			setItem: vi.fn((key: string, value: string) => {
				localStorageMock[key] = value;
			}),
			removeItem: vi.fn((key: string) => {
				delete localStorageMock[key];
			}),
			clear: vi.fn(() => {
				localStorageMock = {};
			})
		});

		// Mock window
		vi.stubGlobal('window', {
			...window,
			localStorage
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe('translationState', () => {
		it('should have default value of enabled', () => {
			const state = get(translationState);
			expect(state).toBe('enabled');
		});
	});

	describe('initSettings', () => {
		it('should load enabled state from localStorage', () => {
			localStorageMock['translationState'] = 'enabled';
			initSettings();
			const state = get(translationState);
			expect(state).toBe('enabled');
		});

		it('should load disabled state from localStorage', () => {
			localStorageMock['translationState'] = 'disabled';
			initSettings();
			const state = get(translationState);
			expect(state).toBe('disabled');
		});

		it('should keep default when localStorage has invalid value', () => {
			localStorageMock['translationState'] = 'invalid';
			initSettings();
			const state = get(translationState);
			expect(state).toBe('enabled');
		});

		it('should keep default when localStorage is empty', () => {
			initSettings();
			const state = get(translationState);
			expect(state).toBe('enabled');
		});
	});

	describe('setTranslationState', () => {
		it('should update store to disabled', () => {
			setTranslationState('disabled');
			const state = get(translationState);
			expect(state).toBe('disabled');
		});

		it('should update store to enabled', () => {
			translationState.set('disabled');
			setTranslationState('enabled');
			const state = get(translationState);
			expect(state).toBe('enabled');
		});

		it('should persist disabled state to localStorage', () => {
			setTranslationState('disabled');
			expect(localStorage.setItem).toHaveBeenCalledWith('translationState', 'disabled');
			expect(localStorageMock['translationState']).toBe('disabled');
		});

		it('should persist enabled state to localStorage', () => {
			setTranslationState('enabled');
			expect(localStorage.setItem).toHaveBeenCalledWith('translationState', 'enabled');
			expect(localStorageMock['translationState']).toBe('enabled');
		});
	});

	describe('toggleTranslationState', () => {
		it('should toggle from enabled to disabled', () => {
			translationState.set('enabled');
			toggleTranslationState();
			const state = get(translationState);
			expect(state).toBe('disabled');
		});

		it('should toggle from disabled to enabled', () => {
			translationState.set('disabled');
			toggleTranslationState();
			const state = get(translationState);
			expect(state).toBe('enabled');
		});

		it('should persist toggled state to localStorage', () => {
			translationState.set('enabled');
			toggleTranslationState();
			expect(localStorage.setItem).toHaveBeenCalledWith('translationState', 'disabled');
			expect(localStorageMock['translationState']).toBe('disabled');
		});
	});
});
