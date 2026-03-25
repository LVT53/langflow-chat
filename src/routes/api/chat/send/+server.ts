import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { getConversation, touchConversation } from '$lib/server/services/conversations';
import { sendMessage } from '$lib/server/services/langflow';
import { getConfig } from '$lib/server/config-store';
import { createMessage } from '$lib/server/services/messages';
import { mirrorMessage } from '$lib/server/services/honcho';
import { detectLanguage } from '$lib/server/services/language';
import {
	translateEnglishToHungarian,
	translateHungarianToEnglish
} from '$lib/server/services/translator';

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;

	let body: { message?: unknown; conversationId?: unknown; model?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { message, conversationId, model } = body;

	if (typeof message !== 'string' || message.trim().length === 0) {
		return json({ error: 'Message must be a non-empty string' }, { status: 400 });
	}

	const { maxMessageLength } = getConfig();
	if (message.length > maxMessageLength) {
		return json(
			{ error: `Message exceeds maximum length of ${maxMessageLength} characters` },
			{ status: 400 }
		);
	}

	if (typeof conversationId !== 'string' || conversationId.trim().length === 0) {
		return json({ error: 'conversationId is required' }, { status: 400 });
	}

	// Validate model parameter
	const modelId = model === 'model1' || model === 'model2' ? model : undefined;

	const conversation = await getConversation(user.id, conversationId);
	if (!conversation) {
		return json({ error: 'Conversation not found' }, { status: 404 });
	}

	try {
		const normalizedMessage = message.trim();
		const sourceLanguage = detectLanguage(normalizedMessage);
		const isTranslationEnabled = user.translationEnabled;

		const upstreamMessage =
			sourceLanguage === 'hu' && isTranslationEnabled
				? await translateHungarianToEnglish(normalizedMessage)
				: normalizedMessage;

		const { text } = await sendMessage(upstreamMessage, conversationId, modelId, user.id);
		const responseText =
			sourceLanguage === 'hu' && isTranslationEnabled
				? await translateEnglishToHungarian(text)
				: text;

		await createMessage(conversationId, 'user', normalizedMessage);
		await createMessage(conversationId, 'assistant', responseText);
		await touchConversation(user.id, conversationId).catch(() => undefined);

		// Fire-and-forget: mirror to Honcho for long-term memory reasoning
		mirrorMessage(user.id, conversationId, 'user', upstreamMessage).catch((err) =>
			console.error('[HONCHO] Mirror user message failed:', err)
		);
		mirrorMessage(user.id, conversationId, 'assistant', text).catch((err) =>
			console.error('[HONCHO] Mirror assistant message failed:', err)
		);

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
