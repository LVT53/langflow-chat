import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
	deepResearchEvidenceNotes,
	deepResearchPassCheckpoints,
	deepResearchSources,
	deepResearchTasks,
} from "$lib/server/db/schema";
import type {
	DeepResearchEvidenceNote,
	DeepResearchSourceQualitySignals,
	DeepResearchTaskOutput,
} from "$lib/types";
import {
	deriveSourceAuthoritySummary,
	normalizeSourceQualitySignals,
	parseSourceQualitySignals,
} from "./source-quality";

type DeepResearchEvidenceNoteRow =
	typeof deepResearchEvidenceNotes.$inferSelect;

const MAX_EVIDENCE_NOTES_PER_SAVE = 64;
const MAX_EVIDENCE_NOTE_TEXT_LENGTH = 2_000;
const SQLITE_SAFE_INSERT_CHUNK_SIZE = 40;

export type SaveDeepResearchEvidenceNoteInput = {
	findingText: string;
	supportedKeyQuestion?: string | null;
	comparedEntity?: string | null;
	comparisonAxis?: string | null;
	sourceSupport?: Record<string, unknown> | null;
	sourceQualitySignals?: DeepResearchSourceQualitySignals | null;
};

export type SaveDeepResearchEvidenceNotesInput = {
	userId: string;
	jobId: string;
	conversationId: string;
	passCheckpointId: string;
	sourceId?: string | null;
	taskId?: string | null;
	notes: SaveDeepResearchEvidenceNoteInput[];
	now?: Date;
};

export type ListDeepResearchEvidenceNotesInput = {
	userId: string;
	jobId: string;
};

export async function saveDeepResearchEvidenceNotes(
	input: SaveDeepResearchEvidenceNotesInput,
): Promise<DeepResearchEvidenceNote[]> {
	const normalizedNotes = input.notes
		.slice(0, MAX_EVIDENCE_NOTES_PER_SAVE)
		.map((note) => ({
			...note,
			findingText: normalizeText(note.findingText).slice(
				0,
				MAX_EVIDENCE_NOTE_TEXT_LENGTH,
			),
			supportedKeyQuestion: normalizeOptionalText(note.supportedKeyQuestion),
			comparedEntity: normalizeOptionalText(note.comparedEntity),
			comparisonAxis: normalizeOptionalText(note.comparisonAxis),
			sourceSupport: note.sourceSupport ?? {},
			sourceQualitySignals: normalizeSourceQualitySignals(
				note.sourceQualitySignals,
			),
		}))
		.filter((note) => note.findingText.length > 0);
	if (normalizedNotes.length === 0) return [];

	const { db } = await import("$lib/server/db");
	const now = input.now ?? new Date();
	const rows: DeepResearchEvidenceNoteRow[] = [];
	for (const noteChunk of chunkArray(
		normalizedNotes,
		SQLITE_SAFE_INSERT_CHUNK_SIZE,
	)) {
		const insertedRows = await db
			.insert(deepResearchEvidenceNotes)
			.values(
				noteChunk.map((note) => ({
					id: randomUUID(),
					jobId: input.jobId,
					conversationId: input.conversationId,
					userId: input.userId,
					passCheckpointId: input.passCheckpointId,
					sourceId: input.sourceId ?? null,
					taskId: input.taskId ?? null,
					supportedKeyQuestion: note.supportedKeyQuestion,
					comparedEntity: note.comparedEntity,
					comparisonAxis: note.comparisonAxis,
					findingText: note.findingText,
					sourceSupportJson: JSON.stringify(note.sourceSupport),
					sourceQualitySignalsJson: note.sourceQualitySignals
						? JSON.stringify(note.sourceQualitySignals)
						: null,
					createdAt: now,
					updatedAt: now,
				})),
			)
			.returning();
		rows.push(...insertedRows);
	}

	return mapEvidenceNoteRowsWithPassNumbers(rows, new Map());
}

export async function saveResearchTaskEvidenceNotes(input: {
	userId: string;
	taskId: string;
	output: DeepResearchTaskOutput;
	now?: Date;
}): Promise<DeepResearchEvidenceNote[]> {
	const { db } = await import("$lib/server/db");
	const [task] = await db
		.select()
		.from(deepResearchTasks)
		.where(
			and(
				eq(deepResearchTasks.id, input.taskId),
				eq(deepResearchTasks.userId, input.userId),
			),
		)
		.limit(1);
	if (!task) return [];

	const [checkpoint] = await db
		.select()
		.from(deepResearchPassCheckpoints)
		.where(
			and(
				eq(deepResearchPassCheckpoints.userId, input.userId),
				eq(deepResearchPassCheckpoints.jobId, task.jobId),
				eq(deepResearchPassCheckpoints.passNumber, task.passNumber),
			),
		)
		.limit(1);
	if (!checkpoint) return [];

	const sourceIds = normalizeStringList(input.output.sourceIds ?? []);
	const validSourceRows =
		sourceIds.length > 0
			? await db
					.select({ id: deepResearchSources.id })
					.from(deepResearchSources)
					.where(
						and(
							eq(deepResearchSources.userId, input.userId),
							eq(deepResearchSources.jobId, task.jobId),
							inArray(deepResearchSources.id, sourceIds),
						),
					)
			: [];
	const validSourceIds = validSourceRows.map((row) => row.id);
	const findings = [
		input.output.summary,
		...(input.output.findings ?? []),
	].filter((finding) => normalizeText(finding).length > 0);
	const uniqueFindings = [...new Set(findings.map(normalizeText))];
	if (uniqueFindings.length === 0) return [];

	return saveDeepResearchEvidenceNotes({
		userId: input.userId,
		jobId: task.jobId,
		conversationId: task.conversationId,
		passCheckpointId: checkpoint.id,
		sourceId: validSourceIds.length === 1 ? validSourceIds[0] : null,
		taskId: task.id,
		notes: uniqueFindings.map((findingText) => ({
			findingText,
			supportedKeyQuestion:
				input.output.supportedKeyQuestion ?? task.keyQuestion,
			comparedEntity: input.output.comparedEntity,
			comparisonAxis: input.output.comparisonAxis,
			sourceSupport: {
				sourceIds: validSourceIds,
				taskId: task.id,
				coverageGapId: task.coverageGapId,
			},
		})),
		now: input.now,
	});
}

