// src/routes/api/conversations/[id]/title/+server.ts
import type { RequestEvent } from '@sveltejs/kit';
import { generateTitle } from '$lib/server/services/title-generator';
import { updateConversationTitle } from '$lib/server/services/conversations';
import { createJsonErrorResponse, createJsonResponse } from '$lib/server/api/responses';

	export async function POST({ request, params, locals }: RequestEvent) {
  try {
    if (process.env.PLAYWRIGHT_TEST === '1') {
		  return createJsonResponse({ title: null });
    }

    const { userMessage, assistantResponse } = await request.json();
    const userId = locals.user?.id;
    if (!userId) {
		  return createJsonErrorResponse('Unauthorized', 401);
    }
    
    const title = await generateTitle(userMessage, assistantResponse, locals.user?.titleLanguage);
    
    await updateConversationTitle(userId, params.id, title);
		return createJsonResponse({ title });
  } catch (error) {
    console.error('[TITLE_GENERATE] Failed to generate title', {
      conversationId: params.id,
      error,
    });
		return createJsonResponse({ title: null });
  }
}
