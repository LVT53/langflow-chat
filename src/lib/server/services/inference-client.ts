import type { InferenceProviderWithSecrets } from './inference-providers';
import { decryptApiKey } from './inference-providers';
import { getConfig } from '../config-store';
import { buildOpenAICompatibleUrl } from './openai-compatible-url';

export type ChatCompletionToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ChatCompletionToolCall[];
  reasoning_content?: string;
}

export interface InferenceRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  tools?: unknown[];
  tool_choice?: 'auto' | 'none';
  extra_body?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface InferenceChunk {
  id: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      reasoning_content?: string;
      reasoning?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface InferenceResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: ChatCompletionToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export type InferenceErrorType = 'timeout' | 'auth_error' | 'server_error' | 'invalid_response' | 'unknown';

export interface InferenceError {
  name?: string;
  type: InferenceErrorType;
  message: string;
  statusCode?: number;
}

function isAuthError(statusCode: number): boolean {
  return statusCode === 401 || statusCode === 403;
}

function isServerError(statusCode: number): boolean {
  return statusCode >= 500 && statusCode < 600;
}

function timeoutSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  return AbortSignal.any([signal, timeout]);
}

export async function callInferenceProvider(
  provider: InferenceProviderWithSecrets,
  request: InferenceRequest
): Promise<InferenceResponse> {
  const config = getConfig();
  const timeoutMs = config.requestTimeoutMs ?? 300000;

  let apiKey: string;
  try {
    apiKey = decryptApiKey(provider.apiKeyEncrypted, provider.apiKeyIv);
  } catch {
    throw createInferenceError('auth_error', 'Failed to decrypt API key - session secret may have changed');
  }

  const url = buildOpenAICompatibleUrl(provider.baseUrl, '/v1/chat/completions');

  try {
    const body = buildRequestBody(provider, request, false);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: timeoutSignal(timeoutMs, request.signal),
    });

    if (isAuthError(response.status)) {
      throw createInferenceError('auth_error', 'Invalid API key', response.status);
    }

    if (isServerError(response.status)) {
      const text = await response.text().catch(() => 'Unknown error');
      throw createInferenceError('server_error', `Server error: ${response.status} - ${text}`, response.status);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error');
      throw createInferenceError('invalid_response', `Request failed: ${response.status} - ${text}`, response.status);
    }

    const data = await response.json();

    if (!data || typeof data !== 'object') {
      throw createInferenceError('invalid_response', 'Invalid response format');
    }

    return validateAndNormalizeResponse(data);
  } catch (error) {
    if (isInferenceError(error)) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.name === 'TimeoutError') {
        throw createInferenceError('timeout', 'Request timed out');
      }
      throw createInferenceError('unknown', error.message);
    }

    throw createInferenceError('unknown', 'Unknown error occurred');
  }
}

export async function* streamInferenceProvider(
  provider: InferenceProviderWithSecrets,
  request: InferenceRequest
): AsyncGenerator<InferenceChunk, void, unknown> {
  const config = getConfig();
  const timeoutMs = config.requestTimeoutMs ?? 300000;

  let apiKey: string;
  try {
    apiKey = decryptApiKey(provider.apiKeyEncrypted, provider.apiKeyIv);
  } catch {
    throw createInferenceError('auth_error', 'Failed to decrypt API key - session secret may have changed');
  }

  const url = buildOpenAICompatibleUrl(provider.baseUrl, '/v1/chat/completions');

  try {
    const body = buildRequestBody(provider, request, true);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: timeoutSignal(timeoutMs, request.signal),
    });

    if (isAuthError(response.status)) {
      const text = await response.text().catch(() => 'Invalid API key');
      throw createInferenceError('auth_error', text, response.status);
    }

    if (isServerError(response.status)) {
      const text = await response.text().catch(() => 'Unknown error');
      throw createInferenceError('server_error', `Server error: ${response.status} - ${text}`, response.status);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error');
      throw createInferenceError('invalid_response', `Request failed: ${response.status} - ${text}`, response.status);
    }

    if (!response.body) {
      throw createInferenceError('invalid_response', 'No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();

          if (!trimmed || trimmed === 'data: [DONE]') {
            if (trimmed === 'data: [DONE]') {
              return;
            }
            continue;
          }

          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6).trim();

            if (!jsonStr) continue;

            try {
              const chunk = JSON.parse(jsonStr);
              yield normalizeStreamChunk(chunk);
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (isInferenceError(error)) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.name === 'TimeoutError') {
        throw createInferenceError('timeout', 'Request timed out');
      }
      throw createInferenceError('unknown', error.message);
    }

    throw createInferenceError('unknown', 'Unknown error occurred');
  }
}

function buildRequestBody(
  provider: InferenceProviderWithSecrets,
  request: InferenceRequest,
  stream: boolean
): Record<string, unknown> {
  return {
    model: request.model,
    messages: request.messages,
    stream,
    max_tokens: request.max_tokens ?? 4096,
    temperature: request.temperature ?? 0.7,
    ...(request.top_p && { top_p: request.top_p }),
    ...(request.stop && { stop: request.stop }),
    ...(request.tools && { tools: request.tools }),
    ...(request.tool_choice && { tool_choice: request.tool_choice }),
    ...(provider.reasoningEffort ? { reasoning_effort: provider.reasoningEffort } : {}),
    // thinking goes at request top level (not inside extra_body) for raw fetch compatibility
    ...(provider.thinkingType ? { thinking: { type: provider.thinkingType } } : {}),
    // extra_body passthrough for other custom params
    ...(request.extra_body && Object.keys(request.extra_body).length > 0
      ? { extra_body: request.extra_body }
      : {}),
  };
}

function createInferenceError(
  type: InferenceErrorType,
  message: string,
  statusCode?: number
): InferenceError {
  const error = new Error(message) as Error & InferenceError;
  error.name = 'InferenceProviderError';
  error.type = type;
  error.statusCode = statusCode;
  return error;
}

function isInferenceError(error: unknown): error is InferenceError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    'message' in error
  );
}

function validateAndNormalizeResponse(data: unknown): InferenceResponse {
  if (!data || typeof data !== 'object') {
    throw createInferenceError('invalid_response', 'Response is not an object');
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.id !== 'string') {
    throw createInferenceError('invalid_response', 'Missing or invalid response id');
  }

  if (typeof obj.model !== 'string') {
    throw createInferenceError('invalid_response', 'Missing or invalid response model');
  }

  if (!Array.isArray(obj.choices) || obj.choices.length === 0) {
    throw createInferenceError('invalid_response', 'Missing or invalid response choices');
  }

  return data as InferenceResponse;
}

function normalizeStreamChunk(chunk: unknown): InferenceChunk {
  if (!chunk || typeof chunk !== 'object') {
    throw createInferenceError('invalid_response', 'Invalid stream chunk');
  }

  const obj = chunk as Record<string, unknown>;

  if (typeof obj.id !== 'string') {
    throw createInferenceError('invalid_response', 'Missing id in stream chunk');
  }

  if (!Array.isArray(obj.choices)) {
    throw createInferenceError('invalid_response', 'Missing choices in stream chunk');
  }

  return chunk as InferenceChunk;
}

export function isInferenceErrorType(error: unknown, type: InferenceErrorType): boolean {
  return isInferenceError(error) && error.type === type;
}

export function shouldFallback(error: unknown): boolean {
  if (!isInferenceError(error)) return false;
  return error.type === 'timeout' || error.type === 'server_error';
}
