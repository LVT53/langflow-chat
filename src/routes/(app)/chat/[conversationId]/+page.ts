import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { hasPendingConversationMessage } from '$lib/client/conversation-session';
import type { PageLoad } from './$types';
import type { ConversationDetail } from '$lib/types';

export const load: PageLoad = async ({ params, fetch, url }) => {
	const { conversationId } = params;
	const useBootstrap =
		url.searchParams.get('view') === 'bootstrap' ||
		(browser && typeof window !== 'undefined'
			? hasPendingConversationMessage(conversationId)
			: false);

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
		draft: detail.draft ?? null,
		bootstrap: detail.bootstrap ?? false,
		generatedFiles: detail.generatedFiles ?? [],
		totalCostUsdMicros: detail.totalCostUsdMicros ?? 0,
		totalTokens: detail.totalTokens ?? 0,
	};
};
