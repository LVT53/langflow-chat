import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { getConversation, touchConversation } from '$lib/server/services/conversations';
import { sendMessage } from '$lib/server/services/langflow';
import { config } from '$lib/server/env';
import { detectLanguage } from '$lib/server/services/language';
import {
	translateEnglishToHungarian,
	translateHungarianToEnglish
} from '$lib/server/services/translator';

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;

	let body: { message?: unknown; conversationId?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { message, conversationId } = body;

	if (typeof message !== 'string' || message.trim().length === 0) {
		return json({ error: 'Message must be a non-empty string' }, { status: 400 });
	}

	if (message.length > config.maxMessageLength) {
		return json(
			{ error: `Message exceeds maximum length of ${config.maxMessageLength} characters` },
			{ status: 400 }
		);
	}

	if (typeof conversationId !== 'string' || conversationId.trim().length === 0) {
		return json({ error: 'conversationId is required' }, { status: 400 });
	}

	const conversation = await getConversation(user.id, conversationId);
	if (!conversation) {
		return json({ error: 'Conversation not found' }, { status: 404 });
	}

	try {
		const normalizedMessage = message.trim();
		const sourceLanguage = detectLanguage(normalizedMessage);
		const upstreamMessage =
			sourceLanguage === 'hu'
				? await translateHungarianToEnglish(normalizedMessage)
				: normalizedMessage;

		const { text } = await sendMessage(upstreamMessage, conversationId);
		const responseText =
			sourceLanguage === 'hu' ? await translateEnglishToHungarian(text) : text;

		await touchConversation(user.id, conversationId).catch(() => undefined);

		return json({
			response: { text: responseText },
			conversationId
		});
	} catch (error) {
		console.error('Langflow sendMessage error:', error);
		return json(
			{ error: 'Failed to get response from AI. Please try again.' },
			{ status: 502 }
		);
	}
};
