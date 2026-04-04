import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRuntimeConfig } = vi.hoisted(() => ({
  mockRuntimeConfig: {
    teiEmbedderUrl: '',
    teiEmbedderApiKey: '',
    teiEmbedderModel: '',
    teiEmbedderBatchSize: 32,
    teiRerankerUrl: 'http://localhost:8082',
    teiRerankerApiKey: '',
    teiRerankerModel: 'bge-reranker-v2-m3',
    teiRerankerMaxTexts: 3,
    teiTimeoutMs: 5000,
  },
}));

vi.mock('$lib/server/config-store', () => ({
  getConfig: () => mockRuntimeConfig,
}));

vi.stubGlobal('fetch', vi.fn());

describe('tei-reranker service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRuntimeConfig.teiRerankerUrl = 'http://localhost:8082';
    mockRuntimeConfig.teiRerankerApiKey = '';
    mockRuntimeConfig.teiRerankerModel = 'bge-reranker-v2-m3';
    mockRuntimeConfig.teiRerankerMaxTexts = 3;
    mockRuntimeConfig.teiTimeoutMs = 5000;
  });

  it('returns null without calling fetch when the reranker is not configured', async () => {
    mockRuntimeConfig.teiRerankerUrl = '';

    const { rerankTexts, canUseTeiReranker } = await import('./tei-reranker');
    const result = await rerankTexts({ query: 'alpha', texts: ['a', 'b'] });

    expect(canUseTeiReranker()).toBe(false);
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts to /rerank, respects max text limits, and parses sorted_results', async () => {
    mockRuntimeConfig.teiRerankerApiKey = 'secret';
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          sorted_results: [
            { index: 1, score: 0.95, text: 'beta' },
            { index: 0, score: 0.75, text: 'alpha' },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { rerankTexts } = await import('./tei-reranker');
    const result = await rerankTexts({
      query: 'best option',
      texts: ['alpha', 'beta', 'gamma', 'delta'],
      truncate: false,
      returnText: true,
    });

    expect(result).toEqual([
      { index: 1, score: 0.95, text: 'beta' },
      { index: 0, score: 0.75, text: 'alpha' },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8082/rerank',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret',
        },
      })
    );

    const [, request] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse(String(request?.body))).toEqual({
      query: 'best option',
      texts: ['alpha', 'beta', 'gamma'],
      truncate: false,
      return_text: true,
      raw_scores: false,
    });
  });

  it('accepts the results response shape and sorts by score descending', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { index: 2, score: 0.1 },
            { index: 0, score: 0.9 },
            { index: 1, score: 0.4 },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { rerankTexts } = await import('./tei-reranker');
    const result = await rerankTexts({ query: 'rank', texts: ['a', 'b', 'c'] });

    expect(result).toEqual([
      { index: 0, score: 0.9 },
      { index: 1, score: 0.4 },
      { index: 2, score: 0.1 },
    ]);
  });
});
