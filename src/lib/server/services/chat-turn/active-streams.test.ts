import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	clearStreamBuffer,
	getOrCreateStreamBuffer,
	registerActiveChatStream,
	requestActiveChatStreamStop,
	unregisterActiveChatStream,
} from './active-streams';

describe('active chat streams registry', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('aborts an active controller when a stop is requested by the same user', () => {
		const controller = new AbortController();
		registerActiveChatStream({
			streamId: 'stream-1',
			userId: 'user-1',
			controller,
			conversationId: 'conversation-1',
		});

		const stopped = requestActiveChatStreamStop({
			streamId: 'stream-1',
			userId: 'user-1',
		});

		expect(stopped).toBe(true);
		expect(controller.signal.aborted).toBe(true);

		unregisterActiveChatStream('stream-1', controller);
	});

	it('aborts a controller that registers after an early stop request', () => {
		const stopped = requestActiveChatStreamStop({
			streamId: 'stream-early-stop',
			userId: 'user-1',
		});
		expect(stopped).toBe(false);

		const controller = new AbortController();
		registerActiveChatStream({
			streamId: 'stream-early-stop',
			userId: 'user-1',
			controller,
			conversationId: 'conversation-early-stop',
		});

		expect(controller.signal.aborted).toBe(true);

		unregisterActiveChatStream('stream-early-stop', controller);
	});

	it('does not abort a stream owned by another user', () => {
		const controller = new AbortController();
		registerActiveChatStream({
			streamId: 'stream-2',
			userId: 'user-1',
			controller,
			conversationId: 'conversation-2',
		});

		const stopped = requestActiveChatStreamStop({
			streamId: 'stream-2',
			userId: 'user-2',
		});

		expect(stopped).toBe(false);
		expect(controller.signal.aborted).toBe(false);

		unregisterActiveChatStream('stream-2', controller);
	});

	it('clears the stream buffer cleanup timer when the last buffer is removed', () => {
		vi.useFakeTimers();

		getOrCreateStreamBuffer('stream-buffer', 'hello');
		expect(vi.getTimerCount()).toBe(1);

		clearStreamBuffer('stream-buffer');
		expect(vi.getTimerCount()).toBe(0);
	});
});
