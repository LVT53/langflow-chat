import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import {
	and,
	asc,
	desc,
	eq,
	inArray,
	isNull,
	like,
	ne,
	or,
	sql,
} from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	artifactChunks,
	artifactLinks,
	artifacts,
	conversationWorkingSetItems,
	messages,
	taskStateEvidenceLinks,
} from '$lib/server/db/schema';
import type {
	Artifact,
	ArtifactLink,
	ArtifactSummary,
	ArtifactType,
	ChatAttachment,
	KnowledgeDocumentItem,
} from '$lib/types';
import { parseJsonRecord } from '$lib/server/utils/json';
import {
	hasMeaningfulAttachmentText,
	logAttachmentTrace,
	summarizeAttachmentTraceText,
} from '../attachment-trace';
import { extractDocumentText } from '../document-extraction';
import { scoreMatch } from '../working-set';
import { syncArtifactChunks } from '../task-state';

export const MAX_MODEL_CONTEXT = 262_144;
export const COMPACTION_UI_THRESHOLD = 209_715;
export const TARGET_CONSTRUCTED_CONTEXT = 157_286;
export const WORKING_SET_PROMPT_TOKEN_BUDGET = 12_000;
export const WORKING_SET_DOCUMENT_TOKEN_BUDGET = 1_500;
export const WORKING_SET_OUTPUT_TOKEN_BUDGET = 2_000;

type ArtifactSummaryRow = Pick<
	typeof artifacts.$inferSelect,
	| 'id'
	| 'type'
	| 'retrievalClass'
	| 'name'
	| 'mimeType'
	| 'sizeBytes'
	| 'conversationId'
	| 'summary'
	| 'createdAt'
	| 'updatedAt'
>;

export const knowledgeArtifactListSelection = {
	id: artifacts.id,
	type: artifacts.type,
	retrievalClass: artifacts.retrievalClass,
	name: artifacts.name,
	mimeType: artifacts.mimeType,
	sizeBytes: artifacts.sizeBytes,
	conversationId: artifacts.conversationId,
	summary: artifacts.summary,
	metadataJson: artifacts.metadataJson,
	createdAt: artifacts.createdAt,
	updatedAt: artifacts.updatedAt,
} as const;

export function mapArtifactSummary(row: ArtifactSummaryRow): ArtifactSummary {
	return {
		id: row.id,
		type: row.type as ArtifactType,
		retrievalClass: (row.retrievalClass ?? 'durable') as ArtifactSummary['retrievalClass'],
		name: row.name,
		mimeType: row.mimeType,
		sizeBytes: row.sizeBytes ?? null,
		conversationId: row.conversationId ?? null,
		summary: row.summary ?? null,
		createdAt: row.createdAt.getTime(),
		updatedAt: row.updatedAt.getTime(),
	};
}

function mapLogicalDocumentItem(params: {
	displayArtifact: ArtifactSummary;
	promptArtifactId: string | null;
	familyArtifactIds: string[];
	normalizedAvailable: boolean;
	summary: string | null;
	updatedAt: number;
}): KnowledgeDocumentItem {
	return {
		id: params.displayArtifact.id,
		displayArtifactId: params.displayArtifact.id,
		promptArtifactId: params.promptArtifactId,
		familyArtifactIds: params.familyArtifactIds,
		name: params.displayArtifact.name,
		mimeType: params.displayArtifact.mimeType,
		sizeBytes: params.displayArtifact.sizeBytes,
		conversationId: params.displayArtifact.conversationId,
		summary: params.summary,
		normalizedAvailable: params.normalizedAvailable,
		createdAt: params.displayArtifact.createdAt,
		updatedAt: params.updatedAt,
	};
}

export function mapArtifact(row: typeof artifacts.$inferSelect): Artifact {
	return {
		...mapArtifactSummary(row),
		userId: row.userId,
		extension: row.extension ?? null,
		storagePath: row.storagePath ?? null,
		contentText: row.contentText ?? null,
		metadata: parseJsonRecord(row.metadataJson ?? null),
	};
}

function mapArtifactLink(row: typeof artifactLinks.$inferSelect): ArtifactLink {
	return {
		id: row.id,
		userId: row.userId,
		artifactId: row.artifactId,
		relatedArtifactId: row.relatedArtifactId ?? null,
		conversationId: row.conversationId ?? null,
		messageId: row.messageId ?? null,
		linkType: row.linkType as ArtifactLink['linkType'],
		createdAt: row.createdAt.getTime(),
	};
}

function fileExtension(name: string): string | null {
	const ext = extname(name).toLowerCase();
	return ext ? ext.slice(1) : null;
}

function knowledgeUserDir(userId: string): string {
	return join(process.cwd(), 'data', 'knowledge', userId);
}

export function guessSummary(text: string | null, fallback: string): string {
	const trimmed = (text ?? '').replace(/\s+/g, ' ').trim();
	return trimmed ? trimmed.slice(0, 240) : fallback.slice(0, 240);
}

export function safeStem(name: string): string {
	const stem = basename(name, extname(name)).trim();
	return stem.length > 0 ? stem : 'artifact';
}

