import { randomUUID } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	artifactLinks,
	artifacts,
	conversationContextStatus,
	conversationWorkingSetItems,
} from '$lib/server/db/schema';
import type {
	Artifact,
	ArtifactSummary,
	CompactionMode,
	ConversationContextStatus,
	ConversationWorkingSetItem,
	MemoryLayer,
	WorkingSetReasonCode,
} from '$lib/types';
import { parseJsonStringArray } from '$lib/server/utils/json';
import { ensureGeneratedOutputRetrievalBackfill } from '../evidence-family';
import {
	rankWorkingSetCandidates,
	scoreMatch,
	WORKING_SET_ACTIVE_LIMIT,
	WORKING_SET_PROMPT_LIMIT,
	type WorkingSetCandidate,
} from '../working-set';
import { getConversationWorkCapsule } from './capsules';
import {
	COMPACTION_UI_THRESHOLD,
	MAX_MODEL_CONTEXT,
	TARGET_CONSTRUCTED_CONTEXT,
	findRelevantArtifactsByTypes,
	getArtifactsForUser,
	listConversationSourceArtifactIds,
	mapArtifact,
	mapArtifactSummary,
} from './store';

function mapContextStatus(row: typeof conversationContextStatus.$inferSelect): ConversationContextStatus {
	return {
		conversationId: row.conversationId,
		userId: row.userId,
		estimatedTokens: row.estimatedTokens,
		maxContextTokens: row.maxContextTokens,
		thresholdTokens: row.thresholdTokens,
		targetTokens: row.targetTokens,
		compactionApplied: row.compactionApplied === 1,
		compactionMode: (row.compactionMode ?? 'none') as CompactionMode,
		routingStage: (row.routingStage ?? 'deterministic') as ConversationContextStatus['routingStage'],
		routingConfidence: row.routingConfidence ?? 0,
		verificationStatus: (row.verificationStatus ?? 'skipped') as ConversationContextStatus['verificationStatus'],
		layersUsed: parseJsonStringArray(row.layersUsedJson) as MemoryLayer[],
		workingSetCount: row.workingSetCount ?? 0,
		workingSetArtifactIds: parseJsonStringArray(row.workingSetArtifactIdsJson),
		workingSetApplied: row.workingSetApplied === 1,
		taskStateApplied: row.taskStateApplied === 1,
		promptArtifactCount: row.promptArtifactCount ?? 0,
		recentTurnCount: row.recentTurnCount ?? 0,
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
	await ensureGeneratedOutputRetrievalBackfill(userId);

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
		.map((row) => {
			const artifact = mapArtifact(row.artifact);
			const messageMatchScore = scoreMatch(
				message,
				`${row.artifact.name}\n${row.artifact.summary ?? ''}\n${row.artifact.contentText ?? ''}`
			);
			const reasonCodes = parseJsonStringArray(row.item.reasonCodesJson) as WorkingSetReasonCode[];
			const explicitlyRequested =
				scoreMatch(message, row.artifact.name) > 0 ||
				scoreMatch(message, row.artifact.summary ?? '') > 1;
			const retrievalClass = (row.artifact.retrievalClass ?? 'durable') as Artifact['retrievalClass'];
			const allowEphemeralOutput =
				artifact.type === 'generated_output' &&
				artifact.conversationId === conversationId &&
				reasonCodes.includes('latest_generated_output');
			const promptEligible =
				(artifact.type !== 'generated_output' || retrievalClass === 'durable' || allowEphemeralOutput) &&
				(reasonCodes.includes('attached_this_turn') ||
					messageMatchScore >= 2 ||
					explicitlyRequested ||
					(reasonCodes.includes('latest_generated_output') && messageMatchScore >= 1) ||
					(reasonCodes.includes('recently_used_in_output') && messageMatchScore >= 1));

			return {
				artifact,
				promptEligible,
				score: row.item.score + messageMatchScore * 14 + (explicitlyRequested ? 14 : 0),
			};
		})
		.filter((entry) => !exclude.has(entry.artifact.id))
		.filter((entry) => entry.promptEligible)
		.sort((left, right) => right.score - left.score)
		.slice(0, WORKING_SET_PROMPT_LIMIT)
		.map((entry) => entry.artifact);
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
		params.latestOutputArtifactId ?? (outputArtifacts.length > 0 ? outputArtifacts[0].id : null);
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
					lastActivatedAt: candidate.selected
						? now
						: existing.lastActivatedAt
							? new Date(existing.lastActivatedAt)
							: null,
					lastUsedAt: shouldTouchUsage
						? now
						: existing.lastUsedAt
							? new Date(existing.lastUsedAt)
							: null,
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
	compactionMode?: CompactionMode;
	routingStage?: ConversationContextStatus['routingStage'];
	routingConfidence?: number;
	verificationStatus?: ConversationContextStatus['verificationStatus'];
	layersUsed: MemoryLayer[];
	workingSetCount?: number;
	workingSetArtifactIds?: string[];
	workingSetApplied?: boolean;
	taskStateApplied?: boolean;
	promptArtifactCount?: number;
	recentTurnCount?: number;
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
			compactionMode: params.compactionMode ?? 'none',
			routingStage: params.routingStage ?? 'deterministic',
			routingConfidence: Math.round(params.routingConfidence ?? 0),
			verificationStatus: params.verificationStatus ?? 'skipped',
			layersUsedJson: JSON.stringify(params.layersUsed),
			workingSetCount: params.workingSetCount ?? 0,
			workingSetArtifactIdsJson: JSON.stringify(params.workingSetArtifactIds ?? []),
			workingSetApplied: params.workingSetApplied ? 1 : 0,
			taskStateApplied: params.taskStateApplied ? 1 : 0,
			promptArtifactCount: params.promptArtifactCount ?? 0,
			recentTurnCount: params.recentTurnCount ?? 0,
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
				compactionMode: params.compactionMode ?? 'none',
				routingStage: params.routingStage ?? 'deterministic',
				routingConfidence: Math.round(params.routingConfidence ?? 0),
				verificationStatus: params.verificationStatus ?? 'skipped',
				layersUsedJson: JSON.stringify(params.layersUsed),
				workingSetCount: params.workingSetCount ?? 0,
				workingSetArtifactIdsJson: JSON.stringify(params.workingSetArtifactIds ?? []),
				workingSetApplied: params.workingSetApplied ? 1 : 0,
				taskStateApplied: params.taskStateApplied ? 1 : 0,
				promptArtifactCount: params.promptArtifactCount ?? 0,
				recentTurnCount: params.recentTurnCount ?? 0,
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

export async function findRelevantKnowledgeArtifacts(
	userId: string,
	query: string,
	excludeConversationId?: string,
	limit = 6
): Promise<Artifact[]> {
	await ensureGeneratedOutputRetrievalBackfill(userId);

	return findRelevantArtifactsByTypes({
		userId,
		query,
		types: ['normalized_document', 'generated_output'],
		limit,
		excludeConversationId,
	});
}
