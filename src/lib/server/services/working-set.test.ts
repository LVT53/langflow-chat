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

	it('keeps the most recently refined document family above generic generated-output recency', () => {
		const ranked = rankWorkingSetCandidates([
			{
				artifactId: 'out-refined-family',
				artifactType: 'generated_output',
				name: 'Refined brief',
				summary: null,
				contentText: null,
				updatedAt: Date.now(),
				isRecentlyRefinedDocumentFamily: true,
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
			artifactId: 'out-refined-family',
			selected: true,
			reasonCodes: expect.arrayContaining(['recently_refined_document_family']),
		});
	});

	it('applies repeated document refinement behavior as a bounded ranking boost', () => {
		const ranked = rankWorkingSetCandidates([
			{
				artifactId: 'out-behavior',
				artifactType: 'generated_output',
				name: 'Repeatedly refined brief',
				summary: null,
				contentText: null,
				updatedAt: Date.now(),
				recentRefinementBehaviorScore: 3,
			},
			{
				artifactId: 'out-plain',
				artifactType: 'generated_output',
				name: 'Plain generated document',
				summary: null,
				contentText: null,
				updatedAt: Date.now(),
			},
		]);

		expect(ranked.find((item) => item.artifactId === 'out-behavior')).toMatchObject({
			artifactId: 'out-behavior',
			selected: false,
			reasonCodes: expect.arrayContaining(['recent_refinement_behavior']),
		});
		expect(ranked.findIndex((item) => item.artifactId === 'out-behavior')).toBeLessThan(
			ranked.findIndex((item) => item.artifactId === 'out-plain')
		);
		expect(ranked.find((item) => item.artifactId === 'out-plain')).toMatchObject({
			artifactId: 'out-plain',
			selected: false,
		});
	});

	it('applies recent document opens as a smaller bounded ranking boost', () => {
		const ranked = rankWorkingSetCandidates([
			{
				artifactId: 'out-opened',
				artifactType: 'generated_output',
				name: 'Recently reopened brief',
				summary: null,
				contentText: null,
				updatedAt: Date.now(),
				recentDocumentOpenScore: 3,
			},
			{
				artifactId: 'out-plain',
				artifactType: 'generated_output',
				name: 'Plain generated document',
				summary: null,
				contentText: null,
				updatedAt: Date.now(),
			},
		]);

		expect(ranked.find((item) => item.artifactId === 'out-opened')).toMatchObject({
			artifactId: 'out-opened',
			selected: false,
			reasonCodes: expect.arrayContaining(['recent_document_open']),
		});
		expect(ranked.findIndex((item) => item.artifactId === 'out-opened')).toBeLessThan(
			ranked.findIndex((item) => item.artifactId === 'out-plain')
		);
	});

	it('downranks historical generated-document families against equally weak active ones', () => {
		const ranked = rankWorkingSetCandidates([
			{
				artifactId: 'out-historical',
				artifactType: 'generated_output',
				name: 'Historical brief',
				summary: null,
				contentText: null,
				updatedAt: Date.now(),
				isHistoricalDocumentFamily: true,
			},
			{
				artifactId: 'out-active',
				artifactType: 'generated_output',
				name: 'Active brief',
				summary: null,
				contentText: null,
				updatedAt: Date.now(),
			},
		]);

		expect(ranked.findIndex((item) => item.artifactId === 'out-active')).toBeLessThan(
			ranked.findIndex((item) => item.artifactId === 'out-historical')
		);
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
