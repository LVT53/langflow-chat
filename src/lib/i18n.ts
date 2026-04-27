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
		landingWork: 'Let\\'s work through it.',
		landingWorkNamed: 'Let\\'s work through it, {name}.',
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
		// Settings profile tab
		settings_avatar: 'Avatar',
		settings_uploadPhoto: 'Upload Photo',
		settings_changeColor: 'Change Color',
		settings_done: 'Done',
		settings_removePhoto: 'Remove Photo',
		settings_removing: 'Removing…',
		settings_profileInformation: 'Profile Information',
		settings_displayName: 'Display Name',
		settings_emailAddress: 'Email Address',
		settings_yourName: 'Your name',
		settings_emailExample: 'email@example.com',
		settings_save: 'Save',
		settings_saving: 'Saving…',
		settings_changePassword: 'Change Password',
		settings_currentPassword: 'Current Password',
		settings_newPassword: 'New Password',
		settings_confirmNewPassword: 'Confirm New Password',
		settings_preferences: 'Preferences',
		settings_defaultModel: 'Default Model',
		settings_theme: 'Theme',
		settings_titleLanguage: 'Title Language',
		settings_autoDetect: 'Auto-Detect',
		settings_english: 'English',
		settings_hungarian: 'Hungarian',
		settings_dangerZone: 'Danger Zone',
		settings_resetDescription: 'Reset clears your chats, Knowledge Base, memories, and generated files while keeping your login, profile preferences, and avatar. Delete permanently removes the account itself too.',
		settings_resetAccount: 'Reset Account',
		settings_deleteAccount: 'Delete Account',
		settings_resetMemory: 'Reset Memory',
		settings_resetting: 'Resetting…',
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
		// Settings profile tab
		settings_avatar: 'Profilkep',
		settings_uploadPhoto: 'Kep feltoltese',
		settings_changeColor: 'Szinváltás',
		settings_done: 'Kész',
		settings_removePhoto: 'Kep eltávolítása',
		settings_removing: 'Eltávolítás...',
		settings_profileInformation: 'Profiladatok',
		settings_displayName: 'Megjelenítési név',
		settings_emailAddress: 'Email cim',
		settings_yourName: 'A neved',
		settings_emailExample: 'pelda@pelda.com',
		settings_save: 'Mentés',
		settings_saving: 'Mentés...',
		settings_changePassword: 'Jelszó változtatása',
		settings_currentPassword: 'Jelenlegi jelszó',
		settings_newPassword: 'Uj jelszó',
		settings_confirmNewPassword: 'Jelszó megerősítése',
		settings_preferences: 'Beállítások',
		settings_defaultModel: 'Alapértelmezett modell',
		settings_theme: 'Téma',
		settings_titleLanguage: 'Cim nyelve',
		settings_autoDetect: 'Automatikus',
		settings_english: 'Angol',
		settings_hungarian: 'Magyar',
		settings_dangerZone: 'Veszélyzóna',
		settings_resetDescription: 'A visszaállítás törli a chat-előzményeket, a tudásbázist, az emlékeket és a generált fájlokat, de meghagyja a bejelentkezést, a profilbeállításokat és az avatart. A törlés véglegesen eltávolítja a fiókot is.',
		settings_resetAccount: 'Fiók visszaállítása',
		settings_deleteAccount: 'Fiók törlése',
		settings_resetMemory: 'Memória visszaállítása',
		settings_resetting: 'Visszaállítás...',
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
