import type {
	LangflowRunRequest,
	LangflowRunResponse,
	ModelId,
} from "$lib/types";
import { isProviderModelId } from "$lib/types";
import {
	getConfig,
	type ModelConfig,
	type RuntimeConfig,
} from "../config-store";
import { extractProviderUsage, type ProviderUsageSnapshot } from "./analytics";
import { deriveModelContextBudget } from "./chat-turn/context-budget";
import { decryptApiKey, getProviderWithSecrets } from "./inference-providers";
import { inferModelContextWindow } from "./model-context";
import { normalizeOpenAICompatibleBaseUrl } from "./openai-compatible-url";

const UNKNOWN_PROVIDER_MAX_MODEL_CONTEXT_FALLBACK = 150_000;

export type PromptContextLimits = {
	maxModelContext: number;
	compactionUiThreshold: number;
	targetConstructedContext: number;
};

export type LangflowModelRunConfig = ModelConfig & {
	contextLimits?: PromptContextLimits;
	providerId?: string;
	providerReasoningEffort?: string | null;
	providerThinkingType?: string | null;
	requiresComponentTweaks?: boolean;
};

export type LangflowFailoverReason = "timeout" | "rate_limit";

export type TimeoutFailoverInfo = {
	fromModelId: ModelId;
	toModelId: ModelId;
	reason: LangflowFailoverReason;
	fromModelName?: string;
	toModelName?: string;
};

type LangflowFailoverTarget = {
	modelId: ModelId;
	overrideModelConfig?: LangflowModelRunConfig;
	timeoutMs: number;
	logFrom: string;
	logTo: string;
	info: TimeoutFailoverInfo;
};

export type LangflowModelRunAttemptParams = {
	modelId: ModelId;
	attemptTimeoutMs: number;
	timeoutFailover?: TimeoutFailoverInfo;
	overrideModelConfig?: LangflowModelRunConfig;
};

type LangflowModelRunFailoverLabel = "Request" | "Streaming request";

export type LangflowModelRunWithFailoverParams<T> = {
	config?: RuntimeConfig;
	label: LangflowModelRunFailoverLabel;
	sessionId: string;
	requestedModelId?: ModelId | null;
	signal?: AbortSignal;
	attempt: (attempt: LangflowModelRunAttemptParams) => Promise<T>;
};

export type LangflowStreamTransportResult = {
	stream?: ReadableStream<Uint8Array>;
	text?: string;
	rawResponse?: LangflowRunResponse;
	providerUsage?: ProviderUsageSnapshot | null;
};

export type LangflowJsonTransportResult = {
	text: string;
	rawResponse: LangflowRunResponse;
	providerUsage?: ProviderUsageSnapshot | null;
};

type LangflowRunBody = LangflowRunRequest & {
	tweaks?: Record<string, unknown>;
};

type LangflowRunLogContext = {
	config: RuntimeConfig;
	flowId: string;
	body: LangflowRunBody;
	attemptTimeoutMs: number;
	sessionId: string;
	modelId: ModelId;
	modelName: string;
	baseUrl?: string | null;
	providerId?: string | null;
	attachmentCount: number;
	inputLength: number;
	signal?: AbortSignal;
	userId?: string | null;
	nonOkLogLabel?: "sendMessage" | "sendMessageStream";
};

export type LangflowJsonRunParams = LangflowRunLogContext;

export type LangflowStreamRunParams = LangflowRunLogContext & {
	connectTimeoutMs?: number;
};

type LangflowTimeoutError = Error & { code?: string };
type LangflowHttpError = Error & {
	status?: number;
	statusText?: string;
	bodyPreview?: string;
};

function createLangflowTimeoutError(message: string): LangflowTimeoutError {
	const error = new Error(message) as LangflowTimeoutError;
	error.name = "LangflowRequestTimeoutError";
	error.code = "langflow_request_timeout";
	return error;
}

function createLangflowHttpError(params: {
	status: number;
	statusText: string;
	body: string;
}): LangflowHttpError {
	const bodyPreview = params.body.slice(0, 500);
	const error = new Error(
		`Langflow API error: ${params.status} ${params.statusText}${bodyPreview ? ` - ${bodyPreview}` : ""}`,
	) as LangflowHttpError;
	error.name = "LangflowHttpError";
	error.status = params.status;
	error.statusText = params.statusText;
	error.bodyPreview = params.body.slice(0, 1000);
	return error;
}

function createLangflowStreamConnectTimeoutError(
	message: string,
): LangflowTimeoutError {
	const error = new Error(message) as LangflowTimeoutError;
	error.name = "LangflowStreamConnectTimeoutError";
	error.code = "langflow_stream_connect_timeout";
	return error;
}

