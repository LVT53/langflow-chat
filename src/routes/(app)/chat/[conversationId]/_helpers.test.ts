import { describe, expect, it } from 'vitest';
import type { I18nKey } from '$lib/i18n';
import {
	applyToolCallUpdateToMessageList,
	attachUnassignedFileProductionJobsToAssistant,
	cloneSendPayload,
	createAssistantPlaceholder,
	getWorkspacePresentationAfterDocumentOpen,
	hasActiveDeepResearchJobs,
	hasActiveFileProductionJobs,
	isConversationReadOnly,
	shouldStartDeepResearchJob,
	mergeFileProductionJob,
	shouldHydrateFileProductionJobsOnToolCall,
	toFriendlySendError,
} from './_helpers';
import type { DeepResearchJob, FileProductionJob } from '$lib/types';

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

function makeDeepResearchJob(status: DeepResearchJob['status']): DeepResearchJob {
	return {
		id: `research-${status}`,
		conversationId: 'conv-1',
		triggerMessageId: 'user-1',
		depth: 'standard',
		status,
		stage: status,
		title: `${status} research`,
		userRequest: `${status} research`,
		createdAt: 1,
		updatedAt: 1,
		completedAt: null,
		cancelledAt: status === 'cancelled' ? 2 : null,
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

describe('workspace presentation helpers', () => {
	it('defaults new document opens to the docked workspace from chat rows and cards', () => {
		expect(getWorkspacePresentationAfterDocumentOpen('expanded')).toBe('docked');
	});

	it('preserves expanded presentation for document opens initiated inside the workspace', () => {
		expect(
			getWorkspacePresentationAfterDocumentOpen('expanded', {
				preservePresentation: true,
			})
		).toBe('expanded');
	});
});

describe('send payload helpers', () => {
	it('preserves Deep Research depth when cloning queued turns', () => {
		const cloned = cloneSendPayload({
			message: 'Research battery recycling',
			attachmentIds: [],
			attachments: [],
			pendingAttachments: [],
			conversationId: 'conv-1',
			deepResearchDepth: 'focused',
		});

		expect(cloned).toEqual(
			expect.objectContaining({
				message: 'Research battery recycling',
				deepResearchDepth: 'focused',
			})
		);
	});

	it('routes composer-selected Deep Research through the job-start path', () => {
		const payload = {
			message: 'Research battery recycling',
			attachmentIds: [],
			attachments: [],
			pendingAttachments: [],
			conversationId: 'conv-1',
			deepResearchDepth: 'focused' as const,
		};

		expect(shouldStartDeepResearchJob(payload)).toBe(true);
		expect(shouldStartDeepResearchJob({ ...payload, deepResearchDepth: null })).toBe(false);
		expect(shouldStartDeepResearchJob(payload, 'assistant-retry-1')).toBe(false);
	});
});

describe('conversation read-only helpers', () => {
	it('treats sealed conversations as read-only for chat input', () => {
		expect(isConversationReadOnly({ status: 'sealed' })).toBe(true);
		expect(isConversationReadOnly({ status: 'open' })).toBe(false);
		expect(isConversationReadOnly({ status: undefined })).toBe(false);
	});

	it('does not infer read-only mode from cancelled or failed Deep Research jobs', () => {
		const jobs = [makeDeepResearchJob('cancelled'), makeDeepResearchJob('failed')];

		expect(isConversationReadOnly({ status: 'open' }, jobs)).toBe(false);
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
		expect(shouldHydrateFileProductionJobsOnToolCall('file_production', 'done')).toBe(true);
		expect(shouldHydrateFileProductionJobsOnToolCall('produce_file', 'running')).toBe(false);
		expect(shouldHydrateFileProductionJobsOnToolCall('web_search', 'done')).toBe(false);
	});

	it('keeps produce_file events out of visible thinking segments', () => {
		const list = [createAssistantPlaceholder('assistant-1')];
		const running = applyToolCallUpdateToMessageList(list, {
			placeholderId: 'assistant-1',
			name: 'produce_file',
			input: { requestTitle: 'Quarterly report' },
			status: 'running',
		});
		const done = applyToolCallUpdateToMessageList(running, {
			placeholderId: 'assistant-1',
			name: 'produce_file',
			input: {},
			status: 'done',
		});

		expect(done[0].thinkingSegments).toBeUndefined();
	});

	it('keeps non-file tool calls visible in thinking segments', () => {
		const list = [createAssistantPlaceholder('assistant-1')];
		const updated = applyToolCallUpdateToMessageList(list, {
			placeholderId: 'assistant-1',
			name: 'web_search',
			input: { query: 'Svelte docs' },
			status: 'running',
		});

		expect(updated[0].thinkingSegments).toEqual([
			{
				type: 'tool_call',
				name: 'web_search',
				input: { query: 'Svelte docs' },
				status: 'running',
			},
		]);
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

describe('Deep Research chat helpers', () => {
	it('detects research jobs that still need chat card refreshes', () => {
		expect(hasActiveDeepResearchJobs([makeDeepResearchJob('awaiting_plan')])).toBe(true);
		expect(hasActiveDeepResearchJobs([makeDeepResearchJob('awaiting_approval')])).toBe(true);
		expect(hasActiveDeepResearchJobs([makeDeepResearchJob('approved')])).toBe(true);
		expect(hasActiveDeepResearchJobs([makeDeepResearchJob('running')])).toBe(true);
		expect(
			hasActiveDeepResearchJobs([
				makeDeepResearchJob('completed'),
				makeDeepResearchJob('failed'),
				makeDeepResearchJob('cancelled'),
			])
		).toBe(false);
	});
});
