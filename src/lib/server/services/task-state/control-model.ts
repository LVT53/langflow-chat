import { getConfig } from "$lib/server/config-store";

export function canUseContextSummarizer(): boolean {
  const config = getConfig();
  return Boolean(config.contextSummarizerUrl && config.contextSummarizerModel);
}

export function parseJsonFromModel(
  content: string,
): Record<string, unknown> | null {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(withoutFence) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function requestContextSummarizer(params: {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
}): Promise<string | null> {
  if (!canUseContextSummarizer()) return null;

  const config = getConfig();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.contextSummarizerApiKey) {
    headers.Authorization = `Bearer ${config.contextSummarizerApiKey}`;
  }

  const response = await fetch(
    `${config.contextSummarizerUrl}/chat/completions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.contextSummarizerModel,
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
        max_tokens: params.maxTokens,
        temperature: params.temperature ?? 0.1,
        stream: false,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Context summarizer error: ${response.status} ${response.statusText}`,
    );
  }

  const json = await response.json();
  const content =
    json.choices?.[0]?.message?.content ??
    json.choices?.[0]?.text ??
    (json.choices?.[0]?.message?.content?.[0]?.text as string | undefined);
  return typeof content === "string" && content.trim() ? content.trim() : null;
}

export async function requestStructuredControlModel<
  T extends Record<string, unknown>,
>(params: {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
}): Promise<T | null> {
  const content = await requestContextSummarizer(params);
  if (!content) return null;
  const parsed = parseJsonFromModel(content);
  return parsed ? (parsed as T) : null;
}
