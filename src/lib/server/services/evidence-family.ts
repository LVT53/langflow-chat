import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { artifactLinks, artifacts, taskStateEvidenceLinks } from '$lib/server/db/schema';
import type { Artifact, ArtifactRetrievalClass } from '$lib/types';

const generatedOutputBackfillDone = new Set<string>();
const generatedOutputBackfillInFlight = new Map<string, Promise<void>>();
const WORKFLOW_HINT_RE =
	/\b(workflow|process|history|previous|earlier|before|draft|result|output|summary|version)\b/i;

function normalizeSimilarityText(text: string): string {
	return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildShingles(text: string, size = 5): Set<string> {
	const words = normalizeSimilarityText(text).split(/\s+/).filter(Boolean);
	if (words.length === 0) return new Set();
	if (words.length <= size) return new Set([words.join(' ')]);

	const shingles = new Set<string>();
	for (let index = 0; index <= words.length - size; index += 1) {
		shingles.add(words.slice(index, index + size).join(' '));
	}
	return shingles;
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
	if (left.size === 0 || right.size === 0) return 0;
	let intersection = 0;
	for (const value of left) {
		if (right.has(value)) intersection += 1;
	}
	const union = left.size + right.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

export function areNearDuplicateArtifactTexts(left: string, right: string): boolean {
	const normalizedLeft = normalizeSimilarityText(left);
	const normalizedRight = normalizeSimilarityText(right);
	if (!normalizedLeft || !normalizedRight) return false;
	if (normalizedLeft === normalizedRight) return true;

	const leftShingles = buildShingles(normalizedLeft);
	const rightShingles = buildShingles(normalizedRight);
	if (leftShingles.size === 0 || rightShingles.size === 0) return false;

	return jaccardSimilarity(leftShingles, rightShingles) >= 0.82;
}

export function prefersWorkflowEvidence(query: string): boolean {
	return WORKFLOW_HINT_RE.test(query);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
	return Array.from(
		new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))
	);
}

async function loadFamilyContext(params: {
	userId: string;
	artifacts: Artifact[];
}): Promise<{
	derivedMap: Map<string, string>;
	usedByArtifactId: Map<string, string[]>;
}> {
	const metadataSourceIds = params.artifacts.flatMap((artifact) => {
		const sourceIds = Array.isArray(artifact.metadata?.sourceArtifactIds)
			? artifact.metadata.sourceArtifactIds.filter((value): value is string => typeof value === 'string')
			: [];
		const outputIds = Array.isArray(artifact.metadata?.outputArtifactIds)
			? artifact.metadata.outputArtifactIds.filter((value): value is string => typeof value === 'string')
			: [];
		return [...sourceIds, ...outputIds];
	});

	const initialIds = uniqueStrings([...params.artifacts.map((artifact) => artifact.id), ...metadataSourceIds]);
	if (initialIds.length === 0) {
		return { derivedMap: new Map(), usedByArtifactId: new Map() };
	}

	const usedRows = await db
		.select({
			artifactId: artifactLinks.artifactId,
			relatedArtifactId: artifactLinks.relatedArtifactId,
		})
		.from(artifactLinks)
		.where(
			and(
				eq(artifactLinks.userId, params.userId),
				inArray(artifactLinks.artifactId, initialIds),
				eq(artifactLinks.linkType, 'used_in_output')
			)
		);

	const idsForDerived = uniqueStrings([
		...initialIds,
		...usedRows.map((row) => row.relatedArtifactId ?? null),
	]);
	const derivedRows =
		idsForDerived.length === 0
			? []
			: await db
					.select({
						artifactId: artifactLinks.artifactId,
						relatedArtifactId: artifactLinks.relatedArtifactId,
					})
					.from(artifactLinks)
					.where(
						and(
							eq(artifactLinks.userId, params.userId),
							inArray(artifactLinks.artifactId, idsForDerived),
							eq(artifactLinks.linkType, 'derived_from')
						)
					);

	const derivedMap = new Map<string, string>();
	for (const row of derivedRows) {
		if (row.relatedArtifactId) {
			derivedMap.set(row.artifactId, row.relatedArtifactId);
		}
	}

	const usedByArtifactId = new Map<string, string[]>();
	for (const row of usedRows) {
		if (!row.relatedArtifactId) continue;
		const values = usedByArtifactId.get(row.artifactId) ?? [];
		values.push(row.relatedArtifactId);
		usedByArtifactId.set(row.artifactId, values);
	}

	return { derivedMap, usedByArtifactId };
}

