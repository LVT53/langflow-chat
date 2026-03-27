import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../env', () => ({
  getDatabasePath: () => './data/test.db',
  config: {
    langflowApiUrl: 'http://localhost:7860',
    langflowApiKey: 'test-api-key',
    langflowFlowId: 'test-flow-id',
    titleGenUrl: 'http://localhost:30001/v1',
    titleGenApiKey: '',
    titleGenModel: 'nemotron-nano',
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
    const callArgs = mockFetch.mock.calls[0]?.[1];
    const body = JSON.parse(typeof callArgs?.body === 'string' ? callArgs.body : '{}');
    expect(body.messages[0].content).toContain('Titles should be 4-7 targeted words long');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/chat/completions'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('User: Hello'),
      })
    );
  });

  it('sends bearer auth when a title gen api key is configured', async () => {
    vi.doMock('../env', () => ({
      getDatabasePath: () => './data/test.db',
      config: {
        langflowApiUrl: 'http://localhost:7860',
        langflowApiKey: 'test-api-key',
        langflowFlowId: 'test-flow-id',
        titleGenUrl: 'http://localhost:30001/v1',
        titleGenApiKey: 'secret-key',
        titleGenModel: 'nemotron-nano',
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
    const lastMessage = body.messages[body.messages.length - 1];
    expect(lastMessage.content).toContain('Assistant: ' + 'x'.repeat(200));
    expect(lastMessage.content).not.toContain('x'.repeat(201));
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

  it('uses reasoning when content is null', async () => {
    const mockFetch = vi.mocked(fetch);
    const mockResponse = new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: null,
            reasoning: 'Greeting and Assistance Offered'
          }
        }
      ]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    mockFetch.mockResolvedValue(mockResponse);

    const title = await generateTitle('User', 'Assistant');
    expect(title).toBe('Greeting and Assistance Offered');
  });

  it('handles title generation service being unreachable (throws)', async () => {
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

  it('falls back to the user message when the model returns no title', async () => {
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

    await expect(generateTitle('User asks for server deployment help', 'Assistant'))
      .resolves.toBe('User asks for server deployment help');
  });

  it('uses the latest user-message language even if the assistant text is Hungarian', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'English Debug Summary' } }]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

    await generateTitle(
      'Please summarize what this file is about in English.',
      'A feltöltött fájl magyar nyelvű.'
    );

    const callArgs = mockFetch.mock.calls[0]?.[1];
    const body = JSON.parse(typeof callArgs?.body === 'string' ? callArgs.body : '{}');
    expect(body.messages[0].content).toContain('You are a conversation title generator');
    expect(body.messages[0].content).not.toContain('Te egy beszélgetés cím generátor vagy');
  });

  it('falls back to the user message when the model returns a title in the wrong language', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Magyar cím' } }]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

    await expect(
      generateTitle('Please explain the attached deployment notes in English', 'Rendben.')
    ).resolves.toBe('Please explain the attached deployment notes in English');
  });
});