function hashBinaryBuffer(buffer: Buffer): string {
	return createHash('sha256').update(buffer).digest('hex');
}

export async function createArtifact(params: {
	id?: string;
	userId: string;
	conversationId?: string | null;
	type: ArtifactType;
	retrievalClass?: Artifact['retrievalClass'];
	name: string;
	mimeType?: string | null;
	extension?: string | null;
	sizeBytes?: number | null;
	binaryHash?: string | null;
	storagePath?: string | null;
	contentText?: string | null;
	summary?: string | null;
	metadata?: Record<string, unknown> | null;
}): Promise<Artifact> {
	const id = params.id ?? randomUUID();
	const [artifact] = await db
		.insert(artifacts)
		.values({
			id,
			userId: params.userId,
			conversationId: params.conversationId ?? null,
			type: params.type,
			retrievalClass: params.retrievalClass ?? 'durable',
			name: params.name,
			mimeType: params.mimeType ?? null,
			extension: params.extension ?? null,
			sizeBytes: params.sizeBytes ?? null,
			binaryHash: params.binaryHash ?? null,
			storagePath: params.storagePath ?? null,
			contentText: params.contentText ?? null,
			summary: params.summary ?? null,
			metadataJson: params.metadata ? JSON.stringify(params.metadata) : null,
			updatedAt: new Date(),
		})
		.returning();

	const mapped = mapArtifact(artifact);
	await syncArtifactChunks({
		artifactId: mapped.id,
		userId: mapped.userId,
		conversationId: mapped.conversationId,
		contentText: mapped.contentText,
	});

	return mapped;
}

async function updateArtifactBinaryHash(artifactId: string, binaryHash: string): Promise<void> {
	await db
		.update(artifacts)
		.set({
			binaryHash,
			updatedAt: new Date(),
		})
		.where(eq(artifacts.id, artifactId));
}

export async function getNormalizedArtifactForSource(
	userId: string,
	sourceArtifactId: string
): Promise<Artifact | null> {
	const rows = await db
		.select({ artifact: artifacts })
		.from(artifactLinks)
		.innerJoin(artifacts, eq(artifactLinks.artifactId, artifacts.id))
		.where(
			and(
				eq(artifactLinks.userId, userId),
				eq(artifactLinks.relatedArtifactId, sourceArtifactId),
				eq(artifactLinks.linkType, 'derived_from'),
				eq(artifacts.type, 'normalized_document')
			)
		)
		.orderBy(asc(artifactLinks.createdAt))
		.limit(1);

	return rows[0] ? mapArtifact(rows[0].artifact) : null;
}

function withAttachmentDisplayName(promptArtifact: Artifact, displayArtifact: Artifact): Artifact {
	return {
		...promptArtifact,
		name: displayArtifact.name,
		mimeType: displayArtifact.mimeType ?? promptArtifact.mimeType,
		sizeBytes: displayArtifact.sizeBytes ?? promptArtifact.sizeBytes,
	};
}

type PromptArtifactDiagnostics = {
	contentLength: number;
	contentPreview: string | null;
	contentHash: string | null;
	chunkCount: number;
};

type PromptAttachmentResolutionItem = {
	requestedArtifactId: string;
	displayArtifact: Artifact | null;
	promptArtifact: Artifact | null;
	promptReady: boolean;
	readinessError: string | null;
	contentLength: number;
	contentPreview: string | null;
	contentHash: string | null;
	chunkCount: number;
};

export class AttachmentReadinessError extends Error {
	code = 'attachment_not_ready' as const;
	status = 422 as const;
	attachmentIds: string[];

	constructor(message: string, attachmentIds: string[]) {
		super(message);
		this.name = 'AttachmentReadinessError';
		this.attachmentIds = attachmentIds;
	}
}

export function isAttachmentReadinessError(error: unknown): error is AttachmentReadinessError {
	return (
		error instanceof AttachmentReadinessError ||
		(typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			(error as { code?: unknown }).code === 'attachment_not_ready')
	);
}

function buildAttachmentReadinessErrorMessage(items: PromptAttachmentResolutionItem[]): string {
	if (items.some((item) => item.displayArtifact === null)) {
		return 'One or more attached files are no longer available. Remove them and upload again.';
	}

	if (items.length === 1) {
		const item = items[0];
		if (item.displayArtifact?.name && item.readinessError) {
			return `${item.displayArtifact.name}: ${item.readinessError}`;
		}
	}

	return 'One or more attached files could not be prepared for chat. Remove the file or upload a supported text-readable document.';
}

async function getPromptArtifactDiagnostics(
	userId: string,
	promptArtifact: Artifact | null
): Promise<PromptArtifactDiagnostics> {
	if (!promptArtifact) {
		return {
			contentLength: 0,
			contentPreview: null,
			contentHash: null,
			chunkCount: 0,
		};
	}

	const [{ chunkCount = 0 } = { chunkCount: 0 }] = await db
		.select({
			chunkCount: sql<number>`count(*)`,
		})
		.from(artifactChunks)
		.where(
			and(eq(artifactChunks.userId, userId), eq(artifactChunks.artifactId, promptArtifact.id))
		);

	return {
		...summarizeAttachmentTraceText(promptArtifact.contentText),
		chunkCount: Number(chunkCount ?? 0),
	};
}

