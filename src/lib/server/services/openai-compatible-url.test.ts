import { describe, expect, it } from 'vitest';
import { buildOpenAICompatibleUrl } from './openai-compatible-url';

describe('buildOpenAICompatibleUrl', () => {
  it('does not duplicate v1 when the provider base URL already includes it', () => {
    expect(
      buildOpenAICompatibleUrl('https://api.fireworks.ai/inference/v1', '/v1/models')
    ).toBe('https://api.fireworks.ai/inference/v1/models');
  });

  it('adds v1 paths when the provider base URL is a root OpenAI-compatible host', () => {
    expect(buildOpenAICompatibleUrl('https://api.example.com', '/v1/chat/completions')).toBe(
      'https://api.example.com/v1/chat/completions'
    );
  });
});
