import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamChat } from './streaming';
import type { StreamCallbacks } from './streaming';

function buildFetchResponse(sseLines: string[], status = 200): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const line of sseLines) {
				controller.enqueue(encoder.encode(line));
			}
			controller.close();
		}
	});
	return new Response(stream, {
		status,
		headers: { 'Content-Type': 'text/event-stream' }
	});
}

interface MockCallbacks {
	onToken: ReturnType<typeof vi.fn>;
	onThinking: ReturnType<typeof vi.fn>;
	onEnd: ReturnType<typeof vi.fn>;
	onError: ReturnType<typeof vi.fn>;
}

function makeCallbacks(): MockCallbacks {
	return {
		onToken: vi.fn(),
		onThinking: vi.fn(),
		onEnd: vi.fn(),
		onError: vi.fn()
	};
}

async function waitForStream(cb: MockCallbacks): Promise<void> {
	return new Promise<void>((resolve) => {
		const originalOnEnd = cb.onEnd as (...args: unknown[]) => void;
		const originalOnError = cb.onError as (...args: unknown[]) => void;
		cb.onEnd = vi.fn((...args: unknown[]) => {
			originalOnEnd(...args);
			resolve();
		});
		cb.onError = vi.fn((...args: unknown[]) => {
			originalOnError(...args);
			resolve();
		});
	});
}

describe('streamChat', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('calls onToken for each SSE token chunk', async () => {
		const mockFetch = vi.mocked(fetch);
		mockFetch.mockResolvedValue(
			buildFetchResponse([
				'event: token\n',
				'data: {"text":"Hello"}\n',
				'\n',
				'event: token\n',
				'data: {"text":" world"}\n',
				'\n',
				'event: end\n',
				'data: {}\n',
				'\n'
			])
		);

		const cb = makeCallbacks();
		const done = waitForStream(cb);
		streamChat('test message', 'conv-1', cb as unknown as StreamCallbacks);
		await done;

		expect(cb.onToken).toHaveBeenCalledTimes(2);
		expect(cb.onToken).toHaveBeenNthCalledWith(1, 'Hello');
		expect(cb.onToken).toHaveBeenNthCalledWith(2, ' world');
	});

	it('calls onEnd with full concatenated text', async () => {
		const mockFetch = vi.mocked(fetch);
		mockFetch.mockResolvedValue(
			buildFetchResponse([
				'event: token\n',
				'data: {"text":"Hello"}\n',
				'\n',
				'event: token\n',
				'data: {"text":" world"}\n',
				'\n',
				'event: end\n',
				'data: {}\n',
				'\n'
			])
		);

		const cb = makeCallbacks();
		const done = waitForStream(cb);
		streamChat('test message', 'conv-1', cb as unknown as StreamCallbacks);
		await done;

		expect(cb.onEnd).toHaveBeenCalledOnce();
		expect(cb.onEnd).toHaveBeenCalledWith('Hello world', undefined);
		expect(cb.onError).not.toHaveBeenCalled();
	});

	it('calls onThinking for thinking SSE chunks', async () => {
		const mockFetch = vi.mocked(fetch);
		mockFetch.mockResolvedValue(
			buildFetchResponse([
				'event: thinking\n',
				'data: {"text":"Need to reason first"}\n',
				'\n',
				'event: token\n',
				'data: {"text":"Final answer"}\n',
				'\n',
				'event: end\n',
				'data: {"thinking":"Need to reason first\\n"}\n',
				'\n'
			])
		);

		const cb = {
			...makeCallbacks(),
			onThinking: vi.fn()
		};
		const done = waitForStream(cb as unknown as MockCallbacks);
		streamChat('test message', 'conv-1', cb as unknown as StreamCallbacks);
		await done;

		expect(cb.onThinking).toHaveBeenCalledOnce();
		expect(cb.onThinking).toHaveBeenCalledWith('Need to reason first');
		expect(cb.onEnd).toHaveBeenCalledWith('Final answer', {
			thinking: 'Need to reason first\n'
		});
	});

	it('parses end-event metadata from the data line', async () => {
		const mockFetch = vi.mocked(fetch);
		mockFetch.mockResolvedValue(
			buildFetchResponse([
				'event: token\n',
				'data: {"text":"Hello"}\n',
				'\n',
				'event: end\n',
				'data: {"tokenCount":3,"generationSpeed":12.5,"wasStopped":false}\n',
				'\n'
			])
		);

		const cb = makeCallbacks();
		const done = waitForStream(cb);
		streamChat('test message', 'conv-1', cb as unknown as StreamCallbacks);
		await done;

		expect(cb.onEnd).toHaveBeenCalledWith('Hello', {
			tokenCount: 3,
			generationSpeed: 12.5,
			wasStopped: false
		});
	});

	it('calls onError on network failure', async () => {
		const mockFetch = vi.mocked(fetch);
		mockFetch.mockRejectedValue(new Error('Network failure'));

		const cb = makeCallbacks();
		const done = waitForStream(cb);
		streamChat('test message', 'conv-1', cb as unknown as StreamCallbacks);
		await done;

		expect(cb.onError).toHaveBeenCalledOnce();
		expect(cb.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Network failure' }));
		expect(cb.onEnd).not.toHaveBeenCalled();
	});

	it('calls onError when response is not ok', async () => {
		const mockFetch = vi.mocked(fetch);
		mockFetch.mockResolvedValue(
			new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			})
		);

		const cb = makeCallbacks();
		const done = waitForStream(cb);
		streamChat('test message', 'conv-1', cb as unknown as StreamCallbacks);
		await done;

		expect(cb.onError).toHaveBeenCalledOnce();
		expect(cb.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Unauthorized' }));
	});

	it('calls onError when stream emits error event', async () => {
		const mockFetch = vi.mocked(fetch);
		mockFetch.mockResolvedValue(
			buildFetchResponse([
				'event: error\n',
				'data: {"message":"Something went wrong"}\n',
				'\n'
			])
		);

		const cb = makeCallbacks();
		const done = waitForStream(cb);
		streamChat('test message', 'conv-1', cb as unknown as StreamCallbacks);
		await done;

		expect(cb.onError).toHaveBeenCalledOnce();
		expect(cb.onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'Something went wrong' })
		);
		expect(cb.onEnd).not.toHaveBeenCalled();
	});

	it('calls onEnd with accumulated text when stream closes without end event', async () => {
		const mockFetch = vi.mocked(fetch);
		mockFetch.mockResolvedValue(
			buildFetchResponse([
				'event: token\n',
				'data: {"text":"partial"}\n',
				'\n'
			])
		);

		const cb = makeCallbacks();
		const done = waitForStream(cb);
		streamChat('test message', 'conv-1', cb as unknown as StreamCallbacks);
		await done;

		expect(cb.onEnd).toHaveBeenCalledOnce();
		expect(cb.onEnd).toHaveBeenCalledWith('partial');
	});

	it('abort() stops the stream and does not call onError', async () => {
		const mockFetch = vi.mocked(fetch);

		let abortReject!: (err: Error) => void;
		mockFetch.mockReturnValue(
			new Promise<Response>((_resolve, reject) => {
				abortReject = reject;
			})
		);

		const cb = makeCallbacks();
		const handle = streamChat('test message', 'conv-1', cb as unknown as StreamCallbacks);

		await new Promise((r) => setTimeout(r, 10));
		handle.abort();

		abortReject(new DOMException('The user aborted a request.', 'AbortError'));

		await new Promise((r) => setTimeout(r, 30));

		expect(cb.onError).not.toHaveBeenCalled();
	});
});
