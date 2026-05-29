import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Artifact } from '$lib/types';
import { db } from '$lib/server/db';
import { artifacts } from '$lib/server/db/schema';
import { parseJsonRecord } from '$lib/server/utils/json';
import {
	createArtifact,
	mapArtifact,
} from '$lib/server/services/knowledge/store/core';
import {
	buildGeneratedDocumentProjection,
	validateGeneratedDocumentSource,
	type GeneratedDocumentSource,
} from './source-schema';

export interface PersistGeneratedDocumentSourceInput {
	userId: string;
	conversationId: string;
	assistantMessageId?: string | null;
	fileProductionJobId: string;
	title: string;
	documentIntent?: string | null;
	source: unknown;
}

export const GENERATED_DOCUMENT_RENDERED_CHAT_FILE_IDS_KEY =
	'generatedDocumentRenderedChatFileIds';

function readStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.filter((item): item is string => typeof item === 'string')
		.map((item) => item.trim())
		.filter(Boolean);
}

async function findGeneratedDocumentSourceArtifactForJob(input: {
	userId: string;
	conversationId: string;
	fileProductionJobId: string;
}): Promise<Artifact | null> {
	const rows = await db
		.select()
		.from(artifacts)
		.where(
			and(
				eq(artifacts.userId, input.userId),
				eq(artifacts.conversationId, input.conversationId),
				eq(artifacts.type, 'generated_output'),
			),
		);

	const existing = rows.find((row) => {
		const metadata = parseJsonRecord(row.metadataJson ?? null);
		return metadata?.fileProductionJobId === input.fileProductionJobId;
	});

	return existing ? mapArtifact(existing) : null;
}

export async function persistGeneratedDocumentSourceArtifact(
	input: PersistGeneratedDocumentSourceInput
): Promise<Artifact> {
	const validation = validateGeneratedDocumentSource(input.source);
	if (!validation.ok) {
		throw new Error(validation.message);
	}

	const source: GeneratedDocumentSource = validation.source;
	const projection = buildGeneratedDocumentProjection(source);
	const existing = await findGeneratedDocumentSourceArtifactForJob({
		userId: input.userId,
		conversationId: input.conversationId,
		fileProductionJobId: input.fileProductionJobId,
	});
	if (existing) {
		return existing;
	}

	const artifactId = randomUUID();

	return createArtifact({
		id: artifactId,
		userId: input.userId,
		conversationId: input.conversationId,
		type: 'generated_output',
		retrievalClass: 'durable',
		name: input.title,
		mimeType: 'application/vnd.alfyai.generated-document+json',
		extension: 'alfyidoc.json',
		contentText: projection,
		summary: source.subtitle ?? source.title,
		metadata: {
			generatedDocumentSourceVersion: source.version,
			generatedDocumentSource: source,
			fileProductionJobId: input.fileProductionJobId,
			originConversationId: input.conversationId,
			originAssistantMessageId: input.assistantMessageId ?? null,
			documentOrigin: 'generated',
			documentFamilyId: artifactId,
			documentFamilyStatus: 'active',
			documentLabel: source.title,
			documentRole: input.documentIntent ?? null,
			versionNumber: 1,
			template: source.template,
		},
	});
}

export async function attachGeneratedDocumentSourceArtifactToRenderedFiles(input: {
	artifactId: string;
	renderedChatFileIds: string[];
}): Promise<Artifact | null> {
	const renderedChatFileIds = Array.from(
		new Set(input.renderedChatFileIds.map((id) => id.trim()).filter(Boolean)),
	);
	if (renderedChatFileIds.length === 0) {
		return null;
	}

	const [row] = await db
		.select()
		.from(artifacts)
		.where(eq(artifacts.id, input.artifactId))
		.limit(1);
	if (!row) {
		return null;
	}

	const metadata = parseJsonRecord(row.metadataJson ?? null) ?? {};
	const existingRenderedIds = readStringArray(
		metadata[GENERATED_DOCUMENT_RENDERED_CHAT_FILE_IDS_KEY],
	);
	const nextRenderedIds = Array.from(
		new Set([...existingRenderedIds, ...renderedChatFileIds]),
	);
	const firstRenderedChatFileId =
		typeof metadata.originalChatFileId === 'string' &&
		metadata.originalChatFileId.trim()
			? metadata.originalChatFileId.trim()
			: nextRenderedIds[0];
	const sourceChatFileId =
		typeof metadata.sourceChatFileId === 'string' &&
		metadata.sourceChatFileId.trim()
			? metadata.sourceChatFileId.trim()
			: firstRenderedChatFileId;

	const [updated] = await db
		.update(artifacts)
		.set({
			metadataJson: JSON.stringify({
				...metadata,
				originalChatFileId: firstRenderedChatFileId,
				sourceChatFileId,
				[GENERATED_DOCUMENT_RENDERED_CHAT_FILE_IDS_KEY]: nextRenderedIds,
			}),
			updatedAt: new Date(),
		})
		.where(eq(artifacts.id, input.artifactId))
		.returning();

	return updated ? mapArtifact(updated) : null;
}
