import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { getStreamBuffer } from '$lib/server/services/chat-turn/active-streams';

export const GET: RequestHandler = async (event) => {
	requireAuth(event);

	const streamId = event.url.searchParams.get('streamId');
	if (!streamId) {
		return json({ error: 'streamId is required' }, { status: 400 });
	}

	const buffer = getStreamBuffer(streamId);
	if (!buffer) {
		return json({ exists: false });
	}

	return json({
		exists: true,
		userMessage: buffer.userMessage,
		tokenCount: buffer.tokens.length,
		thinkingCount: buffer.thinking.length,
		toolCallCount: buffer.toolCalls.length,
	});
};