export function isLangflowTimeoutError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const code = (error as LangflowTimeoutError).code;
	const message = error.message.toLowerCase();
	return (
		error.name === "LangflowRequestTimeoutError" ||
		error.name === "LangflowStreamConnectTimeoutError" ||
		code === "langflow_request_timeout" ||
		code === "langflow_stream_connect_timeout" ||
		message.includes("timed out") ||
		message.includes("apitimeouterror") ||
		message.includes("readtimeout") ||
		message.includes("read timeout")
	);
}

function getLangflowErrorStatus(error: unknown): number | null {
	if (!(error instanceof Error)) return null;
	const status = (error as LangflowHttpError).status;
	return typeof status === "number" && Number.isFinite(status) ? status : null;
}

export function isLangflowRateLimitError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const status = getLangflowErrorStatus(error);
	if (status === 429) return true;

	const bodyPreview = (error as LangflowHttpError).bodyPreview;
	const haystack =
		`${error.name}\n${error.message}\n${typeof bodyPreview === "string" ? bodyPreview : ""}`.toLowerCase();
	if (!haystack.includes("fireworks")) return false;

	return (
		/\b429\b/.test(haystack) ||
		haystack.includes("too many requests") ||
		haystack.includes("rate limit") ||
		haystack.includes("ratelimit")
	);
}

function configuredAttemptTimeoutMs(
	config: RuntimeConfig,
	failoverCandidate: ModelId | null,
): number {
	if (!failoverCandidate) return config.requestTimeoutMs;
	return Math.min(
		config.requestTimeoutMs,
		Math.max(1000, config.modelTimeoutFailoverTimeoutMs),
	);
}