function baseArtifactId(artifactId: string, derivedMap: Map<string, string>): string {
	return derivedMap.get(artifactId) ?? artifactId;
}

function resolveGeneratedOutputMembers(
	artifactId: string,
	usedByArtifactId: Map<string, string[]>,
	derivedMap: Map<string, string>
): string[] {
	const relatedIds = usedByArtifactId.get(artifactId) ?? [];
	if (relatedIds.length === 0) {
		return [artifactId];
	}
	return uniqueStrings(relatedIds.map((value) => baseArtifactId(value, derivedMap))).sort();
}

export async function resolveArtifactFamilyKeys(
	userId: string,
	artifactList: Artifact[]
): Promise<Map<string, string>> {
	const { derivedMap, usedByArtifactId } = await loadFamilyContext({ userId, artifacts: artifactList });
	const keys = new Map<string, string>();

	for (const artifact of artifactList) {
		let key = `${artifact.type}:${artifact.id}`;

		if (artifact.type === 'source_document') {
			key = `source:${artifact.id}`;
		} else if (artifact.type === 'normalized_document') {
			key = `source:${baseArtifactId(artifact.id, derivedMap)}`;
		} else if (artifact.type === 'generated_output') {
			key = `output:${resolveGeneratedOutputMembers(artifact.id, usedByArtifactId, derivedMap).join('|')}`;
		} else if (artifact.type === 'work_capsule') {
			const sourceIds = Array.isArray(artifact.metadata?.sourceArtifactIds)
				? artifact.metadata.sourceArtifactIds.filter((value): value is string => typeof value === 'string')
				: [];
			const outputIds = Array.isArray(artifact.metadata?.outputArtifactIds)
				? artifact.metadata.outputArtifactIds.filter((value): value is string => typeof value === 'string')
				: [];
			const members = uniqueStrings([
				...sourceIds.map((value) => baseArtifactId(value, derivedMap)),
				...outputIds.flatMap((value) =>
					resolveGeneratedOutputMembers(value, usedByArtifactId, derivedMap)
				),
			]).sort();
			key = members.length > 0 ? `capsule:${members.join('|')}` : `capsule:${artifact.conversationId ?? artifact.id}`;
		}

		keys.set(artifact.id, key);
	}

	return keys;
}

function compareFamilyRepresentative(params: {
	query: string;
	conversationId: string;
	left: Artifact;
	right: Artifact;
}): number {
	const preferWorkflow = prefersWorkflowEvidence(params.query);
	const leftPinnedConversation = params.left.conversationId === params.conversationId ? 1 : 0;
	const rightPinnedConversation = params.right.conversationId === params.conversationId ? 1 : 0;
	if (leftPinnedConversation !== rightPinnedConversation) {
		return rightPinnedConversation - leftPinnedConversation;
	}

	const leftDurable = params.left.retrievalClass === 'durable' ? 1 : 0;
	const rightDurable = params.right.retrievalClass === 'durable' ? 1 : 0;
	if (leftDurable !== rightDurable) {
		return rightDurable - leftDurable;
	}

	const artifactTypeRank = (artifact: Artifact): number => {
		if (preferWorkflow) {
			if (artifact.type === 'generated_output') return 0;
			if (artifact.type === 'normalized_document') return 1;
			if (artifact.type === 'source_document') return 2;
			return 3;
		}
		if (artifact.type === 'source_document') return 0;
		if (artifact.type === 'normalized_document') return 1;
		if (artifact.type === 'generated_output') return 2;
		return 3;
	};

	const leftTypeRank = artifactTypeRank(params.left);
	const rightTypeRank = artifactTypeRank(params.right);
	if (leftTypeRank !== rightTypeRank) {
		return leftTypeRank - rightTypeRank;
	}

	return params.right.updatedAt - params.left.updatedAt;
}

