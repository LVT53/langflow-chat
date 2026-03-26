import { writable } from 'svelte/store';
import { updateUserPreferences } from '$lib/client/api/settings';
import type { ModelId } from '$lib/types';

export type TranslationState = 'enabled' | 'disabled';
export type { ModelId };

export const translationState = writable<TranslationState>('enabled');
export const selectedModel = writable<ModelId>('model1');

const SELECTED_MODEL_KEY = 'selectedModel';
const TRANSLATION_STATE_KEY = 'translationState';

function canUseStorage(): boolean {
	return typeof window !== 'undefined';
}

function persistSelectedModel(model: ModelId): void {
	if (canUseStorage()) {
		localStorage.setItem(SELECTED_MODEL_KEY, model);
	}
}

function persistTranslationState(state: TranslationState): void {
	if (canUseStorage()) {
		localStorage.setItem(TRANSLATION_STATE_KEY, state);
	}
}

function readStoredModel(): ModelId | null {
	if (!canUseStorage()) return null;

	const storedModel = localStorage.getItem(SELECTED_MODEL_KEY);
	return storedModel === 'model1' || storedModel === 'model2' ? storedModel : null;
}

function readStoredTranslationState(): TranslationState | null {
	if (!canUseStorage()) return null;

	const storedTranslation = localStorage.getItem(TRANSLATION_STATE_KEY);
	return storedTranslation === 'enabled' || storedTranslation === 'disabled' ? storedTranslation : null;
}

export function initSettings(serverPrefs?: { model?: ModelId; translationEnabled?: boolean }): void {
	if (!canUseStorage()) {
		return;
	}

	if (serverPrefs?.model) {
		selectedModel.set(serverPrefs.model);
		persistSelectedModel(serverPrefs.model);
	} else {
		const storedModel = readStoredModel();
		if (storedModel) {
			selectedModel.set(storedModel);
		}
	}

	if (serverPrefs?.translationEnabled !== undefined) {
		const state: TranslationState = serverPrefs.translationEnabled ? 'enabled' : 'disabled';
		translationState.set(state);
		persistTranslationState(state);
	} else {
		const storedTranslation = readStoredTranslationState();
		if (storedTranslation) {
			translationState.set(storedTranslation);
		}
	}
}

export function setTranslationState(state: TranslationState): void {
	translationState.set(state);
	persistTranslationState(state);
}

export function toggleTranslationState(): void {
	translationState.update((current) => {
		const newState: TranslationState = current === 'enabled' ? 'disabled' : 'enabled';
		persistTranslationState(newState);
		return newState;
	});
}

export function setSelectedModel(model: ModelId): void {
	selectedModel.set(model);
	persistSelectedModel(model);
}

export async function setSelectedModelAndSync(model: ModelId): Promise<void> {
	setSelectedModel(model);
	try {
		await updateUserPreferences({ preferredModel: model });
	} catch {
		// Non-fatal: local preference already applied
	}
}

export async function setTranslationAndSync(enabled: boolean): Promise<void> {
	const state: TranslationState = enabled ? 'enabled' : 'disabled';
	setTranslationState(state);
	try {
		await updateUserPreferences({ translationEnabled: enabled });
	} catch {
		// Non-fatal
	}
}