function readStringProperty(
	record: Record<string, unknown>,
	key: string,
): string | null {
	const value = record[key];
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumberProperty(
	record: Record<string, unknown>,
	key: string,
): number | null {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function resolveProviderPromptContextLimits(provider: {
	modelName?: string | null;
	maxModelContext: number | null;
	compactionUiThreshold?: number | null;
	targetConstructedContext?: number | null;
}): PromptContextLimits {
	const budget = deriveModelContextBudget({
		maxModelContext:
			provider.maxModelContext ??
			inferModelContextWindow(provider.modelName) ??
			UNKNOWN_PROVIDER_MAX_MODEL_CONTEXT_FALLBACK,
		compactionUiThreshold: provider.compactionUiThreshold,
		targetConstructedContext: provider.targetConstructedContext,
	});
	return {
		maxModelContext: budget.maxModelContext,
		compactionUiThreshold: budget.compactionUiThreshold,
		targetConstructedContext: budget.targetConstructedContext,
	};
}

function buildProviderRateLimitFallbackModelConfig(params: {
	provider: unknown;
	config: RuntimeConfig;
}): {
	modelConfig: LangflowModelRunConfig;
	timeoutMs: number;
	logFrom: string;
	logTo: string;
	info: Pick<TimeoutFailoverInfo, "fromModelName" | "toModelName">;
} | null {
	if (!params.provider || typeof params.provider !== "object") return null;
	const provider = params.provider as Record<string, unknown>;
	if (provider.rateLimitFallbackEnabled !== true) return null;

	const baseUrl = readStringProperty(provider, "rateLimitFallbackBaseUrl");
	const modelName = readStringProperty(provider, "rateLimitFallbackModelName");
	const encryptedApiKey = readStringProperty(
		provider,
		"rateLimitFallbackApiKeyEncrypted",
	);
	const apiKeyIv = readStringProperty(provider, "rateLimitFallbackApiKeyIv");
	if (!baseUrl || !modelName || !encryptedApiKey || !apiKeyIv) return null;

	const providerId = readStringProperty(provider, "id") ?? undefined;
	const providerModelName =
		readStringProperty(provider, "modelName") ?? undefined;
	const providerDisplayName =
		readStringProperty(provider, "displayName") ??
		params.config.model1.displayName;
	const fallbackDisplayName = `${providerDisplayName} (rate-limit fallback)`;
	const timeoutMs = Math.max(
		1000,
		readNumberProperty(provider, "rateLimitFallbackTimeoutMs") ??
			params.config.requestTimeoutMs,
	);
	const apiKey = decryptApiKey(encryptedApiKey, apiKeyIv);
	const normalizedBaseUrl = normalizeOpenAICompatibleBaseUrl(baseUrl);
	const contextLimits = resolveProviderPromptContextLimits({
		modelName,
		maxModelContext:
			typeof provider.maxModelContext === "number"
				? provider.maxModelContext
				: null,
	});

	return {
		modelConfig: {
			...params.config.model1,
			baseUrl: normalizedBaseUrl,
			apiKey,
			modelName,
			displayName: fallbackDisplayName,
			maxTokens:
				typeof provider.maxTokens === "number"
					? provider.maxTokens
					: params.config.model1.maxTokens,
			flowId: params.config.model1.flowId || params.config.langflowFlowId,
			componentId: params.config.model1.componentId.trim(),
			contextLimits,
			providerId,
			providerReasoningEffort:
				typeof provider.reasoningEffort === "string"
					? provider.reasoningEffort
					: null,
			providerThinkingType:
				typeof provider.thinkingType === "string"
					? provider.thinkingType
					: null,
			requiresComponentTweaks: true,
		},
		timeoutMs,
		logFrom: providerModelName
			? `${providerId ? `provider:${providerId}` : "provider"}:${providerModelName}`
			: providerId
				? `provider:${providerId}`
				: "provider",
		logTo: providerId ? `provider:${providerId}:${modelName}` : modelName,
		info: {
			fromModelName: providerModelName,
			toModelName: modelName,
		},
	};
}

async function resolveValidatedFailoverTargetModelId(
	sourceModelId: ModelId,
	candidate: ModelId | null,
	config: RuntimeConfig,
): Promise<ModelId | null> {
	if (!candidate || candidate === sourceModelId) return null;

	if (candidate === "model2" && config.model2Enabled === false) {
		return null;
	}

	if (candidate.startsWith("provider:")) {
		const provider = await getProviderWithSecrets(
			candidate.slice("provider:".length),
		).catch(() => null);
		if (!provider?.enabled) return null;
	}

	return candidate;
}

function buildModelIdFailoverTarget(params: {
	sourceModelId: ModelId;
	targetModelId: ModelId | null;
	timeoutMs: number;
	reason: LangflowFailoverReason;
}): LangflowFailoverTarget | null {
	if (!params.targetModelId) return null;
	return {
		modelId: params.targetModelId,
		timeoutMs: params.timeoutMs,
		logFrom: params.sourceModelId,
		logTo: params.targetModelId,
		info: {
			fromModelId: params.sourceModelId,
			toModelId: params.targetModelId,
			reason: params.reason,
		},
	};
}

export async function resolveTimeoutFailoverTargetModelId(
	modelId?: ModelId | null,
	config: RuntimeConfig = getConfig(),
): Promise<ModelId | null> {
	if (!config.modelTimeoutFailoverEnabled) return null;

	const sourceModelId = modelId ?? "model1";
	const targetModelId = config.modelTimeoutFailoverTargetModel;
	return resolveValidatedFailoverTargetModelId(
		sourceModelId,
		targetModelId,
		config,
	);
}

async function resolveRateLimitFailoverTarget(
	modelId?: ModelId | null,
	config: RuntimeConfig = getConfig(),
): Promise<LangflowFailoverTarget | null> {
	const sourceModelId = modelId ?? "model1";
	if (isProviderModelId(sourceModelId)) {
		const provider = await getProviderWithSecrets(
			sourceModelId.slice("provider:".length),
		).catch(() => null);
		const providerFallback = buildProviderRateLimitFallbackModelConfig({
			provider,
			config,
		});
		if (providerFallback) {
			return {
				modelId: sourceModelId,
				overrideModelConfig: providerFallback.modelConfig,
				timeoutMs: providerFallback.timeoutMs,
				logFrom: providerFallback.logFrom,
				logTo: providerFallback.logTo,
				info: {
					fromModelId: sourceModelId,
					toModelId: sourceModelId,
					reason: "rate_limit",
					...providerFallback.info,
				},
			};
		}
	}

	const globalTarget = await resolveTimeoutFailoverTargetModelId(
		sourceModelId,
		config,
	);
	return buildModelIdFailoverTarget({
		sourceModelId,
		targetModelId: globalTarget,
		timeoutMs: config.requestTimeoutMs,
		reason: "rate_limit",
	});
}

function logLangflowFailoverSwitch(params: {
	label: LangflowModelRunFailoverLabel;
	sessionId: string;
	from: string;
	to: string;
	reason: LangflowFailoverReason;
	status?: number | null;
	timeoutMs?: number | null;
}): void {
	const status = params.status ?? null;
	const timeoutMs = params.timeoutMs ?? null;
	console.warn(
		[
			`[LANGFLOW] ${params.label} switching to failover model`,
			`sessionId=${params.sessionId}`,
			`from=${params.from}`,
			`to=${params.to}`,
			`reason=${params.reason}`,
			status == null ? null : `status=${status}`,
			timeoutMs == null ? null : `timeoutMs=${timeoutMs}`,
		]
			.filter(Boolean)
			.join(" "),
	);
}

export async function runLangflowModelRunWithFailover<T>(
	params: LangflowModelRunWithFailoverParams<T>,
): Promise<T> {
	const config = params.config ?? getConfig();
	const requestedModelId = params.requestedModelId ?? "model1";
	const failoverTargetModelId = await resolveTimeoutFailoverTargetModelId(
		requestedModelId,
		config,
	);
	const attemptTimeoutMs = configuredAttemptTimeoutMs(
		config,
		failoverTargetModelId,
	);

	try {
		return await params.attempt({
			modelId: requestedModelId,
			attemptTimeoutMs,
		});
	} catch (error) {
		if (params.signal?.aborted) {
			throw error;
		}

		if (isLangflowTimeoutError(error) && failoverTargetModelId) {
			logLangflowFailoverSwitch({
				label: params.label,
				sessionId: params.sessionId,
				from: requestedModelId,
				to: failoverTargetModelId,
				reason: "timeout",
				timeoutMs: attemptTimeoutMs,
			});

			return params.attempt({
				modelId: failoverTargetModelId,
				attemptTimeoutMs,
				timeoutFailover: {
					fromModelId: requestedModelId,
					toModelId: failoverTargetModelId,
					reason: "timeout",
				},
			});
		}

		if (isLangflowRateLimitError(error)) {
			const rateLimitFailoverTarget = await resolveRateLimitFailoverTarget(
				requestedModelId,
				config,
			);
			if (rateLimitFailoverTarget) {
				logLangflowFailoverSwitch({
					label: params.label,
					sessionId: params.sessionId,
					from: rateLimitFailoverTarget.logFrom,
					to: rateLimitFailoverTarget.logTo,
					reason: "rate_limit",
					status: getLangflowErrorStatus(error),
				});

				return params.attempt({
					modelId: rateLimitFailoverTarget.modelId,
					attemptTimeoutMs: rateLimitFailoverTarget.timeoutMs,
					timeoutFailover: rateLimitFailoverTarget.info,
					overrideModelConfig: rateLimitFailoverTarget.overrideModelConfig,
				});
			}
		}

		throw error;
	}
}

function mergeAbortSignals(
	...signals: Array<AbortSignal | undefined>
): AbortSignal | undefined {
	const activeSignals = signals.filter(Boolean) as AbortSignal[];
	if (activeSignals.length === 0) return undefined;
	if (activeSignals.length === 1) return activeSignals[0];

	const controller = new AbortController();
	const abort = () => {
		if (!controller.signal.aborted) controller.abort();
	};

	for (const signal of activeSignals) {
		if (signal.aborted) {
			abort();
			break;
		}
		signal.addEventListener("abort", abort, { once: true });
	}

	return controller.signal;
}

export function extractLangflowMessageText(
	response: LangflowRunResponse,
): string {
	try {
		const text = response.outputs?.[0]?.outputs?.[0]?.results?.message?.text;

		if (typeof text !== "string" || text === "") {
			throw new Error("Could not extract message text from Langflow response");
		}

		return text;
	} catch (error) {
		throw new Error(
			`Failed to extract message text: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

async function throwForNonOkLangflowResponse(params: {
	response: Response;
	url: string;
	logLabel: "sendMessage" | "sendMessageStream";
}): Promise<never> {
	const errorBody = await params.response.text().catch(() => "");
	const httpError = createLangflowHttpError({
		status: params.response.status,
		statusText: params.response.statusText,
		body: errorBody,
	});
	if (!isLangflowRateLimitError(httpError)) {
		console.error(`[LANGFLOW] ${params.logLabel} non-OK response`, {
			url: params.url,
			status: params.response.status,
			statusText: params.response.statusText,
			bodyPreview: errorBody.slice(0, 1000),
		});
	}
	throw httpError;
}

export async function executeLangflowJsonRun(
	params: LangflowJsonRunParams,
): Promise<LangflowJsonTransportResult> {
	const url = `${params.config.langflowApiUrl}/api/v1/run/${params.flowId}`;
	let timedOut = false;
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	const timeoutController = new AbortController();

	try {
		if (params.config.contextDiagnosticsDebug) {
			console.info("[LANGFLOW] Starting request", {
				url,
				flowId: params.flowId,
				sessionId: params.sessionId,
				userId: params.userId ?? null,
				modelId: params.modelId,
				providerId: params.providerId ?? null,
				modelName: params.modelName,
				baseUrl: params.baseUrl,
				attachmentCount: params.attachmentCount,
				inputLength: params.inputLength,
			});
		}

		timeoutId = setTimeout(() => {
			timedOut = true;
			timeoutController.abort();
		}, params.attemptTimeoutMs);

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": params.config.langflowApiKey,
			},
			body: JSON.stringify(params.body),
			signal: mergeAbortSignals(params.signal, timeoutController.signal),
		});

		if (!response.ok) {
			return throwForNonOkLangflowResponse({
				response,
				url,
				logLabel: params.nonOkLogLabel ?? "sendMessage",
			});
		}

		const rawResponse: LangflowRunResponse = await response.json();
		const text = extractLangflowMessageText(rawResponse);
		const providerUsage = extractProviderUsage(rawResponse);

		return {
			text,
			rawResponse,
			providerUsage,
		};
	} catch (error) {
		if (timedOut) {
			throw createLangflowTimeoutError(
				`Timed out waiting ${params.attemptTimeoutMs}ms for Langflow response`,
			);
		}
		throw error;
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}
}

export async function executeLangflowStreamRun(
	params: LangflowStreamRunParams,
): Promise<LangflowStreamTransportResult> {
	const url = `${params.config.langflowApiUrl}/api/v1/run/${params.flowId}?stream=true`;
	const connectTimeoutMs = Math.min(
		params.attemptTimeoutMs,
		Math.max(1000, params.connectTimeoutMs ?? params.attemptTimeoutMs),
	);
	let timedOut = false;
	let connectTimedOut = false;
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	let connectTimeoutId: ReturnType<typeof setTimeout> | null = null;
	const timeoutController = new AbortController();
	const connectTimeoutController = new AbortController();

	try {
		if (params.config.contextDiagnosticsDebug) {
			console.info("[LANGFLOW] Starting streaming request", {
				url,
				flowId: params.flowId,
				sessionId: params.sessionId,
				userId: params.userId ?? null,
				modelId: params.modelId,
				providerId: params.providerId ?? null,
				modelName: params.modelName,
				baseUrl: params.baseUrl,
				attachmentCount: params.attachmentCount,
				inputLength: params.inputLength,
			});
		}

		timeoutId = setTimeout(() => {
			timedOut = true;
			timeoutController.abort();
		}, params.attemptTimeoutMs);
		connectTimeoutId = setTimeout(() => {
			connectTimedOut = true;
			connectTimeoutController.abort();
		}, connectTimeoutMs);

		const response = await fetch(url, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Cache-Control": "no-cache",
				"Content-Type": "application/json",
				"x-api-key": params.config.langflowApiKey,
			},
			body: JSON.stringify(params.body),
			signal: mergeAbortSignals(
				params.signal,
				timeoutController.signal,
				connectTimeoutController.signal,
			),
		});
		if (connectTimeoutId) {
			clearTimeout(connectTimeoutId);
			connectTimeoutId = null;
		}

		if (!response.ok) {
			return throwForNonOkLangflowResponse({
				response,
				url,
				logLabel: params.nonOkLogLabel ?? "sendMessageStream",
			});
		}

		const contentType = response.headers.get("content-type") ?? "";
		if (!contentType.includes("text/event-stream")) {
			const rawResponse: LangflowRunResponse = await response.json();
			const text = extractLangflowMessageText(rawResponse);
			const providerUsage = extractProviderUsage(rawResponse);
			console.warn(
				"[LANGFLOW] sendMessageStream received non-stream JSON response",
				{
					url,
					sessionId: params.sessionId,
					contentType,
					textLength: text.length,
				},
			);
			return {
				text,
				rawResponse,
				providerUsage,
			};
		}

		if (!response.body) {
			console.error("[LANGFLOW] sendMessageStream missing response body", {
				url,
				sessionId: params.sessionId,
			});
			throw new Error("Response body is empty");
		}

		return {
			stream: response.body as ReadableStream<Uint8Array>,
		};
	} catch (error) {
		if (connectTimedOut) {
			throw createLangflowStreamConnectTimeoutError(
				`Timed out waiting ${connectTimeoutMs}ms for Langflow streaming response headers`,
			);
		}
		if (timedOut) {
			throw createLangflowTimeoutError(
				`Timed out waiting ${params.attemptTimeoutMs}ms for Langflow streaming response`,
			);
		}
		throw error;
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		if (connectTimeoutId) {
			clearTimeout(connectTimeoutId);
		}
	}
}
