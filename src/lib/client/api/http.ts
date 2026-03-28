export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function performRequest(
	fetchImpl: FetchLike,
	input: RequestInfo | URL,
	init: RequestInit | undefined
): Promise<Response> {
	return init === undefined ? fetchImpl(input) : fetchImpl(input, init);
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
	const text = await response.text().catch(() => '');
	if (!text) return fallback;

	try {
		const parsed = JSON.parse(text) as unknown;
		if (isRecord(parsed)) {
			const message = parsed.error ?? parsed.message;
			if (typeof message === 'string' && message.trim()) {
				return message;
			}
		}
	} catch {
		// Fall back to raw text below.
	}

	return text.trim() || fallback;
}

export async function requestJson<T>(
	input: RequestInfo | URL,
	init: RequestInit | undefined,
	errorMessage: string,
	fetchImpl: FetchLike = fetch
): Promise<T> {
	const response = await performRequest(fetchImpl, input, init);
	if (!response.ok) {
		throw new Error(await readErrorMessage(response, errorMessage));
	}

	try {
		return (await response.json()) as T;
	} catch {
		throw new Error('Received an invalid response from the server. Please try again.');
	}
}

export async function requestVoid(
	input: RequestInfo | URL,
	init: RequestInit | undefined,
	errorMessage: string,
	fetchImpl: FetchLike = fetch
): Promise<void> {
	const response = await performRequest(fetchImpl, input, init);
	if (!response.ok) {
		throw new Error(await readErrorMessage(response, errorMessage));
	}
}
