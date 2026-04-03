import type { StreamCallbacks, StreamHandle } from './streaming';

export function streamWebhook(sessionId: string, callbacks: StreamCallbacks): StreamHandle {
	let aborted = false;
	let eventSource: EventSource | null = null;

	const setupTimer = setTimeout(() => {
		if (aborted) return;

		try {
			const url = `/api/stream/webhook/${encodeURIComponent(sessionId)}`;
			eventSource = new EventSource(url);

			let fullText = '';

			eventSource.addEventListener('sentence', (e: MessageEvent) => {
				if (aborted) return;
				try {
					const parsed = JSON.parse(e.data) as { text?: string; index?: number };
					const chunk = parsed.text ?? '';
					if (chunk) {
						fullText += chunk;
						callbacks.onToken(chunk);
					}
				} catch {
					/* noop */
				}
			});

			eventSource.addEventListener('end', () => {
				if (aborted) return;
				cleanup();
				callbacks.onEnd(fullText);
			});

			eventSource.addEventListener('error', (e: Event) => {
				if (aborted) return;
				let errorMessage = 'Webhook stream error';
				if (e instanceof MessageEvent) {
					try {
						const parsed = JSON.parse(e.data) as { message?: string; error?: string };
						errorMessage = parsed.message ?? parsed.error ?? errorMessage;
					} catch {
						errorMessage = e.data || errorMessage;
					}
				}
				cleanup();
				callbacks.onError(new Error(errorMessage));
			});

			eventSource.onerror = () => {
				if (aborted) return;
				if (eventSource && eventSource.readyState === EventSource.CLOSED) {
					cleanup();
					callbacks.onError(new Error('Webhook SSE connection failed'));
				}
			};
		} catch (err) {
			if (!aborted) {
				callbacks.onError(err instanceof Error ? err : new Error(String(err)));
			}
		}
	}, 0);

	function cleanup() {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
	}

	return {
		stop() {
			aborted = true;
			clearTimeout(setupTimer);
			cleanup();
		},
		detach() {
			aborted = true;
			clearTimeout(setupTimer);
			cleanup();
		},
	};
}
