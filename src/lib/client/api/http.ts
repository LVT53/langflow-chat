function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
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
	errorMessage: string
): Promise<T> {
	const response = init === undefined ? await fetch(input) : await fetch(input, init);
	if (!response.ok) {
		throw new Error(await readErrorMessage(response, errorMessage));
	}

	try {
		return (await response.json()) as T;
	} catch {
		throw new Error('Received an invalid response from the server. Please try again.');
	}
}
