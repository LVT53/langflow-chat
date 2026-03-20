import { writable } from 'svelte/store';

export type TranslationState = 'enabled' | 'disabled';
export type ModelId = 'model1' | 'model2';

export const translationState = writable<TranslationState>('enabled');
export const selectedModel = writable<ModelId>('model1');

export function initSettings(serverPrefs?: { model?: ModelId; translationEnabled?: boolean }): void {
	if (typeof window !== 'undefined') {
		// Server-provided preferences take priority
		if (serverPrefs?.model) {
			selectedModel.set(serverPrefs.model);
			localStorage.setItem('selectedModel', serverPrefs.model);
		} else {
			const storedModel = localStorage.getItem('selectedModel');
			if (storedModel === 'model1' || storedModel === 'model2') {
				selectedModel.set(storedModel);
			}
		}

		if (serverPrefs?.translationEnabled !== undefined) {
			const state: TranslationState = serverPrefs.translationEnabled ? 'enabled' : 'disabled';
			translationState.set(state);
			localStorage.setItem('translationState', state);
		} else {
			const storedTranslation = localStorage.getItem('translationState');
			if (storedTranslation === 'enabled' || storedTranslation === 'disabled') {
				translationState.set(storedTranslation);
			}
		}
	}
}

export function setTranslationState(state: TranslationState): void {
	translationState.set(state);
	if (typeof window !== 'undefined') {
		localStorage.setItem('translationState', state);
	}
}

export function toggleTranslationState(): void {
	translationState.update((current) => {
		const newState: TranslationState = current === 'enabled' ? 'disabled' : 'enabled';
		if (typeof window !== 'undefined') {
			localStorage.setItem('translationState', newState);
		}
		return newState;
	});
}

export function setSelectedModel(model: ModelId): void {
	selectedModel.set(model);
	if (typeof window !== 'undefined') {
		localStorage.setItem('selectedModel', model);
	}
}

export async function setSelectedModelAndSync(model: ModelId): Promise<void> {
	setSelectedModel(model);
	try {
		await fetch('/api/settings/preferences', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ preferredModel: model }),
		});
	} catch {
		// Non-fatal: local preference already applied
	}
}

export async function setTranslationAndSync(enabled: boolean): Promise<void> {
	const state: TranslationState = enabled ? 'enabled' : 'disabled';
	setTranslationState(state);
	try {
		await fetch('/api/settings/preferences', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ translationEnabled: enabled }),
		});
	} catch {
		// Non-fatal
	}
}
