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
	or,
	sql
} from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	artifactLinks,
	artifacts,
	conversationContextStatus,
	conversationWorkingSetItems,
	conversations,
	messages
} from '$lib/server/db/schema';
import type {
	Artifact,
	ArtifactLink,
	ArtifactSummary,
	ArtifactType,
	ChatAttachment,
	ConversationContextStatus,
	ConversationWorkingSetItem,
	MemoryLayer,
	WorkingSetReasonCode,
	WorkCapsule,
} from '$lib/types';
import { extractDocumentText } from './document-extraction';
import {
	deriveConversationArtifactBaseName,
	isPlaceholderConversationTitle,
} from './knowledge-labels';
import {
	rankWorkingSetCandidates,
	scoreMatch,
	WORKING_SET_ACTIVE_LIMIT,
	WORKING_SET_PROMPT_LIMIT,
	type WorkingSetCandidate,
} from './working-set';

export const MAX_MODEL_CONTEXT = 262_144;
export const COMPACTION_UI_THRESHOLD = 209_715;
export const TARGET_CONSTRUCTED_CONTEXT = 157_286;
export const WORKING_SET_PROMPT_TOKEN_BUDGET = 12_000;
export const WORKING_SET_DOCUMENT_TOKEN_BUDGET = 1_500;
export const WORKING_SET_OUTPUT_TOKEN_BUDGET = 2_000;

function parseJsonRecord(value: string | null): Record<string, unknown> | null {
	if (!value) return null;
	try {
		const parsed = JSON.parse(value) as Record<string, unknown>;
		return parsed && typeof parsed === 'object' ? parsed : null;
	} catch {
		return null;
	}
}

function parseJsonStringArray(value: string | null): string[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value) as unknown;
		return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
	} catch {
		return [];
	}
}

function mapArtifactSummary(row: typeof artifacts.$inferSelect): ArtifactSummary {
	return {
		id: row.id,
		type: row.type as ArtifactType,
		name: row.name,
		mimeType: row.mimeType,
		sizeBytes: row.sizeBytes ?? null,
		conversationId: row.conversationId ?? null,
		summary: row.summary ?? null,
		createdAt: row.createdAt.getTime(),
		updatedAt: row.updatedAt.getTime(),
	};
}

