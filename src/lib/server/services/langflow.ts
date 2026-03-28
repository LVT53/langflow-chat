// Langflow API client service
import type { LangflowRunRequest, LangflowRunResponse, ModelId } from '$lib/types';
import { getSystemPrompt } from '../prompts';
import { getConfig } from '../config-store';
import { buildConstructedContext, buildEnhancedSystemPrompt } from './honcho';
import {
	logAttachmentTrace,
	summarizeAttachmentSectionInInput,
} from './attachment-trace';

const URL_LIST_TOOL_ARGUMENT_GUARD = [
	'Tool argument safety for URL-processing tools:',
	'- If a tool field is named `urls` or expects a list of URLs/links, always pass an array of strings.',
	'- For a single link, use `["https://example.com"]`, never a bare string.',
].join('\n');

const DATE_BEFORE_SEARCH_GUARD = [
	'Time-sensitive search workflow:',
	'- Before any web search, news search, or other freshness-sensitive search, first get the current date and time.',
	'- Use that date/time to frame the search query and interpret freshness.',
	'- Do not search first and check the date afterward.',
].join('\n');

function containsHttpUrl(value: string): boolean {
	return /https?:\/\/[^\s)>\]]+/i.test(value);
}

function buildOutboundSystemPrompt(params: {
	basePrompt: string;
	inputValue: string;
	systemPromptAppendix?: string;
}): string {
	const basePrompt = params.basePrompt.trim();
	const additions: string[] = [DATE_BEFORE_SEARCH_GUARD];

	if (containsHttpUrl(params.inputValue)) {
		additions.push(URL_LIST_TOOL_ARGUMENT_GUARD);
	}

	if (typeof params.systemPromptAppendix === 'string' && params.systemPromptAppendix.trim()) {
		additions.push(params.systemPromptAppendix.trim());
	}

	if (additions.length === 0) {
		return params.basePrompt;
	}

	const uniqueAdditions = Array.from(new Set(additions));
	return `${basePrompt}\n\n## Tool And Search Guidance\n${uniqueAdditions.join('\n\n')}`;
}

function mergeAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal {
  const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));

  if (activeSignals.length === 1) {
    return activeSignals[0];
  }

  const controller = new AbortController();
  const abort = () => controller.abort();

  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }

    signal.addEventListener('abort', abort, { once: true });
  }

  return controller.signal;
}

