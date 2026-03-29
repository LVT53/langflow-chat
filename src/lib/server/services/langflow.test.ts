import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRuntimeConfig } = vi.hoisted(() => ({
  mockRuntimeConfig: {
    langflowApiUrl: 'http://localhost:7860',
    langflowApiKey: 'test-api-key',
    langflowFlowId: 'test-flow-id',
    langflowWebhookSecret: '',
    attachmentTraceDebug: false,
    translatorUrl: 'http://localhost:30002/v1',
    translatorApiKey: '',
    translatorModel: 'translategemma',
    translationMaxTokens: 256,
    translationTemperature: 0.1,
    titleGenUrl: 'http://localhost:30001/v1',
    titleGenApiKey: '',
    titleGenModel: 'nemotron-nano',
    contextSummarizerUrl: '',
    contextSummarizerApiKey: '',
    contextSummarizerModel: '',
    webhookPort: 8090,
    requestTimeoutMs: 5000,
    maxMessageLength: 10000,
    sessionSecret: 'test-secret',
    databasePath: './data/test.db',
    model1: {
      baseUrl: 'http://localhost:30001/v1',
      apiKey: '',
      modelName: 'model-1',
      displayName: 'Model 1',
      systemPrompt: 'default',
      flowId: 'test-flow-id',
      componentId: '',
    },
    model2: {
      baseUrl: '',
      apiKey: '',
      modelName: '',
      displayName: 'Model 2',
      systemPrompt: 'default',
      flowId: '',
      componentId: '',
    },
    model2Enabled: true,
    honchoApiKey: '',
    honchoBaseUrl: 'http://localhost:8000',
    honchoWorkspace: 'test-workspace',
    honchoEnabled: false,
    memoryMaintenanceIntervalMinutes: 0,
  },
}));

vi.mock('../env', () => ({
  getDatabasePath: () => './data/test.db',
  config: {
    langflowApiUrl: 'http://localhost:7860',
    langflowApiKey: 'test-api-key',
    langflowFlowId: 'test-flow-id',
    langflowWebhookSecret: '',
    translatorUrl: 'http://localhost:30002/v1',
    translatorApiKey: '',
    translatorModel: 'translategemma',
    translationMaxTokens: 256,
    translationTemperature: 0.1,
    titleGenUrl: 'http://localhost:30001/v1',
    titleGenApiKey: '',
    titleGenModel: 'nemotron-nano',
    contextSummarizerUrl: '',
    contextSummarizerApiKey: '',
    contextSummarizerModel: '',
    webhookPort: 8090,
    requestTimeoutMs: 5000,
    maxMessageLength: 10000,
    sessionSecret: 'test-secret',
    databasePath: './data/test.db',
    model1: {
      baseUrl: 'http://localhost:30001/v1',
      apiKey: '',
      modelName: 'model-1',
      displayName: 'Model 1',
      systemPrompt: 'default',
      flowId: 'test-flow-id',
      componentId: '',
    },
    model2: {
      baseUrl: '',
      apiKey: '',
      modelName: '',
      displayName: 'Model 2',
      systemPrompt: 'default',
      flowId: '',
      componentId: '',
    },
    honchoApiKey: '',
    honchoBaseUrl: 'http://localhost:8000',
    honchoWorkspace: 'test-workspace',
    honchoEnabled: false,
  },
}));

vi.mock('../config-store', () => ({
  getConfig: () => mockRuntimeConfig,
}));

vi.stubGlobal('fetch', vi.fn());

vi.mock('./honcho', () => ({
  buildConstructedContext: vi.fn(async ({ message }: { message: string }) => ({
    inputValue: `CTX:${message}`,
    contextStatus: {
      conversationId: 'test-session',
      userId: 'user-1',
      estimatedTokens: 42,
      maxContextTokens: 262144,
      thresholdTokens: 209715,
      targetTokens: 157286,
      compactionApplied: false,
      compactionMode: 'none',
      routingStage: 'deterministic',
      routingConfidence: 0,
      verificationStatus: 'skipped',
      layersUsed: ['session'],
      workingSetCount: 0,
      workingSetArtifactIds: [],
      workingSetApplied: false,
      taskStateApplied: false,
      promptArtifactCount: 0,
      recentTurnCount: 0,
      summary: null,
      updatedAt: Date.now(),
    },
    taskState: null,
    contextDebug: null,
  })),
  buildEnhancedSystemPrompt: vi.fn(async () => 'You are a helpful AI assistant.'),
}));

