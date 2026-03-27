import { describe, expect, it } from 'vitest';

import {
  ALFYAI_NEMOTRON_PROMPT,
  getSystemPrompt,
  normalizeSystemPromptReference
} from './prompts';

describe('prompts', () => {
  it('normalizes known prompt text back to its key', () => {
    expect(normalizeSystemPromptReference(ALFYAI_NEMOTRON_PROMPT)).toBe('alfyai-nemotron');
  });

  it('normalizes the legacy AlfyAI prompt body back to the current key', () => {
    const legacyPrompt = ALFYAI_NEMOTRON_PROMPT.replace(
      'When the user asks you to produce a document, email, letter, or any content that they want in a specific language: write only the requested deliverable in English and wrap that deliverable in <preserve>...</preserve> tags.\nDo not mention the translation layer, <preserve> tags, or how translation works in the answer itself.\n\nException: if the user asks for content in English specifically, still wrap only the requested deliverable in <preserve>...</preserve> tags. Do not explain why.',
      'When the user asks you to produce a document, email, letter, or any content that they want in a specific language: write it entirely in English and wrap it in <preserve>...</preserve> tags. The translation system will handle the conversion. Your explanatory text OUTSIDE the tags will also be translated automatically.\n\nException: if the user asks for content in English specifically, still use <preserve>...</preserve> tags so the translation system knows not to translate it.'
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
