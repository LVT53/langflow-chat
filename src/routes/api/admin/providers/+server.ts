import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/hooks';
import { clearProvidersCache } from '$lib/server/config-store';
import {
  createProvider,
  listProviders,
  normalizeReasoningEffort,
  normalizeThinkingType,
  validateProviderConnection,
  type CreateProviderInput,
} from '$lib/server/services/inference-providers';

export const GET: RequestHandler = async (event) => {
  try {
    requireAdmin(event);
    const providers = await listProviders();
    return json({ providers });
  } catch (error) {
    console.error('[ADMIN] Failed to list providers:', error);
    return json({ error: 'Failed to list providers' }, { status: 500 });
  }
};

export const POST: RequestHandler = async (event) => {
  try {
    requireAdmin(event);
    const body = await event.request.json();

    const input: CreateProviderInput = {
      name: body.name,
      displayName: body.displayName,
      baseUrl: body.baseUrl,
      apiKey: body.apiKey,
      modelName: body.modelName,
      reasoningEffort: normalizeReasoningEffort(body.reasoningEffort),
      thinkingType: normalizeThinkingType(body.thinkingType),
      enabled: body.enabled ?? true,
      sortOrder: body.sortOrder ?? 0,
      maxModelContext: typeof body.maxModelContext === 'number' ? body.maxModelContext : null,
      compactionUiThreshold: typeof body.compactionUiThreshold === 'number' ? body.compactionUiThreshold : null,
      targetConstructedContext: typeof body.targetConstructedContext === 'number' ? body.targetConstructedContext : null,
      maxMessageLength: typeof body.maxMessageLength === 'number' ? body.maxMessageLength : null,
    };

    if (!input.name || !input.displayName || !input.baseUrl || !input.apiKey || !input.modelName) {
      return json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (body.reasoningEffort && !input.reasoningEffort) {
      return json({ error: 'Invalid reasoning effort' }, { status: 400 });
    }

    if (body.thinkingType && !input.thinkingType) {
      return json({ error: 'Invalid thinking type' }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(input.name)) {
      return json({ error: 'Name must contain only letters, numbers, underscores, and hyphens' }, { status: 400 });
    }

    const connectionTest = await validateProviderConnection(input.baseUrl, input.apiKey);
    if (!connectionTest.valid) {
      return json({ error: connectionTest.error }, { status: 400 });
    }

    const provider = await createProvider(input);
    clearProvidersCache();
    return json({ provider }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
      return json({ error: 'A provider with this name already exists' }, { status: 409 });
    }
    console.error('[ADMIN] Failed to create provider:', error);
    return json({ error: 'Failed to create provider' }, { status: 500 });
  }
};