function mapArtifact(row: typeof artifacts.$inferSelect): Artifact {
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

function mapContextStatus(row: typeof conversationContextStatus.$inferSelect): ConversationContextStatus {
	return {
		conversationId: row.conversationId,
		userId: row.userId,
		estimatedTokens: row.estimatedTokens,
		maxContextTokens: row.maxContextTokens,
		thresholdTokens: row.thresholdTokens,
		targetTokens: row.targetTokens,
		compactionApplied: row.compactionApplied === 1,
		layersUsed: parseJsonStringArray(row.layersUsedJson) as MemoryLayer[],
		workingSetCount: row.workingSetCount ?? 0,
		workingSetArtifactIds: parseJsonStringArray(row.workingSetArtifactIdsJson),
		workingSetApplied: row.workingSetApplied === 1,
		summary: row.summary ?? null,
		updatedAt: row.updatedAt.getTime(),
	};
}

function mapConversationWorkingSetItem(
	row: typeof conversationWorkingSetItems.$inferSelect
): ConversationWorkingSetItem {
	return {
		id: row.id,
		userId: row.userId,
		conversationId: row.conversationId,
		artifactId: row.artifactId,
		artifactType: row.artifactType as ConversationWorkingSetItem['artifactType'],
		score: row.score,
		state: row.state as ConversationWorkingSetItem['state'],
		reasonCodes: parseJsonStringArray(row.reasonCodesJson) as WorkingSetReasonCode[],
		lastActivatedAt: row.lastActivatedAt ? row.lastActivatedAt.getTime() : null,
		lastUsedAt: row.lastUsedAt ? row.lastUsedAt.getTime() : null,
		createdAt: row.createdAt.getTime(),
		updatedAt: row.updatedAt.getTime(),
	};
}

function fileExtension(name: string): string | null {
	const ext = extname(name).toLowerCase();
	return ext ? ext.slice(1) : null;
}

function knowledgeUserDir(userId: string): string {
	return join(process.cwd(), 'data', 'knowledge', userId);
}

function guessSummary(text: string | null, fallback: string): string {
	const trimmed = (text ?? '').replace(/\s+/g, ' ').trim();
	return trimmed ? trimmed.slice(0, 240) : fallback.slice(0, 240);
}

function safeStem(name: string): string {
	const stem = basename(name, extname(name)).trim();
	return stem.length > 0 ? stem : 'artifact';
}

function hashBinaryBuffer(buffer: Buffer): string {
	return createHash('sha256').update(buffer).digest('hex');
}

async function createArtifact(params: {
	id?: string;
	userId: string;
	conversationId?: string | null;
	type: ArtifactType;
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

	return mapArtifact(artifact);
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

async function getNormalizedArtifactForSource(
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

export async function deleteArtifactForUser(
	userId: string,
	artifactId: string
): Promise<{ deletedArtifactIds: string[] } | null> {
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
	const artifactsToDelete = await db
		.select()
		.from(artifacts)
		.where(and(eq(artifacts.userId, userId), inArray(artifacts.id, ids)));

	await db.transaction(async (tx) => {
		await tx
			.delete(conversationWorkingSetItems)
			.where(
				and(
					eq(conversationWorkingSetItems.userId, userId),
					inArray(conversationWorkingSetItems.artifactId, ids)
				)
			);

		await tx
			.delete(artifactLinks)
			.where(
				and(
					eq(artifactLinks.userId, userId),
					or(
						inArray(artifactLinks.artifactId, ids),
						inArray(artifactLinks.relatedArtifactId, ids)
					)
				)
			);

		await tx
			.delete(artifacts)
			.where(and(eq(artifacts.userId, userId), inArray(artifacts.id, ids)));
	});

	for (const row of artifactsToDelete) {
		if (!row.storagePath) continue;
		try {
			await unlink(join(process.cwd(), row.storagePath));
		} catch {
			// If the file is already gone, the DB deletion is still authoritative.
		}
	}

	return { deletedArtifactIds: ids };
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

export async function listKnowledgeArtifacts(userId: string): Promise<{
	documents: ArtifactSummary[];
	results: ArtifactSummary[];
	workflows: WorkCapsule[];
}> {
	const rows = await db
		.select()
		.from(artifacts)
		.where(eq(artifacts.userId, userId))
		.orderBy(desc(artifacts.updatedAt));

	const documents = rows
		.filter((row) => row.type === 'source_document' || row.type === 'normalized_document')
		.map(mapArtifactSummary);

	const latestGeneratedByConversation = new Map<string, typeof artifacts.$inferSelect>();
	for (const row of rows) {
		if (row.type !== 'generated_output') continue;
		const key = row.conversationId ?? row.id;
		if (!latestGeneratedByConversation.has(key)) {
			latestGeneratedByConversation.set(key, row);
		}
	}

	const workflows = rows
		.filter((row) => row.type === 'work_capsule')
		.map(mapWorkCapsuleFromArtifact);

	return {
		documents,
		results: Array.from(latestGeneratedByConversation.values()).map(mapArtifactSummary),
		workflows,
	};
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

async function listConversationWorkingSetItems(
	userId: string,
	conversationId: string
): Promise<ConversationWorkingSetItem[]> {
	const rows = await db
		.select()
		.from(conversationWorkingSetItems)
		.where(
			and(
				eq(conversationWorkingSetItems.userId, userId),
				eq(conversationWorkingSetItems.conversationId, conversationId)
			)
		)
		.orderBy(desc(conversationWorkingSetItems.score), desc(conversationWorkingSetItems.updatedAt));
	return rows.map(mapConversationWorkingSetItem);
}

export async function getConversationWorkingSet(
	userId: string,
	conversationId: string
): Promise<ArtifactSummary[]> {
	const rows = await db
		.select({
			item: conversationWorkingSetItems,
			artifact: artifacts,
		})
		.from(conversationWorkingSetItems)
		.innerJoin(artifacts, eq(conversationWorkingSetItems.artifactId, artifacts.id))
		.where(
			and(
				eq(conversationWorkingSetItems.userId, userId),
				eq(conversationWorkingSetItems.conversationId, conversationId),
				eq(conversationWorkingSetItems.state, 'active')
			)
		)
		.orderBy(desc(conversationWorkingSetItems.score), desc(conversationWorkingSetItems.updatedAt));

	return rows.map((row) => mapArtifactSummary(row.artifact));
}

export async function selectWorkingSetArtifactsForPrompt(
	userId: string,
	conversationId: string,
	message: string,
	excludeArtifactIds: string[] = []
): Promise<Artifact[]> {
	const exclude = new Set(excludeArtifactIds);
	const rows = await db
		.select({
			item: conversationWorkingSetItems,
			artifact: artifacts,
		})
		.from(conversationWorkingSetItems)
		.innerJoin(artifacts, eq(conversationWorkingSetItems.artifactId, artifacts.id))
		.where(
			and(
				eq(conversationWorkingSetItems.userId, userId),
				eq(conversationWorkingSetItems.conversationId, conversationId),
				eq(conversationWorkingSetItems.state, 'active')
			)
		);

	return rows
		.map((row) => ({
			artifact: mapArtifact(row.artifact),
			score:
				row.item.score +
				scoreMatch(
					message,
					`${row.artifact.name}\n${row.artifact.summary ?? ''}\n${row.artifact.contentText ?? ''}`
				) *
					12,
		}))
		.filter((entry) => !exclude.has(entry.artifact.id))
		.sort((a, b) => b.score - a.score)
		.slice(0, WORKING_SET_PROMPT_LIMIT)
		.map((entry) => entry.artifact);
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
		.where(
			and(
				eq(artifacts.userId, params.userId),
				inArray(artifacts.id, uniqueArtifactIds)
			)
		);

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
				or(
					eq(artifacts.type, 'source_document'),
					eq(artifacts.type, 'normalized_document')
				)
			)
		);
	return Array.from(new Set(rows.map((row) => row.artifactId)));
}

export async function createGeneratedOutputArtifact(params: {
	userId: string;
	conversationId: string;
	messageId: string;
	content: string;
	sourceArtifactIds: string[];
}): Promise<Artifact | null> {
	const trimmed = params.content.trim();
	if (!trimmed) return null;

	const [conversationTitle, latestUserMessage] = await Promise.all([
		db
			.select({ title: conversations.title })
			.from(conversations)
			.where(and(eq(conversations.id, params.conversationId), eq(conversations.userId, params.userId))),
		db
			.select({ content: messages.content })
			.from(messages)
			.where(and(eq(messages.conversationId, params.conversationId), eq(messages.role, 'user')))
			.orderBy(desc(messages.createdAt))
			.limit(1),
	]);
	const artifactBaseName = deriveConversationArtifactBaseName({
		conversationTitle: conversationTitle[0]?.title,
		fallbackText: latestUserMessage[0]?.content,
		defaultLabel: 'Conversation',
	});

	const artifact = await createArtifact({
		userId: params.userId,
		conversationId: params.conversationId,
		type: 'generated_output',
		name: `${artifactBaseName} result`,
		mimeType: 'text/markdown',
		extension: 'md',
		sizeBytes: Buffer.byteLength(trimmed, 'utf8'),
		contentText: trimmed,
		summary: guessSummary(trimmed, trimmed),
		metadata: {
			messageId: params.messageId,
		},
	});

	for (const sourceArtifactId of params.sourceArtifactIds) {
		await createArtifactLink({
			userId: params.userId,
			artifactId: artifact.id,
			relatedArtifactId: sourceArtifactId,
			conversationId: params.conversationId,
			messageId: params.messageId,
			linkType: 'used_in_output',
		});
	}

	return artifact;
}

function mapWorkCapsuleFromArtifact(row: typeof artifacts.$inferSelect): WorkCapsule {
	const metadata = parseJsonRecord(row.metadataJson ?? null);
	return {
		artifact: mapArtifactSummary(row),
		conversationId: row.conversationId ?? null,
		taskSummary: typeof metadata?.taskSummary === 'string' ? metadata.taskSummary : null,
		workflowSummary: typeof metadata?.workflowSummary === 'string' ? metadata.workflowSummary : null,
		keyConclusions: Array.isArray(metadata?.keyConclusions)
			? metadata.keyConclusions.filter((item): item is string => typeof item === 'string')
			: [],
		reusablePatterns: Array.isArray(metadata?.reusablePatterns)
			? metadata.reusablePatterns.filter((item): item is string => typeof item === 'string')
			: [],
		sourceArtifactIds: Array.isArray(metadata?.sourceArtifactIds)
			? metadata.sourceArtifactIds.filter((item): item is string => typeof item === 'string')
			: [],
		outputArtifactIds: Array.isArray(metadata?.outputArtifactIds)
			? metadata.outputArtifactIds.filter((item): item is string => typeof item === 'string')
			: [],
	};
}

export async function upsertWorkCapsule(params: {
	userId: string;
	conversationId: string;
}): Promise<WorkCapsule | null> {
	const [conversation] = await db
		.select()
		.from(conversations)
		.where(and(eq(conversations.id, params.conversationId), eq(conversations.userId, params.userId)));

	if (!conversation) return null;

	const recentMessages = await db
		.select()
		.from(messages)
		.where(eq(messages.conversationId, params.conversationId))
		.orderBy(desc(messages.createdAt))
		.limit(8);

	const sourceArtifactIds = await listConversationSourceArtifactIds(params.userId, params.conversationId);
	const outputArtifacts = await db
		.select()
		.from(artifacts)
		.where(
			and(
				eq(artifacts.userId, params.userId),
				eq(artifacts.conversationId, params.conversationId),
				eq(artifacts.type, 'generated_output')
			)
		)
		.orderBy(desc(artifacts.updatedAt))
		.limit(6);

	const taskSummary = recentMessages
		.filter((message) => message.role === 'user')
		.slice(0, 2)
		.map((message) => message.content.trim())
		.filter(Boolean)
		.join(' ');
	const conversationBaseName = deriveConversationArtifactBaseName({
		conversationTitle: conversation.title,
		fallbackText: taskSummary,
		defaultLabel: 'Conversation',
	});
	const meaningfulConversationTitle = isPlaceholderConversationTitle(conversation.title)
		? null
		: conversation.title.trim();
	const workflowSummary = [
		sourceArtifactIds.length > 0 ? `Used ${sourceArtifactIds.length} source document(s).` : null,
		outputArtifacts.length > 0 ? `Produced ${outputArtifacts.length} saved result(s).` : null,
	].filter(Boolean).join(' ');
	const keyConclusions = [
		meaningfulConversationTitle ? `Project theme: ${meaningfulConversationTitle}` : null,
		sourceArtifactIds.length > 0 ? 'The workflow depends on attached source documents.' : null,
		outputArtifacts.length > 0 ? 'The conversation produced reusable written outputs.' : null,
	].filter((item): item is string => Boolean(item));
	const reusablePatterns = [
		sourceArtifactIds.length > 0 ? 'Start from the existing source set and update with fresh material.' : null,
		outputArtifacts.length > 0 ? 'Reuse prior output structure as a template before rewriting details.' : null,
	].filter((item): item is string => Boolean(item));

	const metadata = {
		taskSummary: taskSummary || meaningfulConversationTitle || conversationBaseName,
		workflowSummary: workflowSummary || 'Conversation generated reusable knowledge.',
		keyConclusions,
		reusablePatterns,
		sourceArtifactIds,
		outputArtifactIds: outputArtifacts.map((artifact) => artifact.id),
	};
	const contentText = [
		`Task: ${metadata.taskSummary}`,
		`Workflow: ${metadata.workflowSummary}`,
		keyConclusions.length > 0 ? `Key conclusions: ${keyConclusions.join(' ')}` : null,
		reusablePatterns.length > 0 ? `Reusable patterns: ${reusablePatterns.join(' ')}` : null,
	].filter(Boolean).join('\n');

	const existing = await db
		.select()
		.from(artifacts)
		.where(
			and(
				eq(artifacts.userId, params.userId),
				eq(artifacts.conversationId, params.conversationId),
				eq(artifacts.type, 'work_capsule')
			)
		)
		.limit(1);

	let row: typeof artifacts.$inferSelect;
	if (existing[0]) {
		const updated = await db
			.update(artifacts)
			.set({
				name: `${safeStem(conversationBaseName)} workflow capsule`,
				contentText,
				summary: guessSummary(contentText, conversationBaseName),
				metadataJson: JSON.stringify(metadata),
				updatedAt: new Date(),
			})
			.where(eq(artifacts.id, existing[0].id))
			.returning();
		row = updated[0];
	} else {
		row = (
			await db
				.insert(artifacts)
				.values({
					id: randomUUID(),
					userId: params.userId,
					conversationId: params.conversationId,
					type: 'work_capsule',
					name: `${safeStem(conversationBaseName)} workflow capsule`,
					mimeType: 'text/plain',
					extension: 'txt',
					contentText,
					summary: guessSummary(contentText, conversationBaseName),
					metadataJson: JSON.stringify(metadata),
					updatedAt: new Date(),
				})
				.returning()
		)[0];
	}

	for (const sourceArtifactId of sourceArtifactIds) {
		await createArtifactLink({
			userId: params.userId,
			artifactId: row.id,
			relatedArtifactId: sourceArtifactId,
			conversationId: params.conversationId,
			linkType: 'captured_by_capsule',
		});
	}
	for (const outputArtifact of outputArtifacts) {
		await createArtifactLink({
			userId: params.userId,
			artifactId: row.id,
			relatedArtifactId: outputArtifact.id,
			conversationId: params.conversationId,
			linkType: 'captured_by_capsule',
		});
	}

	return mapWorkCapsuleFromArtifact(row);
}

async function getConversationWorkCapsule(
	userId: string,
	conversationId: string
): Promise<WorkCapsule | null> {
	const [row] = await db
		.select()
		.from(artifacts)
		.where(
			and(
				eq(artifacts.userId, userId),
				eq(artifacts.conversationId, conversationId),
				eq(artifacts.type, 'work_capsule')
			)
		)
		.orderBy(desc(artifacts.updatedAt))
		.limit(1);
	return row ? mapWorkCapsuleFromArtifact(row) : null;
}

export async function refreshConversationWorkingSet(params: {
	userId: string;
	conversationId: string;
	message?: string;
	attachmentIds?: string[];
	latestOutputArtifactId?: string | null;
}): Promise<ArtifactSummary[]> {
	const attachmentIds = params.attachmentIds ?? [];
	const existingItems = await listConversationWorkingSetItems(params.userId, params.conversationId);
	const workCapsule = await getConversationWorkCapsule(params.userId, params.conversationId);
	const sourceArtifactIds = await listConversationSourceArtifactIds(params.userId, params.conversationId);
	const outputArtifacts = await db
		.select()
		.from(artifacts)
		.where(
			and(
				eq(artifacts.userId, params.userId),
				eq(artifacts.conversationId, params.conversationId),
				eq(artifacts.type, 'generated_output')
			)
		)
		.orderBy(desc(artifacts.updatedAt))
		.limit(8);

	const latestOutputArtifactId =
		params.latestOutputArtifactId ??
		(outputArtifacts.length > 0 ? outputArtifacts[0].id : null);
	const sourceIdsLinkedToLatestOutput = latestOutputArtifactId
		? await db
				.select({ relatedArtifactId: artifactLinks.relatedArtifactId })
				.from(artifactLinks)
				.where(
					and(
						eq(artifactLinks.userId, params.userId),
						eq(artifactLinks.conversationId, params.conversationId),
						eq(artifactLinks.linkType, 'used_in_output'),
						eq(artifactLinks.artifactId, latestOutputArtifactId)
					)
				)
				.then((rows) =>
					rows
						.map((row) => row.relatedArtifactId)
						.filter((value): value is string => typeof value === 'string')
				)
		: [];

	const candidateIds = new Set<string>([
		...existingItems.map((item) => item.artifactId),
		...attachmentIds,
		...sourceArtifactIds,
		...outputArtifacts.map((artifact) => artifact.id),
		...(workCapsule?.sourceArtifactIds ?? []),
		...(workCapsule?.outputArtifactIds ?? []),
	]);

	if (candidateIds.size === 0) {
		return [];
	}

	const artifactRows = await getArtifactsForUser(params.userId, Array.from(candidateIds));
	const existingByArtifactId = new Map(existingItems.map((item) => [item.artifactId, item]));
	const message = params.message?.trim() ?? '';

	const candidates: WorkingSetCandidate[] = artifactRows
		.filter((artifact) => artifact.type !== 'work_capsule')
		.map((artifact) => ({
			artifactId: artifact.id,
			artifactType: artifact.type as WorkingSetCandidate['artifactType'],
			name: artifact.name,
			summary: artifact.summary,
			contentText: artifact.contentText,
			updatedAt: artifact.updatedAt,
			previousScore: existingByArtifactId.get(artifact.id)?.score,
			previousState: existingByArtifactId.get(artifact.id)?.state ?? null,
			isAttachedThisTurn: attachmentIds.includes(artifact.id),
			isLatestGeneratedOutput: latestOutputArtifactId === artifact.id,
			isLinkedToLatestOutput: sourceIdsLinkedToLatestOutput.includes(artifact.id),
			isLinkedFromWorkCapsule:
				(workCapsule?.sourceArtifactIds ?? []).includes(artifact.id) ||
				(workCapsule?.outputArtifactIds ?? []).includes(artifact.id),
			messageMatchScore: message
				? scoreMatch(message, `${artifact.name}\n${artifact.summary ?? ''}\n${artifact.contentText ?? ''}`)
				: 0,
		}));

	const ranked = rankWorkingSetCandidates(candidates);
	const now = new Date();
	const activeIds = new Set(ranked.filter((item) => item.selected).map((item) => item.artifactId));

	for (const candidate of ranked) {
		const existing = existingByArtifactId.get(candidate.artifactId);
		const shouldTouchUsage =
			candidate.reasonCodes.includes('attached_this_turn') ||
			candidate.reasonCodes.includes('matched_current_turn') ||
			candidate.reasonCodes.includes('latest_generated_output') ||
			candidate.reasonCodes.includes('recently_used_in_output');

		if (existing) {
			await db
				.update(conversationWorkingSetItems)
				.set({
					artifactType: candidate.artifactType,
					score: candidate.score,
					state: candidate.state,
					reasonCodesJson: JSON.stringify(candidate.reasonCodes),
					lastActivatedAt: candidate.selected ? now : existing.lastActivatedAt ? new Date(existing.lastActivatedAt) : null,
					lastUsedAt: shouldTouchUsage ? now : existing.lastUsedAt ? new Date(existing.lastUsedAt) : null,
					updatedAt: now,
				})
				.where(eq(conversationWorkingSetItems.id, existing.id));
			continue;
		}

		if (candidate.score <= 0) {
			continue;
		}

		await db.insert(conversationWorkingSetItems).values({
			id: randomUUID(),
			userId: params.userId,
			conversationId: params.conversationId,
			artifactId: candidate.artifactId,
			artifactType: candidate.artifactType,
			score: candidate.score,
			state: candidate.state,
			reasonCodesJson: JSON.stringify(candidate.reasonCodes),
			lastActivatedAt: candidate.selected ? now : null,
			lastUsedAt: shouldTouchUsage ? now : null,
			updatedAt: now,
		});
	}

	const refreshed = await getConversationWorkingSet(params.userId, params.conversationId);
	return refreshed
		.filter((artifact) => activeIds.has(artifact.id))
		.slice(0, WORKING_SET_ACTIVE_LIMIT);
}

export async function updateConversationContextStatus(params: {
	conversationId: string;
	userId: string;
	estimatedTokens: number;
	compactionApplied: boolean;
	layersUsed: MemoryLayer[];
	workingSetCount?: number;
	workingSetArtifactIds?: string[];
	workingSetApplied?: boolean;
	summary?: string | null;
}): Promise<ConversationContextStatus> {
	const [row] = await db
		.insert(conversationContextStatus)
		.values({
			conversationId: params.conversationId,
			userId: params.userId,
			estimatedTokens: params.estimatedTokens,
			maxContextTokens: MAX_MODEL_CONTEXT,
			thresholdTokens: COMPACTION_UI_THRESHOLD,
			targetTokens: TARGET_CONSTRUCTED_CONTEXT,
			compactionApplied: params.compactionApplied ? 1 : 0,
			layersUsedJson: JSON.stringify(params.layersUsed),
			workingSetCount: params.workingSetCount ?? 0,
			workingSetArtifactIdsJson: JSON.stringify(params.workingSetArtifactIds ?? []),
			workingSetApplied: params.workingSetApplied ? 1 : 0,
			summary: params.summary ?? null,
			updatedAt: new Date(),
		})
		.onConflictDoUpdate({
			target: conversationContextStatus.conversationId,
			set: {
				userId: params.userId,
				estimatedTokens: params.estimatedTokens,
				maxContextTokens: MAX_MODEL_CONTEXT,
				thresholdTokens: COMPACTION_UI_THRESHOLD,
					targetTokens: TARGET_CONSTRUCTED_CONTEXT,
					compactionApplied: params.compactionApplied ? 1 : 0,
					layersUsedJson: JSON.stringify(params.layersUsed),
					workingSetCount: params.workingSetCount ?? 0,
					workingSetArtifactIdsJson: JSON.stringify(params.workingSetArtifactIds ?? []),
					workingSetApplied: params.workingSetApplied ? 1 : 0,
					summary: params.summary ?? null,
					updatedAt: new Date(),
				},
		})
		.returning();

	return mapContextStatus(row);
}

export async function getConversationContextStatus(
	userId: string,
	conversationId: string
): Promise<ConversationContextStatus | null> {
	const [row] = await db
		.select()
		.from(conversationContextStatus)
		.where(
			and(
				eq(conversationContextStatus.userId, userId),
				eq(conversationContextStatus.conversationId, conversationId)
			)
		);
	return row ? mapContextStatus(row) : null;
}

async function findRelevantArtifacts(params: {
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
			score: scoreMatch(params.query, `${artifact.name}\n${artifact.summary ?? ''}\n${artifact.contentText ?? ''}`),
		}))
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, params.limit)
		.map((entry) => entry.artifact);
}

export async function findRelevantWorkCapsules(
	userId: string,
	query: string,
	excludeConversationId?: string,
	limit = 3
): Promise<WorkCapsule[]> {
	const artifactsFound = await findRelevantArtifacts({
		userId,
		query,
		types: ['work_capsule'],
		limit,
		excludeConversationId,
	});
	return artifactsFound.map((artifact) => ({
		artifact: {
			id: artifact.id,
			type: artifact.type,
			name: artifact.name,
			mimeType: artifact.mimeType,
			sizeBytes: artifact.sizeBytes,
			conversationId: artifact.conversationId,
			summary: artifact.summary,
			createdAt: artifact.createdAt,
			updatedAt: artifact.updatedAt,
		},
		conversationId: artifact.conversationId,
		taskSummary: typeof artifact.metadata?.taskSummary === 'string' ? artifact.metadata.taskSummary : null,
		workflowSummary: typeof artifact.metadata?.workflowSummary === 'string' ? artifact.metadata.workflowSummary : null,
		keyConclusions: Array.isArray(artifact.metadata?.keyConclusions)
			? artifact.metadata.keyConclusions.filter((item): item is string => typeof item === 'string')
			: [],
		reusablePatterns: Array.isArray(artifact.metadata?.reusablePatterns)
			? artifact.metadata.reusablePatterns.filter((item): item is string => typeof item === 'string')
			: [],
		sourceArtifactIds: Array.isArray(artifact.metadata?.sourceArtifactIds)
			? artifact.metadata.sourceArtifactIds.filter((item): item is string => typeof item === 'string')
			: [],
		outputArtifactIds: Array.isArray(artifact.metadata?.outputArtifactIds)
			? artifact.metadata.outputArtifactIds.filter((item): item is string => typeof item === 'string')
			: [],
	}));
}

export async function findRelevantKnowledgeArtifacts(
	userId: string,
	query: string,
	excludeConversationId?: string,
	limit = 6
): Promise<Artifact[]> {
	return findRelevantArtifacts({
		userId,
		query,
		types: ['source_document', 'normalized_document', 'generated_output'],
		limit,
		excludeConversationId,
	});
}
