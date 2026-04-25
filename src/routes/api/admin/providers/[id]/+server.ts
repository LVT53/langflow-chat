import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/hooks';
import { clearProvidersCache } from '$lib/server/config-store';
import {
  deleteProvider,
  decryptApiKey,
  getProviderWithSecrets,
  normalizeReasoningEffort,
  normalizeThinkingType,
  updateProvider,
  validateProviderConnection,
  type UpdateProviderInput,
} from '$lib/server/services/inference-providers';

export const PUT: RequestHandler = async (event) => {
  try {
    requireAdmin(event);
    const { id } = event.params;
    const body = await event.request.json();

    const input: UpdateProviderInput = {};

    if (body.displayName !== undefined) input.displayName = body.displayName;
    if (body.baseUrl !== undefined) input.baseUrl = body.baseUrl;
    if (body.apiKey !== undefined) input.apiKey = body.apiKey;
    if (body.modelName !== undefined) input.modelName = body.modelName;
    if (body.reasoningEffort !== undefined) input.reasoningEffort = normalizeReasoningEffort(body.reasoningEffort);
    if (body.thinkingType !== undefined) input.thinkingType = normalizeThinkingType(body.thinkingType);
    if (body.enabled !== undefined) input.enabled = body.enabled;
    if (body.sortOrder !== undefined) input.sortOrder = body.sortOrder;

    if (body.reasoningEffort && !input.reasoningEffort) {
      return json({ error: 'Invalid reasoning effort' }, { status: 400 });
    }

    if (body.thinkingType && !input.thinkingType) {
      return json({ error: 'Invalid thinking type' }, { status: 400 });
    }

    const validationBaseUrl =
      typeof body.baseUrl === 'string' && body.baseUrl.trim()
        ? body.baseUrl
        : undefined;
    const validationApiKey =
      typeof body.apiKey === 'string' && body.apiKey.trim()
        ? body.apiKey
        : undefined;

    if (validationBaseUrl || validationApiKey) {
      const existing = await getProviderWithSecrets(id);
      if (!existing) {
        return json({ error: 'Provider not found' }, { status: 404 });
      }
      const apiKey = validationApiKey ?? decryptApiKey(existing.apiKeyEncrypted, existing.apiKeyIv);
      const connectionTest = await validateProviderConnection(
        validationBaseUrl ?? existing.baseUrl,
        apiKey
      );
      if (!connectionTest.valid) {
        return json({ error: connectionTest.error }, { status: 400 });
      }
    }

    const provider = await updateProvider(id, input);

    if (!provider) {
      return json({ error: 'Provider not found' }, { status: 404 });
    }

    clearProvidersCache();
    return json({ provider });
  } catch (error) {
    console.error('[ADMIN] Failed to update provider:', error);
    return json({ error: 'Failed to update provider' }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async (event) => {
  try {
    requireAdmin(event);
    const { id } = event.params;

    const deleted = await deleteProvider(id);

    if (!deleted) {
      return json({ error: 'Provider not found' }, { status: 404 });
    }

    clearProvidersCache();
    return json({ success: true });
  } catch (error) {
    console.error('[ADMIN] Failed to delete provider:', error);
    return json({ error: 'Failed to delete provider' }, { status: 500 });
  }
};
