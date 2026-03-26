import {
	translateEnglishToHungarian,
	translateHungarianToEnglish,
} from '$lib/server/services/translator';

export function shouldTranslateHungarian(params: {
	sourceLanguage: string;
	translationEnabled: boolean;
}): boolean {
	return params.sourceLanguage === 'hu' && params.translationEnabled;
}

export async function buildUpstreamMessage(params: {
	normalizedMessage: string;
	sourceLanguage: string;
	translationEnabled: boolean;
}): Promise<string> {
	if (!shouldTranslateHungarian(params)) {
		return params.normalizedMessage;
	}

	return translateHungarianToEnglish(params.normalizedMessage);
}

export async function buildSendResponseText(params: {
	responseText: string;
	sourceLanguage: string;
	translationEnabled: boolean;
}): Promise<string> {
	if (!shouldTranslateHungarian(params)) {
		return params.responseText;
	}

	return translateEnglishToHungarian(params.responseText);
}
