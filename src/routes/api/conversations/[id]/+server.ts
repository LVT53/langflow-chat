import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import {
	getConversation,
	updateConversationTitle,
	deleteConversation,
	moveConversationToProject
} from '$lib/server/services/conversations';
import { listMessages } from '$lib/server/services/messages';
import {
	getConversationWorkingSet,
	getConversationContextStatus,
	listConversationArtifacts
} from '$lib/server/services/knowledge';
import { getContextDebugState, getConversationTaskState } from '$lib/server/services/task-state';

export const GET: RequestHandler = async (event) => {
	try {
		requireAuth(event);
		const user = event.locals.user!;
		const { id } = event.params;

		const conversation = await getConversation(user.id, id);
		if (!conversation) {
			return json({ error: 'Conversation not found' }, { status: 404 });
		}

		const [messageHistory, attachedArtifacts, activeWorkingSet, contextStatus, taskState, contextDebug] = await Promise.all([
			listMessages(id),
			listConversationArtifacts(user.id, id),
			getConversationWorkingSet(user.id, id),
			getConversationContextStatus(user.id, id),
			getConversationTaskState(user.id, id),
			getContextDebugState(user.id, id),
		]);

		return json({
			conversation,
			messages: messageHistory,
			attachedArtifacts,
			activeWorkingSet,
			contextStatus,
			taskState,
			contextDebug,
		});
	} catch (err) {
		console.error('Error loading conversation:', err);
		return json({ error: 'Failed to load conversation' }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const { id } = event.params;

	const body = await event.request.json().catch(() => null);
	if (!body) {
		return json({ error: 'Body is required' }, { status: 400 });
	}

	// Handle project assignment
	if ('projectId' in body) {
		const projectId = body.projectId === null || typeof body.projectId === 'string' ? body.projectId : undefined;
		if (projectId === undefined) {
			return json({ error: 'projectId must be a string or null' }, { status: 400 });
		}
		const conversation = await moveConversationToProject(user.id, id, projectId);
		if (!conversation) {
			return json({ error: 'Conversation not found' }, { status: 404 });
		}
		return json(conversation);
	}

	// Handle title rename
	if (typeof body.title !== 'string' || body.title.trim().length === 0) {
		return json({ error: 'Title is required' }, { status: 400 });
	}

	const conversation = await updateConversationTitle(user.id, id, body.title.trim());
	if (!conversation) {
		return json({ error: 'Conversation not found' }, { status: 404 });
	}

	return json(conversation);
};

export const DELETE: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const { id } = event.params;

	const deleted = await deleteConversation(user.id, id);
	if (!deleted) {
		return json({ error: 'Conversation not found' }, { status: 404 });
	}

	return json({ success: true });
};
