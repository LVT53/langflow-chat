// src/routes/api/conversations/[id]/title/+server.ts
import type { RequestEvent } from '@sveltejs/kit';
import { generateTitle } from '$lib/server/services/title-generator';
import { updateConversationTitle } from '$lib/server/services/conversations';

export async function POST({ request, params, locals }: RequestEvent) {
  try {
    if (process.env.PLAYWRIGHT_TEST === '1') {
      return new Response(JSON.stringify({ title: null }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    const { userMessage, assistantResponse } = await request.json();
    const userId = locals.user?.id;
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    
    const title = await generateTitle(userMessage, assistantResponse);
    
    await updateConversationTitle(userId, params.id, title);
    
    return new Response(JSON.stringify({ title }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Failed to generate title:', error);
    return new Response(JSON.stringify({ title: null }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
