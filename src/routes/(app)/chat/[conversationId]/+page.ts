import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { ConversationDetail } from '$lib/types';

export const load: PageLoad = async ({ params, fetch }) => {
	const { conversationId } = params;

	const res = await fetch(`/api/conversations/${conversationId}`);

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
		contextStatus: detail.contextStatus ?? null
	};
};