async function buildPromptAttachmentResolutionItem(params: {
	userId: string;
	requestedArtifactId: string;
	displayArtifact: Artifact;
	promptArtifact: Artifact | null;
	readinessError: string;
}): Promise<PromptAttachmentResolutionItem> {
	const diagnostics = await getPromptArtifactDiagnostics(params.userId, params.promptArtifact);
	const promptReady =
		Boolean(params.promptArtifact) &&
		hasMeaningfulAttachmentText(params.promptArtifact?.contentText) &&
		diagnostics.contentLength > 0;

	return {
		requestedArtifactId: params.requestedArtifactId,
		displayArtifact: params.displayArtifact,
		promptArtifact: params.promptArtifact,
		promptReady,
		readinessError: promptReady ? null : params.readinessError,
		contentLength: diagnostics.contentLength,
		contentPreview: diagnostics.contentPreview,
		contentHash: diagnostics.contentHash,
		chunkCount: diagnostics.chunkCount,
	};
}

export async function resolvePromptAttachmentArtifacts(
	userId: string,
	attachmentIds: string[]
): Promise<{
	displayArtifacts: Artifact[];
	promptArtifacts: Artifact[];
	items: PromptAttachmentResolutionItem[];
	unresolvedItems: PromptAttachmentResolutionItem[];
}> {
	const displayArtifacts = await getArtifactsForUser(userId, attachmentIds);
	if (displayArtifacts.length === 0) {
		const items = attachmentIds.map((attachmentId) => ({
			requestedArtifactId: attachmentId,
			displayArtifact: null,
			promptArtifact: null,
			promptReady: false,
			readinessError: 'Attached file is no longer available.',
			contentLength: 0,
			contentPreview: null,
			contentHash: null,
			chunkCount: 0,
		}));
		return { displayArtifacts: [], promptArtifacts: [], items, unresolvedItems: items };
	}

	const displayArtifactsById = new Map(displayArtifacts.map((artifact) => [artifact.id, artifact]));
	const items = await Promise.all(
		attachmentIds.map(async (attachmentId) => {
			const displayArtifact = displayArtifactsById.get(attachmentId) ?? null;
			if (!displayArtifact) {
				return {
					requestedArtifactId: attachmentId,
					displayArtifact: null,
					promptArtifact: null,
					promptReady: false,
					readinessError: 'Attached file is no longer available.',
					contentLength: 0,
					contentPreview: null,
					contentHash: null,
					chunkCount: 0,
				};
			}

			if (displayArtifact.type !== 'source_document') {
				return buildPromptAttachmentResolutionItem({
					userId,
					requestedArtifactId: attachmentId,
					displayArtifact,
					promptArtifact: withAttachmentDisplayName(displayArtifact, displayArtifact),
					readinessError:
						'This attachment does not contain enough readable text to use in chat. Remove it or upload a supported text-readable document.',
				});
			}

			const normalized = await getNormalizedArtifactForSource(userId, displayArtifact.id);
			if (!normalized) {
				return {
					requestedArtifactId: attachmentId,
					displayArtifact,
					promptArtifact: null,
					promptReady: false,
					readinessError:
						'This file could not be prepared for chat. Supported extraction currently works best for text, HTML, JSON, PDF, DOCX, PPTX, and XLSX files.',
					contentLength: 0,
					contentPreview: null,
					contentHash: null,
					chunkCount: 0,
				};
			}

			return buildPromptAttachmentResolutionItem({
				userId,
				requestedArtifactId: attachmentId,
				displayArtifact,
				promptArtifact: withAttachmentDisplayName(normalized, displayArtifact),
				readinessError:
					'This file was uploaded, but no usable readable text could be prepared for chat from it.',
			});
		})
	);
	const unresolvedItems = items.filter((item) => !item.promptReady);

	return {
		displayArtifacts,
		promptArtifacts: Array.from(
			new Map(
				items
					.flatMap((item) =>
						item.promptReady && item.promptArtifact
							? [[item.promptArtifact.id, item.promptArtifact] as const]
							: []
					)
			).values()
		),
		items,
		unresolvedItems,
	};
}

