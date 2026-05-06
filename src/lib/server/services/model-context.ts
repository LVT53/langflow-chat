const OPENAI_GPT_4_1_CONTEXT_WINDOW = 1_047_576;

export function inferModelContextWindow(
	modelName: string | null | undefined,
): number | null {
	const normalized = modelName?.trim().toLowerCase();
	if (!normalized) return null;

	if (matchesModelId(normalized, "gpt-4.1")) {
		return OPENAI_GPT_4_1_CONTEXT_WINDOW;
	}
	if (matchesModelId(normalized, "gpt-4.1-mini")) {
		return OPENAI_GPT_4_1_CONTEXT_WINDOW;
	}
	if (matchesModelId(normalized, "gpt-4.1-nano")) {
		return OPENAI_GPT_4_1_CONTEXT_WINDOW;
	}

	return null;
}

function matchesModelId(value: string, modelId: string): boolean {
	const escaped = modelId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const snapshotSuffix = "(?:-\\d{4}-\\d{2}-\\d{2})?";
	const boundary = "(?:^|[^a-z0-9._-])";
	const endBoundary = "(?:$|[^a-z0-9._-])";
	return new RegExp(
		`${boundary}${escaped}${snapshotSuffix}${endBoundary}`,
	).test(value);
}
