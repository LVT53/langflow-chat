export type ModelContextBudgetInput = {
	maxModelContext: number | null | undefined;
	targetConstructedContext?: number | null;
	compactionUiThreshold?: number | null;
	maxTokens?: number | null;
	systemPromptTokens?: number;
	currentMessageTokens?: number;
	overheadReserveTokens?: number;
};

export type ModelContextBudget = {
	maxModelContext: number;
	usableModelContext: number;
	targetConstructedContext: number;
	compactionUiThreshold: number;
	outputReserve: number;
	configuredMaxTokens: number | null;
	effectiveMaxTokens: number | null;
	outputReserveClamped: boolean;
	reservedBudget: number;
	coreBudget: number;
	supportBudget: number;
	awarenessBudget: number;
};

const MIN_MODEL_CONTEXT_TOKENS = 1_000;
const DEFAULT_MAX_MODEL_CONTEXT_TOKENS = 262_144;
const TARGET_CONTEXT_RATIO = 0.9;
const COMPACTION_THRESHOLD_RATIO = 0.8;
const RESERVED_CONTEXT_RATIO = 0.1;
const CORE_CONTEXT_RATIO = 0.5;
const SUPPORT_CONTEXT_RATIO = 0.35;

export function deriveModelContextBudget(
	input: ModelContextBudgetInput,
): ModelContextBudget {
	const maxModelContext = normalizePositiveInteger(
		input.maxModelContext,
		DEFAULT_MAX_MODEL_CONTEXT_TOKENS,
	);
	const configuredMaxTokens =
		input.maxTokens == null
			? null
			: Math.max(1, Math.floor(input.maxTokens));
	const explicitTargetConstructedContext =
		typeof input.targetConstructedContext === "number" &&
		Number.isFinite(input.targetConstructedContext) &&
		input.targetConstructedContext >= 1
			? normalizeOptionalLimit(
					input.targetConstructedContext,
					Math.floor(maxModelContext * TARGET_CONTEXT_RATIO),
					maxModelContext,
				)
			: null;
	const requiredInputReserve =
		Math.max(0, Math.floor(input.systemPromptTokens ?? 0)) +
		Math.max(0, Math.floor(input.currentMessageTokens ?? 0)) +
		Math.max(0, Math.floor(input.overheadReserveTokens ?? 0));
	const maxReserveForRequiredInput = Math.max(
		1,
		maxModelContext - requiredInputReserve,
	);
	const maxReserveForTargetContext =
		explicitTargetConstructedContext === null
			? maxModelContext
			: Math.max(1, maxModelContext - explicitTargetConstructedContext);
	const effectiveMaxTokens =
		configuredMaxTokens == null
			? null
			: Math.min(
					configuredMaxTokens,
					maxReserveForRequiredInput,
					maxReserveForTargetContext,
				);
	const outputReserve = effectiveMaxTokens ?? 0;
	const usableModelContext = Math.max(1, maxModelContext - outputReserve);
	const targetConstructedContext = normalizeOptionalLimit(
		explicitTargetConstructedContext,
		Math.floor(usableModelContext * TARGET_CONTEXT_RATIO),
		usableModelContext,
	);
	const compactionUiThreshold = normalizeOptionalLimit(
		input.compactionUiThreshold,
		Math.floor(usableModelContext * COMPACTION_THRESHOLD_RATIO),
		usableModelContext,
	);
	const reservedBudget = Math.floor(
		targetConstructedContext * RESERVED_CONTEXT_RATIO,
	);
	const allocatableBudget = Math.max(0, targetConstructedContext - reservedBudget);
	const coreBudget = Math.floor(allocatableBudget * CORE_CONTEXT_RATIO);
	const supportBudget = Math.floor(allocatableBudget * SUPPORT_CONTEXT_RATIO);
	const awarenessBudget = Math.max(
		0,
		allocatableBudget - coreBudget - supportBudget,
	);

	return {
		maxModelContext,
		usableModelContext,
		targetConstructedContext,
		compactionUiThreshold,
		outputReserve,
		configuredMaxTokens,
		effectiveMaxTokens,
		outputReserveClamped:
			configuredMaxTokens !== null && effectiveMaxTokens !== configuredMaxTokens,
		reservedBudget,
		coreBudget,
		supportBudget,
		awarenessBudget,
	};
}

function normalizePositiveInteger(
	value: number | null | undefined,
	fallback: number,
): number {
	if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
		return Math.max(MIN_MODEL_CONTEXT_TOKENS, Math.floor(value));
	}
	return Math.max(MIN_MODEL_CONTEXT_TOKENS, Math.floor(fallback));
}

function normalizeOptionalLimit(
	value: number | null | undefined,
	derivedValue: number,
	maxModelContext: number,
): number {
	const normalized =
		typeof value === "number" && Number.isFinite(value) && value >= 1
			? Math.floor(value)
			: derivedValue;
	return Math.max(1, Math.min(normalized, maxModelContext));
}