export async function collapseArtifactsByFamily(params: {
	userId: string;
	conversationId: string;
	query: string;
	artifacts: Artifact[];
	pinnedIds?: Set<string>;
	currentAttachmentIds?: Set<string>;
}): Promise<Artifact[]> {
	if (params.artifacts.length <= 1) return params.artifacts;

	const pinnedIds = params.pinnedIds ?? new Set<string>();
	const currentAttachmentIds = params.currentAttachmentIds ?? new Set<string>();
	const familyKeys = await resolveArtifactFamilyKeys(params.userId, params.artifacts);
	const preserved: Artifact[] = [];
	const grouped = new Map<string, Artifact[]>();

	for (const artifact of params.artifacts) {
		if (pinnedIds.has(artifact.id) || currentAttachmentIds.has(artifact.id)) {
			preserved.push(artifact);
			continue;
		}

		const familyKey = familyKeys.get(artifact.id) ?? `${artifact.type}:${artifact.id}`;
		const items = grouped.get(familyKey) ?? [];
		items.push(artifact);
		grouped.set(familyKey, items);
	}

	const representatives = Array.from(grouped.values()).map((items) =>
		items
			.slice()
			.sort((left, right) =>
				compareFamilyRepresentative({
					query: params.query,
					conversationId: params.conversationId,
					left,
					right,
				})
			)[0]
	);

	return Array.from(new Map([...preserved, ...representatives].map((artifact) => [artifact.id, artifact])).values());
}

async function setArtifactRetrievalClass(
	artifactId: string,
	retrievalClass: ArtifactRetrievalClass
): Promise<void> {
	await db
		.update(artifacts)
		.set({
			retrievalClass,
			updatedAt: new Date(),
		})
		.where(eq(artifacts.id, artifactId));
}

async function backfillGeneratedOutputRetrievalClasses(userId: string): Promise<void> {
	const rows = await db
		.select()
		.from(artifacts)
		.where(and(eq(artifacts.userId, userId), eq(artifacts.type, 'generated_output')))
		.orderBy(desc(artifacts.updatedAt));

	const outputs = rows.map((row) => ({
		...row,
		retrievalClass: (row.retrievalClass ?? 'durable') as ArtifactRetrievalClass,
	}));
	if (outputs.length === 0) return;

	const artifactObjects = outputs.map((row) => ({
		id: row.id,
		userId: row.userId,
		conversationId: row.conversationId ?? null,
		type: row.type as Artifact['type'],
		retrievalClass: (row.retrievalClass ?? 'durable') as ArtifactRetrievalClass,
		name: row.name,
		mimeType: row.mimeType ?? null,
		sizeBytes: row.sizeBytes ?? null,
		extension: row.extension ?? null,
		storagePath: row.storagePath ?? null,
		contentText: row.contentText ?? null,
		summary: row.summary ?? null,
		metadata:
			row.metadataJson && typeof row.metadataJson === 'string'
				? (JSON.parse(row.metadataJson) as Record<string, unknown>)
				: null,
		createdAt: row.createdAt.getTime(),
		updatedAt: row.updatedAt.getTime(),
	})) satisfies Artifact[];

	const pinnedRows = await db
		.select({ artifactId: taskStateEvidenceLinks.artifactId })
		.from(taskStateEvidenceLinks)
		.where(
			and(
				eq(taskStateEvidenceLinks.userId, userId),
				eq(taskStateEvidenceLinks.role, 'pinned'),
				eq(taskStateEvidenceLinks.origin, 'user')
			)
		);
	const pinnedIds = new Set(pinnedRows.map((row) => row.artifactId));
	const familyKeys = await resolveArtifactFamilyKeys(userId, artifactObjects);
	const byFamily = new Map<string, Artifact[]>();

	for (const artifact of artifactObjects) {
		const familyKey = familyKeys.get(artifact.id) ?? artifact.id;
		const items = byFamily.get(familyKey) ?? [];
		items.push(artifact);
		byFamily.set(familyKey, items);
	}

	for (const items of byFamily.values()) {
		const kept: Artifact[] = [];
		for (const artifact of items.sort((left, right) => right.updatedAt - left.updatedAt)) {
			let nextClass: ArtifactRetrievalClass = 'durable';
			if (!pinnedIds.has(artifact.id)) {
				const duplicateOfKept = kept.some((existing) =>
					areNearDuplicateArtifactTexts(
						artifact.contentText ?? artifact.summary ?? '',
						existing.contentText ?? existing.summary ?? ''
					)
				);
				if (duplicateOfKept) {
					nextClass = 'archived_duplicate';
				}
			}

			if (nextClass === 'durable') {
				kept.push({ ...artifact, retrievalClass: nextClass });
			}

			if (artifact.retrievalClass !== nextClass) {
				await setArtifactRetrievalClass(artifact.id, nextClass);
			}
		}
	}
}

