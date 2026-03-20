import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/hooks';
import { db } from '$lib/server/db';
import { adminConfig } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getConfig, refreshConfig, getEnvDefaults, ADMIN_CONFIG_KEYS, type AdminConfigKey } from '$lib/server/config-store';
import { getSystemPrompt } from '$lib/server/prompts';

export const GET: RequestHandler = async (event) => {
  requireAdmin(event);

  const rows = await db.select().from(adminConfig);
  const overrides: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const envDefaults = getEnvDefaults();
  const runtime = getConfig();

  const currentValues: Record<string, string> = {
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

  return json({ keys: ADMIN_CONFIG_KEYS, currentValues, overrides, envDefaults });
};

export const PUT: RequestHandler = async (event) => {
  requireAdmin(event);
  const userId = event.locals.user!.id;

  let body: Record<string, unknown>;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const now = new Date();

  for (const key of ADMIN_CONFIG_KEYS) {
    if (body[key] !== undefined) {
      const value = String(body[key]);
      if (value.trim() === '') {
        // Empty value = revert to env default (delete DB override)
        await db.delete(adminConfig).where(eq(adminConfig.key, key));
      } else {
        await db
          .insert(adminConfig)
          .values({ key: key as AdminConfigKey, value, updatedAt: now, updatedBy: userId })
          .onConflictDoUpdate({
            target: adminConfig.key,
            set: { value, updatedAt: now, updatedBy: userId },
          });
      }
    }
  }

  await refreshConfig();

  return json({ success: true });
};
