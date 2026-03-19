// Langflow API client service
import { config } from '../env';
import type { LangflowRunRequest, LangflowRunResponse, LangflowMessage } from '$lib/types';
import type { ModelId } from '$lib/stores/settings';

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
  modelId?: ModelId
): Promise<{ text: string; rawResponse: LangflowRunResponse }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const url = `${config.langflowApiUrl}/api/v1/run/${config.langflowFlowId}`;

    // Get model config based on modelId
    const modelConfig = modelId ? config[modelId] : config.model1;
    const modelName = modelConfig.modelName;
    const baseUrl = modelConfig.baseUrl;

    console.log('[LANGFLOW] sendMessage request', {
      url,
      sessionId,
      messageLength: message.length,
      modelId,
      modelName,
      baseUrl
    });

    const body: LangflowRunRequest & { tweaks?: Record<string, unknown> } = {
      input_value: message,
      input_type: 'chat',
      output_type: 'chat',
      session_id: sessionId,
      tweaks: {
        // Pass model config to Langflow via tweaks
        model_name: modelName,
        api_base: baseUrl
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

    return { text, rawResponse };
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
  options?: { signal?: AbortSignal }
): Promise<ReadableStream<Uint8Array>> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), config.requestTimeoutMs);
  const signal = mergeAbortSignals(options?.signal, timeoutController.signal);

  try {
    const url = `${config.langflowApiUrl}/api/v1/run/${config.langflowFlowId}?stream=true`;

    // Get model config based on modelId
    const modelConfig = modelId ? config[modelId] : config.model1;
    const modelName = modelConfig.modelName;
    const baseUrl = modelConfig.baseUrl;

    console.log('[LANGFLOW] sendMessageStream request', {
      url,
      sessionId,
      messageLength: message.length,
      modelId,
      modelName,
      baseUrl
    });

    const body: LangflowRunRequest & { tweaks?: Record<string, unknown> } = {
      input_value: message,
      input_type: 'chat',
      output_type: 'chat',
      session_id: sessionId,
      tweaks: {
        model_name: modelName,
        api_base: baseUrl
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.langflowApiKey
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

    return response.body as ReadableStream<Uint8Array>;
  } catch (error) {
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
