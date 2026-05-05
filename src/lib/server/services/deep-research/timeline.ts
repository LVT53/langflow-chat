export type ResearchTimelineStage =
	| "plan_generation"
	| "plan_revision"
	| "plan_approval"
	| "source_discovery"
	| "source_review"
	| "coverage_assessment"
	| "synthesis"
	| "citation_audit"
	| "report_completion";

export type ResearchTimelineKind =
	| "plan_generated"
	| "plan_revised"
	| "plan_approved"
	| "stage_started"
	| "stage_completed"
	| "warning"
	| "assumption"
	| "coverage_assessed";

export type ResearchSourceCounts = {
	discovered: number;
	reviewed: number;
	cited: number;
};

export type ResearchTimelineEvent = {
	jobId: string;
	conversationId: string;
	userId: string;
	taskId: string | null;
	stage: ResearchTimelineStage;
	kind: ResearchTimelineKind;
	occurredAt: string;
	messageKey: string;
	messageParams: Record<string, string | number | boolean | null>;
	sourceCounts: ResearchSourceCounts;
	assumptions: string[];
	warnings: string[];
	summary: string;
};

export type CreatePlanGenerationTimelineEventInput = {
	jobId: string;
	conversationId: string;
	userId: string;
	taskId?: string | null;
	stage: "plan_generation";
	researchLanguage: "en" | "hu";
	occurredAt?: Date;
	sourceCounts?: Partial<ResearchSourceCounts>;
	assumptions?: string[];
	warnings?: string[];
	privateReasoning?: string;
};

export function createPlanGenerationTimelineEvent(
	input: CreatePlanGenerationTimelineEventInput,
): ResearchTimelineEvent {
	const sourceCounts = normalizeSourceCounts(input.sourceCounts);

	return {
		jobId: input.jobId,
		conversationId: input.conversationId,
		userId: input.userId,
		taskId: input.taskId ?? null,
		stage: input.stage,
		kind: "plan_generated",
		occurredAt: (input.occurredAt ?? new Date()).toISOString(),
		messageKey: "deepResearch.timeline.planGenerated",
		messageParams: {
			discoveredSources: sourceCounts.discovered,
			reviewedSources: sourceCounts.reviewed,
			citedSources: sourceCounts.cited,
		},
		sourceCounts,
		assumptions: sanitizeUserVisibleNotes(input.assumptions ?? []),
		warnings: sanitizeUserVisibleNotes(input.warnings ?? []),
		summary: "Research Plan drafted for approval.",
	};
}

function normalizeSourceCounts(
	sourceCounts: Partial<ResearchSourceCounts> = {},
): ResearchSourceCounts {
	return {
		discovered: normalizeCount(sourceCounts.discovered),
		reviewed: normalizeCount(sourceCounts.reviewed),
		cited: normalizeCount(sourceCounts.cited),
	};
}

function normalizeCount(value: unknown): number {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function sanitizeUserVisibleNotes(notes: string[]): string[] {
	return notes.map((note) => note.replace(/\s+/g, " ").trim()).filter(Boolean);
}