export async function assertPromptReadyAttachments(params: {
	userId: string;
	conversationId: string;
	attachmentIds: string[];
	traceId?: string;
}): Promise<{
	displayArtifacts: Artifact[];
	promptArtifacts: Artifact[];
}> {
	const resolved = await resolvePromptAttachmentArtifacts(params.userId, params.attachmentIds);

	if (params.attachmentIds.length > 0) {
		console.info('[ATTACHMENTS] Prompt readiness preflight', {
			conversationId: params.conversationId,
			requestedAttachmentIds: params.attachmentIds,
			displayArtifactCount: resolved.displayArtifacts.length,
			promptArtifactCount: resolved.promptArtifacts.length,
			unresolvedAttachmentIds: resolved.unresolvedItems.map((item) => item.requestedArtifactId),
		});
		logAttachmentTrace('preflight', {
			traceId: params.traceId ?? null,
			conversationId: params.conversationId,
			requestedAttachmentIds: params.attachmentIds,
			displayArtifactIds: resolved.displayArtifacts.map((artifact) => artifact.id),
			promptArtifactIds: resolved.promptArtifacts.map((artifact) => artifact.id),
			unresolvedAttachments: resolved.unresolvedItems.map((item) => ({
				artifactId: item.requestedArtifactId,
				name: item.displayArtifact?.name ?? null,
				readinessError: item.readinessError,
				contentLength: item.contentLength,
				chunkCount: item.chunkCount,
				contentHash: item.contentHash,
			})),
		});
	}

	if (resolved.unresolvedItems.length > 0) {
		throw new AttachmentReadinessError(
			buildAttachmentReadinessErrorMessage(resolved.unresolvedItems),
			resolved.unresolvedItems.map((item) => item.requestedArtifactId)
		);
	}

	return {
		displayArtifacts: resolved.displayArtifacts,
		promptArtifacts: resolved.promptArtifacts,
	};
}

async function ensureConversationAttachmentLink(params: {
	userId: string;
	artifactId: string;
	conversationId: string;
}): Promise<void> {
	const existing = await db
		.select({ id: artifactLinks.id })
		.from(artifactLinks)
		.where(
			and(
				eq(artifactLinks.userId, params.userId),
				eq(artifactLinks.artifactId, params.artifactId),
				eq(artifactLinks.conversationId, params.conversationId),
				eq(artifactLinks.linkType, 'attached_to_conversation'),
				isNull(artifactLinks.messageId)
			)
		)
		.limit(1);

	if (existing[0]) return;

	await createArtifactLink({
		userId: params.userId,
		artifactId: params.artifactId,
		linkType: 'attached_to_conversation',
		conversationId: params.conversationId,
	});
}

async function findDuplicateUploadedArtifact(params: {
	userId: string;
	binaryHash: string;
	sizeBytes: number;
}): Promise<{ artifact: Artifact; normalizedArtifact: Artifact | null } | null> {
	const exactRows = await db
		.select()
		.from(artifacts)
		.where(
			and(
				eq(artifacts.userId, params.userId),
				eq(artifacts.type, 'source_document'),
				eq(artifacts.binaryHash, params.binaryHash)
			)
		)
		.orderBy(asc(artifacts.createdAt))
		.limit(1);

	if (exactRows[0]) {
		return {
			artifact: mapArtifact(exactRows[0]),
			normalizedArtifact: await getNormalizedArtifactForSource(params.userId, exactRows[0].id),
		};
	}

	const legacyCandidates = await db
		.select()
		.from(artifacts)
		.where(
			and(
				eq(artifacts.userId, params.userId),
				eq(artifacts.type, 'source_document'),
				isNull(artifacts.binaryHash),
				eq(artifacts.sizeBytes, params.sizeBytes)
			)
		)
		.orderBy(asc(artifacts.createdAt))
		.limit(24);

	for (const candidate of legacyCandidates) {
		if (!candidate.storagePath) continue;
		try {
			const buffer = await readFile(join(process.cwd(), candidate.storagePath));
			const candidateHash = hashBinaryBuffer(buffer);
			await updateArtifactBinaryHash(candidate.id, candidateHash);
			if (candidateHash === params.binaryHash) {
				return {
					artifact: mapArtifact({
						...candidate,
						binaryHash: candidateHash,
					}),
					normalizedArtifact: await getNormalizedArtifactForSource(params.userId, candidate.id),
				};
			}
		} catch (error) {
			console.error('[KNOWLEDGE] Failed to hydrate artifact hash for dedupe:', {
				artifactId: candidate.id,
				error,
			});
		}
	}

	return null;
}

export async function createArtifactLink(params: {
	userId: string;
	artifactId: string;
	linkType: ArtifactLink['linkType'];
	relatedArtifactId?: string | null;
	conversationId?: string | null;
	messageId?: string | null;
}): Promise<ArtifactLink> {
	const [row] = await db
		.insert(artifactLinks)
		.values({
			id: randomUUID(),
			userId: params.userId,
			artifactId: params.artifactId,
			linkType: params.linkType,
			relatedArtifactId: params.relatedArtifactId ?? null,
			conversationId: params.conversationId ?? null,
			messageId: params.messageId ?? null,
		})
		.returning();
	return mapArtifactLink(row);
}

export async function getArtifactForUser(userId: string, artifactId: string): Promise<Artifact | null> {
	const [row] = await db
		.select()
		.from(artifacts)
		.where(and(eq(artifacts.id, artifactId), eq(artifacts.userId, userId)));
	return row ? mapArtifact(row) : null;
}

export async function listArtifactLinksForUser(
	userId: string,
	artifactId: string
): Promise<ArtifactLink[]> {
	const rows = await db
		.select()
		.from(artifactLinks)
		.where(and(eq(artifactLinks.userId, userId), eq(artifactLinks.artifactId, artifactId)))
		.orderBy(desc(artifactLinks.createdAt));
	return rows.map(mapArtifactLink);
}