describe('Langflow API Client Service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRuntimeConfig.model1.componentId = '';
    mockRuntimeConfig.model2.componentId = '';
  });

  describe('extractMessageText', () => {
    it('should extract text from valid Langflow response', async () => {
      const { extractMessageText } = await import('./langflow');

      const mockResponse = {
        outputs: [{
          outputs: [{
            results: {
              message: {
                text: 'Hello from Langflow!'
              }
            }
          }]
        }]
      };

      const result = extractMessageText(mockResponse as any);
      expect(result).toBe('Hello from Langflow!');
    });

    it('should throw error for empty text', async () => {
      const { extractMessageText } = await import('./langflow');

      const mockResponse = {
        outputs: [{
          outputs: [{
            results: {
              message: {
                text: ''
              }
            }
          }]
        }]
      };

      expect(() => extractMessageText(mockResponse as any))
        .toThrow(/Could not extract message text/);
    });

    it('should throw error for malformed response', async () => {
      const { extractMessageText } = await import('./langflow');

      const mockResponse = {
        outputs: [{
          outputs: [{
            results: {}
          }]
        }]
      };

      expect(() => extractMessageText(mockResponse as any))
        .toThrow(/Could not extract message text/);
    });
  });

  describe('sendMessage', () => {
    it('should send message and return extracted text', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          outputs: [{
            outputs: [{
              results: {
                message: {
                  text: 'AI response'
                }
              }
            }]
          }]
        }),
        ok: true
      }));

      const { sendMessage } = await import('./langflow');

      const result = await sendMessage('Hello', 'test-session');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:7860/api/v1/run/test-flow-id',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'test-api-key'
          },
        })
      );
      const request = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
      const body = JSON.parse(String(request?.body));
      expect(body).toMatchObject({
        input_value: 'Hello',
        input_type: 'chat',
        output_type: 'chat',
        session_id: 'test-session',
        tweaks: {
          model_name: 'model-1',
          api_base: 'http://localhost:30001/v1',
        },
      });
      expect(body.tweaks.system_prompt).toContain('You are a helpful AI assistant.');
      expect(body.tweaks.system_prompt).toContain('Time-sensitive search workflow');
      expect(body.tweaks.system_prompt).toContain('first get the current date and time');

      expect(result).toEqual({
        text: 'AI response',
        contextStatus: undefined,
        rawResponse: {
          outputs: [{
            outputs: [{
              results: {
                message: {
                  text: 'AI response'
                }
              }
            }]
          }]
        }
      });
    });

    it('scopes tweaks under the configured Langflow component ID when present', async () => {
      mockRuntimeConfig.model1.componentId = 'NemotronNode-123';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          outputs: [{
            outputs: [{
              results: {
                message: {
                  text: 'AI response'
                }
              }
            }]
          }]
        }),
        ok: true
      }));

      const { sendMessage } = await import('./langflow');

      await sendMessage('Hello', 'test-session');

      const request = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
      const body = JSON.parse(String(request?.body));
      expect(body.tweaks).toEqual({
        'NemotronNode-123': {
          model_name: 'model-1',
          api_base: 'http://localhost:30001/v1',
          system_prompt: expect.stringContaining('You are a helpful AI assistant.'),
        },
      });
    });

    it('should throw error on non-200 response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: vi.fn().mockResolvedValue('')
      }));

      const { sendMessage } = await import('./langflow');

      await expect(sendMessage('Hello', 'test-session'))
        .rejects
        .toThrow('Langflow API error: 500 Internal Server Error');
    });

    it('still sends when attachments are requested but the final prompt bundle marker is missing', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { sendMessage } = await import('./langflow');
      const { buildConstructedContext } = await import('./honcho');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          outputs: [{
            outputs: [{
              results: {
                message: {
                  text: 'AI response'
                }
              }
            }]
          }]
        }),
        ok: true
      }));

      vi.mocked(buildConstructedContext).mockResolvedValueOnce({
        inputValue: 'CTX:Hello',
        contextStatus: null as any,
        taskState: null,
        contextDebug: null,
      });

      const result = await sendMessage('Hello', 'test-session', undefined, 'user-1', {
        attachmentIds: ['artifact-1'],
        attachmentTraceId: 'trace-1',
      });

      expect(result.text).toBe('AI response');
      expect(fetch).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        '[LANGFLOW] Attachment marker missing from outgoing request bundle',
        expect.objectContaining({
          sessionId: 'test-session',
        })
      );
    });

    it('adds a URL list guard when the outbound prompt contains a link', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          outputs: [{
            outputs: [{
              results: {
                message: {
                  text: 'AI response'
                }
              }
            }]
          }]
        }),
        ok: true
      }));

      const { sendMessage } = await import('./langflow');

      await sendMessage('Please inspect https://example.com/article', 'test-session');

      const request = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
      const body = JSON.parse(String(request?.body));
      expect(body.tweaks.system_prompt).toContain('Tool argument safety');
      expect(body.tweaks.system_prompt).toContain('field is named `urls`');
      expect(body.tweaks.system_prompt).toContain('["https://example.com"]');
      expect(body.tweaks.system_prompt).toContain('Time-sensitive search workflow');
    });
  });

  describe('sendMessageStream', () => {
    it('should return a ReadableStream for streaming requests', async () => {
      const mockBody = {} as ReadableStream<Uint8Array>;
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        body: mockBody,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        status: 200,
        statusText: 'OK',
      }));

      const { sendMessageStream } = await import('./langflow');

      const response = await sendMessageStream('Hello', 'test-session');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:7860/api/v1/run/test-flow-id?stream=true',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/json',
            'x-api-key': 'test-api-key'
          },
        })
      );
      const request = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
      const body = JSON.parse(String(request?.body));
      expect(body).toMatchObject({
        input_value: 'Hello',
        input_type: 'chat',
        output_type: 'chat',
        session_id: 'test-session',
        tweaks: {
          model_name: 'model-1',
          api_base: 'http://localhost:30001/v1',
        },
      });
      expect(body.tweaks.system_prompt).toContain('You are a helpful AI assistant.');
      expect(body.tweaks.system_prompt).toContain('Time-sensitive search workflow');
      expect(body.tweaks.system_prompt).toContain('first get the current date and time');

      expect(response.stream).toBeDefined();
    });

    it('scopes streaming tweaks under the configured Langflow component ID when present', async () => {
      const mockBody = {} as ReadableStream<Uint8Array>;
      mockRuntimeConfig.model1.componentId = 'NemotronNode-123';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        body: mockBody,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        status: 200,
        statusText: 'OK',
      }));

      const { sendMessageStream } = await import('./langflow');

      await sendMessageStream('Hello', 'test-session');

      const request = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
      const body = JSON.parse(String(request?.body));
      expect(body.tweaks).toEqual({
        'NemotronNode-123': {
          model_name: 'model-1',
          api_base: 'http://localhost:30001/v1',
          system_prompt: expect.stringContaining('You are a helpful AI assistant.'),
        },
      });
    });

    it('should throw error on non-200 response for streaming', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: vi.fn().mockResolvedValue(''),
        headers: new Headers()
      }));

      const { sendMessageStream } = await import('./langflow');

      await expect(sendMessageStream('Hello', 'test-session'))
        .rejects
        .toThrow('Langflow API error: 500 Internal Server Error');
    });

    it('should throw error if response body is empty', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        body: undefined,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        status: 200,
        statusText: 'OK',
      }));

      const { sendMessageStream } = await import('./langflow');

      await expect(sendMessageStream('Hello', 'test-session'))
        .rejects
        .toThrow('Response body is empty');
    });

    it('still streams when attachments are requested but the prompt bundle marker is missing', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { sendMessageStream } = await import('./langflow');
      const { buildConstructedContext } = await import('./honcho');
      const mockBody = {} as ReadableStream<Uint8Array>;
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        body: mockBody,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        status: 200,
        statusText: 'OK',
      }));

      vi.mocked(buildConstructedContext).mockResolvedValueOnce({
        inputValue: 'CTX:Hello',
        contextStatus: null as any,
        taskState: null,
        contextDebug: null,
      });

      const result = await sendMessageStream('Hello', 'test-session', undefined, {
        userId: 'user-1',
        attachmentIds: ['artifact-1'],
        attachmentTraceId: 'trace-2',
      });

      expect(result.stream).toBe(mockBody);
      expect(fetch).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        '[LANGFLOW] Attachment marker missing from outgoing streaming bundle',
        expect.objectContaining({
          sessionId: 'test-session',
        })
      );
    });

    it('throws a specific connect-timeout error when stream headers never arrive', async () => {
      vi.useFakeTimers();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((_: RequestInfo | URL, init?: RequestInit) => {
          return new Promise<Response>((_resolve, reject) => {
            const abortError = new Error('This operation was aborted');
            abortError.name = 'AbortError';

            if (init?.signal?.aborted) {
              reject(abortError);
              return;
            }

            init?.signal?.addEventListener('abort', () => reject(abortError), {
              once: true,
            });
          });
        })
      );

      const { sendMessageStream } = await import('./langflow');
      const responsePromise = sendMessageStream('Hello', 'test-session', undefined, {
        connectTimeoutMs: 1000,
      });
      const handledResponsePromise = responsePromise.catch((error) => error);

      await vi.advanceTimersByTimeAsync(1100);

      await expect(handledResponsePromise).resolves.toMatchObject({
        name: 'LangflowStreamConnectTimeoutError',
        code: 'langflow_stream_connect_timeout',
      });

      vi.useRealTimers();
    });
  });
});
