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
landingWork: `Let's work through it.`,
	landingWorkNamed: `Let's work through it, {name}.`,
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
		// Analytics tab
		'analytics.loadingAnalytics': 'Loading analytics...',
		'analytics.retry': 'Retry',
		'analytics.yourActivity': 'Your Activity',
		'analytics.messagesSent': 'Messages sent',
		'analytics.avgResponseTime': 'Avg response time',
		'analytics.tokensUsed': 'Tokens used',
		'analytics.reasoningTokens': 'Reasoning tokens',
		'analytics.favoriteModel': 'Favorite model',
		'analytics.conversations': 'Conversations',
		'analytics.modelUsage': 'Model usage',
		'analytics.systemOverview': 'System Overview',
		'analytics.totalMessages': 'Total messages',
		'analytics.totalUsers': 'Total users',
		'analytics.totalTokens': 'Total tokens',
		'analytics.totalConversations': 'Total conversations',
		'analytics.userActivity': 'User Activity',
		'analytics.perUserBreakdown': 'Per-User Breakdown',
		'analytics.user': 'User',
		'analytics.msgs': 'Msgs',
		'analytics.avgTime': 'Avg Time',
		'analytics.prompt': 'Prompt',
		'analytics.output': 'Output',
		'analytics.reasoning': 'Reasoning',
		'analytics.cost': 'Cost',
		'analytics.model': 'Model',
		'analytics.chats': 'Chats',
		'analytics.noData': 'No analytics data yet.',
		'analytics.chartMessages': 'Messages',
		'analytics.chartConversations': 'Conversations',
		'analytics.tooltipMessages': 'messages',
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
		// Analytics tab
		'analytics.loadingAnalytics': 'Analitika betöltése...',
		'analytics.retry': 'Újra',
		'analytics.yourActivity': 'A tevékenységed',
		'analytics.messagesSent': 'Elküldött üzenetek',
		'analytics.avgResponseTime': 'Átlagos válaszidő',
		'analytics.tokensUsed': 'Felhasznált tokenek',
		'analytics.reasoningTokens': 'Gondolkodási tokenek',
		'analytics.favoriteModel': 'Kedvenc modell',
		'analytics.conversations': 'Beszélgetések',
		'analytics.modelUsage': 'Modell használat',
		'analytics.systemOverview': 'Rendszer áttekintés',
		'analytics.totalMessages': 'Összes üzenet',
		'analytics.totalUsers': 'Összes felhasználó',
		'analytics.totalTokens': 'Összes token',
		'analytics.totalConversations': 'Összes beszélgetés',
		'analytics.userActivity': 'Felhasználói aktivitás',
		'analytics.perUserBreakdown': 'Felhasználónkénti bontás',
		'analytics.user': 'Felhasználó',
		'analytics.msgs': 'Üzenet',
		'analytics.avgTime': 'Átlag idő',
		'analytics.prompt': 'Prompt',
		'analytics.output': 'Kimenet',
		'analytics.reasoning': 'Gondolkodás',
		'analytics.cost': 'Költség',
		'analytics.model': 'Modell',
		'analytics.chats': 'Chat',
		'analytics.noData': 'Még nincs analitikai adat.',
		'analytics.chartMessages': 'Üzenetek',
		'analytics.chartConversations': 'Beszélgetések',
		'analytics.tooltipMessages': 'üzenet',
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
