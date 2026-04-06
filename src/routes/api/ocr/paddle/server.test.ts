import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetConfig = vi.fn();
const mockCallPaddleOcrAdapter = vi.fn();

vi.mock('$lib/server/config-store', () => ({
	getConfig: () => mockGetConfig(),
}));

vi.mock('$lib/server/services/ocr/paddle-adapter', async () => {
	class MockPaddleAdapterHttpError extends Error {
		status: number;
		body: string | null;

		constructor(status: number, message: string, body: string | null) {
			super(message);
			this.name = 'PaddleAdapterHttpError';
			this.status = status;
			this.body = body;
		}
	}

	return {
		PaddleAdapterHttpError: MockPaddleAdapterHttpError,
		callPaddleOcrAdapter: mockCallPaddleOcrAdapter,
	};
});

describe('/api/ocr/paddle', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetConfig.mockReturnValue({
			documentParserOcrLanguage: 'hu+en+nl',
			documentParserPaddleBackendUrl: 'http://127.0.0.1:5000/ocr',
		});
	});

	it('returns 400 when file is missing', async () => {
		const { POST } = await import('./+server');
		const request = {
			formData: async () => new FormData(),
		} as Request;

		const response = await POST({ request } as Parameters<typeof POST>[0]);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Missing file' });
	});

	it('forwards first language from profile for paddle backend compatibility', async () => {
		mockCallPaddleOcrAdapter.mockResolvedValueOnce({
			results: [{ text: 'Szia', bbox: [0, 0, 10, 10], confidence: 0.9 }],
		});

		const { POST } = await import('./+server');
		const formData = new FormData();
		formData.append('file', new File([new Uint8Array([1, 2, 3])], 'scan.png', { type: 'image/png' }));
		formData.append('language', 'hu+en+nl');

		const request = {
			formData: async () => formData,
		} as Request;

		const response = await POST({ request } as Parameters<typeof POST>[0]);
		expect(response.status).toBe(200);
		expect(mockCallPaddleOcrAdapter).toHaveBeenCalledWith(
			expect.objectContaining({
				language: 'hu',
				endpoint: 'http://127.0.0.1:5000/ocr',
			})
		);
		expect(await response.json()).toEqual({
			results: [{ text: 'Szia', bbox: [0, 0, 10, 10], confidence: 0.9 }],
		});
	});

	it('returns 500 when backend URL is not configured', async () => {
		mockGetConfig.mockReturnValueOnce({
			documentParserOcrLanguage: 'hu+en+nl',
			documentParserPaddleBackendUrl: '',
		});

		const { POST } = await import('./+server');
		const formData = new FormData();
		formData.append('file', new File([new Uint8Array([1])], 'scan.png', { type: 'image/png' }));

		const request = {
			formData: async () => formData,
		} as Request;

		const response = await POST({ request } as Parameters<typeof POST>[0]);
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			error: 'DOCUMENT_PARSER_PADDLE_BACKEND_URL is not configured',
		});
	});
});
