import { afterEach, describe, expect, it, vi } from 'vitest';
import { callInferenceProvider, streamInferenceProvider } from './inference-client';
import {
	encryptApiKey,
	validateProviderConnection,
	type InferenceProviderWithSecrets,
} from './inference-providers';

function makeProvider(
	overrides: Partial<InferenceProviderWithSecrets> = {}
): InferenceProviderWithSecrets {
	const { encrypted, iv } = encryptApiKey('test-key');
	return {
		id: 'provider-1',
		name: 'test',
		displayName: 'Test Provider',
		baseUrl: 'https://provider.example',
		modelName: 'test-model',
		reasoningEffort: null,
		thinkingType: null,
		enabled: true,
		sortOrder: 0,
		createdAt: new Date(),
		updatedAt: new Date(),
		apiKeyEncrypted: encrypted,
		apiKeyIv: iv,
		...overrides,
	};
}

function sseResponse(lines: string[]): Response {
	const encoder = new TextEncoder();
	return new Response(
		new ReadableStream({
			start(controller) {
				for (const line of lines) {
					controller.enqueue(encoder.encode(line));
				}
				controller.close();
			},
		}),
		{
			status: 200,
			headers: { 'content-type': 'text/event-stream' },
		}
	);
}

describe('streamInferenceProvider', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('parses OpenAI-compatible data lines before DONE', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				sseResponse([
					'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":"Hel"}}]}\n\n',
					'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":"lo"}}]}\n\n',
					'data: [DONE]\n\n',
				])
			)
		);

		const chunks = [];
		for await (const chunk of streamInferenceProvider(makeProvider(), {
			model: 'test-model',
			messages: [{ role: 'user', content: 'Hi' }],
			stream: true,
		})) {
			chunks.push(chunk);
		}

		expect(chunks.map((chunk) => chunk.choices[0]?.delta.content).join('')).toBe('Hello');
	});

	it('sends provider reasoning and thinking options in the completion body', async () => {
		const fetchMock = vi.fn(async () =>
			new Response(
				JSON.stringify({
					id: 'chatcmpl-1',
					model: 'test-model',
					choices: [
						{
							index: 0,
							message: { role: 'assistant', content: 'Hello' },
							finish_reason: 'stop',
						},
					],
				}),
				{
					status: 200,
					headers: { 'content-type': 'application/json' },
				}
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		await callInferenceProvider(
			makeProvider({
				baseUrl: 'https://api.fireworks.ai/inference/v1',
				reasoningEffort: 'high',
				thinkingType: 'enabled',
			}),
			{
				model: 'test-model',
				messages: [{ role: 'user', content: 'Hi' }],
			}
		);

		const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
		expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
			'https://api.fireworks.ai/inference/v1/chat/completions'
		);
		expect(body.reasoning_effort).toBe('high');
		expect(body.thinking).toEqual({ type: 'enabled' });
	});

	it('validates provider model URLs without duplicating v1', async () => {
		const fetchMock = vi.fn(async () =>
			new Response(JSON.stringify({ data: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const result = await validateProviderConnection(
			'https://api.fireworks.ai/inference/v1',
			'test-key'
		);

		expect(result.valid).toBe(true);
		expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
			'https://api.fireworks.ai/inference/v1/models'
		);
	});
});
