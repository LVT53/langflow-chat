import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import {
	getConversation,
	updateConversationTitle,
	moveConversationToProject
} from '$lib/server/services/conversations';
import { deleteConversationWithCleanup } from '$lib/server/services/cleanup';
import { listMessages } from '$lib/server/services/messages';
import {
	getConversationWorkingSet,
	getConversationContextStatus,
	listConversationArtifacts
} from '$lib/server/services/knowledge';
import { getChatFiles } from '$lib/server/services/chat-files';
import { getConversationDraft } from '$lib/server/services/conversation-drafts';
import {
	attachContinuityToTaskState,
	getContextDebugState,
	getConversationTaskState,
} from '$lib/server/services/task-state';

export const GET: RequestHandler = async (event) => {
	try {
		requireAuth(event);
		const user = event.locals.user!;
		const { id } = event.params;

		const conversation = await getConversation(user.id, id);
		if (!conversation) {
			return json({ error: 'Conversation not found' }, { status: 404 });
		}

		if (event.url.searchParams.get('view') === 'bootstrap') {
			const draft = await getConversationDraft(user.id, id).catch(() => null);
			return json({
				conversation,
				messages: [],
				attachedArtifacts: [],
				activeWorkingSet: [],
				contextStatus: null,
				taskState: null,
				contextDebug: null,
				draft,
				bootstrap: true,
			});
		}

		const [
			messageHistory,
			attachedArtifacts,
			activeWorkingSet,
			contextStatus,
			taskState,
			contextDebug,
			draft,
			generatedFiles,
		] = await Promise.all([
			listMessages(id),
			listConversationArtifacts(user.id, id),
			getConversationWorkingSet(user.id, id),
			getConversationContextStatus(user.id, id),
			getConversationTaskState(user.id, id),
			getContextDebugState(user.id, id),
			getConversationDraft(user.id, id),
			getChatFiles(id),
		]);
		const taskStateWithContinuity = await attachContinuityToTaskState(user.id, taskState).catch(
			() => taskState
		);
		return json({
			conversation,
			messages: messageHistory,
			attachedArtifacts,
			activeWorkingSet,
			contextStatus,
			taskState: taskStateWithContinuity,
			contextDebug,
			draft,
			generatedFiles,
			bootstrap: false,
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

	let deleted;
	try {
		deleted = await deleteConversationWithCleanup(user.id, id);
	} catch (error) {
		console.error('[CONVERSATION_DELETE] Failed to fully delete conversation:', error);
		return json({ error: 'Failed to fully delete conversation' }, { status: 500 });
	}

	if (!deleted) {
		return json({ error: 'Conversation not found' }, { status: 404 });
	}

	return json({
		success: true,
		deletedArtifactIds: deleted.deletedArtifactIds,
		preservedArtifactIds: deleted.preservedArtifactIds,
	});
};
