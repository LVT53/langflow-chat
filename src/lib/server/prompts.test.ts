import { describe, expect, it } from 'vitest';

import {
  ALFYAI_NEMOTRON_PROMPT,
  getSystemPrompt,
  normalizeSystemPromptReference
} from './prompts';

describe('prompts', () => {
  it('leaves an empty prompt unset', () => {
    expect(getSystemPrompt(undefined)).toBe('');
    expect(getSystemPrompt('')).toBe('');
  });

  it('normalizes known prompt text back to its key', () => {
    expect(normalizeSystemPromptReference(ALFYAI_NEMOTRON_PROMPT)).toBe('alfyai-nemotron');
  });

  it('normalizes the old fetch_content prompt body back to the current key', () => {
    const legacyPrompt = ALFYAI_NEMOTRON_PROMPT
      .replace(
        '| search | Search the web for information | Current events, recent facts, product research, general-topic research, verification, when connected |\n| get_contents | Fetch and read Exa search result content | Search snippets are insufficient or exact page details matter, when connected |\n| find_similar | Find pages similar to a URL | The user gives a source URL and wants similar pages, when connected |',
        '| search | Search the web for information | Current events, recent facts, product research, general-topic research, verification |\n| fetch_content | Fetch and read a specific URL | The user gives a link, search snippets are insufficient, or exact page details matter |'
      )
      .replace(
        'Use search for web research when it is connected. Use get_contents when Exa returned result IDs and snippets are not enough. If a different content-fetching tool is connected, use the exact runtime tool name shown by the tool schema instead of inventing fetch_content.',
        'Use search for web research. Use fetch_content when the user gives a URL or when snippets are not enough.'
      );

    expect(normalizeSystemPromptReference(legacyPrompt)).toBe('alfyai-nemotron');
    expect(getSystemPrompt(legacyPrompt)).toBe(ALFYAI_NEMOTRON_PROMPT);
  });

  it('leaves custom prompt text untouched', () => {
    const customPrompt = 'You are a custom assistant.';

    expect(normalizeSystemPromptReference(customPrompt)).toBe(customPrompt);
    expect(getSystemPrompt(customPrompt)).toBe(customPrompt);
  });
});
