import { redirect } from '@sveltejs/kit';
import type { ServerLoad } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, adminConfig } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getConfig, getEnvDefaults, ADMIN_CONFIG_KEYS } from '$lib/server/config-store';
import { getSystemPrompt } from '$lib/server/prompts';
import type { UserSettings } from '$lib/types';

export const load: ServerLoad = async (event) => {
  if (!event.locals.user) throw redirect(302, '/login');

  const [userRow] = await db.select().from(users).where(eq(users.id, event.locals.user.id));
  if (!userRow) throw redirect(302, '/login');

  const userSettings: UserSettings = {
    id: userRow.id,
    email: userRow.email,
    name: userRow.name,
    role: userRow.role as 'user' | 'admin',
    preferences: {
      preferredModel: (userRow.preferredModel ?? 'model1') as 'model1' | 'model2',
      translationEnabled: (userRow.translationEnabled ?? 0) === 1,
      theme: (userRow.theme ?? 'system') as 'system' | 'light' | 'dark',
      avatarId: userRow.avatarId ?? null,
    },
  };

  const isAdmin = userRow.role === 'admin';

  if (!isAdmin) {
    return { userSettings };
  }

  // Admin: load config data
  const configRows = await db.select().from(adminConfig);
  const configOverrides: Record<string, string> = Object.fromEntries(
    configRows.map((r) => [r.key, r.value])
  );

  const runtime = getConfig();
  const envDefaults = getEnvDefaults();

  // Build current resolved values (with system prompts resolved to full text)
  const currentConfigValues: Record<string, string> = {
    MAX_MESSAGE_LENGTH: String(runtime.maxMessageLength),
    MODEL_1_BASEURL: runtime.model1.baseUrl,
    MODEL_1_NAME: runtime.model1.modelName,
    MODEL_1_DISPLAY_NAME: runtime.model1.displayName,
    MODEL_1_SYSTEM_PROMPT: getSystemPrompt(runtime.model1.systemPrompt),
    MODEL_1_FLOW_ID: runtime.model1.flowId,
    MODEL_2_BASEURL: runtime.model2.baseUrl,
    MODEL_2_NAME: runtime.model2.modelName,
    MODEL_2_DISPLAY_NAME: runtime.model2.displayName,
    MODEL_2_SYSTEM_PROMPT: getSystemPrompt(runtime.model2.systemPrompt),
    MODEL_2_FLOW_ID: runtime.model2.flowId,
    TITLE_GEN_URL: runtime.titleGenUrl,
    TITLE_GEN_MODEL: runtime.titleGenModel,
    TRANSLATOR_URL: runtime.translatorUrl,
    TRANSLATOR_MODEL: runtime.translatorModel,
    TRANSLATION_MAX_TOKENS: String(runtime.translationMaxTokens),
    TRANSLATION_TEMPERATURE: String(runtime.translationTemperature),
  };

  // Get runtime model display names for preferences section
  const modelNames = {
    model1: runtime.model1.displayName,
    model2: runtime.model2.displayName,
  };

  return {
    userSettings,
    adminConfigKeys: ADMIN_CONFIG_KEYS,
    currentConfigValues,
    configOverrides,
    envDefaults,
    modelNames,
  };
};
