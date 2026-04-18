export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length === 0 || b.length === 0) return 0;

	const dimensions = Math.min(a.length, b.length);
	if (dimensions === 0) return 0;

	let dot = 0;
	let aNorm = 0;
	let bNorm = 0;

	for (let i = 0; i < dimensions; i++) {
		dot += a[i] * b[i];
		aNorm += a[i] * a[i];
		bNorm += b[i] * b[i];
	}

	if (aNorm <= 0 || bNorm <= 0) return 0;

	return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

export interface DetectTopicShiftParams {
	currentMessageEmbedding: number[];
	previousMessageEmbedding: number[];
	threshold?: number;
}

export interface DetectTopicShiftResult {
	isShift: boolean;
	distance: number;
}

export function detectTopicShift(params: DetectTopicShiftParams): DetectTopicShiftResult {
	const { currentMessageEmbedding, previousMessageEmbedding, threshold = 0.3 } = params;

	const isEmptyOrZero = (v: number[]) =>
		v.length === 0 || v.every((x) => x === 0);

	if (isEmptyOrZero(currentMessageEmbedding) || isEmptyOrZero(previousMessageEmbedding)) {
		return { isShift: false, distance: 0 };
	}

	const similarity = cosineSimilarity(currentMessageEmbedding, previousMessageEmbedding);
	const distance = 1 - similarity;

	return {
		isShift: similarity < threshold,
		distance,
	};
}

export interface ShouldSuppressCarryoverParams {
	isShift: boolean;
	hasExplicitResetSignal: boolean;
	turnsSinceLastShift: number;
}

export function shouldSuppressCarryover(params: ShouldSuppressCarryoverParams): boolean {
	return params.isShift || params.hasExplicitResetSignal;
}