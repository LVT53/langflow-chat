import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	decryptApiKey: vi.fn(),
	getConfig: vi.fn(),
	getProviderWithSecrets: vi.fn(),
	getSystemPrompt: vi.fn(),
}));

vi.mock('../config-store', () => ({
	getConfig: mocks.getConfig,
}));

vi.mock('../prompts', () => ({
	getSystemPrompt: mocks.getSystemPrompt,
}));

vi.mock('./honcho', () => ({
	buildConstructedContext: vi.fn(),
	buildEnhancedSystemPrompt: vi.fn(),
}));

vi.mock('./attachment-trace', () => ({
	logAttachmentTrace: vi.fn(),
	summarizeAttachmentSectionInInput: vi.fn(() => ({ hasMarker: false, preview: '', previewHash: '' })),
}));

vi.mock('./inference-providers', () => ({
	decryptApiKey: mocks.decryptApiKey,
	getProviderWithSecrets: mocks.getProviderWithSecrets,
}));

import { buildOutboundSystemPrompt, sendMessage } from './langflow';

const model1 = {
	baseUrl: 'http://local-model/v1',
	apiKey: 'local-key',
	modelName: 'local-model',
	displayName: 'Local Model',
	systemPrompt: 'alfyai-nemotron',
	flowId: 'shared-flow',
	componentId: 'ModelNode-1',
	maxTokens: 4096,
};

function mockConfig(overrides: Partial<typeof model1> = {}) {
	mocks.getConfig.mockReturnValue({
		langflowApiUrl: 'http://langflow',
		langflowApiKey: 'langflow-key',
		langflowFlowId: 'fallback-flow',
		requestTimeoutMs: 300000,
		maxModelContext: 262144,
		compactionUiThreshold: 209715,
		targetConstructedContext: 157286,
		model1: { ...model1, ...overrides },
		model2: {
			baseUrl: '',
			apiKey: '',
			modelName: '',
			displayName: 'Model 2',
			systemPrompt: '',
			flowId: '',
			componentId: '',
			maxTokens: null,
		},
	});
}

function mockLangflowResponse() {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify({
			outputs: [{ outputs: [{ results: { message: { text: 'Provider answer' } } }] }],
		}), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		}))
	);
}

describe('buildOutboundSystemPrompt', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('keeps always-on date, generated-file, and image-search guidance with custom prompts', () => {
		const prompt = buildOutboundSystemPrompt({
			basePrompt: 'Custom system prompt',
			inputValue: 'Create a downloadable PDF with photos of Amsterdam.',
			modelDisplayName: 'Provider Model',
		});

		expect(prompt).toContain('[MODEL: Provider Model]');
		expect(prompt).toContain('Time-sensitive search workflow');
		expect(prompt).toContain('Generated file workflow');
		expect(prompt).toContain('If the user asks for a downloadable file');
		expect(prompt).toContain('Image search workflow');
		expect(prompt).toContain('image_search');
	});

	it('places the selected personality style after generic tool guidance so it controls visible answer style', () => {
		const prompt = buildOutboundSystemPrompt({
			basePrompt: 'Base system prompt',
			inputValue: 'Explain this briefly.',
			personalityPrompt: 'Be extremely concise.',
		});

		expect(prompt).toContain('## Tool And Search Guidance');
		expect(prompt).toContain('## Selected Response Style');
		expect(prompt.indexOf('## Selected Response Style')).toBeGreaterThan(
			prompt.indexOf('## Tool And Search Guidance')
		);
		expect(prompt).toContain('Be extremely concise.');
	});
});

describe('sendMessage provider routing', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockConfig();
		mockLangflowResponse();
		mocks.getSystemPrompt.mockReturnValue('Base system prompt');
		mocks.decryptApiKey.mockReturnValue('provider-secret');
		mocks.getProviderWithSecrets.mockResolvedValue({
			id: 'provider-1',
			name: 'fireworks',
			displayName: 'Fireworks Model',
			baseUrl: 'https://api.fireworks.ai/inference/v1',
			apiKeyEncrypted: 'encrypted',
			apiKeyIv: 'iv',
			modelName: 'accounts/fireworks/models/kimi-k2',
			reasoningEffort: 'high',
			thinkingType: 'enabled',
			enabled: true,
			sortOrder: 0,
			maxModelContext: null,
			compactionUiThreshold: null,
			targetConstructedContext: null,
			maxMessageLength: null,
			maxTokens: 8192,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	});

	it('runs provider models through the shared Langflow flow with component-scoped tweaks', async () => {
		await sendMessage('Hello', 'conv-1', 'provider:provider-1');

		expect(fetch).toHaveBeenCalledWith(
			'http://langflow/api/v1/run/shared-flow',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({ 'x-api-key': 'langflow-key' }),
			})
		);

		const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
		expect(body.session_id).toBe('conv-1');
		expect(body.input_value).toBe('Hello');
		expect(body.tweaks).toMatchObject({
			'ModelNode-1': {
				model_name: 'accounts/fireworks/models/kimi-k2',
				api_base: 'https://api.fireworks.ai/inference/v1',
				api_key: 'provider-secret',
				max_tokens: 8192,
				reasoning_effort: 'high',
			},
		});
		expect(body.tweaks['ModelNode-1']).not.toHaveProperty('thinking_type');
		expect(body.tweaks['ModelNode-1'].system_prompt).toContain('[MODEL: Fireworks Model]');
	});

	it('fails clearly when provider routing has no shared Langflow component ID', async () => {
		mockConfig({ componentId: '' });

		await expect(sendMessage('Hello', 'conv-1', 'provider:provider-1')).rejects.toThrow(
			/MODEL_1_COMPONENT_ID/
		);
		expect(fetch).not.toHaveBeenCalled();
	});
});