export async function hardDeleteArtifactsForUser(
	userId: string,
	artifactIds: string[]
): Promise<{
	deletedArtifactIds: string[];
	deletedStoragePaths: string[];
	failedStoragePaths: string[];
}> {
	const uniqueIds = Array.from(new Set(artifactIds));
	if (uniqueIds.length === 0) {
		return { deletedArtifactIds: [], deletedStoragePaths: [], failedStoragePaths: [] };
	}

	const artifactsToDelete = await db
		.select()
		.from(artifacts)
		.where(and(eq(artifacts.userId, userId), inArray(artifacts.id, uniqueIds)));
	const ids = artifactsToDelete.map((row) => row.id);

	if (ids.length === 0) {
		return { deletedArtifactIds: [], deletedStoragePaths: [], failedStoragePaths: [] };
	}

	db.transaction((tx) => {
		tx
			.delete(conversationWorkingSetItems)
			.where(
				and(
					eq(conversationWorkingSetItems.userId, userId),
					inArray(conversationWorkingSetItems.artifactId, ids)
				)
			)
			.run();

		tx
			.delete(taskStateEvidenceLinks)
			.where(
				and(eq(taskStateEvidenceLinks.userId, userId), inArray(taskStateEvidenceLinks.artifactId, ids))
			)
			.run();

		tx
			.delete(artifactLinks)
			.where(
				and(
					eq(artifactLinks.userId, userId),
					or(inArray(artifactLinks.artifactId, ids), inArray(artifactLinks.relatedArtifactId, ids))
				)
			)
			.run();

		tx
			.delete(artifacts)
			.where(and(eq(artifacts.userId, userId), inArray(artifacts.id, ids)))
			.run();
	});

	const deletedStoragePaths: string[] = [];
	const failedStoragePaths: string[] = [];
	for (const row of artifactsToDelete) {
		if (!row.storagePath) continue;
		try {
			await unlink(join(process.cwd(), row.storagePath));
			deletedStoragePaths.push(row.storagePath);
		} catch (error) {
			failedStoragePaths.push(row.storagePath);
			console.warn('[KNOWLEDGE_DELETE] File cleanup failed after DB deletion', {
				userId,
				artifactId: row.id,
				storagePath: row.storagePath,
				error,
			});
		}
	}

	return {
		deletedArtifactIds: ids,
		deletedStoragePaths,
		failedStoragePaths,
	};
}

export async function listConversationOwnedArtifacts(
	userId: string,
	conversationId: string
): Promise<Artifact[]> {
	const rows = await db
		.select()
		.from(artifacts)
		.where(and(eq(artifacts.userId, userId), eq(artifacts.conversationId, conversationId)))
		.orderBy(desc(artifacts.updatedAt));

	return rows.map(mapArtifact);
}

export async function getSourceArtifactIdForNormalizedArtifact(
	userId: string,
	normalizedArtifactId: string
): Promise<string | null> {
	const [row] = await db
		.select({ sourceArtifactId: artifactLinks.relatedArtifactId })
		.from(artifactLinks)
		.innerJoin(artifacts, eq(artifactLinks.artifactId, artifacts.id))
		.where(
			and(
				eq(artifactLinks.userId, userId),
				eq(artifactLinks.artifactId, normalizedArtifactId),
				eq(artifactLinks.linkType, 'derived_from'),
				eq(artifacts.type, 'normalized_document')
			)
		)
		.limit(1);

	return row?.sourceArtifactId ?? null;
}

export async function artifactHasReferencesOutsideConversation(
	userId: string,
	artifactId: string,
	conversationId: string
): Promise<boolean> {
	const [artifactRow] = await db
		.select({ conversationId: artifacts.conversationId })
		.from(artifacts)
		.where(and(eq(artifacts.userId, userId), eq(artifacts.id, artifactId)))
		.limit(1);

	if (artifactRow?.conversationId && artifactRow.conversationId !== conversationId) {
		return true;
	}

	const linkRows = await db
		.select({
			conversationId: artifactLinks.conversationId,
			messageConversationId: messages.conversationId,
		})
		.from(artifactLinks)
		.leftJoin(messages, eq(artifactLinks.messageId, messages.id))
		.where(
			and(
				eq(artifactLinks.userId, userId),
				or(eq(artifactLinks.artifactId, artifactId), eq(artifactLinks.relatedArtifactId, artifactId))
			)
		);

	if (
		linkRows.some((row) => {
			const linkedConversationId = row.conversationId ?? row.messageConversationId ?? null;
			return linkedConversationId === null || linkedConversationId !== conversationId;
		})
	) {
		return true;
	}

	const [evidenceReference] = await db
		.select({ id: taskStateEvidenceLinks.id })
		.from(taskStateEvidenceLinks)
		.where(
			and(
				eq(taskStateEvidenceLinks.userId, userId),
				eq(taskStateEvidenceLinks.artifactId, artifactId),
				ne(taskStateEvidenceLinks.conversationId, conversationId)
			)
		)
		.limit(1);

	if (evidenceReference) {
		return true;
	}

	const [workingSetReference] = await db
		.select({ id: conversationWorkingSetItems.id })
		.from(conversationWorkingSetItems)
		.where(
			and(
				eq(conversationWorkingSetItems.userId, userId),
				eq(conversationWorkingSetItems.artifactId, artifactId),
				ne(conversationWorkingSetItems.conversationId, conversationId)
			)
		)
		.limit(1);

	return Boolean(workingSetReference);
}

