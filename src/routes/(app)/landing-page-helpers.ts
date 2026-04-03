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
