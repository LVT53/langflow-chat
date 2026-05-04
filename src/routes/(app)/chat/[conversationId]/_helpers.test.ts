import { describe, expect, it } from 'vitest';
import type { I18nKey } from '$lib/i18n';
import {
	attachUnassignedFileProductionJobsToAssistant,
	hasActiveFileProductionJobs,
	mergeFileProductionJob,
	shouldHydrateFileProductionJobsOnToolCall,
	toFriendlySendError,
} from './_helpers';
import type { FileProductionJob } from '$lib/types';

function makeJob(id: string, status: FileProductionJob['status']): FileProductionJob {
	return {
		id,
		conversationId: 'conv-1',
		assistantMessageId: 'assistant-1',
		title: id,
		status,
		stage: null,
		createdAt: 1,
		updatedAt: 1,
		files: [],
		warnings: [],
		error: null,
	};
}

function makeUnassignedJob(
	id: string,
	overrides: Partial<FileProductionJob> = {}
): FileProductionJob {
	return {
		...makeJob(id, 'succeeded'),
		assistantMessageId: null,
		...overrides,
	};
}

describe('toFriendlySendError', () => {
	const translate = (key: I18nKey) => `translated:${key}`;

	it('uses localized messages for known stream error codes', () => {
		const error = new Error('Stream error') as Error & { code?: string };
		error.code = 'timeout';

		expect(toFriendlySendError(error, translate)).toBe('translated:chat.error.timeout');
	});

	it('maps unknown generation failures to the descriptive backend message', () => {
		expect(toFriendlySendError(new Error('Langflow down'), translate)).toBe(
			'translated:chat.error.backend'
		);
	});
});

describe('file production chat helpers', () => {
	it('detects only queued and running jobs as active polling candidates', () => {
		expect(hasActiveFileProductionJobs([makeJob('queued', 'queued')])).toBe(true);
		expect(hasActiveFileProductionJobs([makeJob('running', 'running')])).toBe(true);
		expect(
			hasActiveFileProductionJobs([
				makeJob('succeeded', 'succeeded'),
				makeJob('failed', 'failed'),
				makeJob('cancelled', 'cancelled'),
			])
		).toBe(false);
	});

	it('merges an updated job into the existing chat state without duplicating cards', () => {
		const current = [makeJob('job-1', 'running'), makeJob('job-2', 'queued')];
		const merged = mergeFileProductionJob(current, {
			...makeJob('job-1', 'failed'),
			error: {
				code: 'renderer_timeout',
				message: 'Renderer timed out.',
				retryable: true,
			},
		});

		expect(merged).toHaveLength(2);
		expect(merged[0]).toMatchObject({
			id: 'job-1',
			status: 'failed',
			error: {
				code: 'renderer_timeout',
			},
		});
		expect(merged[1].id).toBe('job-2');
	});

	it('hydrates file-production jobs once the produce_file tool call has created a job', () => {
		expect(shouldHydrateFileProductionJobsOnToolCall('produce_file', 'done')).toBe(true);
		expect(shouldHydrateFileProductionJobsOnToolCall('produce_file', 'running')).toBe(false);
		expect(shouldHydrateFileProductionJobsOnToolCall('web_search', 'done')).toBe(false);
	});

	it('keeps newly produced files attached when the streaming placeholder becomes the server assistant message', () => {
		const jobs = [
			makeUnassignedJob('job-new'),
			makeUnassignedJob('job-other-conversation', { conversationId: 'conv-2' }),
			makeJob('job-existing', 'succeeded'),
		];

		const attached = attachUnassignedFileProductionJobsToAssistant(jobs, {
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-server',
		});

		expect(attached).toEqual([
			expect.objectContaining({
				id: 'job-new',
				assistantMessageId: 'assistant-server',
			}),
			expect.objectContaining({
				id: 'job-other-conversation',
				assistantMessageId: null,
			}),
			expect.objectContaining({
				id: 'job-existing',
				assistantMessageId: 'assistant-1',
			}),
		]);
	});
});
