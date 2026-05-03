import type { MemoryLayer } from "$lib/types";
import {
	compactContextSections,
	type PromptContextSection,
	type PromptContextSectionSelection,
} from "$lib/server/utils/prompt-context";
import type {
	ContextTraceSource,
	LegacyContextTraceSectionInput,
} from "./context-trace";

export type ContextSelectionCandidate = {
	title: string;
	body: string;
	source: ContextTraceSource;
	layer?: MemoryLayer;
	protected?: boolean;
	itemIds?: string[];
	itemTitles?: string[];
	signalReasons?: string[];
};

export type SelectedPromptContext = {
	inputValue: string;
	compactionApplied: boolean;
	compactionMode: ReturnType<typeof compactContextSections>["compactionMode"];
	layersUsed: MemoryLayer[];
	estimatedTokens: number;
	contextTraceSections: LegacyContextTraceSectionInput[];
	sectionSelections: PromptContextSectionSelection[];
};

function toTraceInclusionLevel(
	selection: PromptContextSectionSelection,
): LegacyContextTraceSectionInput["inclusionLevel"] {
	if (selection.inclusionLevel === "omitted") return "omitted";
	return selection.trimmed ? "legacy_truncated" : "legacy_full";
}

export function selectPromptContext(params: {
	intro: string;
	message: string;
	candidates: ContextSelectionCandidate[];
	targetTokens: number;
	initialCompactionMode?: Parameters<typeof compactContextSections>[0]["initialCompactionMode"];
}): SelectedPromptContext {
	const sections: PromptContextSection[] = params.candidates.map((candidate) => ({
		title: candidate.title,
		body: candidate.body,
		layer: candidate.layer,
		protected: candidate.protected,
	}));
	const compacted = compactContextSections({
		intro: params.intro,
		message: params.message,
		sections,
		targetTokens: params.targetTokens,
		initialCompactionMode: params.initialCompactionMode,
	});
	const candidatesByTitle = new Map(
		params.candidates.map((candidate) => [candidate.title, candidate]),
	);
	const contextTraceSections: LegacyContextTraceSectionInput[] = [
		...compacted.sectionSelections.map((selection) => {
			const candidate = candidatesByTitle.get(selection.title);
			return {
				name: selection.title,
				source: candidate?.source ?? "session",
				body: selection.body,
				inclusionLevel: toTraceInclusionLevel(selection),
				itemIds: candidate?.itemIds ?? [],
				itemTitles: candidate?.itemTitles ?? [],
				signalReasons: candidate?.signalReasons ?? [],
				trimmed: selection.trimmed,
				protected: selection.protected,
			};
		}),
		{
			name: "Current User Message",
			source: "user",
			body: params.message,
			inclusionLevel: "legacy_full",
			signalReasons: ["current_user_message"],
			trimmed: false,
			protected: false,
		},
	];

	return {
		inputValue: compacted.inputValue,
		compactionApplied: compacted.compactionApplied,
		compactionMode: compacted.compactionMode,
		layersUsed: compacted.layersUsed,
		estimatedTokens: compacted.estimatedTokens,
		contextTraceSections,
		sectionSelections: compacted.sectionSelections,
	};
}
