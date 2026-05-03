import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { validateGeneratedDocumentSource } from './source-schema';

const fixtureRoot = path.resolve('fixtures/file-production/standard-report');
const expectedPositiveFixtures = [
	'chart-heavy-report.json',
	'hungarian-report.json',
	'image-report.json',
	'long-report.json',
	'short-report.json',
	'table-heavy-report.json',
	'technical-note.json',
];
const expectedNegativeFixtures = [
	'disallowed-image-url.json',
	'injection-attempts.json',
	'merged-nested-table.json',
	'output-type-mismatch.json',
	'oversized-data.json',
	'raw-html-block.json',
	'unsupported-chart.json',
];

function readFixture(kind: 'positive' | 'negative', filename: string) {
	return JSON.parse(
		readFileSync(path.join(fixtureRoot, kind, filename), 'utf8')
	) as Record<string, unknown>;
}

function readBaseline() {
	return JSON.parse(readFileSync(path.join(fixtureRoot, 'visual-baseline.json'), 'utf8')) as Record<
		string,
		unknown
	>;
}

describe('AlfyAI Standard Report fixtures', () => {
	it('contains the expected deterministic positive and negative source fixtures', () => {
		expect(readdirSync(path.join(fixtureRoot, 'positive')).sort()).toEqual(
			expectedPositiveFixtures
		);
		expect(readdirSync(path.join(fixtureRoot, 'negative')).sort()).toEqual(
			expectedNegativeFixtures
		);
	});

	it('validates every positive fixture and declares all renderer output families', () => {
		for (const filename of expectedPositiveFixtures) {
			const fixture = readFixture('positive', filename);
			expect(fixture.outputs).toEqual(['pdf', 'docx', 'html']);
			expect(validateGeneratedDocumentSource(fixture.documentSource).ok).toBe(true);
		}
	});

	it('declares expected failure codes for every negative fixture', () => {
		for (const filename of expectedNegativeFixtures) {
			const fixture = readFixture('negative', filename);
			expect(typeof fixture.expectedErrorCode).toBe('string');
			expect(fixture.expectedErrorCode).not.toBe('');
		}
	});

	it('declares visual acceptance budgets and deterministic screenshot targets', () => {
		const baseline = readBaseline();
		expect(baseline).toMatchObject({
			version: 1,
			template: 'alfyai_standard_report',
			fixtureSet: 'standard-report',
			outputs: ['pdf', 'docx', 'html'],
			screenshotOutputs: ['pdf', 'html'],
		});

		const visualReview = baseline.visualReview as Record<string, unknown>;
		expect(visualReview?.artifactDirectory).toBe(
			'artifacts/file-production/standard-report'
		);
		expect(visualReview?.screenshots).toEqual(
			expectedPositiveFixtures.flatMap((filename) => {
				const fixtureId = filename.replace(/\.json$/, '');
				return [
					`${fixtureId}/pdf/page-1.png`,
					`${fixtureId}/html/desktop.png`,
					`${fixtureId}/html/mobile.png`,
				];
			})
		);

		const printBudget = baseline.printBudget as Record<string, unknown>;
		expect(printBudget).toMatchObject({
			bodyFontPt: { min: 10.5, target: 11, max: 12 },
			marginMm: { top: 18, right: 16, bottom: 18, left: 16 },
			headerFooter: {
				minBodyGapMm: 6,
				maxHeaderHeightMm: 12,
				maxFooterHeightMm: 10,
			},
			tables: {
				forbidHorizontalClipping: true,
				minCellPaddingPt: 4,
				maxPortraitColumns: 8,
			},
			layout: {
				forbidOrphanedHeadings: true,
				keepCaptionsWithFigures: true,
				forbidLongWordOverflow: true,
			},
		});
	});
});
