import { getConfig } from '$lib/server/config-store';
import { postToTei } from './tei-client';

export interface TeiRerankResult {
  index: number;
  score: number;
  text?: string;
}

export interface RankedTeiItem<T> {
  item: T;
  index: number;
  score: number;
}

type TeiRerankResponse =
  | TeiRerankResult[]
  | { results?: TeiRerankResult[]; sorted_results?: TeiRerankResult[] };

function isRerankResult(value: unknown): value is TeiRerankResult {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as TeiRerankResult).index === 'number' &&
      typeof (value as TeiRerankResult).score === 'number'
  );
}

function normalizeRerankResponse(response: TeiRerankResponse): TeiRerankResult[] {
  const candidate =
    Array.isArray(response)
      ? response
      : Array.isArray(response.sorted_results)
        ? response.sorted_results
        : Array.isArray(response.results)
          ? response.results
          : null;

  if (!candidate || !candidate.every((item) => isRerankResult(item))) {
    throw new Error('Unexpected TEI rerank response shape');
  }

  return [...candidate].sort((left, right) => right.score - left.score);
}

function normalizeConfidenceScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  if (score >= 0 && score <= 1) {
    return score;
  }
  return 1 / (1 + Math.exp(-score));
}

export function scoreToConfidencePercent(score: number): number {
  return Math.max(0, Math.min(100, Math.round(normalizeConfidenceScore(score) * 100)));
}

export function canUseTeiReranker(): boolean {
  const config = getConfig();
  return Boolean(config.teiRerankerUrl);
}

export function getTeiRerankerMaxTexts(): number {
  return Math.max(1, getConfig().teiRerankerMaxTexts);
}

export async function rerankTexts(params: {
  query: string;
  texts: string[];
  truncate?: boolean;
  returnText?: boolean;
  maxTexts?: number;
}): Promise<TeiRerankResult[] | null> {
  if (params.texts.length === 0) return [];
  if (!canUseTeiReranker()) return null;

  const config = getConfig();
  const maxTexts = Math.max(1, params.maxTexts ?? config.teiRerankerMaxTexts);
  const texts = params.texts.slice(0, maxTexts);

  const response = await postToTei<TeiRerankResponse>({
    baseUrl: config.teiRerankerUrl,
    path: '/rerank',
    apiKey: config.teiRerankerApiKey,
    body: {
      query: params.query,
      texts,
      truncate: params.truncate ?? true,
      return_text: params.returnText ?? false,
      raw_scores: false,
    },
  });

  return normalizeRerankResponse(response);
}

export async function rerankItems<T>(params: {
  query: string;
  items: T[];
  getText: (item: T) => string;
  maxTexts?: number;
  truncate?: boolean;
}): Promise<{ items: Array<RankedTeiItem<T>>; confidence: number } | null> {
  if (params.items.length === 0) {
    return { items: [], confidence: 0 };
  }

  const limitedItems = params.items.slice(0, params.maxTexts ?? getTeiRerankerMaxTexts());
  const results = await rerankTexts({
    query: params.query,
    texts: limitedItems.map((item) => params.getText(item)),
    truncate: params.truncate,
    maxTexts: params.maxTexts,
  });

  if (!results) return null;

  const rankedItems = results
    .map((result) => {
      const item = limitedItems[result.index];
      if (item === undefined) return null;
      return {
        item,
        index: result.index,
        score: result.score,
      };
    })
    .filter((value): value is RankedTeiItem<T> => Boolean(value));

  return {
    items: rankedItems,
    confidence: rankedItems.length > 0 ? scoreToConfidencePercent(rankedItems[0].score) : 0,
  };
}
