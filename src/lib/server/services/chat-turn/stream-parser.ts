export type UpstreamEvent = {
	event: string;
	data: unknown;
};

function parseMaybeJson(value: unknown): unknown {
	if (typeof value !== 'string') {
		return value;
	}

	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function parseSseBlock(block: string): UpstreamEvent | null {
	let event = 'message';
	const dataLines: string[] = [];

	for (const rawLine of block.split('\n')) {
		const line = rawLine.trimEnd();
		if (!line || line.startsWith(':')) continue;

		if (line.startsWith('event:')) {
			event = line.slice('event:'.length).trim() || 'message';
			continue;
		}

		if (line.startsWith('data:')) {
			dataLines.push(line.slice('data:'.length).trimStart());
		}
	}

	if (dataLines.length === 0 && event === 'message') {
		return null;
	}

	return {
		event,
		data: parseMaybeJson(dataLines.join('\n')),
	};
}

function parseJsonBlock(block: string): UpstreamEvent | null {
	try {
		const parsed = JSON.parse(block) as { event?: unknown; data?: unknown };
		return {
			event: typeof parsed.event === 'string' ? parsed.event : 'message',
			data: parsed.data,
		};
	} catch {
		return null;
	}
}

function parseEventBlock(block: string): UpstreamEvent | null {
	return block.includes('event:') || block.includes('data:')
		? parseSseBlock(block)
		: parseJsonBlock(block);
}

/**
 * Async generator that yields parsed upstream SSE/JSON events from a stream.
 */
export async function* parseUpstreamEvents(
	stream: ReadableStream<Uint8Array>,
): AsyncGenerator<UpstreamEvent, void, unknown> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (true) {
			let chunk: ReadableStreamReadResult<Uint8Array>;
			try {
				chunk = await reader.read();
			} catch (error) {
				const finalBlock = buffer.trim();
				if (finalBlock) {
					const event = parseEventBlock(finalBlock);
					if (event) {
						yield event;
						return;
					}
				}
				throw error;
			}

			const { done, value } = chunk;
			if (done) break;
			if (!value) continue;

			buffer += decoder.decode(value, { stream: true });
			buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

			if (buffer.includes('event:') || buffer.includes('data:')) {
				let separatorIndex = buffer.indexOf('\n\n');
				while (separatorIndex !== -1) {
					const block = buffer.slice(0, separatorIndex).trim();
					buffer = buffer.slice(separatorIndex + 2);

					if (block) {
						const event = parseEventBlock(block);
						if (event) {
							yield event;
						}
					}

					separatorIndex = buffer.indexOf('\n\n');
				}
				continue;
			}

			let newlineIndex = buffer.indexOf('\n');
			while (newlineIndex !== -1) {
				const line = buffer.slice(0, newlineIndex).trim();
				buffer = buffer.slice(newlineIndex + 1);

				if (line) {
					const event = parseJsonBlock(line);
					if (event) {
						yield event;
					} else {
						buffer = `${line}\n${buffer}`;
						break;
					}
				}

				newlineIndex = buffer.indexOf('\n');
			}
		}

		buffer += decoder.decode();
		buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

		const finalBlock = buffer.trim();
		if (finalBlock) {
			const event = parseEventBlock(finalBlock);
			if (event) {
				yield event;
			}
		}
	} finally {
		reader.releaseLock();
	}
}

export { parseSseBlock, parseJsonBlock, parseEventBlock, parseMaybeJson };