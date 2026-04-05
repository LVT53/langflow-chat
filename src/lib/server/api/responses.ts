const JSON_RESPONSE_HEADERS = { 'Content-Type': 'application/json' };

export function createJsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: JSON_RESPONSE_HEADERS,
	});
}

export function createJsonErrorResponse(error: string, status: number): Response {
	return createJsonResponse({ error }, status);
}
