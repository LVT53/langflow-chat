import { getConfig } from "$lib/server/config-store";
import {
	decryptApiKey,
	getProviderWithSecrets,
} from "$lib/server/services/inference-providers";
import { buildOpenAICompatibleUrl } from "$lib/server/services/openai-compatible-url";
import {
	type DeepResearchModelRole,
	resolveDeepResearchModel,
} from "./model-config";
import type { ResearchTimelineStage } from "./timeline";
import {
	buildResearchUsageRecord,
	getResearchUsageForeignKeyDiagnostics,
	type ResearchProviderUsageSnapshot,
	type ResearchUsageOperation,
	saveResearchUsageRecord,
} from "./usage";

const DEFAULT_DEEP_RESEARCH_MODEL_TIMEOUT_MS = 90_000;

export type DeepResearchModelMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};

export type DeepResearchModelRunResult = {
	content: string;
	modelId: string;
	modelDisplayName: string;
	providerId: string | null;
	providerDisplayName: string | null;
	providerModelName: string | null;
	runtimeMs: number;
	usage: ResearchProviderUsageSnapshot | null;
};

export async function runDeepResearchModel(input: {
	role: DeepResearchModelRole;
	messages: DeepResearchModelMessage[];
	temperature?: number;
	maxTokens?: number;
	fetchImpl?: typeof fetch;
}): Promise<DeepResearchModelRunResult> {
	const resolved = await resolveDeepResearchModel(input.role);
	const config = getConfig();
	const credentials = await resolveModelCredentials(resolved.modelId);
	const baseUrl = resolved.providerBaseUrl ?? credentials.baseUrl;
	const model = resolved.providerModelName ?? credentials.modelName;
	if (!baseUrl || !model) {
		throw new Error(`Deep Research model ${input.role} is not configured`);
	}

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (credentials.apiKey)
		headers.Authorization = `Bearer ${credentials.apiKey}`;
	const startedAt = Date.now();
	const body: Record<string, unknown> = {
		model,
		messages: input.messages,
		temperature: input.temperature ?? 0.2,
		max_tokens: input.maxTokens ?? resolved.limits.maxTokens ?? 1800,
	};
	if (!resolved.providerId) {
		body.chat_template_kwargs = { enable_thinking: false };
		body.extra_body = {
			chat_template_kwargs: { enable_thinking: false },
		};
	}
	const response = await (input.fetchImpl ?? fetch)(
		buildOpenAICompatibleUrl(baseUrl, "/v1/chat/completions"),
		{
			method: "POST",
			headers,
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(
				deepResearchModelTimeoutMs(config.requestTimeoutMs),
			),
		},
	);
	if (!response.ok) {
		throw new Error(
			`Deep Research model ${input.role} failed: ${response.status}`,
		);
	}
	const json = await response.json();
	const content = String(json?.choices?.[0]?.message?.content ?? "").trim();
	return {
		content,
		modelId: resolved.modelId,
		modelDisplayName: resolved.modelDisplayName,
		providerId: resolved.providerId,
		providerDisplayName: resolved.providerDisplayName,
		providerModelName: resolved.providerModelName,
		runtimeMs: Date.now() - startedAt,
		usage: mapUsage(json?.usage),
	};
}

function deepResearchModelTimeoutMs(configuredTimeoutMs: number): number {
	if (!Number.isFinite(configuredTimeoutMs)) {
		return DEFAULT_DEEP_RESEARCH_MODEL_TIMEOUT_MS;
	}
	return Math.max(
		1_000,
		Math.min(
			Math.floor(configuredTimeoutMs),
			DEFAULT_DEEP_RESEARCH_MODEL_TIMEOUT_MS,
		),
	);
}

