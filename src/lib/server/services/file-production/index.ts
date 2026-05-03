import type { FileProductionJob } from '$lib/types';
import { getChatFiles } from '$lib/server/services/chat-files';
import { db } from '$lib/server/db';
import {
	fileProductionJobAttempts,
	fileProductionJobFiles,
	fileProductionJobs,
} from '$lib/server/db/schema';
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { ChatFile } from '$lib/server/services/chat-files';
import { randomUUID } from 'node:crypto';

export interface CreateFileProductionJobInput {
	userId: string;
	conversationId: string;
	assistantMessageId?: string | null;
	title: string;
	origin: string;
	now?: Date;
}

export interface FileProductionJobAttempt {
	id: string;
	jobId: string;
	attemptNumber: number;
	status: string;
	stage: string | null;
	workerId: string | null;
	claimedAt: number | null;
	heartbeatAt: number | null;
	startedAt: number | null;
	finishedAt: number | null;
	errorCode: string | null;
	errorMessage: string | null;
	retryable: boolean;
}

export interface ClaimFileProductionJobInput {
	workerId: string;
	now?: Date;
}

export interface OwnedFileProductionAttemptInput {
	jobId: string;
	attemptId: string;
	workerId: string;
	now?: Date;
}

export interface FailFileProductionAttemptInput extends OwnedFileProductionAttemptInput {
	errorCode: string;
	errorMessage: string;
	retryable: boolean;
}

export interface RecoverStaleFileProductionAttemptsInput {
	staleBefore: Date;
	now?: Date;
}

export interface RetryFileProductionJobInput {
	userId: string;
	jobId: string;
	now?: Date;
}

export interface CancelFileProductionJobInput {
	userId: string;
	jobId: string;
	now?: Date;
}

export interface ClaimedFileProductionJob {
	job: FileProductionJob;
	attempt: FileProductionJobAttempt;
}

function legacyJobId(fileId: string): string {
	return `legacy-file:${fileId}`;
}

function legacyJobFileLinkId(fileId: string): string {
	return `legacy-file-link:${fileId}`;
}

async function ensureLegacyJobs(files: ChatFile[]): Promise<void> {
	if (files.length === 0) {
		return;
	}

	const fileIds = files.map((file) => file.id);
	const existingLinks = await db
		.select({ chatGeneratedFileId: fileProductionJobFiles.chatGeneratedFileId })
		.from(fileProductionJobFiles)
		.where(inArray(fileProductionJobFiles.chatGeneratedFileId, fileIds));
	const linkedFileIds = new Set(existingLinks.map((link) => link.chatGeneratedFileId));
	const missingFiles = files.filter((file) => !linkedFileIds.has(file.id));

	for (const file of missingFiles) {
		const createdAt = new Date(file.createdAt);
		await db
			.insert(fileProductionJobs)
			.values({
				id: legacyJobId(file.id),
				conversationId: file.conversationId,
				assistantMessageId: file.assistantMessageId,
				userId: file.userId,
				title: file.documentLabel ?? file.filename,
				status: 'succeeded',
				stage: null,
				origin: 'legacy_generated_file',
				createdAt,
				updatedAt: createdAt,
			})
			.onConflictDoNothing({ target: fileProductionJobs.id });

		await db
			.insert(fileProductionJobFiles)
			.values({
				id: legacyJobFileLinkId(file.id),
				jobId: legacyJobId(file.id),
				chatGeneratedFileId: file.id,
				sortOrder: 0,
				createdAt,
			})
			.onConflictDoNothing({ target: fileProductionJobFiles.chatGeneratedFileId });
	}
}

function mapChatFileToProducedFile(file: ChatFile): FileProductionJob['files'][number] {
	return {
		id: file.id,
		filename: file.filename,
		mimeType: file.mimeType,
		sizeBytes: file.sizeBytes,
		downloadUrl: `/api/chat/files/${file.id}/download`,
		previewUrl: `/api/chat/files/${file.id}/preview`,
		artifactId: file.artifactId,
		documentFamilyId: file.documentFamilyId,
		documentFamilyStatus: file.documentFamilyStatus,
		documentLabel: file.documentLabel,
		documentRole: file.documentRole,
		versionNumber: file.versionNumber,
		originConversationId: file.originConversationId,
		originAssistantMessageId: file.originAssistantMessageId,
		sourceChatFileId: file.sourceChatFileId,
	};
}

