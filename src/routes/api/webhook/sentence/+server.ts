import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { WebhookSentencePayload } from '$lib/types';

export const POST: RequestHandler = async (event) => {
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
		!('sentence' in body) ||
		!('index' in body) ||
		!('is_final' in body)
	) {
		return json({ error: 'Missing required fields: session_id, sentence, index, is_final' }, { status: 400 });
	}

	const { session_id, sentence, index, is_final } = body as WebhookSentencePayload;

	if (typeof session_id !== 'string' || session_id.trim().length === 0) {
		return json({ error: 'session_id must be a non-empty string' }, { status: 400 });
	}

	if (typeof sentence !== 'string' || sentence.trim().length === 0) {
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

	webhookBuffer.addSentence(session_id, sentence, index, is_final);

	return json({ success: true });
};