import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { WebhookSentencePayload } from '$lib/types';
import { getConfig } from '$lib/server/config-store';

export const POST: RequestHandler = async (event) => {
	const { langflowWebhookSecret } = getConfig();
	if (langflowWebhookSecret) {
		const providedSecret = event.request.headers.get('x-webhook-secret');
		if (providedSecret !== langflowWebhookSecret) {
			return json({ error: 'Unauthorized webhook request' }, { status: 401 });
		}
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	if (
		!body ||
		typeof body !== 'object' ||
		!('session_id' in body) ||
		!('index' in body) ||
		!('is_final' in body)
	) {
		return json({ error: 'Missing required fields: session_id, index, is_final' }, { status: 400 });
	}

	const { session_id, sentence, index, is_final } = body as WebhookSentencePayload;

	if (typeof session_id !== 'string' || session_id.trim().length === 0) {
		return json({ error: 'session_id must be a non-empty string' }, { status: 400 });
	}

	if (sentence !== undefined && (typeof sentence !== 'string' || sentence.trim().length === 0)) {
		return json({ error: 'sentence must be a non-empty string' }, { status: 400 });
	}

	if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
		return json({ error: 'index must be a non-negative integer' }, { status: 400 });
	}

	if (typeof is_final !== 'boolean') {
		return json({ error: 'is_final must be a boolean' }, { status: 400 });
	}

	const webhookBuffer = event.locals.webhookBuffer;
	if (!webhookBuffer) {
		return json({ error: 'Webhook buffer not available' }, { status: 500 });
	}

	if (typeof sentence === 'string' && sentence.trim().length > 0) {
		webhookBuffer.addSentence(session_id, sentence, index, is_final);
	} else if (is_final) {
		webhookBuffer.markComplete(session_id);
	} else {
		return json({ error: 'sentence is required unless is_final is true' }, { status: 400 });
	}

	return json({ success: true });
};