export async function deleteArtifactForUser(
	userId: string,
	artifactId: string
): Promise<{
	deletedArtifactIds: string[];
	deletedStoragePaths: string[];
	failedStoragePaths: string[];
} | null> {
	const startedAt = Date.now();
	const artifact = await getArtifactForUser(userId, artifactId);
	if (!artifact) return null;

	const artifactIdsToDelete = new Set<string>([artifact.id]);
	if (artifact.type === 'source_document') {
		const derivedRows = await db
			.select({ artifact: artifacts })
			.from(artifactLinks)
			.innerJoin(artifacts, eq(artifactLinks.artifactId, artifacts.id))
			.where(
				and(
					eq(artifactLinks.userId, userId),
					eq(artifactLinks.relatedArtifactId, artifact.id),
					eq(artifactLinks.linkType, 'derived_from'),
					eq(artifacts.type, 'normalized_document')
				)
			);

		for (const row of derivedRows) {
			artifactIdsToDelete.add(row.artifact.id);
		}
	}

	const ids = Array.from(artifactIdsToDelete);
	const result = await hardDeleteArtifactsForUser(userId, ids);
	console.info('[KNOWLEDGE_DELETE] Artifact delete completed', {
		userId,
		artifactId: artifact.id,
		artifactType: artifact.type,
		derivedArtifactIds: ids.filter((id) => id !== artifact.id),
		deletedArtifactIds: result.deletedArtifactIds,
		deletedStoragePathCount: result.deletedStoragePaths.length,
		failedStoragePathCount: result.failedStoragePaths.length,
		durationMs: Date.now() - startedAt,
	});
	if (result.failedStoragePaths.length > 0) {
		console.warn('[KNOWLEDGE_DELETE] Artifact delete completed with file cleanup gaps', {
			userId,
			artifactId: artifact.id,
			failedStoragePaths: result.failedStoragePaths,
		});
	}
	return result;
}

export type KnowledgeBulkAction =
	| 'forget_all_documents'
	| 'forget_all_results'
	| 'forget_all_workflows';

async function listDocumentRootArtifactIds(userId: string): Promise<string[]> {
	const documents = await listLogicalDocuments(userId);
	return documents.map((document) => document.id);
}

export async function deleteKnowledgeArtifactsByAction(
	userId: string,
	action: KnowledgeBulkAction
): Promise<{
	deletedArtifactIds: string[];
	deletedStoragePaths: string[];
	failedStoragePaths: string[];
}> {
	let rootArtifactIds: string[] = [];

	if (action === 'forget_all_documents') {
		rootArtifactIds = await listDocumentRootArtifactIds(userId);
	} else {
		const type = action === 'forget_all_results' ? 'generated_output' : 'work_capsule';
		const rows = await db
			.select({ id: artifacts.id })
			.from(artifacts)
			.where(and(eq(artifacts.userId, userId), eq(artifacts.type, type)));
		rootArtifactIds = rows.map((row) => row.id);
	}

	if (rootArtifactIds.length === 0) {
		return { deletedArtifactIds: [], deletedStoragePaths: [], failedStoragePaths: [] };
	}

	const expandedIds = new Set<string>(rootArtifactIds);
	if (action === 'forget_all_documents') {
		const derivedRows = await db
			.select({ artifactId: artifactLinks.artifactId })
			.from(artifactLinks)
			.innerJoin(artifacts, eq(artifactLinks.artifactId, artifacts.id))
			.where(
				and(
					eq(artifactLinks.userId, userId),
					inArray(artifactLinks.relatedArtifactId, rootArtifactIds),
					eq(artifactLinks.linkType, 'derived_from'),
					eq(artifacts.type, 'normalized_document')
				)
			);
		for (const row of derivedRows) {
			expandedIds.add(row.artifactId);
		}
	}

	return hardDeleteArtifactsForUser(userId, Array.from(expandedIds));
}

export async function getArtifactsForUser(
	userId: string,
	artifactIds: string[]
): Promise<Artifact[]> {
	if (artifactIds.length === 0) return [];
	const rows = await db
		.select()
		.from(artifacts)
		.where(and(eq(artifacts.userId, userId), inArray(artifacts.id, artifactIds)));
	return rows.map(mapArtifact);
}

