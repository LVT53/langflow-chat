import { writable } from 'svelte/store';

export type TranslationState = 'enabled' | 'disabled';
export type ModelId = 'model1' | 'model2';

export const translationState = writable<TranslationState>('enabled');
export const selectedModel = writable<ModelId>('model1');

export function initSettings(): void {
	if (typeof window !== 'undefined') {
		const storedTranslation = localStorage.getItem('translationState');
		if (storedTranslation === 'enabled' || storedTranslation === 'disabled') {
			translationState.set(storedTranslation);
		}

		const storedModel = localStorage.getItem('selectedModel');
		if (storedModel === 'model1' || storedModel === 'model2') {
			selectedModel.set(storedModel);
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
