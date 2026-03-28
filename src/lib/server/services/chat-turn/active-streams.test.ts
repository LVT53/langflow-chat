import { describe, expect, it } from 'vitest';
import {
	registerActiveChatStream,
	requestActiveChatStreamStop,
	unregisterActiveChatStream,
} from './active-streams';

describe('active chat streams registry', () => {
	it('aborts an active controller when a stop is requested by the same user', () => {
		const controller = new AbortController();
		registerActiveChatStream({
			streamId: 'stream-1',
			userId: 'user-1',
			controller,
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
		});

		const stopped = requestActiveChatStreamStop({
			streamId: 'stream-2',
			userId: 'user-2',
		});

		expect(stopped).toBe(false);
		expect(controller.signal.aborted).toBe(false);

		unregisterActiveChatStream('stream-2', controller);
	});
});
