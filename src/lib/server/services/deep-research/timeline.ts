import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { deepResearchTimelineEvents } from "$lib/server/db/schema";

export type ResearchTimelineStage =
	| "plan_generation"
	| "plan_revision"
	| "plan_approval"
	| "source_discovery"
	| "source_review"
	| "coverage_assessment"
	| "research_tasks"
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

export type PersistedResearchTimelineEvent = ResearchTimelineEvent & {
	id: string;
	createdAt: string;
};

export type ListResearchTimelineEventsInput = {
	userId: string;
	jobId: string;
};

export type ListResearchTimelineEventsForJobsInput = {
	userId: string;
	jobIds: string[];
};

type DeepResearchTimelineEventRow =
	typeof deepResearchTimelineEvents.$inferSelect;

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
	const summary =
		input.researchLanguage === "hu"
			? "A kutatási terv elkészült jóváhagyásra."
			: "Research Plan drafted for approval.";

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
		summary,
	};
}

export async function saveResearchTimelineEvent(
	event: ResearchTimelineEvent,
): Promise<PersistedResearchTimelineEvent> {
	const { db } = await import("$lib/server/db");
	const [row] = await db
		.insert(deepResearchTimelineEvents)
		.values({
			id: randomUUID(),
			jobId: event.jobId,
			taskId: event.taskId,
			conversationId: event.conversationId,
			userId: event.userId,
			stage: event.stage,
			kind: event.kind,
			occurredAt: new Date(event.occurredAt),
			messageKey: event.messageKey,
			messageParamsJson: JSON.stringify(event.messageParams),
			sourceCountsJson: JSON.stringify(event.sourceCounts),
			assumptionsJson: JSON.stringify(event.assumptions),
			warningsJson: JSON.stringify(event.warnings),
			summary: event.summary,
		})
		.returning();

	return mapTimelineEventRow(row);
}

export async function listResearchTimelineEvents(
	input: ListResearchTimelineEventsInput,
): Promise<PersistedResearchTimelineEvent[]> {
	const { db } = await import("$lib/server/db");
	const rows = await db
		.select()
		.from(deepResearchTimelineEvents)
		.where(
			and(
				eq(deepResearchTimelineEvents.userId, input.userId),
				eq(deepResearchTimelineEvents.jobId, input.jobId),
			),
		)
		.orderBy(asc(deepResearchTimelineEvents.occurredAt));

	return rows.map(mapTimelineEventRow);
}

export async function listResearchTimelineEventsForJobs(
	input: ListResearchTimelineEventsForJobsInput,
): Promise<PersistedResearchTimelineEvent[]> {
	if (input.jobIds.length === 0) return [];
	const { db } = await import("$lib/server/db");
	const rows = await db
		.select()
		.from(deepResearchTimelineEvents)
		.where(
			and(
				eq(deepResearchTimelineEvents.userId, input.userId),
				inArray(deepResearchTimelineEvents.jobId, input.jobIds),
			),
		)
		.orderBy(asc(deepResearchTimelineEvents.occurredAt));

	return rows.map(mapTimelineEventRow);
}

function mapTimelineEventRow(
	row: DeepResearchTimelineEventRow,
): PersistedResearchTimelineEvent {
	return {
		id: row.id,
		jobId: row.jobId,
		conversationId: row.conversationId,
		userId: row.userId,
		taskId: row.taskId,
		stage: row.stage as ResearchTimelineStage,
		kind: row.kind as ResearchTimelineKind,
		occurredAt: row.occurredAt.toISOString(),
		messageKey: row.messageKey,
		messageParams: parseJson<Record<string, string | number | boolean | null>>(
			row.messageParamsJson,
		),
		sourceCounts: parseJson<ResearchSourceCounts>(row.sourceCountsJson),
		assumptions: parseJson<string[]>(row.assumptionsJson),
		warnings: parseJson<string[]>(row.warningsJson),
		summary: row.summary,
		createdAt: row.createdAt.toISOString(),
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

function parseJson<T>(value: string): T {
	return JSON.parse(value) as T;
}
