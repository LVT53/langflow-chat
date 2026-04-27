import { derived } from 'svelte/store';
import { uiLanguage } from '$lib/stores/settings';

/**
 * Key Naming Convention
 * --------------------
 * All i18n keys use dot-separated hierarchical naming:
 *   {group}.{subgroup}.{specificName}
 *
 * Examples:
 *   sidebar.newChat        → sidebar New Chat button
 *   analytics.stats.messagesSent  → analytics stats label
 *   settings.avatar        → settings Avatar section
 *   login.welcomeBack      → login page welcome text
 *   common.confirm         → shared confirm button
 *   common.cancel          → shared cancel button
 *
 * Group categories:
 *   - sidebar, header, layout (navigation/layout)
 *   - chat, messageArea, messageInput (chat components)
 *   - knowledge, filePreview (knowledge components)
 *   - settings, settingsProfile, settingsAnalytics, settingsAdministration (settings)
 *   - admin (admin panel)
 *   - analytics (analytics tab)
 *   - login (login page)
 *   - common (shared UI components like ConfirmDialog, ErrorMessage)
 *   - generatedFile (chat-generated file components)
 *   - pageTitle (HTML <title> tags)
 *
 * All keys must exist in BOTH en and hu dictionaries.
 */

const dictionary = {
	en: {
		landingGreeting: 'What can I help you with?',
		landingGreetingNamed: 'What can I help you with, {name}?',
		landingReady: 'Ready when you are.',
		landingReadyNamed: 'Ready when you are, {name}.',
		landingWork: "Let's work through it.",
		landingWorkNamed: "Let's work through it, {name}.",
		openingChat: 'Opening your new chat...',
		startingConversation: 'Starting conversation',
		settingsProfile: 'Profile',
		settingsAnalytics: 'Analytics',
		settingsAdministration: 'Administration',
		settings: 'Settings',
		uiLanguage: 'UI Language',
		english: 'English',
		hungarian: 'Hungarian',
		totalCost: 'Estimated cost',
		promptTokens: 'Prompt tokens',
		cachedInput: 'Cached input',
		outputTokens: 'Output tokens',
	},
	hu: {
		landingGreeting: 'Miben segithetek?',
		landingGreetingNamed: 'Miben segithetek, {name}?',
		landingReady: 'Kezdhetjuk.',
		landingReadyNamed: 'Kezdhetjuk, {name}.',
		landingWork: 'Dolgozzuk vegig.',
		landingWorkNamed: 'Dolgozzuk vegig, {name}.',
		openingChat: 'Uj chat megnyitasa...',
		startingConversation: 'Beszelgetes inditasa',
		settingsProfile: 'Profil',
		settingsAnalytics: 'Analitika',
		settingsAdministration: 'Adminisztracio',
		settings: 'Beallitasok',
		uiLanguage: 'Feluletei nyelv',
		english: 'Angol',
		hungarian: 'Magyar',
		totalCost: 'Becsult koltseg',
		promptTokens: 'Prompt tokenek',
		cachedInput: 'Gyorsitotarazott bemenet',
		outputTokens: 'Kimeneti tokenek',
	},
} as const;

export type I18nKey = keyof typeof dictionary.en;

export const t = derived(uiLanguage, ($uiLanguage) => {
	const lang = dictionary[$uiLanguage] ?? dictionary.en;
	return (key: I18nKey, params?: Record<string, string | number>) => {
		let value = lang[key] ?? dictionary.en[key] ?? key;
		for (const [name, replacement] of Object.entries(params ?? {})) {
			value = value.replaceAll(`{${name}}`, String(replacement));
		}
		return value;
	};
});
