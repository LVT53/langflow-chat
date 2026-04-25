import { getConfig } from '$lib/server/config-store';
import {
	callInferenceProvider,
	streamInferenceProvider,
	type ChatCompletionToolCall,
	type ChatMessage,
	type InferenceChunk,
} from '$lib/server/services/inference-client';
import { getProviderWithSecrets, type InferenceProviderWithSecrets } from '$lib/server/services/inference-providers';
import {
	executeProviderTool,
	PROVIDER_TOOL_DEFINITIONS,
	type ProviderToolResult,
} from '$lib/server/services/provider-tools';
import {
	prepareOutboundChatContext,
	type AuthenticatedPromptUser,
	type PreparedOutboundChatContext,
} from '$lib/server/services/langflow';

const MAX_PROVIDER_TOOL_ROUNDS = 6;

export type ProviderChatCallbacks = {
	onToken?: (chunk: string) => Promise<boolean> | boolean;
	onThinking?: (chunk: string) => Promise<boolean> | boolean;
	onToolCall?: (
		name: string,
		input: Record<string, unknown>,
		status: 'running' | 'done',
		details?: {
			outputSummary?: string | null;
			sourceType?: 'web' | 'tool';
			candidates?: import('$lib/types').ToolEvidenceCandidate[];
		}
	) => void;
};

export type ProviderChatParams = {
	providerId: string;
	upstreamMessage: string;
	conversationId: string;
	user: AuthenticatedPromptUser;
	attachmentIds?: string[];
	activeDocumentArtifactId?: string;
	attachmentTraceId?: string;
	signal?: AbortSignal;
	systemPromptAppendix?: string;
	callbacks?: ProviderChatCallbacks;
};

export type ProviderChatResult = PreparedOutboundChatContext & {
	text: string;
	provider: InferenceProviderWithSecrets;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	};
};

type PendingToolCall = {
	index: number;
	id: string;
	name: string;
	argumentsText: string;
};

function parseToolArguments(value: string): Record<string, unknown> {
	if (!value.trim()) return {};
	try {
		const parsed = JSON.parse(value) as unknown;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function getProviderId(modelId: string | undefined): string {
	if (!modelId?.startsWith('provider:')) {
		throw new Error('Provider model id is required');
	}
	return modelId.slice('provider:'.length);
}

async function resolveProvider(providerId: string): Promise<InferenceProviderWithSecrets> {
	const provider = await getProviderWithSecrets(providerId);
	if (!provider || !provider.enabled) {
		throw new Error('Selected provider model is not available');
	}
	return provider;
}

function buildInitialMessages(context: PreparedOutboundChatContext): ChatMessage[] {
	return [
		{ role: 'system', content: context.systemPrompt },
		{ role: 'user', content: context.inputValue },
	];
}

function normalizeToolCalls(toolCalls: PendingToolCall[]): ChatCompletionToolCall[] {
	return toolCalls
		.sort((left, right) => left.index - right.index)
		.map((toolCall) => ({
			id: toolCall.id,
			type: 'function' as const,
			function: {
				name: toolCall.name,
				arguments: toolCall.argumentsText,
			},
		}));
}

function collectToolCallsFromChunk(
	pending: Map<number, PendingToolCall>,
	chunk: InferenceChunk
): void {
	for (const choice of chunk.choices ?? []) {
		for (const deltaToolCall of choice.delta.tool_calls ?? []) {
			const index = deltaToolCall.index ?? 0;
			const existing =
				pending.get(index) ??
				({
					index,
					id: deltaToolCall.id ?? `tool-${index}`,
					name: '',
					argumentsText: '',
				} satisfies PendingToolCall);

			if (deltaToolCall.id) existing.id = deltaToolCall.id;
			if (deltaToolCall.function?.name) existing.name += deltaToolCall.function.name;
			if (deltaToolCall.function?.arguments) {
				existing.argumentsText += deltaToolCall.function.arguments;
			}
			pending.set(index, existing);
		}
	}
}

async function executeToolCalls(params: {
  messages: ChatMessage[];
  toolCalls: ChatCompletionToolCall[];
  reasoningContent?: string;
  conversationId: string;
  userId: string;
  callbacks?: ProviderChatCallbacks;
}): Promise<void> {
  params.messages.push({
    role: 'assistant',
    content: '',
    tool_calls: params.toolCalls,
    ...(params.reasoningContent ? { reasoning_content: params.reasoningContent } : {}),
  });

  for (const toolCall of params.toolCalls) {
    const input = parseToolArguments(toolCall.function.arguments);
    params.callbacks?.onToolCall?.(toolCall.function.name, input, 'running');
    let result: ProviderToolResult;
    try {
      result = await executeProviderTool({
        name: toolCall.function.name,
        input,
        conversationId: params.conversationId,
        userId: params.userId,
      });
    } catch (error) {
      result = {
        output: JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }),
        outputSummary: null,
        sourceType: 'tool',
        candidates: [],
      };
    }
    params.callbacks?.onToolCall?.(toolCall.function.name, input, 'done', {
      outputSummary: result.outputSummary,
      sourceType: result.sourceType,
      candidates: result.candidates,
    });
    params.messages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: result.output,
    });
  }
}

