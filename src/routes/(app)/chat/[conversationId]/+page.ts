import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import type { PageLoad } from './$types';
import type { ConversationDetail } from '$lib/types';

const PENDING_MESSAGE_PREFIX = 'pending-chat-message:';

export const load: PageLoad = async ({ params, fetch }) => {
	const { conversationId } = params;
	const useBootstrap =
		browser && typeof window !== 'undefined'
			? Boolean(window.sessionStorage.getItem(`${PENDING_MESSAGE_PREFIX}${conversationId}`))
			: false;

	const res = await fetch(
		`/api/conversations/${conversationId}${useBootstrap ? '?view=bootstrap' : ''}`
	);

	if (res.status === 404 || res.status === 500) {
		throw redirect(302, '/');
	}

	if (!res.ok) {
		throw redirect(302, '/');
	}

	const detail: ConversationDetail = await res.json();

	return {
		conversation: detail.conversation,
		messages: detail.messages,
		attachedArtifacts: detail.attachedArtifacts ?? [],
		activeWorkingSet: detail.activeWorkingSet ?? [],
		contextStatus: detail.contextStatus ?? null,
		taskState: detail.taskState ?? null,
		contextDebug: detail.contextDebug ?? null,
		bootstrap: detail.bootstrap ?? false,
	};
};
