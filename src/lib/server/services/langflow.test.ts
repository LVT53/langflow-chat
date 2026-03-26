import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../env', () => ({
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
    },
    model2: {
      baseUrl: '',
      apiKey: '',
      modelName: '',
      displayName: 'Model 2',
      systemPrompt: 'default',
      flowId: '',
    },
    honchoApiKey: '',
    honchoBaseUrl: 'http://localhost:8000',
    honchoWorkspace: 'test-workspace',
    honchoEnabled: false,
  },
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
          body: JSON.stringify({
            input_value: 'Hello',
            input_type: 'chat',
            output_type: 'chat',
            session_id: 'test-session',
            tweaks: {
              model_name: 'model-1',
              api_base: 'http://localhost:30001/v1',
              system_prompt: 'You are a helpful AI assistant.'
            }
          })
        })
      );

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
  });

  describe('sendMessageStream', () => {
    it('should return a ReadableStream for streaming requests', async () => {
      const mockBody = {} as ReadableStream<Uint8Array>;
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        body: mockBody
      }));

      const { sendMessageStream } = await import('./langflow');

      const response = await sendMessageStream('Hello', 'test-session');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:7860/api/v1/run/test-flow-id?stream=true',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'test-api-key'
          },
          body: JSON.stringify({
            input_value: 'Hello',
            input_type: 'chat',
            output_type: 'chat',
            session_id: 'test-session',
            tweaks: {
              model_name: 'model-1',
              api_base: 'http://localhost:30001/v1',
              system_prompt: 'You are a helpful AI assistant.'
            }
          })
        })
      );

      expect(response.stream).toBeDefined();
    });

    it('should throw error on non-200 response for streaming', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: vi.fn().mockResolvedValue('')
      }));

      const { sendMessageStream } = await import('./langflow');

      await expect(sendMessageStream('Hello', 'test-session'))
        .rejects
        .toThrow('Langflow API error: 500 Internal Server Error');
    });

    it('should throw error if response body is empty', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        body: undefined
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
        body: mockBody
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
  });
});
