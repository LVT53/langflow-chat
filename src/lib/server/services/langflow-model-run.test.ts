import { afterEach, describe, expect, it, vi } from "vitest";
import type { LangflowRunRequest } from "$lib/types";
import type { RuntimeConfig } from "../config-store";

const mocks = vi.hoisted(() => ({
	decryptApiKey: vi.fn(),
	getProviderWithSecrets: vi.fn(),
}));

vi.mock("./inference-providers", () => ({
	decryptApiKey: mocks.decryptApiKey,
	getProviderWithSecrets: mocks.getProviderWithSecrets,
}));

import {
	executeLangflowJsonRun,
	executeLangflowStreamRun,
	isLangflowTimeoutError,
	runLangflowModelRunWithFailover,
} from "./langflow-model-run";

const runtimeConfig = {
	langflowApiUrl: "http://langflow",
	langflowApiKey: "langflow-key",
	contextDiagnosticsDebug: false,
	requestTimeoutMs: 30_000,
	modelTimeoutFailoverEnabled: false,
	modelTimeoutFailoverTimeoutMs: 10_000,
	modelTimeoutFailoverTargetModel: "model2",
	langflowFlowId: "fallback-flow",
	model1: {
		baseUrl: "http://local-model/v1",
		apiKey: "local-key",
		modelName: "local-model",
		displayName: "Local Model",
		systemPrompt: "alfyai-nemotron",
		flowId: "shared-flow",
		componentId: "ModelNode-1",
		maxTokens: 4096,
		reasoningEffort: null,
		thinkingType: null,
	},
} as RuntimeConfig;

function requestBody(): LangflowRunRequest & {
	tweaks?: Record<string, unknown>;
} {
	return {
		input_value: "Hello",
		input_type: "chat",
		output_type: "chat",
		session_id: "conv-1",
		tweaks: { "ModelNode-1": { model_name: "local-model" } },
	};
}

