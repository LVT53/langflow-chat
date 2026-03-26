import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import {
	selectedModel,
	translationState,
	initSettings,
	setSelectedModel,
	setSelectedModelAndSync,
	setTranslationState,
	setTranslationAndSync,
	toggleTranslationState,
	type ModelId,
} from './settings';

describe('settings store', () => {
	let localStorageMock: Record<string, string> = {};

	beforeEach(() => {
		// Reset store to default
		selectedModel.set('model1');
		translationState.set('enabled');
		localStorageMock = {};
		vi.restoreAllMocks();
		vi.stubGlobal('fetch', vi.fn());

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

	describe('selectedModel', () => {
		it('should have default value of model1', () => {
			const model = get(selectedModel);
			expect(model).toBe('model1');
		});
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

		it('should load selected model from localStorage', () => {
			localStorageMock['selectedModel'] = 'model2';
			initSettings();
			expect(get(selectedModel)).toBe('model2');
		});

		it('should prioritize server preferences over localStorage', () => {
			localStorageMock['selectedModel'] = 'model2';
			localStorageMock['translationState'] = 'disabled';

			initSettings({ model: 'model1', translationEnabled: true });

			expect(get(selectedModel)).toBe('model1');
			expect(get(translationState)).toBe('enabled');
			expect(localStorageMock['selectedModel']).toBe('model1');
			expect(localStorageMock['translationState']).toBe('enabled');
		});
	});

	describe('setSelectedModel', () => {
		it('should update store to model2', () => {
			setSelectedModel('model2');
			expect(get(selectedModel)).toBe('model2');
		});

		it('should persist selected model to localStorage', () => {
			setSelectedModel('model2');
			expect(localStorage.setItem).toHaveBeenCalledWith('selectedModel', 'model2');
			expect(localStorageMock['selectedModel']).toBe('model2');
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

	describe('sync helpers', () => {
		it('should sync selected model through the preferences API', async () => {
			vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));

			await setSelectedModelAndSync('model2');

			expect(get(selectedModel)).toBe('model2');
			expect(fetch).toHaveBeenCalledWith(
				'/api/settings/preferences',
				expect.objectContaining({
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ preferredModel: 'model2' satisfies ModelId }),
				})
			);
		});

		it('should keep the local selected model if syncing fails', async () => {
			vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));

			await setSelectedModelAndSync('model2');

			expect(get(selectedModel)).toBe('model2');
		});

		it('should sync translation through the preferences API', async () => {
			vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));

			await setTranslationAndSync(false);

			expect(get(translationState)).toBe('disabled');
			expect(fetch).toHaveBeenCalledWith(
				'/api/settings/preferences',
				expect.objectContaining({
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ translationEnabled: false }),
				})
			);
		});

		it('should keep the local translation state if syncing fails', async () => {
			vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));

			await setTranslationAndSync(false);

			expect(get(translationState)).toBe('disabled');
		});
	});
});
