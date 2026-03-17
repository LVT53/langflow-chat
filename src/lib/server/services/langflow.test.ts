import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../env', () => ({
  config: {
    langflowApiUrl: 'http://localhost:7860',
    langflowApiKey: 'test-api-key',
    langflowFlowId: 'test-flow-id',
    nemotronUrl: 'http://localhost:30001/v1',
    nemotronModel: 'nemotron-nano',
    webhookPort: 8090,
    requestTimeoutMs: 5000,
    maxMessageLength: 10000,
    sessionSecret: 'test-secret',
    databasePath: './data/test.db',
  },
}));

vi.stubGlobal('fetch', vi.fn());

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
            session_id: 'test-session'
          })
        })
      );

      expect(result).toEqual({
        text: 'AI response',
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
        statusText: 'Internal Server Error'
      }));

      const { sendMessage } = await import('./langflow');

      await expect(sendMessage('Hello', 'test-session'))
        .rejects
        .toThrow('Langflow API error: 500 Internal Server Error');
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

      const stream = await sendMessageStream('Hello', 'test-session');

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
            session_id: 'test-session'
          })
        })
      );

      expect(stream).toBeDefined();
    });

    it('should throw error on non-200 response for streaming', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
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
  });
});
