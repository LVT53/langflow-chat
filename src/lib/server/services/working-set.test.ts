import { describe, expect, it } from 'vitest';
import { rankWorkingSetCandidates } from './working-set';

describe('working-set ranking', () => {
	it('prioritizes newly attached documents and the current generated document', () => {
		const ranked = rankWorkingSetCandidates([
			{
				artifactId: 'doc-1',
				artifactType: 'source_document',
				name: 'Q1 brief',
				summary: null,
				contentText: null,
				updatedAt: Date.now(),
				isAttachedThisTurn: true,
			},
			{
				artifactId: 'out-1',
				artifactType: 'generated_output',
				name: 'Portfolio draft',
				summary: null,
				contentText: null,
				updatedAt: Date.now(),
				isCurrentGeneratedDocument: true,
			},
		]);

		expect(ranked.find((item) => item.artifactId === 'doc-1')?.selected).toBe(true);
		expect(ranked.find((item) => item.artifactId === 'out-1')?.selected).toBe(true);
		expect(ranked[0]?.artifactId).toBe('doc-1');
	});

	it('treats the active workspace document as stronger than generic current-document recency', () => {
		const ranked = rankWorkingSetCandidates([
			{
				artifactId: 'out-focused',
				artifactType: 'generated_output',
				name: 'Focused brief',
				summary: null,
				contentText: null,
				updatedAt: Date.now(),
				isActiveDocumentFocus: true,
			},
			{
				artifactId: 'out-latest',
				artifactType: 'generated_output',
				name: 'Current generated document',
				summary: null,
				contentText: null,
				updatedAt: Date.now(),
				isCurrentGeneratedDocument: true,
			},
		]);

		expect(ranked[0]).toMatchObject({
			artifactId: 'out-focused',
			selected: true,
			reasonCodes: expect.arrayContaining(['active_document_focus']),
		});
		expect(ranked[1]?.artifactId).toBe('out-latest');
	});

	it('boosts an actively corrected document above generic generated-output recency', () => {
		const ranked = rankWorkingSetCandidates([
			{
				artifactId: 'out-corrected',
				artifactType: 'generated_output',
				name: 'Corrected brief',
				summary: null,
				contentText: null,
				updatedAt: Date.now(),
				isRecentUserCorrection: true,
			},
			{
				artifactId: 'out-latest',
				artifactType: 'generated_output',
				name: 'Latest generated document',
				summary: null,
				contentText: null,
				updatedAt: Date.now(),
				isCurrentGeneratedDocument: true,
			},
		]);

		expect(ranked[0]).toMatchObject({
			artifactId: 'out-corrected',
			selected: true,
			reasonCodes: expect.arrayContaining(['recent_user_correction']),
		});
	});

	it('decays stale items that only persist from previous turns', () => {
		const ranked = rankWorkingSetCandidates([
			{
				artifactId: 'doc-1',
				artifactType: 'source_document',
				name: 'Old notes',
				summary: null,
				contentText: null,
				updatedAt: Date.now(),
				previousScore: 18,
				previousState: 'active',
			},
		]);

		expect(ranked[0]).toMatchObject({
			artifactId: 'doc-1',
			state: 'cooling',
			selected: false,
		});
	});

	it('enforces per-type and total working-set caps', () => {
		const ranked = rankWorkingSetCandidates([
			...Array.from({ length: 6 }, (_, index) => ({
				artifactId: `doc-${index + 1}`,
				artifactType: 'source_document' as const,
				name: `Document ${index + 1}`,
				summary: null,
				contentText: null,
				updatedAt: Date.now(),
				isAttachedThisTurn: true,
			})),
			...Array.from({ length: 3 }, (_, index) => ({
				artifactId: `out-${index + 1}`,
				artifactType: 'generated_output' as const,
				name: `Output ${index + 1}`,
				summary: null,
				contentText: null,
				updatedAt: Date.now(),
				isCurrentGeneratedDocument: index === 0,
				isLinkedToLatestOutput: index === 1,
				previousScore: 40,
				previousState: 'active' as const,
			})),
		]);

		const selected = ranked.filter((item) => item.selected);
		expect(selected).toHaveLength(6);
		expect(selected.filter((item) => item.artifactType === 'source_document')).toHaveLength(4);
		expect(selected.filter((item) => item.artifactType === 'generated_output')).toHaveLength(2);
	});
});
