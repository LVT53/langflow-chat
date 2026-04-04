import type { DocumentWorkspaceItem, KnowledgeVaultSearchResult } from '$lib/types';

const KNOWLEDGE_WORKSPACE_ARTIFACT_PARAM = 'open_artifact';
const KNOWLEDGE_WORKSPACE_FILENAME_PARAM = 'open_filename';
const KNOWLEDGE_WORKSPACE_MIMETYPE_PARAM = 'open_mime';

export function buildKnowledgeWorkspaceHref(params: {
	artifactId: string;
	filename: string;
	mimeType?: string | null;
}): string {
	const url = new URL('/knowledge', 'http://localhost');
	url.searchParams.set(KNOWLEDGE_WORKSPACE_ARTIFACT_PARAM, params.artifactId);
	url.searchParams.set(KNOWLEDGE_WORKSPACE_FILENAME_PARAM, params.filename);
	if (params.mimeType) {
		url.searchParams.set(KNOWLEDGE_WORKSPACE_MIMETYPE_PARAM, params.mimeType);
	}
	return `${url.pathname}${url.search}`;
}

export function buildKnowledgeWorkspaceHrefFromSearchResult(
	result: KnowledgeVaultSearchResult
): string {
	return buildKnowledgeWorkspaceHref({
		artifactId: result.promptArtifactId ?? result.displayArtifactId,
		filename: result.name,
		mimeType: result.mimeType,
	});
}

export function getKnowledgeWorkspaceDocumentFromUrl(url: URL): DocumentWorkspaceItem | null {
	const artifactId = url.searchParams.get(KNOWLEDGE_WORKSPACE_ARTIFACT_PARAM)?.trim();
	const filename = url.searchParams.get(KNOWLEDGE_WORKSPACE_FILENAME_PARAM)?.trim();
	if (!artifactId || !filename) return null;

	const mimeType = url.searchParams.get(KNOWLEDGE_WORKSPACE_MIMETYPE_PARAM)?.trim() || null;

	return {
		id: `artifact:${artifactId}`,
		source: 'knowledge_artifact',
		filename,
		title: filename,
		mimeType,
		artifactId,
	};
}

export function clearKnowledgeWorkspaceParams(url: URL): URL {
	const nextUrl = new URL(url);
	nextUrl.searchParams.delete(KNOWLEDGE_WORKSPACE_ARTIFACT_PARAM);
	nextUrl.searchParams.delete(KNOWLEDGE_WORKSPACE_FILENAME_PARAM);
	nextUrl.searchParams.delete(KNOWLEDGE_WORKSPACE_MIMETYPE_PARAM);
	return nextUrl;
}
