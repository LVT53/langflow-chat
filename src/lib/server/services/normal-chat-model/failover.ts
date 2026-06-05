import type { RuntimeConfig } from "$lib/server/config-store";
import { getConfig } from "$lib/server/config-store";
import type { ModelId } from "$lib/types";
import { normalizeOpenAICompatibleBaseUrl } from "../openai-compatible-url";
import {
	decryptApiKey,
	getProviderByName,
	getProviderWithSecrets,
} from "../providers";
import type { NormalChatModelRunProvider } from "./index";

type ModelTimeoutLikeError = Error & {
	code?: unknown;
	cause?: unknown;
};

type ModelRateLimitLikeError = Error & {
	statusCode?: unknown;
	status?: unknown;
	code?: unknown;
	cause?: unknown;
};

const TIMEOUT_ERROR_NAMES = new Set(["apitimeouterror", "timeouterror"]);

const TIMEOUT_ERROR_CODES = new Set([
	"abort_err_timeout",
	"etimedout",
	"und_err_body_timeout",
	"und_err_headers_timeout",
]);

export function isModelTimeoutError(error: unknown): boolean {
	return isModelTimeoutErrorInner(error, new Set<unknown>());
}

export async function resolveModelTimeoutFailoverTargetModelId(
	modelId?: ModelId | null,
	config: RuntimeConfig = getConfig(),
): Promise<ModelId | null> {
	if (!config.modelTimeoutFailoverEnabled) return null;

	const sourceModelId = modelId ?? "model1";
	const targetModelId = config.modelTimeoutFailoverTargetModel;
	return resolveValidatedModelFailoverTargetModelId(
		sourceModelId,
		targetModelId,
		config,
	);
}

export function resolveModelStreamFirstOutputTimeoutMs(
	modelId?: ModelId | null,
	config: RuntimeConfig = getConfig(),
): number | null {
	const sourceModelId = modelId ?? "model1";
	const failoverTargetModelId = config.modelTimeoutFailoverTargetModel;
	if (
		config.modelTimeoutFailoverEnabled &&
		failoverTargetModelId &&
		failoverTargetModelId !== sourceModelId
	) {
		return Math.min(
			config.requestTimeoutMs,
			Math.max(1000, config.modelTimeoutFailoverTimeoutMs),
		);
	}

	return null;
}

async function resolveValidatedModelFailoverTargetModelId(
	sourceModelId: ModelId,
	candidate: ModelId | null,
	config: RuntimeConfig,
): Promise<ModelId | null> {
	if (!candidate || candidate === sourceModelId) return null;

	if (candidate === "model2" && config.model2Enabled === false) {
		return null;
	}

	if (candidate.startsWith("provider:")) {
		const providerId = extractProviderId(candidate);
		if (!providerId) return null;
		const provider = await getProviderWithSecrets(providerId).catch(() => null);
		if (!provider?.enabled) return null;
	}

	return candidate;
}

function extractProviderId(modelId: string): string | null {
	if (!modelId.startsWith("provider:")) return modelId || null;
	const parts = modelId.split(":");
	if (parts.length >= 3) return parts[1] || null;
	return modelId.slice("provider:".length) || null;
}

function isModelTimeoutErrorInner(error: unknown, seen: Set<unknown>): boolean {
	if (!(error instanceof Error)) return false;
	if (seen.has(error)) return false;
	seen.add(error);

	const code =
		typeof (error as ModelTimeoutLikeError).code === "string"
			? (error as ModelTimeoutLikeError).code.toLowerCase()
			: null;
	const name = error.name.toLowerCase();
	const message = error.message.toLowerCase();
	const cause = (error as ModelTimeoutLikeError).cause;
	const causeTimedOut = isModelTimeoutErrorInner(cause, seen);

	if (name === "aborterror") {
		return causeTimedOut || timeoutTextMatches(message) || codeMatches(code);
	}

	return (
		causeTimedOut ||
		TIMEOUT_ERROR_NAMES.has(name) ||
		codeMatches(code) ||
		timeoutTextMatches(message)
	);
}

function codeMatches(code: string | null): boolean {
	return Boolean(code && TIMEOUT_ERROR_CODES.has(code));
}

function timeoutTextMatches(text: string): boolean {
	return (
		text.includes("timed out") ||
		text.includes("timeout") ||
		text.includes("apitimeouterror") ||
		text.includes("readtimeout") ||
		text.includes("read timeout")
	);
}

export function isModelRateLimitError(error: unknown): boolean {
	return isModelRateLimitErrorInner(error, new Set<unknown>());
}

function isModelRateLimitErrorInner(
	error: unknown,
	seen: Set<unknown>,
): boolean {
	if (!(error instanceof Error)) return false;
	if (seen.has(error)) return false;
	seen.add(error);

	const maybe = error as ModelRateLimitLikeError;
	if (maybe.statusCode === 429 || maybe.status === 429) {
		return true;
	}

	const code = typeof maybe.code === "string" ? maybe.code.toLowerCase() : "";
	const message = error.message.toLowerCase();
	if (
		code === "rate_limit_exceeded" ||
		message.includes("429") ||
		message.includes("rate limit") ||
		message.includes("rate_limit") ||
		message.includes("too many requests")
	) {
		return true;
	}

	return isModelRateLimitErrorInner(maybe.cause, seen);
}

/**
 * Resolves a rate-limit fallback provider from the new `providers` table.
 *
 * Returns a fully-resolved {@link NormalChatModelRunProvider} ready for model
 * execution, or `null` when the provider has no fallback configured, the
 * fallback fields are incomplete, or the provider itself is disabled.
 */
export async function resolveProviderRateLimitFallback(
	providerId: string,
): Promise<NormalChatModelRunProvider | null> {
	let provider = await getProviderWithSecrets(providerId).catch(() => null);

	if (!provider) {
		const byName = await getProviderByName(providerId).catch(() => null);
		if (!byName?.enabled) return null;
		provider = await getProviderWithSecrets(byName.id).catch(() => null);
	}

	if (!provider?.enabled || provider.rateLimitFallbackEnabled !== true) {
		return null;
	}

	const baseUrl = provider.rateLimitFallbackBaseUrl?.trim();
	const modelName = provider.rateLimitFallbackModelName?.trim();

	if (
		!baseUrl ||
		!modelName ||
		!provider.rateLimitFallbackApiKeyEncrypted ||
		!provider.rateLimitFallbackApiKeyIv
	) {
		return null;
	}

	const apiKey = decryptApiKey(
		provider.rateLimitFallbackApiKeyEncrypted,
		provider.rateLimitFallbackApiKeyIv,
	);

	return {
		id: provider.id,
		modelId: `provider:${provider.id}:rate-limit-fallback`,
		name: provider.name,
		displayName: `${provider.displayName} (rate-limit fallback)`,
		baseUrl: normalizeOpenAICompatibleBaseUrl(baseUrl),
		modelName,
		apiKey,
		requestTimeoutMs: provider.rateLimitFallbackTimeoutMs,
	};
}
