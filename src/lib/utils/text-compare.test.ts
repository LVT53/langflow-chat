import { describe, expect, it } from 'vitest';
import { summarizeTextComparison } from './text-compare';

describe('summarizeTextComparison', () => {
	it('counts changed lines at matching positions', () => {
		expect(
			summarizeTextComparison(
				'alpha\nbeta\ngamma',
				'alpha\nbeta updated\ngamma'
			)
		).toEqual({
			addedLines: 0,
			removedLines: 0,
			changedLines: 1,
			totalCurrentLines: 3,
			totalComparedLines: 3,
		});
	});

	it('counts added and removed lines when lengths differ', () => {
		expect(
			summarizeTextComparison(
				'alpha\nbeta\ngamma\ndelta',
				'alpha\nbeta'
			)
		).toEqual({
			addedLines: 2,
			removedLines: 0,
			changedLines: 0,
			totalCurrentLines: 4,
			totalComparedLines: 2,
		});
	});
});
