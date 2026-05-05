import type { Artifact } from '$lib/types';
import { createArtifact } from '$lib/server/services/knowledge/store/core';
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
	source: unknown;
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

	return createArtifact({
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
			template: source.template,
		},
	});
}