export async function saveUploadedArtifact(params: {
	userId: string;
	conversationId: string;
	file: File;
}): Promise<{ artifact: Artifact; reusedExistingArtifact: boolean; normalizedArtifact: Artifact | null }> {
	const extension = fileExtension(params.file.name);
	const userDir = knowledgeUserDir(params.userId);
	const buffer = Buffer.from(await params.file.arrayBuffer());
	const binaryHash = hashBinaryBuffer(buffer);

	const duplicate = await findDuplicateUploadedArtifact({
		userId: params.userId,
		binaryHash,
		sizeBytes: params.file.size,
	});

	if (duplicate) {
		await ensureConversationAttachmentLink({
			userId: params.userId,
			artifactId: duplicate.artifact.id,
			conversationId: params.conversationId,
		});

		return {
			artifact: duplicate.artifact,
			reusedExistingArtifact: true,
			normalizedArtifact: duplicate.normalizedArtifact,
		};
	}

	const artifactId = randomUUID();
	await mkdir(userDir, { recursive: true });

	const fileName = extension ? `${artifactId}.${extension}` : artifactId;
	const storagePath = join('data', 'knowledge', params.userId, fileName);
	const absolutePath = join(process.cwd(), storagePath);
	await writeFile(absolutePath, buffer);

	const artifact = await createArtifact({
		id: artifactId,
		userId: params.userId,
		conversationId: params.conversationId,
		type: 'source_document',
		name: params.file.name,
		mimeType: params.file.type || null,
		extension,
		sizeBytes: params.file.size,
		binaryHash,
		storagePath,
		summary: params.file.name,
		metadata: {
			uploadSource: 'chat',
		},
	});

	await ensureConversationAttachmentLink({
		userId: params.userId,
		artifactId: artifact.id,
		conversationId: params.conversationId,
	});

	return {
		artifact,
		reusedExistingArtifact: false,
		normalizedArtifact: null,
	};
}

export async function createNormalizedArtifact(params: {
	userId: string;
	conversationId: string;
	sourceArtifactId: string;
	sourceStoragePath: string;
	sourceName: string;
	sourceMimeType: string | null;
}): Promise<Artifact | null> {
	const absoluteSourcePath = join(process.cwd(), params.sourceStoragePath);
	const extraction = await extractDocumentText(
		absoluteSourcePath,
		params.sourceMimeType,
		params.sourceName
	);

	if (!extraction.text) return null;

	const artifact = await createArtifact({
		userId: params.userId,
		conversationId: params.conversationId,
		type: 'normalized_document',
		name: extraction.normalizedName,
		mimeType: extraction.mimeType,
		extension: 'txt',
		sizeBytes: Buffer.byteLength(extraction.text, 'utf8'),
		storagePath: null,
		contentText: extraction.text,
		summary: guessSummary(extraction.text, params.sourceName),
		metadata: {
			sourceArtifactId: params.sourceArtifactId,
			normalizedFrom: params.sourceName,
		},
	});

	await createArtifactLink({
		userId: params.userId,
		artifactId: artifact.id,
		relatedArtifactId: params.sourceArtifactId,
		conversationId: params.conversationId,
		linkType: 'derived_from',
	});

	return artifact;
}