export async function tryRunAndRecordDeepResearchModel(input: {
	role: DeepResearchModelRole;
	jobId: string;
	conversationId: string;
	userId: string;
	taskId?: string | null;
	stage: ResearchTimelineStage;
	operation?: ResearchUsageOperation;
	messages: DeepResearchModelMessage[];
	temperature?: number;
	maxTokens?: number;
	occurredAt?: Date;
	fetchImpl?: typeof fetch;
}): Promise<DeepResearchModelRunResult | null> {
	if (process.env.NODE_ENV === "test" && !input.fetchImpl) {
		return null;
	}

	try {
		const result = await runDeepResearchModel({
			role: input.role,
			messages: input.messages,
			temperature: input.temperature,
			maxTokens: input.maxTokens,
			fetchImpl: input.fetchImpl,
		});
		let usageRecord: Awaited<
			ReturnType<typeof buildResearchUsageRecord>
		> | null = null;
		try {
			usageRecord = await buildResearchUsageRecord({
				jobId: input.jobId,
				taskId: input.taskId ?? null,
				conversationId: input.conversationId,
				userId: input.userId,
				stage: input.stage,
				operation: input.operation ?? input.role,
				modelId: result.modelId,
				modelDisplayName: result.modelDisplayName,
				providerId: result.providerId,
				providerDisplayName: result.providerDisplayName,
				providerModelName: result.providerModelName,
				occurredAt: input.occurredAt,
				runtimeMs: result.runtimeMs,
				providerUsage: result.usage,
			});
			await saveResearchUsageRecord(usageRecord);
		} catch (error) {
			const foreignKeyDiagnostics =
				usageRecord && isSqliteForeignKeyConstraintError(error)
					? await getResearchUsageForeignKeyDiagnostics(usageRecord).catch(
							(diagnosticError) => ({
								error:
									diagnosticError instanceof Error
										? diagnosticError.message
										: "unknown diagnostic error",
							}),
						)
					: null;
			console.warn("[DEEP_RESEARCH] Usage record save failed", {
				role: input.role,
				jobId: input.jobId,
				taskId: input.taskId ?? null,
				error: error instanceof Error ? error.message : "unknown error",
				foreignKeyDiagnostics,
			});
		}
		return result;
	} catch (error) {
		console.warn("[DEEP_RESEARCH] LLM role failed; using fallback", {
			role: input.role,
			jobId: input.jobId,
			error: error instanceof Error ? error.message : "unknown error",
		});
		return null;
	}
}

async function resolveModelCredentials(modelId: string): Promise<{
	baseUrl: string;
	modelName: string;
	apiKey: string;
}> {
	const config = getConfig();
	if (modelId === "model2") {
		return {
			baseUrl: config.model2.baseUrl,
			modelName: config.model2.modelName,
			apiKey: config.model2.apiKey,
		};
	}
	if (modelId.startsWith("provider:")) {
		const provider = await getProviderWithSecrets(
			modelId.slice("provider:".length),
		);
		if (!provider) return { baseUrl: "", modelName: "", apiKey: "" };
		return {
			baseUrl: provider.baseUrl,
			modelName: provider.modelName,
			apiKey: decryptApiKey(provider.apiKeyEncrypted, provider.apiKeyIv),
		};
	}
	return {
		baseUrl: config.model1.baseUrl,
		modelName: config.model1.modelName,
		apiKey: config.model1.apiKey,
	};
}

function mapUsage(value: unknown): ResearchProviderUsageSnapshot | null {
	if (!value || typeof value !== "object") return null;
	const usage = value as Record<string, unknown>;
	return {
		promptTokens: readNumber(usage.prompt_tokens),
		completionTokens: readNumber(usage.completion_tokens),
		totalTokens: readNumber(usage.total_tokens),
		reasoningTokens: readNumber(usage.reasoning_tokens),
		source: "provider",
	};
}

function readNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function isSqliteForeignKeyConstraintError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const code = "code" in error ? (error as { code?: unknown }).code : undefined;
	return (
		code === "SQLITE_CONSTRAINT_FOREIGNKEY" ||
		(error instanceof Error &&
			error.message.includes("FOREIGN KEY constraint failed"))
	);
}
