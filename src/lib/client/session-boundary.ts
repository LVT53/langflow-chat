import { clearConversationSessionState } from '$lib/client/conversation-session';
import { initAvatar } from '$lib/stores/avatar';
import { clearConversationStore } from '$lib/stores/conversations';
import { projects } from '$lib/stores/projects';
import { currentConversationId, sidebarOpen } from '$lib/stores/ui';

export function clearClientAccountState(): void {
	clearConversationStore();
	projects.set([]);
	currentConversationId.set(null);
	sidebarOpen.set(false);
	initAvatar(null);
	clearConversationSessionState();
}
