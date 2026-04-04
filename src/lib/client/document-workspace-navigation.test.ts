import { describe, expect, it } from 'vitest';
import {
	buildKnowledgeWorkspaceHref,
	buildKnowledgeWorkspaceHrefFromSearchResult,
	clearKnowledgeWorkspaceParams,
	getKnowledgeWorkspaceDocumentFromUrl,
} from './document-workspace-navigation';

describe('document workspace navigation', () => {
	it('builds a knowledge workspace href with the expected params', () => {
		expect(
			buildKnowledgeWorkspaceHref({
				artifactId: 'normalized-1',
				filename: 'Vault brief.txt',
				mimeType: 'text/plain',
			})
		).toBe(
			'/knowledge?open_artifact=normalized-1&open_filename=Vault+brief.txt&open_mime=text%2Fplain'
		);
	});

	it('prefers the prompt artifact when building a search-result href', () => {
		expect(
			buildKnowledgeWorkspaceHrefFromSearchResult({
				id: 'doc-1',
				displayArtifactId: 'source-1',
				promptArtifactId: 'normalized-1',
				name: 'Vault brief.txt',
				mimeType: 'text/plain',
				vaultId: 'vault-1',
				vaultName: 'Research',
				summary: 'Brief summary',
				snippet: 'Important extracted text',
				normalizedAvailable: true,
				updatedAt: Date.now(),
			})
		).toContain('open_artifact=normalized-1');
	});

	it('derives a workspace document from a knowledge handoff url', () => {
		const document = getKnowledgeWorkspaceDocumentFromUrl(
			new URL(
				'http://localhost/knowledge?open_artifact=normalized-1&open_filename=Vault+brief.txt&open_mime=text%2Fplain'
			)
		);

		expect(document).toEqual({
			id: 'artifact:normalized-1',
			source: 'knowledge_artifact',
			filename: 'Vault brief.txt',
			title: 'Vault brief.txt',
			mimeType: 'text/plain',
			artifactId: 'normalized-1',
		});
	});

	it('clears workspace handoff params after consumption', () => {
		const url = clearKnowledgeWorkspaceParams(
			new URL(
				'http://localhost/knowledge?open_artifact=normalized-1&open_filename=Vault+brief.txt&open_mime=text%2Fplain&tab=library'
			)
		);

		expect(url.pathname + url.search).toBe('/knowledge?tab=library');
	});
});