export async function ensureGeneratedOutputRetrievalBackfill(userId: string): Promise<void> {
	if (generatedOutputBackfillDone.has(userId)) return;
	const running = generatedOutputBackfillInFlight.get(userId);
	if (running) {
		await running;
		return;
	}

	const promise = backfillGeneratedOutputRetrievalClasses(userId)
		.then(() => {
			generatedOutputBackfillDone.add(userId);
		})
		.finally(() => {
			generatedOutputBackfillInFlight.delete(userId);
		});
	generatedOutputBackfillInFlight.set(userId, promise);
	await promise;
}

export async function classifyGeneratedOutputArtifact(params: {
	userId: string;
	artifact: Artifact;
}): Promise<ArtifactRetrievalClass> {
	await ensureGeneratedOutputRetrievalBackfill(params.userId);

	const rows = await db
		.select()
		.from(artifacts)
		.where(and(eq(artifacts.userId, params.userId), eq(artifacts.type, 'generated_output')))
		.orderBy(desc(artifacts.updatedAt));

	const candidates = rows
		.filter((row) => row.id !== params.artifact.id && (row.retrievalClass ?? 'durable') === 'durable')
		.map((row) => ({
			id: row.id,
			userId: row.userId,
			conversationId: row.conversationId ?? null,
			type: row.type as Artifact['type'],
			retrievalClass: (row.retrievalClass ?? 'durable') as ArtifactRetrievalClass,
			name: row.name,
			mimeType: row.mimeType ?? null,
			sizeBytes: row.sizeBytes ?? null,
			extension: row.extension ?? null,
			storagePath: row.storagePath ?? null,
			contentText: row.contentText ?? null,
			summary: row.summary ?? null,
			metadata:
				row.metadataJson && typeof row.metadataJson === 'string'
					? (JSON.parse(row.metadataJson) as Record<string, unknown>)
					: null,
			createdAt: row.createdAt.getTime(),
			updatedAt: row.updatedAt.getTime(),
		})) satisfies Artifact[];

	if (candidates.length === 0) return 'durable';

	const familyKeys = await resolveArtifactFamilyKeys(params.userId, [params.artifact, ...candidates]);
	const targetFamily = familyKeys.get(params.artifact.id);
	if (!targetFamily) return 'durable';

	const latestDurable = candidates
		.filter((artifact) => familyKeys.get(artifact.id) === targetFamily)
		.sort((left, right) => right.updatedAt - left.updatedAt)[0];

	if (!latestDurable) return 'durable';

	return areNearDuplicateArtifactTexts(
		params.artifact.contentText ?? params.artifact.summary ?? '',
		latestDurable.contentText ?? latestDurable.summary ?? ''
	)
		? 'ephemeral_followup'
		: 'durable';
}
