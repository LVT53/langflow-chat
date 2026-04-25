import { writable } from 'svelte/store';
import { updateUserPreferences } from '$lib/client/api/settings';
import type { ModelId } from '$lib/types';
import { canUseStorage, persist, read } from './_local-storage';

export type TranslationState = 'enabled' | 'disabled';
export type { ModelId };

export const translationState = writable<TranslationState>('enabled');
export const selectedModel = writable<ModelId>('model1');

const SELECTED_MODEL_KEY = 'selectedModel';
const TRANSLATION_STATE_KEY = 'translationState';

export function initSettings(serverPrefs?: { model?: ModelId; translationEnabled?: boolean }): void {
	if (!canUseStorage()) {
		return;
	}

	if (serverPrefs?.model) {
		selectedModel.set(serverPrefs.model);
		persist(SELECTED_MODEL_KEY, serverPrefs.model);
	} else {
		const storedModel = read<ModelId>(SELECTED_MODEL_KEY, null as ModelId | null, (v): v is ModelId =>
			v === 'model1' || v === 'model2' || (typeof v === 'string' && v.startsWith('provider:'))
		);
		if (storedModel) {
			selectedModel.set(storedModel);
		}
	}

	if (serverPrefs?.translationEnabled !== undefined) {
		const state: TranslationState = serverPrefs.translationEnabled ? 'enabled' : 'disabled';
		translationState.set(state);
		persist(TRANSLATION_STATE_KEY, state);
	} else {
		const storedTranslation = read<TranslationState>(TRANSLATION_STATE_KEY, null as TranslationState | null, (v): v is TranslationState =>
			v === 'enabled' || v === 'disabled'
		);
		if (storedTranslation) {
			translationState.set(storedTranslation);
		}
	}
}

export function setTranslationState(state: TranslationState): void {
	translationState.set(state);
	persist(TRANSLATION_STATE_KEY, state);
}

export function toggleTranslationState(): void {
	translationState.update((current) => {
		const newState: TranslationState = current === 'enabled' ? 'disabled' : 'enabled';
		persist(TRANSLATION_STATE_KEY, newState);
		return newState;
	});
}

export function setSelectedModel(model: ModelId): void {
	selectedModel.set(model);
	persist(SELECTED_MODEL_KEY, model);
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
