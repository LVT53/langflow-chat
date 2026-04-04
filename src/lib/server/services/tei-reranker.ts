import { getConfig } from '$lib/server/config-store';
import { postToTei } from './tei-client';

export interface TeiRerankResult {
  index: number;
  score: number;
  text?: string;
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