export async function listDeepResearchEvidenceNotes(
	input: ListDeepResearchEvidenceNotesInput,
): Promise<DeepResearchEvidenceNote[]> {
	const { db } = await import("$lib/server/db");
	const rows = await db
		.select({
			note: deepResearchEvidenceNotes,
			passNumber: deepResearchPassCheckpoints.passNumber,
		})
		.from(deepResearchEvidenceNotes)
		.innerJoin(
			deepResearchPassCheckpoints,
			eq(
				deepResearchEvidenceNotes.passCheckpointId,
				deepResearchPassCheckpoints.id,
			),
		)
		.where(
			and(
				eq(deepResearchEvidenceNotes.userId, input.userId),
				eq(deepResearchEvidenceNotes.jobId, input.jobId),
			),
		)
		.orderBy(
			asc(deepResearchPassCheckpoints.passNumber),
			asc(deepResearchEvidenceNotes.createdAt),
			asc(deepResearchEvidenceNotes.id),
		);

	const passNumbers = new Map(rows.map((row) => [row.note.id, row.passNumber]));
	return mapEvidenceNoteRowsWithPassNumbers(
		rows.map((row) => row.note),
		passNumbers,
	);
}

export async function buildSourceReviewEvidenceNotes(input: {
	userId: string;
	jobId: string;
	conversationId: string;
	passCheckpointId: string;
	sourceId: string;
	title: string;
	url: string;
	summary?: string | null;
	keyFindings: string[];
	extractedText?: string | null;
	supportedKeyQuestions: string[];
	comparedEntity?: string | null;
	comparisonAxis?: string | null;
	sourceQualitySignals?: DeepResearchSourceQualitySignals | null;
	now?: Date;
}): Promise<DeepResearchEvidenceNote[]> {
	const keyFindings =
		input.keyFindings.length > 0
			? input.keyFindings
			: [input.summary ?? input.extractedText ?? ""];
	return saveDeepResearchEvidenceNotes({
		userId: input.userId,
		jobId: input.jobId,
		conversationId: input.conversationId,
		passCheckpointId: input.passCheckpointId,
		sourceId: input.sourceId,
		notes: keyFindings.map((findingText) => ({
			findingText,
			supportedKeyQuestion: input.supportedKeyQuestions[0] ?? null,
			comparedEntity: input.comparedEntity,
			comparisonAxis: input.comparisonAxis,
			sourceSupport: {
				sourceId: input.sourceId,
				url: input.url,
				title: input.title,
				excerpt: input.extractedText ?? input.summary ?? findingText,
			},
			sourceQualitySignals: input.sourceQualitySignals,
		})),
		now: input.now,
	});
}

async function mapEvidenceNoteRowsWithPassNumbers(
	rows: DeepResearchEvidenceNoteRow[],
	passNumbers: Map<string, number>,
): Promise<DeepResearchEvidenceNote[]> {
	if (rows.length === 0) return [];
	const missingPassCheckpointIds = [
		...new Set(
			rows
				.filter((row) => !passNumbers.has(row.id))
				.map((row) => row.passCheckpointId),
		),
	];
	if (missingPassCheckpointIds.length > 0) {
		const { db } = await import("$lib/server/db");
		for (const passCheckpointId of missingPassCheckpointIds) {
			const [checkpoint] = await db
				.select({
					id: deepResearchPassCheckpoints.id,
					passNumber: deepResearchPassCheckpoints.passNumber,
				})
				.from(deepResearchPassCheckpoints)
				.where(eq(deepResearchPassCheckpoints.id, passCheckpointId))
				.limit(1);
			for (const row of rows) {
				if (checkpoint && row.passCheckpointId === checkpoint.id) {
					passNumbers.set(row.id, checkpoint.passNumber);
				}
			}
		}
	}
	return rows.map((row) =>
		mapEvidenceNoteRow(row, passNumbers.get(row.id) ?? 0),
	);
}

function mapEvidenceNoteRow(
	row: DeepResearchEvidenceNoteRow,
	passNumber: number,
): DeepResearchEvidenceNote {
	const sourceQualitySignals = parseSourceQualitySignals(
		row.sourceQualitySignalsJson,
	);
	return {
		id: row.id,
		jobId: row.jobId,
		conversationId: row.conversationId,
		userId: row.userId,
		passCheckpointId: row.passCheckpointId,
		passNumber,
		sourceId: row.sourceId,
		taskId: row.taskId,
		supportedKeyQuestion: row.supportedKeyQuestion,
		comparedEntity: row.comparedEntity,
		comparisonAxis: row.comparisonAxis,
		findingText: row.findingText,
		sourceSupport: parseObject(row.sourceSupportJson),
		sourceQualitySignals,
		sourceAuthoritySummary: deriveSourceAuthoritySummary(sourceQualitySignals),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function normalizeText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function chunkArray<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}

function normalizeOptionalText(
	value: string | null | undefined,
): string | null {
	const normalized = value?.replace(/\s+/g, " ").trim();
	return normalized ? normalized : null;
}

function normalizeStringList(values: string[]): string[] {
	return values.map(normalizeText).filter(Boolean);
}

function parseObject(value: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(value) as unknown;
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}