export function extractMessageText(response: LangflowRunResponse): string {
  try {
    const text = response.outputs?.[0]?.outputs?.[0]?.results?.message?.text;
    
    if (typeof text !== 'string' || text === '') {
      throw new Error('Could not extract message text from Langflow response');
    }
    
    return text;
  } catch (error) {
    throw new Error(`Failed to extract message text: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function sendMessage(
  message: string,
  sessionId: string,
  modelId?: ModelId,
  userId?: string,
  options?: {
    attachmentIds?: string[];
    attachmentTraceId?: string;
    systemPromptAppendix?: string;
  }
): Promise<{
  text: string;
  rawResponse: LangflowRunResponse;
  contextStatus?: import('$lib/types').ConversationContextStatus;
  taskState?: import('$lib/types').TaskState | null;
  contextDebug?: import('$lib/types').ContextDebugState | null;
}> {
  const config = getConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const modelConfig = modelId ? config[modelId] : config.model1;
    const flowId = modelConfig.flowId || config.langflowFlowId;
    const url = `${config.langflowApiUrl}/api/v1/run/${flowId}`;
    const modelName = modelConfig.modelName;
    const baseUrl = modelConfig.baseUrl;

    let inputValue = message;
    let contextStatus: import('$lib/types').ConversationContextStatus | undefined;
    let taskState: import('$lib/types').TaskState | null | undefined;
    let contextDebug: import('$lib/types').ContextDebugState | null | undefined;
    if (userId) {
      const constructed = await buildConstructedContext({
        userId,
        conversationId: sessionId,
        message,
        attachmentIds: options?.attachmentIds,
        attachmentTraceId: options?.attachmentTraceId,
      });
      inputValue = constructed.inputValue;
      contextStatus = constructed.contextStatus;
      taskState = constructed.taskState;
      contextDebug = constructed.contextDebug;
    }

    const attachmentSection = summarizeAttachmentSectionInInput(inputValue);
    if ((options?.attachmentIds?.length ?? 0) > 0) {
      logAttachmentTrace('langflow_request', {
        traceId: options?.attachmentTraceId ?? null,
        sessionId,
        inputValueLength: inputValue.length,
        hasCurrentAttachmentsMarker: attachmentSection.hasMarker,
        attachmentSectionPreview: attachmentSection.preview,
        attachmentSectionPreviewHash: attachmentSection.previewHash,
      });
      if (!attachmentSection.hasMarker) {
        console.warn('[LANGFLOW] Attachment marker missing from outgoing request bundle', {
          sessionId,
          attachmentIds: options?.attachmentIds ?? [],
          traceId: options?.attachmentTraceId ?? null,
          inputValueLength: inputValue.length,
        });
      }
    }

    const baseSystemPrompt = userId
      ? await buildEnhancedSystemPrompt(modelConfig.systemPrompt, userId)
      : getSystemPrompt(modelConfig.systemPrompt);
    const systemPrompt = buildOutboundSystemPrompt({
      basePrompt: baseSystemPrompt,
      inputValue,
      systemPromptAppendix: options?.systemPromptAppendix,
    });

    console.log('[LANGFLOW] sendMessage request', {
      url,
      sessionId,
      messageLength: message.length,
      inputValueLength: inputValue.length,
      modelId,
      modelName,
      baseUrl,
      flowId
    });

    const body: LangflowRunRequest & { tweaks?: Record<string, unknown> } = {
      input_value: inputValue,
      input_type: 'chat',
      output_type: 'chat',
      session_id: sessionId,
      tweaks: {
        model_name: modelName,
        api_base: baseUrl,
        system_prompt: systemPrompt
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.langflowApiKey
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error('[LANGFLOW] sendMessage non-OK response', {
        url,
        status: response.status,
        statusText: response.statusText,
        bodyPreview: errorBody.slice(0, 1000)
      });
      throw new Error(`Langflow API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody.slice(0, 500)}` : ''}`);
    }

    const rawResponse: LangflowRunResponse = await response.json();
    const text = extractMessageText(rawResponse);

    return { text, rawResponse, contextStatus, taskState, contextDebug };
  } catch (error) {
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function sendMessageStream(
  message: string,
  sessionId: string,
  modelId?: ModelId,
  options?: {
    signal?: AbortSignal;
    userId?: string;
    attachmentIds?: string[];
    attachmentTraceId?: string;
    systemPromptAppendix?: string;
  }
): Promise<{
  stream: ReadableStream<Uint8Array>;
  contextStatus?: import('$lib/types').ConversationContextStatus;
  taskState?: import('$lib/types').TaskState | null;
  contextDebug?: import('$lib/types').ContextDebugState | null;
}> {
  const config = getConfig();
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), config.requestTimeoutMs);
  const signal = mergeAbortSignals(options?.signal, timeoutController.signal);

  try {
    const modelConfig = modelId ? config[modelId] : config.model1;
    const flowId = modelConfig.flowId || config.langflowFlowId;
    const url = `${config.langflowApiUrl}/api/v1/run/${flowId}?stream=true`;
    const modelName = modelConfig.modelName;
    const baseUrl = modelConfig.baseUrl;

    let inputValue = message;
    let contextStatus: import('$lib/types').ConversationContextStatus | undefined;
    let taskState: import('$lib/types').TaskState | null | undefined;
    let contextDebug: import('$lib/types').ContextDebugState | null | undefined;
    if (options?.userId) {
      const constructed = await buildConstructedContext({
        userId: options.userId,
        conversationId: sessionId,
        message,
        attachmentIds: options.attachmentIds,
        attachmentTraceId: options.attachmentTraceId,
      });
      inputValue = constructed.inputValue;
      contextStatus = constructed.contextStatus;
      taskState = constructed.taskState;
      contextDebug = constructed.contextDebug;
    }

    const attachmentSection = summarizeAttachmentSectionInInput(inputValue);
    if ((options?.attachmentIds?.length ?? 0) > 0) {
      logAttachmentTrace('langflow_request', {
        traceId: options?.attachmentTraceId ?? null,
        sessionId,
        inputValueLength: inputValue.length,
        hasCurrentAttachmentsMarker: attachmentSection.hasMarker,
        attachmentSectionPreview: attachmentSection.preview,
        attachmentSectionPreviewHash: attachmentSection.previewHash,
      });
      if (!attachmentSection.hasMarker) {
        console.warn('[LANGFLOW] Attachment marker missing from outgoing streaming bundle', {
          sessionId,
          attachmentIds: options?.attachmentIds ?? [],
          traceId: options?.attachmentTraceId ?? null,
          inputValueLength: inputValue.length,
        });
      }
    }

    const baseSystemPrompt = options?.userId
      ? await buildEnhancedSystemPrompt(modelConfig.systemPrompt, options.userId)
      : getSystemPrompt(modelConfig.systemPrompt);
    const systemPrompt = buildOutboundSystemPrompt({
      basePrompt: baseSystemPrompt,
      inputValue,
      systemPromptAppendix: options?.systemPromptAppendix,
    });

    console.log('[LANGFLOW] sendMessageStream request', {
      url,
      sessionId,
      messageLength: message.length,
      inputValueLength: inputValue.length,
      modelId,
      modelName,
      baseUrl,
      flowId,
      systemPromptLength: systemPrompt.length,
      systemPromptPreview: systemPrompt.slice(0, 80)
    });

    const body: LangflowRunRequest & { tweaks?: Record<string, unknown> } = {
      input_value: inputValue,
      input_type: 'chat',
      output_type: 'chat',
      session_id: sessionId,
      tweaks: {
        model_name: modelName,
        api_base: baseUrl,
        system_prompt: systemPrompt
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.langflowApiKey,
      },
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error('[LANGFLOW] sendMessageStream non-OK response', {
        url,
        status: response.status,
        statusText: response.statusText,
        bodyPreview: errorBody.slice(0, 1000)
      });
      throw new Error(`Langflow API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody.slice(0, 500)}` : ''}`);
    }

    if (!response.body) {
      console.error('[LANGFLOW] sendMessageStream missing response body', { url, sessionId });
      throw new Error('Response body is empty');
    }

    return { stream: response.body as ReadableStream<Uint8Array>, contextStatus, taskState, contextDebug };
  } catch (error) {
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