export async function createFileProductionJob(
	input: CreateFileProductionJobInput
): Promise<FileProductionJob> {
	const now = input.now ?? new Date();
	const id = randomUUID();
	await db.insert(fileProductionJobs).values({
		id,
		conversationId: input.conversationId,
		assistantMessageId: input.assistantMessageId ?? null,
		userId: input.userId,
		title: input.title,
		status: 'queued',
		stage: null,
		origin: input.origin,
		currentAttemptId: null,
		retryable: false,
		errorCode: null,
		errorMessage: null,
		completedAt: null,
		cancelRequestedAt: null,
		createdAt: now,
		updatedAt: now,
	});

	return {
		id,
		conversationId: input.conversationId,
		assistantMessageId: input.assistantMessageId ?? null,
		title: input.title,
		status: 'queued',
		stage: null,
		createdAt: now.getTime(),
		updatedAt: now.getTime(),
		files: [],
		warnings: [],
		error: null,
	};
}

function mapError(job: typeof fileProductionJobs.$inferSelect): FileProductionJob['error'] {
	if (!job.errorCode && !job.errorMessage) {
		return null;
	}

	return {
		code: job.errorCode ?? 'file_production_error',
		message: job.errorMessage ?? 'File production failed.',
		retryable: Boolean(job.retryable),
	};
}

function mapJobRow(
	job: typeof fileProductionJobs.$inferSelect,
	files: FileProductionJob['files']
): FileProductionJob {
	return {
		id: job.id,
		conversationId: job.conversationId,
		assistantMessageId: job.assistantMessageId,
		title: job.title,
		status: job.status as FileProductionJob['status'],
		stage: job.stage,
		createdAt: job.createdAt.getTime(),
		updatedAt: job.updatedAt.getTime(),
		files,
		warnings: [],
		error: mapError(job),
	};
}

export async function claimNextFileProductionJob(
	input: ClaimFileProductionJobInput
): Promise<ClaimedFileProductionJob | null> {
	const now = input.now ?? new Date();
	const claimed = db.transaction((tx) => {
		const activeRunningJob = tx
			.select({ id: fileProductionJobs.id })
			.from(fileProductionJobs)
			.where(eq(fileProductionJobs.status, 'running'))
			.limit(1)
			.all();

		if (activeRunningJob.length > 0) {
			return null;
		}

		const [queuedJob] = tx
			.select()
			.from(fileProductionJobs)
			.where(eq(fileProductionJobs.status, 'queued'))
			.orderBy(asc(fileProductionJobs.createdAt))
			.limit(1)
			.all();

		if (!queuedJob) {
			return null;
		}

		const [attemptStats] = tx
			.select({
				maxAttemptNumber: sql<number>`coalesce(max(${fileProductionJobAttempts.attemptNumber}), 0)`,
			})
			.from(fileProductionJobAttempts)
			.where(eq(fileProductionJobAttempts.jobId, queuedJob.id))
			.all();
		const attemptNumber = Number(attemptStats?.maxAttemptNumber ?? 0) + 1;
		const attemptId = randomUUID();
		tx.insert(fileProductionJobAttempts)
			.values({
				id: attemptId,
				jobId: queuedJob.id,
				attemptNumber,
				status: 'running',
				stage: queuedJob.stage,
				workerId: input.workerId,
				claimedAt: now,
				heartbeatAt: now,
				startedAt: now,
				finishedAt: null,
				errorCode: null,
				errorMessage: null,
				retryable: false,
				createdAt: now,
				updatedAt: now,
			})
			.run();
		tx.update(fileProductionJobs)
			.set({
				status: 'running',
				currentAttemptId: attemptId,
				retryable: false,
				errorCode: null,
				errorMessage: null,
				updatedAt: now,
			})
			.where(and(eq(fileProductionJobs.id, queuedJob.id), eq(fileProductionJobs.status, 'queued')))
			.run();
		const [updatedJob] = tx
			.select()
			.from(fileProductionJobs)
			.where(eq(fileProductionJobs.id, queuedJob.id))
			.limit(1)
			.all();

		if (!updatedJob || updatedJob.currentAttemptId !== attemptId || updatedJob.status !== 'running') {
			return null;
		}

		return {
			job: updatedJob,
			attempt: {
				id: attemptId,
				jobId: queuedJob.id,
				attemptNumber,
				status: 'running',
				stage: queuedJob.stage,
				workerId: input.workerId,
				claimedAt: now,
				heartbeatAt: now,
				startedAt: now,
				finishedAt: null,
				errorCode: null,
				errorMessage: null,
				retryable: false,
			},
		};
	});

	if (!claimed) {
		return null;
	}

	return {
		job: mapJobRow(claimed.job, []),
		attempt: {
			...claimed.attempt,
			claimedAt: claimed.attempt.claimedAt.getTime(),
			heartbeatAt: claimed.attempt.heartbeatAt.getTime(),
			startedAt: claimed.attempt.startedAt.getTime(),
			finishedAt: null,
		},
	};
}

