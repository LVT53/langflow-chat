import type { ConversationDetail } from '$lib/types';

export function canReuseLandingPreparedConversation(
	detail: Pick<ConversationDetail, 'conversation' | 'messages' | 'generatedFiles'>
): boolean {
	return (
		detail.conversation.title === 'New Conversation' &&
		(detail.messages?.length ?? 0) === 0 &&
		(detail.generatedFiles?.length ?? 0) === 0
	);
}

export async function navigateToConversationFromLanding(params: {
	conversationId: string;
	goto: (href: string) => Promise<void>;
	hardNavigate?: ((href: string) => void) | null;
}): Promise<void> {
	const href = `/chat/${params.conversationId}`;

	// The landing-to-chat bootstrap path is vulnerable to stale SPA state after deploys
	// or restarts. Prefer a full document navigation when available so the browser cannot
	// remain visually stuck on the landing surface while the new chat is already running.
	if (params.hardNavigate) {
		params.hardNavigate(href);
		return;
	}

	await params.goto(href);
}
