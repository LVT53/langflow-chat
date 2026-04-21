export function cosineSimilarity(left: number[], right: number[]): number {
	const dimensions = Math.min(left.length, right.length);
	if (dimensions === 0) return 0;

	let dot = 0;
	let leftNorm = 0;
	let rightNorm = 0;

	for (let index = 0; index < dimensions; index += 1) {
		const leftValue = left[index] ?? 0;
		const rightValue = right[index] ?? 0;
		dot += leftValue * rightValue;
		leftNorm += leftValue * leftValue;
		rightNorm += rightValue * rightValue;
	}

	if (leftNorm <= 0 || rightNorm <= 0) {
		return 0;
	}

	return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}