async function prepareProviderChat(params: ProviderChatParams) {
	const provider = await resolveProvider(params.providerId);
	const runtimeConfig = getConfig();
	const context = await prepareOutboundChatContext({
		message: params.upstreamMessage,
		sessionId: params.conversationId,
		modelConfig: runtimeConfig.model1,
		user: params.user,
		attachmentIds: params.attachmentIds,
		activeDocumentArtifactId: params.activeDocumentArtifactId,
		attachmentTraceId: params.attachmentTraceId,
		systemPromptAppendix: params.systemPromptAppendix,
		logLabel: 'provider request',
	});
	return { provider, context, messages: buildInitialMessages(context) };
}

export async function runProviderChatCompletion(
	params: ProviderChatParams
): Promise<ProviderChatResult> {
	const { provider, context, messages } = await prepareProviderChat(params);
	let usage: ProviderChatResult['usage'];

	for (let round = 0; round <= MAX_PROVIDER_TOOL_ROUNDS; round += 1) {
		const response = await callInferenceProvider(provider, {
			model: provider.modelName,
			messages,
			stream: false,
			tools: PROVIDER_TOOL_DEFINITIONS,
			tool_choice: 'auto',
			signal: params.signal,
		});
		usage = response.usage;

		const message = response.choices[0]?.message;
		const text = typeof message?.content === 'string' ? message.content : '';
		const toolCalls = message?.tool_calls ?? [];
		if (toolCalls.length === 0) {
			return { ...context, text, provider, usage };
		}
		if (round === MAX_PROVIDER_TOOL_ROUNDS) {
			throw new Error('Provider exceeded the maximum tool-call rounds');
		}
		await executeToolCalls({
			messages,
			toolCalls,
			conversationId: params.conversationId,
			userId: params.user.id,
			callbacks: params.callbacks,
		});
	}

	throw new Error('Provider failed to produce a final response');
}

export async function runProviderChatStream(params: ProviderChatParams): Promise<ProviderChatResult> {
	const { provider, context, messages } = await prepareProviderChat(params);
	let finalText = '';
	let usage: ProviderChatResult['usage'];

	for (let round = 0; round <= MAX_PROVIDER_TOOL_ROUNDS; round += 1) {
    let roundText = '';
    let roundReasoning = '';
		const pendingToolCalls = new Map<number, PendingToolCall>();
		let sawToolFinish = false;

		for await (const chunk of streamInferenceProvider(provider, {
			model: provider.modelName,
			messages,
			stream: true,
			tools: PROVIDER_TOOL_DEFINITIONS,
			tool_choice: 'auto',
			signal: params.signal,
		})) {
			if (chunk.usage) usage = chunk.usage;
			collectToolCallsFromChunk(pendingToolCalls, chunk);

			for (const choice of chunk.choices ?? []) {
          const reasoning = choice.delta.reasoning_content ?? choice.delta.reasoning;
          if (reasoning) {
            roundReasoning += reasoning;
            if (params.callbacks?.onThinking) {
              const shouldContinue = await params.callbacks.onThinking(`${reasoning}\n`);
              if (shouldContinue === false) {
                return { ...context, text: finalText, provider, usage };
              }
            }
          }

				const text = choice.delta.content ?? '';
				if (text) {
					roundText += text;
					finalText += text;
					if (params.callbacks?.onToken) {
						const shouldContinue = await params.callbacks.onToken(text);
						if (shouldContinue === false) {
							return { ...context, text: finalText, provider, usage };
						}
					}
				}

				if (choice.finish_reason === 'tool_calls') {
					sawToolFinish = true;
				}
			}
		}

		const toolCalls = normalizeToolCalls(Array.from(pendingToolCalls.values())).filter(
			(toolCall) => toolCall.function.name
		);

		if (toolCalls.length === 0) {
			return { ...context, text: finalText, provider, usage };
		}
		if (!sawToolFinish && roundText.trim()) {
			return { ...context, text: finalText, provider, usage };
		}
		if (round === MAX_PROVIDER_TOOL_ROUNDS) {
			throw new Error('Provider exceeded the maximum tool-call rounds');
		}

    await executeToolCalls({
      messages,
      toolCalls,
      reasoningContent: roundReasoning || undefined,
      conversationId: params.conversationId,
      userId: params.user.id,
      callbacks: params.callbacks,
    });
	}

	throw new Error('Provider failed to produce a final response');
}

export { getProviderId };
