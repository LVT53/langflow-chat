import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamUnified } from './unified-streaming';
import type { StreamCallbacks } from './streaming';

vi.mock('./streaming', () => ({
	streamChat: vi.fn()
}));

vi.mock('./webhook-streaming', () => ({
	streamWebhook: vi.fn()
}));

import { streamChat } from './streaming';
import { streamWebhook } from './webhook-streaming';

const mockStreamChat = vi.mocked(streamChat);
const mockStreamWebhook = vi.mocked(streamWebhook);

function makeCallbacks(): StreamCallbacks {
	return {
		onToken: vi.fn(),
		onEnd: vi.fn(),
		onError: vi.fn()
	};
}

const fakeHandle = { abort: vi.fn() };

describe('streamUnified', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockStreamChat.mockReturnValue(fakeHandle);
		mockStreamWebhook.mockReturnValue(fakeHandle);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('source: langflow', () => {
		it('delegates to streamChat with correct params', () => {
			const cb = makeCallbacks();
			streamUnified({ source: 'langflow', message: 'hello', conversationId: 'conv-1' }, cb);

			expect(mockStreamChat).toHaveBeenCalledOnce();
			expect(mockStreamChat).toHaveBeenCalledWith('hello', 'conv-1', cb);
			expect(mockStreamWebhook).not.toHaveBeenCalled();
		});

		it('returns the handle from streamChat', () => {
			const cb = makeCallbacks();
			const handle = streamUnified(
				{ source: 'langflow', message: 'hello', conversationId: 'conv-1' },
				cb
			);

			expect(handle).toBe(fakeHandle);
		});

		it('passes callbacks so onToken fires correctly', () => {
			const cb = makeCallbacks();
			mockStreamChat.mockImplementation((_msg, _id, callbacks) => {
				callbacks.onToken('Hello');
				callbacks.onToken(' world');
				callbacks.onEnd('Hello world');
				return fakeHandle;
			});

			streamUnified({ source: 'langflow', message: 'q', conversationId: 'c' }, cb);

			expect(cb.onToken).toHaveBeenCalledTimes(2);
			expect(cb.onToken).toHaveBeenNthCalledWith(1, 'Hello');
			expect(cb.onToken).toHaveBeenNthCalledWith(2, ' world');
			expect(cb.onEnd).toHaveBeenCalledWith('Hello world');
		});

		it('propagates error from streamChat', () => {
			const cb = makeCallbacks();
			mockStreamChat.mockImplementation((_msg, _id, callbacks) => {
				callbacks.onError(new Error('langflow error'));
				return fakeHandle;
			});

			streamUnified({ source: 'langflow', message: 'q', conversationId: 'c' }, cb);

			expect(cb.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'langflow error' }));
		});

		it('abort() calls the handle returned by streamChat', () => {
			const abortFn = vi.fn();
			mockStreamChat.mockReturnValue({ abort: abortFn });

			const cb = makeCallbacks();
			const handle = streamUnified(
				{ source: 'langflow', message: 'q', conversationId: 'c' },
				cb
			);
			handle.abort();

			expect(abortFn).toHaveBeenCalledOnce();
		});
	});

	describe('source: webhook', () => {
		it('delegates to streamWebhook with correct sessionId', () => {
			const cb = makeCallbacks();
			streamUnified({ source: 'webhook', sessionId: 'sess-123' }, cb);

			expect(mockStreamWebhook).toHaveBeenCalledOnce();
			expect(mockStreamWebhook).toHaveBeenCalledWith('sess-123', cb);
			expect(mockStreamChat).not.toHaveBeenCalled();
		});

		it('returns the handle from streamWebhook', () => {
			const cb = makeCallbacks();
			const handle = streamUnified({ source: 'webhook', sessionId: 'sess-123' }, cb);

			expect(handle).toBe(fakeHandle);
		});

		it('passes callbacks so onToken fires correctly', () => {
			const cb = makeCallbacks();
			mockStreamWebhook.mockImplementation((_id, callbacks) => {
				callbacks.onToken('Helló');
				callbacks.onToken(' világ');
				callbacks.onEnd('Helló világ');
				return fakeHandle;
			});

			streamUnified({ source: 'webhook', sessionId: 'sess-1' }, cb);

			expect(cb.onToken).toHaveBeenCalledTimes(2);
			expect(cb.onToken).toHaveBeenNthCalledWith(1, 'Helló');
			expect(cb.onToken).toHaveBeenNthCalledWith(2, ' világ');
			expect(cb.onEnd).toHaveBeenCalledWith('Helló világ');
		});

		it('propagates error from streamWebhook', () => {
			const cb = makeCallbacks();
			mockStreamWebhook.mockImplementation((_id, callbacks) => {
				callbacks.onError(new Error('webhook error'));
				return fakeHandle;
			});

			streamUnified({ source: 'webhook', sessionId: 'sess-1' }, cb);

			expect(cb.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'webhook error' }));
		});

		it('abort() calls the handle returned by streamWebhook', () => {
			const abortFn = vi.fn();
			mockStreamWebhook.mockReturnValue({ abort: abortFn });

			const cb = makeCallbacks();
			const handle = streamUnified({ source: 'webhook', sessionId: 'sess-1' }, cb);
			handle.abort();

			expect(abortFn).toHaveBeenCalledOnce();
		});
	});

	describe('consistent callback interface', () => {
		it('both sources produce the same callback signature', () => {
			const cbLangflow = makeCallbacks();
			const cbWebhook = makeCallbacks();

			mockStreamChat.mockImplementation((_m, _c, callbacks) => {
				callbacks.onToken('chunk');
				callbacks.onEnd('chunk');
				return fakeHandle;
			});
			mockStreamWebhook.mockImplementation((_id, callbacks) => {
				callbacks.onToken('chunk');
				callbacks.onEnd('chunk');
				return fakeHandle;
			});

			streamUnified({ source: 'langflow', message: 'q', conversationId: 'c' }, cbLangflow);
			streamUnified({ source: 'webhook', sessionId: 's' }, cbWebhook);

			expect(cbLangflow.onToken).toHaveBeenCalledWith('chunk');
			expect(cbLangflow.onEnd).toHaveBeenCalledWith('chunk');
			expect(cbWebhook.onToken).toHaveBeenCalledWith('chunk');
			expect(cbWebhook.onEnd).toHaveBeenCalledWith('chunk');
		});

		it('both sources return a handle with abort()', () => {
			const langflowHandle = streamUnified(
				{ source: 'langflow', message: 'q', conversationId: 'c' },
				makeCallbacks()
			);
			const webhookHandle = streamUnified(
				{ source: 'webhook', sessionId: 's' },
				makeCallbacks()
			);

			expect(typeof langflowHandle.abort).toBe('function');
			expect(typeof webhookHandle.abort).toBe('function');
		});
	});
});
