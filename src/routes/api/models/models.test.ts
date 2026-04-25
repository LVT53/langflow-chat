import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/config-store', () => ({
	getConfig: vi.fn(),
	getAvailableModels: vi.fn(),
	getAvailableModelsWithProviders: vi.fn(),
}));

import { GET } from './+server';
import {
	getAvailableModels,
	getAvailableModelsWithProviders,
	getConfig,
} from '$lib/server/config-store';

const mockGetConfig = getConfig as ReturnType<typeof vi.fn>;
const mockGetAvailableModels = getAvailableModels as ReturnType<typeof vi.fn>;
const mockGetAvailableModelsWithProviders = getAvailableModelsWithProviders as ReturnType<typeof vi.fn>;

describe('GET /api/models', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetConfig.mockReturnValue({
			model1: { displayName: 'Test Model 1' },
			model2: { displayName: 'Test Model 2' },
			model2Enabled: true,
		});
		mockGetAvailableModels.mockReturnValue([
			{ id: 'model1', displayName: 'Test Model 1' },
			{ id: 'model2', displayName: 'Test Model 2' },
		]);
		mockGetAvailableModelsWithProviders.mockResolvedValue([
			{ id: 'model1', displayName: 'Test Model 1' },
			{ id: 'model2', displayName: 'Test Model 2' },
		]);
	});

	it('returns 200 with the available models array', async () => {
		const response = await GET({} as any);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.models).toHaveLength(2);
	});

	it('returns model1 and model2 when model2 is enabled', async () => {
		const response = await GET({} as any);
		const data = await response.json();

		expect(data.models).toEqual([
			{ id: 'model1', displayName: 'Test Model 1' },
			{ id: 'model2', displayName: 'Test Model 2' },
		]);
	});

	it('hides model2 when model2 is disabled', async () => {
		mockGetConfig.mockReturnValue({
			model1: { displayName: 'Test Model 1' },
			model2: { displayName: 'Test Model 2' },
			model2Enabled: false,
		});
		mockGetAvailableModels.mockReturnValue([
			{ id: 'model1', displayName: 'Test Model 1' },
		]);
		mockGetAvailableModelsWithProviders.mockResolvedValue([
			{ id: 'model1', displayName: 'Test Model 1' },
		]);

		const response = await GET({} as any);
		const data = await response.json();

		expect(data.models).toEqual([
			{ id: 'model1', displayName: 'Test Model 1' },
		]);
	});
});