export async function heartbeatFileProductionJobAttempt(
	input: OwnedFileProductionAttemptInput
): Promise<boolean> {
	const now = input.now ?? new Date();
	return db.transaction((tx) => {
		const [job] = tx
			.select({ id: fileProductionJobs.id })
			.from(fileProductionJobs)
			.where(
				and(
					eq(fileProductionJobs.id, input.jobId),
					eq(fileProductionJobs.status, 'running'),
					eq(fileProductionJobs.currentAttemptId, input.attemptId)
				)
			)
			.limit(1)
			.all();

		if (!job) {
			return false;
		}

		const result = tx
			.update(fileProductionJobAttempts)
			.set({
				heartbeatAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(fileProductionJobAttempts.id, input.attemptId),
					eq(fileProductionJobAttempts.jobId, input.jobId),
					eq(fileProductionJobAttempts.workerId, input.workerId),
					eq(fileProductionJobAttempts.status, 'running')
				)
			)
			.run();

		return result.changes > 0;
	});
}

export async function failFileProductionJobAttempt(
	input: FailFileProductionAttemptInput
): Promise<boolean> {
	const now = input.now ?? new Date();
	return db.transaction((tx) => {
		const [job] = tx
			.select({ id: fileProductionJobs.id })
			.from(fileProductionJobs)
			.where(
				and(
					eq(fileProductionJobs.id, input.jobId),
					eq(fileProductionJobs.status, 'running'),
					eq(fileProductionJobs.currentAttemptId, input.attemptId)
				)
			)
			.limit(1)
			.all();

		if (!job) {
			return false;
		}

		const attemptResult = tx
			.update(fileProductionJobAttempts)
			.set({
				status: 'failed',
				finishedAt: now,
				errorCode: input.errorCode,
				errorMessage: input.errorMessage,
				retryable: input.retryable,
				updatedAt: now,
			})
			.where(
				and(
					eq(fileProductionJobAttempts.id, input.attemptId),
					eq(fileProductionJobAttempts.jobId, input.jobId),
					eq(fileProductionJobAttempts.workerId, input.workerId),
					eq(fileProductionJobAttempts.status, 'running')
				)
			)
			.run();

		if (attemptResult.changes === 0) {
			return false;
		}

		tx.update(fileProductionJobs)
			.set({
				status: 'failed',
				stage: null,
				retryable: input.retryable,
				errorCode: input.errorCode,
				errorMessage: input.errorMessage,
				updatedAt: now,
				completedAt: now,
			})
			.where(
				and(
					eq(fileProductionJobs.id, input.jobId),
					eq(fileProductionJobs.status, 'running'),
					eq(fileProductionJobs.currentAttemptId, input.attemptId)
				)
			)
			.run();

		return true;
	});
}

export async function recoverStaleFileProductionAttempts(
	input: RecoverStaleFileProductionAttemptsInput
): Promise<{ recovered: number }> {
	const now = input.now ?? new Date();
	const recovered = db.transaction((tx) => {
		const staleAttempts = tx
			.select({
				attemptId: fileProductionJobAttempts.id,
				jobId: fileProductionJobAttempts.jobId,
			})
			.from(fileProductionJobAttempts)
			.innerJoin(fileProductionJobs, eq(fileProductionJobs.id, fileProductionJobAttempts.jobId))
			.where(
				and(
					eq(fileProductionJobs.status, 'running'),
					eq(fileProductionJobs.currentAttemptId, fileProductionJobAttempts.id),
					eq(fileProductionJobAttempts.status, 'running'),
					lt(fileProductionJobAttempts.heartbeatAt, input.staleBefore)
				)
			)
			.all();
		let recoveredCount = 0;

		for (const attempt of staleAttempts) {
			const attemptResult = tx
				.update(fileProductionJobAttempts)
				.set({
					status: 'failed',
					finishedAt: now,
					errorCode: 'worker_heartbeat_timeout',
					errorMessage: 'File production worker stopped before finishing.',
					retryable: true,
					updatedAt: now,
				})
				.where(
					and(
						eq(fileProductionJobAttempts.id, attempt.attemptId),
						eq(fileProductionJobAttempts.jobId, attempt.jobId),
						eq(fileProductionJobAttempts.status, 'running')
					)
				)
				.run();

			if (attemptResult.changes === 0) {
				continue;
			}

			tx.update(fileProductionJobs)
				.set({
					status: 'failed',
					stage: null,
					retryable: true,
					errorCode: 'worker_heartbeat_timeout',
					errorMessage: 'File production worker stopped before finishing.',
					completedAt: now,
					updatedAt: now,
				})
				.where(
					and(
						eq(fileProductionJobs.id, attempt.jobId),
						eq(fileProductionJobs.status, 'running'),
						eq(fileProductionJobs.currentAttemptId, attempt.attemptId)
					)
				)
				.run();
			recoveredCount += 1;
		}

		return recoveredCount;
	});

	return { recovered };
}

