import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { applyKnowledgeMemoryAction } from '$lib/server/services/memory';

function isValidPayload(body: unknown): body is
	| { action: 'forget_persona_memory'; conclusionId: string }
	| { action: 'forget_all_persona_memory' }
	| { action: 'forget_task_memory'; taskId: string } {
	if (!body || typeof body !== 'object') return false;
	const action = (body as Record<string, unknown>).action;

	if (action === 'forget_persona_memory') {
		return typeof (body as Record<string, unknown>).conclusionId === 'string';
	}

	if (action === 'forget_task_memory') {
		return typeof (body as Record<string, unknown>).taskId === 'string';
	}

	return action === 'forget_all_persona_memory';
}

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;

	const body = await event.request.json().catch(() => null);
	if (!isValidPayload(body)) {
		return json({ error: 'Invalid memory action payload' }, { status: 400 });
	}

	try {
		const memory = await applyKnowledgeMemoryAction(user.id, body);
		return json(memory);
	} catch (error) {
		console.error('[KNOWLEDGE_MEMORY] Failed to apply memory action:', error);
		return json({ error: 'Failed to update memory profile' }, { status: 500 });
	}
};