export async function listLogicalDocuments(userId: string): Promise<KnowledgeDocumentItem[]> {
	const rows = await db
		.select(knowledgeArtifactListSelection)
		.from(artifacts)
		.where(
			and(
				eq(artifacts.userId, userId),
				inArray(artifacts.type, ['source_document', 'normalized_document'])
			)
		)
		.orderBy(desc(artifacts.updatedAt));

	if (rows.length === 0) return [];

	const summaries = rows.map(mapArtifactSummary);
	const byId = new Map(summaries.map((item) => [item.id, item]));
	const sourceArtifacts = summaries.filter((item) => item.type === 'source_document');
	const normalizedArtifacts = summaries.filter((item) => item.type === 'normalized_document');

	const derivedRows =
		normalizedArtifacts.length === 0
			? []
			: await db
					.select({
						normalizedArtifactId: artifactLinks.artifactId,
						sourceArtifactId: artifactLinks.relatedArtifactId,
					})
					.from(artifactLinks)
					.where(
						and(
							eq(artifactLinks.userId, userId),
							inArray(
								artifactLinks.artifactId,
								normalizedArtifacts.map((item) => item.id)
							),
							eq(artifactLinks.linkType, 'derived_from')
						)
					);

	const normalizedBySourceId = new Map<string, ArtifactSummary>();
	const sourceByNormalizedId = new Map<string, string>();
	for (const row of derivedRows) {
		if (!(row.sourceArtifactId && row.normalizedArtifactId)) continue;
		const normalized = byId.get(row.normalizedArtifactId);
		if (!normalized) continue;
		normalizedBySourceId.set(row.sourceArtifactId, normalized);
		sourceByNormalizedId.set(row.normalizedArtifactId, row.sourceArtifactId);
	}

	const documents: KnowledgeDocumentItem[] = [];
	for (const source of sourceArtifacts) {
		const normalized = normalizedBySourceId.get(source.id) ?? null;
		documents.push(
			mapLogicalDocumentItem({
				displayArtifact: source,
				promptArtifactId: normalized?.id ?? null,
				familyArtifactIds: [source.id, normalized?.id ?? null].filter(
					(value): value is string => Boolean(value)
				),
				normalizedAvailable: Boolean(normalized),
				summary: normalized?.summary ?? source.summary,
				updatedAt: Math.max(source.updatedAt, normalized?.updatedAt ?? source.updatedAt),
			})
		);
	}

	for (const normalized of normalizedArtifacts) {
		if (sourceByNormalizedId.has(normalized.id)) continue;
		documents.push(
			mapLogicalDocumentItem({
				displayArtifact: normalized,
				promptArtifactId: normalized.id,
				familyArtifactIds: [normalized.id],
				normalizedAvailable: true,
				summary: normalized.summary,
				updatedAt: normalized.updatedAt,
			})
		);
	}

	return documents.sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function listConversationArtifacts(
	userId: string,
	conversationId: string
): Promise<ArtifactSummary[]> {
	const rows = await db
		.select({ artifact: artifacts })
		.from(artifactLinks)
		.innerJoin(artifacts, eq(artifactLinks.artifactId, artifacts.id))
		.where(
			and(
				eq(artifactLinks.userId, userId),
				eq(artifactLinks.conversationId, conversationId),
				eq(artifactLinks.linkType, 'attached_to_conversation'),
				isNull(artifactLinks.messageId)
			)
		)
		.orderBy(desc(artifacts.updatedAt));

	const unique = new Map<string, ArtifactSummary>();
	for (const row of rows) {
		unique.set(row.artifact.id, mapArtifactSummary(row.artifact));
	}
	return Array.from(unique.values());
}

export async function listMessageAttachments(
	conversationId: string
): Promise<Map<string, ChatAttachment[]>> {
	const rows = await db
		.select({
			link: artifactLinks,
			artifact: artifacts,
		})
		.from(artifactLinks)
		.innerJoin(artifacts, eq(artifactLinks.artifactId, artifacts.id))
		.where(
			and(
				eq(artifactLinks.conversationId, conversationId),
				eq(artifactLinks.linkType, 'attached_to_conversation'),
				sql`${artifactLinks.messageId} IS NOT NULL`
			)
		)
		.orderBy(desc(artifactLinks.createdAt));

	const result = new Map<string, ChatAttachment[]>();
	for (const row of rows) {
		if (!row.link.messageId) continue;
		const attachments = result.get(row.link.messageId) ?? [];
		attachments.push({
			id: row.link.id,
			artifactId: row.artifact.id,
			name: row.artifact.name,
			type: row.artifact.type as ArtifactType,
			mimeType: row.artifact.mimeType ?? null,
			sizeBytes: row.artifact.sizeBytes ?? null,
			conversationId: row.artifact.conversationId ?? null,
			messageId: row.link.messageId,
			createdAt: row.link.createdAt.getTime(),
		});
		result.set(row.link.messageId, attachments);
	}

	return result;
}

export async function attachArtifactsToMessage(params: {
	userId: string;
	conversationId: string;
	messageId: string;
	artifactIds: string[];
}): Promise<void> {
	const uniqueArtifactIds = Array.from(new Set(params.artifactIds));
	if (uniqueArtifactIds.length === 0) return;

	const ownedArtifacts = await db
		.select()
		.from(artifacts)
		.where(and(eq(artifacts.userId, params.userId), inArray(artifacts.id, uniqueArtifactIds)));

	for (const artifact of ownedArtifacts) {
		await createArtifactLink({
			userId: params.userId,
			artifactId: artifact.id,
			conversationId: params.conversationId,
			messageId: params.messageId,
			linkType: 'attached_to_conversation',
		});
	}
}

export async function listConversationSourceArtifactIds(
	userId: string,
	conversationId: string
): Promise<string[]> {
	const rows = await db
		.select({ artifactId: artifactLinks.artifactId })
		.from(artifactLinks)
		.innerJoin(artifacts, eq(artifactLinks.artifactId, artifacts.id))
		.where(
			and(
				eq(artifactLinks.userId, userId),
				eq(artifactLinks.conversationId, conversationId),
				eq(artifactLinks.linkType, 'attached_to_conversation'),
				or(eq(artifacts.type, 'source_document'), eq(artifacts.type, 'normalized_document'))
			)
		);
	return Array.from(new Set(rows.map((row) => row.artifactId)));
}

export async function findRelevantArtifactsByTypes(params: {
	userId: string;
	query: string;
	types: ArtifactType[];
	limit: number;
	excludeConversationId?: string;
}): Promise<Artifact[]> {
	const queryFragment = `%${params.query.slice(0, 80)}%`;
	const rows = await db
		.select()
		.from(artifacts)
		.where(
			and(
				eq(artifacts.userId, params.userId),
				inArray(artifacts.type, params.types),
				params.types.includes('generated_output')
					? or(ne(artifacts.type, 'generated_output'), eq(artifacts.retrievalClass, 'durable'))
					: undefined,
				params.excludeConversationId
					? sql`${artifacts.conversationId} IS NULL OR ${artifacts.conversationId} <> ${params.excludeConversationId}`
					: undefined,
				or(
					like(artifacts.name, queryFragment),
					like(artifacts.summary, queryFragment),
					like(artifacts.contentText, queryFragment)
				)
			)
		)
		.orderBy(desc(artifacts.updatedAt))
		.limit(60);

	return rows
		.map(mapArtifact)
		.map((artifact) => ({
			artifact,
			score: scoreMatch(
				params.query,
				`${artifact.name}\n${artifact.summary ?? ''}\n${artifact.contentText ?? ''}`
			),
		}))
		.filter((entry) => entry.score > 0)
		.sort((left, right) => right.score - left.score)
		.slice(0, params.limit)
		.map((entry) => entry.artifact);
}