export async function retryFileProductionJob(
	input: RetryFileProductionJobInput
): Promise<FileProductionJob | null> {
	const now = input.now ?? new Date();
	const retried = db.transaction((tx) => {
		const [existingJob] = tx
			.select()
			.from(fileProductionJobs)
			.where(
				and(
					eq(fileProductionJobs.id, input.jobId),
					eq(fileProductionJobs.userId, input.userId),
					eq(fileProductionJobs.status, 'failed'),
					eq(fileProductionJobs.retryable, true)
				)
			)
			.limit(1)
			.all();

		if (!existingJob) {
			return null;
		}

		tx.update(fileProductionJobs)
			.set({
				status: 'queued',
				stage: null,
				currentAttemptId: null,
				retryable: false,
				errorCode: null,
				errorMessage: null,
				completedAt: null,
				cancelRequestedAt: null,
				updatedAt: now,
			})
			.where(
				and(
					eq(fileProductionJobs.id, input.jobId),
					eq(fileProductionJobs.userId, input.userId),
					eq(fileProductionJobs.status, 'failed'),
					eq(fileProductionJobs.retryable, true)
				)
			)
			.run();

		const [updatedJob] = tx
			.select()
			.from(fileProductionJobs)
			.where(eq(fileProductionJobs.id, input.jobId))
			.limit(1)
			.all();

		return updatedJob ?? null;
	});

	return retried ? mapJobRow(retried, []) : null;
}

export async function cancelFileProductionJob(
	input: CancelFileProductionJobInput
): Promise<FileProductionJob | null> {
	const now = input.now ?? new Date();
	const cancelled = db.transaction((tx) => {
		const [existingJob] = tx
			.select()
			.from(fileProductionJobs)
			.where(
				and(
					eq(fileProductionJobs.id, input.jobId),
					eq(fileProductionJobs.userId, input.userId),
					inArray(fileProductionJobs.status, ['queued', 'running'])
				)
			)
			.limit(1)
			.all();

		if (!existingJob) {
			return null;
		}

		if (existingJob.status === 'running' && existingJob.currentAttemptId) {
			tx.update(fileProductionJobAttempts)
				.set({
					status: 'cancelled',
					finishedAt: now,
					updatedAt: now,
				})
				.where(
					and(
						eq(fileProductionJobAttempts.id, existingJob.currentAttemptId),
						eq(fileProductionJobAttempts.jobId, existingJob.id),
						eq(fileProductionJobAttempts.status, 'running')
					)
				)
				.run();
		}

		tx.update(fileProductionJobs)
			.set({
				status: 'cancelled',
				stage: null,
				retryable: false,
				errorCode: null,
				errorMessage: null,
				completedAt: now,
				cancelRequestedAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(fileProductionJobs.id, input.jobId),
					eq(fileProductionJobs.userId, input.userId),
					inArray(fileProductionJobs.status, ['queued', 'running'])
				)
			)
			.run();

		const [updatedJob] = tx
			.select()
			.from(fileProductionJobs)
			.where(eq(fileProductionJobs.id, input.jobId))
			.limit(1)
			.all();

		return updatedJob ?? null;
	});

	return cancelled ? mapJobRow(cancelled, []) : null;
}

export async function listConversationFileProductionJobs(
	userId: string,
	conversationId: string
): Promise<FileProductionJob[]> {
	const files = await getChatFiles(conversationId);
	const userFiles = files.filter((file) => file.userId === userId);
	await ensureLegacyJobs(userFiles);
	const fileById = new Map(userFiles.map((file) => [file.id, file]));
	const jobs = await db
		.select()
		.from(fileProductionJobs)
		.where(
			and(
				eq(fileProductionJobs.userId, userId),
				eq(fileProductionJobs.conversationId, conversationId)
			)
		)
		.orderBy(desc(fileProductionJobs.createdAt));

	if (jobs.length === 0) {
		return [];
	}

	const links = await db
		.select()
		.from(fileProductionJobFiles)
		.where(
			inArray(
				fileProductionJobFiles.jobId,
				jobs.map((job) => job.id)
			)
		);
	const linksByJobId = new Map<string, typeof links>();
	for (const link of links) {
		const next = linksByJobId.get(link.jobId) ?? [];
		next.push(link);
		linksByJobId.set(link.jobId, next);
	}

	return jobs
		.map((job) => {
			const jobLinks = (linksByJobId.get(job.id) ?? []).sort(
				(a, b) => a.sortOrder - b.sortOrder
			);
			return mapJobRow(
				job,
				jobLinks
					.map((link) => fileById.get(link.chatGeneratedFileId))
					.filter((file): file is ChatFile => Boolean(file))
					.map(mapChatFileToProducedFile)
			);
		})
		.filter((job) => job.files.length > 0 || job.status !== 'succeeded');
}
