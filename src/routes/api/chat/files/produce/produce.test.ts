import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/services/conversations', () => ({
	getConversation: vi.fn(),
	getConversationUserId: vi.fn(),
}));

vi.mock('$lib/server/services/file-production', () => ({
	createFailedFileProductionJob: vi.fn(),
	createOrReuseFileProductionJob: vi.fn(),
	wakeFileProductionWorker: vi.fn(),
}));

vi.mock('$lib/server/auth/hooks', () => ({
	verifyFileGenerateServiceAssertion: vi.fn(),
}));

import { POST } from './+server';
import { getConversation } from '$lib/server/services/conversations';
import {
	createFailedFileProductionJob,
	createOrReuseFileProductionJob,
	wakeFileProductionWorker,
} from '$lib/server/services/file-production';

const mockGetConversation = getConversation as ReturnType<typeof vi.fn>;
const mockCreateOrReuseFileProductionJob =
	createOrReuseFileProductionJob as ReturnType<typeof vi.fn>;
const mockCreateFailedFileProductionJob =
	createFailedFileProductionJob as ReturnType<typeof vi.fn>;
const mockWakeFileProductionWorker = wakeFileProductionWorker as ReturnType<typeof vi.fn>;

function makeEvent(body: unknown, user: { id: string } | null = { id: 'user-1' }) {
	return {
		request: new Request('http://localhost/api/chat/files/produce', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		}),
		locals: { user },
		params: {},
		url: new URL('http://localhost/api/chat/files/produce'),
		route: { id: '/api/chat/files/produce' },
	} as any;
}

describe('POST /api/chat/files/produce', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetConversation.mockResolvedValue({
			id: 'conv-1',
			title: 'Files',
			createdAt: 1,
			updatedAt: 1,
		});
		mockCreateOrReuseFileProductionJob.mockResolvedValue({
			reused: false,
			job: {
				id: 'job-1',
				conversationId: 'conv-1',
				assistantMessageId: null,
				title: 'CSV export',
				status: 'queued',
				stage: null,
				createdAt: 1,
				updatedAt: 1,
				files: [],
				warnings: [],
				error: null,
			},
		});
		mockCreateFailedFileProductionJob.mockResolvedValue({
			id: 'job-failed',
			conversationId: 'conv-1',
			assistantMessageId: null,
			title: 'Broken export',
			status: 'failed',
			stage: null,
			createdAt: 1,
			updatedAt: 1,
			files: [],
			warnings: [],
			error: {
				code: 'invalid_program_language',
				message: 'program.language must be python or javascript',
				retryable: false,
			},
		});
		mockWakeFileProductionWorker.mockResolvedValue(undefined);
	});

	it('creates a durable queued program-mode job and wakes the worker', async () => {
		const response = await POST(
			makeEvent({
				conversationId: 'conv-1',
				idempotencyKey: 'turn-1:file-1',
				requestTitle: 'CSV export',
				sourceMode: 'program',
				outputs: [{ type: 'csv' }],
				program: {
					language: 'python',
					sourceCode: 'from pathlib import Path\nPath("/output/data.csv").write_text("a,b\\n1,2")',
					filename: 'data.csv',
				},
			})
		);
		const data = await response.json();

		expect(response.status).toBe(202);
		expect(mockGetConversation).toHaveBeenCalledWith('user-1', 'conv-1');
		expect(mockCreateOrReuseFileProductionJob).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				conversationId: 'conv-1',
				assistantMessageId: null,
				title: 'CSV export',
				idempotencyKey: 'turn-1:file-1',
				sourceMode: 'program',
				requestJson: expect.objectContaining({
					sourceMode: 'program',
					program: expect.objectContaining({
						language: 'python',
						filename: 'data.csv',
					}),
				}),
			})
		);
		expect(mockWakeFileProductionWorker).toHaveBeenCalledTimes(1);
		expect(data).toEqual({
			job: expect.objectContaining({ id: 'job-1', status: 'queued' }),
			reused: false,
		});
	});

	it('persists source validation failures as failed jobs without waking the worker', async () => {
		const response = await POST(
			makeEvent({
				conversationId: 'conv-1',
				idempotencyKey: 'turn-1:bad-file',
				requestTitle: 'Broken export',
				sourceMode: 'program',
				outputs: [{ type: 'csv' }],
				program: {
					language: 'ruby',
					sourceCode: 'puts "bad"',
				},
			})
		);
		const data = await response.json();

		expect(response.status).toBe(422);
		expect(mockGetConversation).toHaveBeenCalledWith('user-1', 'conv-1');
		expect(mockCreateFailedFileProductionJob).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				conversationId: 'conv-1',
				title: 'Broken export',
				idempotencyKey: 'turn-1:bad-file',
				sourceMode: 'program',
				errorCode: 'invalid_program_language',
				errorMessage: 'program.language must be python or javascript',
				requestJson: expect.objectContaining({
					sourceMode: 'program',
				}),
			})
		);
		expect(mockWakeFileProductionWorker).not.toHaveBeenCalled();
		expect(data.job).toMatchObject({
			id: 'job-failed',
			status: 'failed',
		});
	});
});
