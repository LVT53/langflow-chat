import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/env', () => ({
	config: {
		model1: {
			baseUrl: 'http://localhost:30001/v1',
			apiKey: 'test-key-1',
			modelName: 'test-model-1',
			displayName: 'Test Model 1'
		},
		model2: {
			baseUrl: 'http://localhost:30002/v1',
			apiKey: 'test-key-2',
			modelName: 'test-model-2',
			displayName: 'Test Model 2'
		}
	}
}));

import { GET } from './+server';

function makeEvent() {
	return {} as any;
}

describe('GET /api/models', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 200 with models array', async () => {
		const response = await GET(makeEvent());
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.models).toHaveLength(2);
	});

	it('returns model1 with correct id and displayName', async () => {
		const response = await GET(makeEvent());
		const data = await response.json();

		expect(data.models[0]).toEqual({
			id: 'model1',
			displayName: 'Test Model 1'
		});
	});

	it('returns model2 with correct id and displayName', async () => {
		const response = await GET(makeEvent());
		const data = await response.json();

		expect(data.models[1]).toEqual({
			id: 'model2',
			displayName: 'Test Model 2'
		});
	});

	it('returns Content-Type application/json header', async () => {
		const response = await GET(makeEvent());

		expect(response.headers.get('Content-Type')).toBe('application/json');
	});
});