describe("Langflow model-run transport", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("returns text and provider usage from JSON runs", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							outputs: [
								{
									outputs: [
										{
											results: {
												message: { text: "JSON answer" },
											},
										},
									],
								},
							],
							usage: {
								prompt_tokens: 5,
								completion_tokens: 2,
								total_tokens: 7,
							},
						}),
						{
							status: 200,
							headers: { "Content-Type": "application/json" },
						},
					),
			),
		);

		const result = await executeLangflowJsonRun({
			config: runtimeConfig,
			flowId: "flow-1",
			body: requestBody(),
			attemptTimeoutMs: 30_000,
			sessionId: "conv-1",
			modelId: "model1",
			modelName: "local-model",
			baseUrl: "http://local-model/v1",
			providerId: null,
			attachmentCount: 0,
			inputLength: 5,
			signal: undefined,
		});

		expect(result).toMatchObject({
			text: "JSON answer",
			providerUsage: {
				promptTokens: 5,
				completionTokens: 2,
				totalTokens: 7,
				source: "provider",
			},
		});
		expect(fetch).toHaveBeenCalledWith(
			"http://langflow/api/v1/run/flow-1",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					"Content-Type": "application/json",
					"x-api-key": "langflow-key",
				}),
			}),
		);
	});

	it("removes caller abort listeners after JSON runs complete", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							outputs: [
								{
									outputs: [
										{
											results: {
												message: { text: "JSON answer" },
											},
										},
									],
								},
							],
						}),
						{
							status: 200,
							headers: { "Content-Type": "application/json" },
						},
					),
			),
		);
		const callerController = new AbortController();
		const addEventListener = vi.spyOn(
			callerController.signal,
			"addEventListener",
		);
		const removeEventListener = vi.spyOn(
			callerController.signal,
			"removeEventListener",
		);

		await executeLangflowJsonRun({
			config: runtimeConfig,
			flowId: "flow-1",
			body: requestBody(),
			attemptTimeoutMs: 30_000,
			sessionId: "conv-1",
			modelId: "model1",
			modelName: "local-model",
			baseUrl: "http://local-model/v1",
			providerId: null,
			attachmentCount: 0,
			inputLength: 5,
			signal: callerController.signal,
		});

		expect(addEventListener).toHaveBeenCalledWith(
			"abort",
			expect.any(Function),
			{ once: true },
		);
		expect(removeEventListener).toHaveBeenCalledWith(
			"abort",
			expect.any(Function),
		);
	});

	it("returns text and provider usage when a streaming run falls back to JSON", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							outputs: [
								{
									outputs: [
										{
											results: {
												message: { text: "Fallback JSON answer" },
											},
										},
									],
								},
							],
							usage: {
								prompt_tokens: 11,
								completion_tokens: 7,
								total_tokens: 18,
							},
						}),
						{
							status: 200,
							headers: { "Content-Type": "application/json" },
						},
					),
			),
		);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		const result = await executeLangflowStreamRun({
			config: runtimeConfig,
			flowId: "flow-1",
			body: requestBody(),
			attemptTimeoutMs: 30_000,
			connectTimeoutMs: 1_000,
			sessionId: "conv-1",
			modelId: "model1",
			modelName: "local-model",
			baseUrl: "http://local-model/v1",
			providerId: null,
			attachmentCount: 0,
			inputLength: 5,
			signal: undefined,
		});

		expect(result).toMatchObject({
			text: "Fallback JSON answer",
			providerUsage: {
				promptTokens: 11,
				completionTokens: 7,
				totalTokens: 18,
				source: "provider",
			},
		});
		expect(fetch).toHaveBeenCalledWith(
			"http://langflow/api/v1/run/flow-1?stream=true",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Accept: "application/json",
					"x-api-key": "langflow-key",
				}),
			}),
		);
		expect(warn).toHaveBeenCalledWith(
			"[LANGFLOW] sendMessageStream received non-stream JSON response",
			expect.objectContaining({
				sessionId: "conv-1",
				contentType: "application/json",
				textLength: 20,
			}),
		);
	});

	it("returns event streams without parsing and cleans up after the stream closes", async () => {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("data: chunk\n\n"));
				controller.close();
			},
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(stream, {
						status: 200,
						headers: { "Content-Type": "text/event-stream" },
					}),
			),
		);
		const callerController = new AbortController();
		const removeEventListener = vi.spyOn(
			callerController.signal,
			"removeEventListener",
		);

		const result = await executeLangflowStreamRun({
			config: runtimeConfig,
			flowId: "flow-1",
			body: requestBody(),
			attemptTimeoutMs: 30_000,
			connectTimeoutMs: 1_000,
			sessionId: "conv-1",
			modelId: "model1",
			modelName: "local-model",
			baseUrl: "http://local-model/v1",
			providerId: null,
			attachmentCount: 0,
			inputLength: 5,
			signal: callerController.signal,
		});

		expect(result).toEqual({
			stream: expect.any(ReadableStream),
		});
		expect(removeEventListener).not.toHaveBeenCalled();
		if (!result.stream) {
			throw new Error("Expected Langflow streaming run to return a stream");
		}
		const reader = result.stream.getReader();
		await expect(reader.read()).resolves.toMatchObject({
			done: false,
		});
		await expect(reader.read()).resolves.toEqual({
			done: true,
			value: undefined,
		});
		expect(removeEventListener).toHaveBeenCalledWith(
			"abort",
			expect.any(Function),
		);
		expect(fetch).toHaveBeenCalledWith(
			"http://langflow/api/v1/run/flow-1?stream=true",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Accept: "application/json",
					"Cache-Control": "no-cache",
					"Content-Type": "application/json",
				}),
			}),
		);
	});

	it("keeps caller abort propagation alive while the returned event stream is consumed", async () => {
		const callerController = new AbortController();
		const removeEventListener = vi.spyOn(
			callerController.signal,
			"removeEventListener",
		);
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async (_url: string | URL | Request, init?: RequestInit) =>
					new Response(
						new ReadableStream<Uint8Array>({
							start(controller) {
								controller.enqueue(new TextEncoder().encode("data: one\n\n"));
								init?.signal?.addEventListener("abort", () => {
									controller.error(new Error("upstream stream aborted"));
								});
							},
						}),
						{
							status: 200,
							headers: { "Content-Type": "text/event-stream" },
						},
					),
			),
		);

		const result = await executeLangflowStreamRun({
			config: runtimeConfig,
			flowId: "flow-1",
			body: requestBody(),
			attemptTimeoutMs: 30_000,
			connectTimeoutMs: 1_000,
			sessionId: "conv-1",
			modelId: "model1",
			modelName: "local-model",
			baseUrl: "http://local-model/v1",
			providerId: null,
			attachmentCount: 0,
			inputLength: 5,
			signal: callerController.signal,
		});

		expect(removeEventListener).not.toHaveBeenCalled();
		if (!result.stream) {
			throw new Error("Expected Langflow streaming run to return a stream");
		}
		const reader = result.stream.getReader();
		await expect(reader.read()).resolves.toMatchObject({
			done: false,
		});
		const pendingRead = reader.read();
		const rejection = expect(pendingRead).rejects.toThrow(
			"upstream stream aborted",
		);
		callerController.abort(new Error("user stopped stream"));
		await rejection;
		expect(removeEventListener).toHaveBeenCalledWith(
			"abort",
			expect.any(Function),
		);
	});

	it("classifies streaming connect timeouts as Langflow timeout errors", async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			"fetch",
			vi.fn(
				(_url: string | URL | Request, init?: RequestInit) =>
					new Promise<Response>((_resolve, reject) => {
						init?.signal?.addEventListener("abort", () => {
							const error = new Error("The operation was aborted");
							error.name = "AbortError";
							reject(error);
						});
					}),
			),
		);

		const pending = executeLangflowStreamRun({
			config: runtimeConfig,
			flowId: "flow-1",
			body: requestBody(),
			attemptTimeoutMs: 30_000,
			connectTimeoutMs: 1_000,
			sessionId: "conv-1",
			modelId: "model1",
			modelName: "local-model",
			baseUrl: "http://local-model/v1",
			providerId: null,
			attachmentCount: 0,
			inputLength: 5,
			signal: undefined,
		});
		const rejection = expect(pending).rejects.toSatisfy((error: unknown) => {
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toContain(
				"Timed out waiting 1000ms for Langflow streaming response headers",
			);
			return isLangflowTimeoutError(error);
		});
		await vi.advanceTimersByTimeAsync(1_000);
		await rejection;
	});

	it("retries provider rate limits with the configured provider fallback endpoint", async () => {
		mocks.getProviderWithSecrets.mockResolvedValue({
			id: "provider-1",
			name: "fireworks",
			displayName: "Fire Pass Kimi K2.6 Turbo",
			baseUrl: "https://api.fireworks.ai/inference/v1",
			apiKeyEncrypted: "encrypted",
			apiKeyIv: "iv",
			modelName: "accounts/fireworks/routers/kimi-k2p6-turbo",
			reasoningEffort: null,
			thinkingType: null,
			enabled: true,
			sortOrder: 0,
			maxModelContext: null,
			compactionUiThreshold: null,
			targetConstructedContext: null,
			maxMessageLength: null,
			maxTokens: 8192,
			rateLimitFallbackEnabled: true,
			rateLimitFallbackBaseUrl: "https://api.moonshot.ai/chat/completions",
			rateLimitFallbackApiKeyEncrypted: "encrypted-fallback",
			rateLimitFallbackApiKeyIv: "fallback-iv",
			rateLimitFallbackModelName: "kimi-k2.6",
			rateLimitFallbackTimeoutMs: 500,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		mocks.decryptApiKey.mockReturnValue("fallback-secret");
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const attempts: Array<{
			modelId: string;
			attemptTimeoutMs: number;
			timeoutFailover?: unknown;
			overrideModelConfig?: Record<string, unknown>;
		}> = [];
		const rateLimitError = Object.assign(
			new Error(
				"Langflow API error: 429 Too Many Requests - Fireworks API rate limit",
			),
			{
				name: "LangflowHttpError",
				status: 429,
				statusText: "Too Many Requests",
				bodyPreview: "Fireworks API error 429: rate limit exceeded",
			},
		);

		const result = await runLangflowModelRunWithFailover({
			config: runtimeConfig,
			label: "Streaming request",
			sessionId: "conv-1",
			requestedModelId: "provider:provider-1",
			signal: undefined,
			attempt: async (attempt) => {
				attempts.push(attempt);
				if (attempts.length === 1) throw rateLimitError;
				return {
					modelId: attempt.modelId,
					modelDisplayName:
						attempt.overrideModelConfig?.displayName ?? "Primary",
					timeoutFailover: attempt.timeoutFailover,
				};
			},
		});

		expect(attempts).toHaveLength(2);
		expect(attempts[1]).toMatchObject({
			modelId: "provider:provider-1",
			attemptTimeoutMs: 1000,
			timeoutFailover: {
				fromModelId: "provider:provider-1",
				toModelId: "provider:provider-1",
				reason: "rate_limit",
				fromModelName: "accounts/fireworks/routers/kimi-k2p6-turbo",
				toModelName: "kimi-k2.6",
			},
			overrideModelConfig: {
				baseUrl: "https://api.moonshot.ai/v1",
				apiKey: "fallback-secret",
				modelName: "kimi-k2.6",
				displayName: "Fire Pass Kimi K2.6 Turbo (rate-limit fallback)",
				maxTokens: 8192,
				requiresComponentTweaks: true,
			},
		});
		expect(result).toMatchObject({
			modelId: "provider:provider-1",
			modelDisplayName: "Fire Pass Kimi K2.6 Turbo (rate-limit fallback)",
			timeoutFailover: {
				fromModelId: "provider:provider-1",
				toModelId: "provider:provider-1",
				reason: "rate_limit",
			},
		});
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining(
				"[LANGFLOW] Streaming request switching to failover model sessionId=conv-1 from=provider:provider-1:accounts/fireworks/routers/kimi-k2p6-turbo to=provider:provider-1:kimi-k2.6 reason=rate_limit status=429",
			),
		);
	});

	it("does not retry rate-limit failover when the caller aborts during fallback resolution", async () => {
		const callerController = new AbortController();
		let resolveProviderLookup: (provider: unknown) => void = () => undefined;
		mocks.decryptApiKey.mockReturnValue("fallback-secret");
		const providerLookupStarted = new Promise<void>((resolve) => {
			mocks.getProviderWithSecrets.mockImplementation(
				() =>
					new Promise((providerResolve) => {
						resolveProviderLookup = providerResolve;
						resolve();
					}),
			);
		});
		const rateLimitError = Object.assign(
			new Error("Langflow API error: 429 Too Many Requests"),
			{
				name: "LangflowHttpError",
				status: 429,
				statusText: "Too Many Requests",
				bodyPreview: "provider rate limit",
			},
		);
		const attempts: Array<{ modelId: string }> = [];

		const pending = runLangflowModelRunWithFailover({
			config: runtimeConfig,
			label: "Streaming request",
			sessionId: "conv-1",
			requestedModelId: "provider:provider-1",
			signal: callerController.signal,
			attempt: async (attempt) => {
				attempts.push({ modelId: attempt.modelId });
				throw rateLimitError;
			},
		});

		await providerLookupStarted;
		callerController.abort(new Error("user stopped stream"));
		resolveProviderLookup({
			id: "provider-1",
			displayName: "Provider One",
			modelName: "provider-primary",
			enabled: true,
			rateLimitFallbackEnabled: true,
			rateLimitFallbackBaseUrl: "https://api.moonshot.ai/chat/completions",
			rateLimitFallbackApiKeyEncrypted: "encrypted-fallback",
			rateLimitFallbackApiKeyIv: "fallback-iv",
			rateLimitFallbackModelName: "kimi-k2.6",
		});

		await expect(pending).rejects.toBe(rateLimitError);
		expect(attempts).toEqual([{ modelId: "provider:provider-1" }]);
	});
});
