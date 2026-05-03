import { estimateTokenCount } from "$lib/utils/tokens";
import { getConfig } from "../../config-store";

export type ContextTracePhase =
	| "context_selection"
	| "outbound_budget"
	| "fallback";

export type ContextTraceSource =
	| "attachment"
	| "document"
	| "generated_output"
	| "memory"
	| "session"
	| "system"
	| "task_state"
	| "user"
	| "working_set";

export type ContextTraceContextSource =
	| "disabled"
	| "live"
	| "mixed"
	| "persisted_fallback"
	| "snapshot";

export type LegacyContextTraceSectionInput = {
	name: string;
	source: ContextTraceSource;
	body: string;
	inclusionLevel?: ContextTraceSection["inclusionLevel"];
	itemIds?: string[];
	itemTitles?: string[];
	signalReasons?: string[];
	trimmed?: boolean;
	protected?: boolean;
};

export type ContextTraceSection = {
	name: string;
	source: ContextTraceSource;
	inclusionLevel: "legacy_full" | "legacy_truncated" | "omitted";
	estimatedTokens: number;
	itemCount: number;
	itemIds: string[];
	itemTitles: string[];
	signalReasons: string[];
	trimmed: boolean;
	protected: boolean;
};

export type ContextTraceBudget = {
	maxModelContext: number;
	targetConstructedContext: number;
	reservedEstimate: number;
	promptEstimate: number;
	outputReserve: number;
	wasBudgetEnforced: boolean;
};

export type ContextTrace = {
	traceVersion: 1;
	conversationId: string;
	streamId: string | null;
	userId: string;
	messageId: string | null;
	modelId: string;
	providerId: string | null;
	modelName: string;
	attempt: number;
	phase: ContextTracePhase;
	contextSource: ContextTraceContextSource;
	budget: ContextTraceBudget;
	sections: ContextTraceSection[];
	totalsBySource: Record<string, number>;
	limitations: string[];
	warnings: string[];
	fallbacks: string[];
	totalEstimatedTokens: number;
};

export function buildLegacyContextTrace(params: {
	conversationId: string;
	streamId?: string | null;
	userId: string;
	messageId?: string | null;
	modelId: string;
	providerId?: string | null;
	modelName: string;
	attempt: number;
	phase: ContextTracePhase;
	contextSource: ContextTraceContextSource;
	budget: ContextTraceBudget;
	sections: LegacyContextTraceSectionInput[];
	limitations: string[];
	warnings: string[];
	fallbacks: string[];
}): ContextTrace {
	const sections = params.sections.map((section) => {
		const estimatedTokens = estimateTokenCount(section.body);
		return {
			name: section.name,
			source: section.source,
			inclusionLevel:
				section.inclusionLevel ??
				(section.trimmed
					? ("legacy_truncated" as const)
					: ("legacy_full" as const)),
			estimatedTokens,
			itemCount: section.itemIds?.length ?? 0,
			itemIds: section.itemIds ?? [],
			itemTitles: section.itemTitles ?? [],
			signalReasons: section.signalReasons ?? [],
			trimmed: section.trimmed ?? false,
			protected: section.protected ?? false,
		};
	});
	const totalsBySource: Record<string, number> = {};
	for (const section of sections) {
		totalsBySource[section.source] =
			(totalsBySource[section.source] ?? 0) + section.estimatedTokens;
	}

	return {
		traceVersion: 1,
		conversationId: params.conversationId,
		streamId: params.streamId ?? null,
		userId: params.userId,
		messageId: params.messageId ?? null,
		modelId: params.modelId,
		providerId: params.providerId ?? null,
		modelName: params.modelName,
		attempt: params.attempt,
		phase: params.phase,
		contextSource: params.contextSource,
		budget: params.budget,
		sections,
		totalsBySource,
		limitations: params.limitations,
		warnings: params.warnings,
		fallbacks: params.fallbacks,
		totalEstimatedTokens: sections.reduce(
			(total, section) => total + section.estimatedTokens,
			0,
		),
	};
}

export function emitContextTrace(trace: ContextTrace): void {
	if (!getConfig().contextDiagnosticsDebug) return;
	console.info("[CONTEXT_TRACE]", trace);
}
