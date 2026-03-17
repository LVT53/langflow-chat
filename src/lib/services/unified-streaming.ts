import { streamChat } from './streaming';
import { streamWebhook } from './webhook-streaming';
import type { StreamCallbacks, StreamHandle } from './streaming';

export type { StreamCallbacks, StreamHandle };

export type UnifiedStreamSource = 'langflow' | 'webhook';

export interface LangflowStreamParams {
	source: 'langflow';
	message: string;
	conversationId: string;
}

export interface WebhookStreamParams {
	source: 'webhook';
	sessionId: string;
}

export type UnifiedStreamParams = LangflowStreamParams | WebhookStreamParams;

export function streamUnified(params: UnifiedStreamParams, callbacks: StreamCallbacks): StreamHandle {
	if (params.source === 'langflow') {
		return streamChat(params.message, params.conversationId, callbacks);
	}
	return streamWebhook(params.sessionId, callbacks);
}
