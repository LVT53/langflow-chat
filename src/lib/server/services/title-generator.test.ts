import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../env', () => ({
  config: {
    langflowApiUrl: 'http://localhost:7860',
    langflowApiKey: 'test-api-key',
    langflowFlowId: 'test-flow-id',
    nemotronUrl: 'http://localhost:30001/v1',
    nemotronApiKey: '',
    nemotronModel: 'nemotron-nano',
    webhookPort: 8090,
    requestTimeoutMs: 5000,
    maxMessageLength: 10000,
    sessionSecret: 'test-secret',
    databasePath: './data/test.db',
  },
}));

import { generateTitle } from './title-generator';

describe('generateTitle', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('generates title from user message + assistant response', async () => {
    const mockFetch = vi.mocked(fetch);
    const mockResponse = new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: '  "A Great Conversation Title"  '
          }
        }
      ]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    mockFetch.mockResolvedValue(mockResponse);

    const title = await generateTitle('Hello', 'Hi there! How can I help you today?');
    expect(title).toBe('A Great Conversation Title');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/chat/completions'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('User: Hello'),
      })
    );
  });

  it('sends bearer auth when a nemotron api key is configured', async () => {
    vi.doMock('../env', () => ({
      config: {
        langflowApiUrl: 'http://localhost:7860',
        langflowApiKey: 'test-api-key',
        langflowFlowId: 'test-flow-id',
        nemotronUrl: 'http://localhost:30001/v1',
        nemotronApiKey: 'secret-key',
        nemotronModel: 'nemotron-nano',
        webhookPort: 8090,
        requestTimeoutMs: 5000,
        maxMessageLength: 10000,
        sessionSecret: 'test-secret',
        databasePath: './data/test.db',
      },
    }));

    vi.resetModules();
    const { generateTitle: generateTitleWithAuth } = await import('./title-generator');
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Secure Title' } }]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

    await generateTitleWithAuth('User', 'Assistant');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/chat/completions'),
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-key'
        }
      })
    );
  });

  it('truncates assistant response to 200 chars', async () => {
    const longResponse = 'x'.repeat(300);
    const mockFetch = vi.mocked(fetch);
    const mockResponse = new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: 'Title'
          }
        }
      ]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    mockFetch.mockResolvedValue(mockResponse);

    await generateTitle('User message', longResponse);
    const callArgs = mockFetch.mock.calls[0][1];
    const body = JSON.parse(typeof callArgs.body === 'string' ? callArgs.body : '');
    const prompt = body.messages[0].content;
    expect(prompt).toContain('Assistant: ' + 'x'.repeat(200));
    expect(prompt).not.toContain('x'.repeat(201));
  });

  it('removes surrounding quotes from generated title', async () => {
    const mockFetch = vi.mocked(fetch);
    const mockResponse = new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: '"Quoted Title"'
          }
        }
      ]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    mockFetch.mockResolvedValue(mockResponse);

    const title = await generateTitle('User', 'Assistant');
    expect(title).toBe('Quoted Title');
  });

  it('handles nemotron-nano being unreachable (throws)', async () => {
    const mockFetch = vi.mocked(fetch);
    const mockResponse = new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      statusText: 'Internal Server Error'
    });
    mockFetch.mockResolvedValue(mockResponse);

    await expect(generateTitle('User', 'Assistant')).rejects.toThrow(
      'Title generation failed: 500'
    );
  });

  it('throws error when empty title generated', async () => {
    const mockFetch = vi.mocked(fetch);
    const mockResponse = new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: ''
          }
        }
      ]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    mockFetch.mockResolvedValue(mockResponse);

    await expect(generateTitle('User', 'Assistant')).rejects.toThrow(
      'Empty title generated'
    );
  });
});
