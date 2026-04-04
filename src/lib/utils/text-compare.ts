export interface TextComparisonSummary {
	addedLines: number;
	removedLines: number;
	changedLines: number;
	totalCurrentLines: number;
	totalComparedLines: number;
}

function splitLines(value: string): string[] {
	return value.replace(/\r\n/g, '\n').split('\n');
}

export function summarizeTextComparison(
	currentText: string,
	comparedText: string
): TextComparisonSummary {
	const currentLines = splitLines(currentText);
	const comparedLines = splitLines(comparedText);
	const sharedLength = Math.min(currentLines.length, comparedLines.length);
	let changedLines = 0;

	for (let index = 0; index < sharedLength; index += 1) {
		if (currentLines[index] !== comparedLines[index]) {
			changedLines += 1;
		}
	}

	return {
		addedLines: Math.max(0, currentLines.length - comparedLines.length),
		removedLines: Math.max(0, comparedLines.length - currentLines.length),
		changedLines,
		totalCurrentLines: currentLines.length,
		totalComparedLines: comparedLines.length,
	};
}
