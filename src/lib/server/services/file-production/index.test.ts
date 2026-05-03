import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import * as schema from '$lib/server/db/schema';

let dbPath: string;

async function seedLegacyGeneratedFile() {
	const sqlite = new Database(dbPath);
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });

	const now = new Date('2026-05-03T19:30:00.000Z');
	db.insert(schema.users)
		.values({
			id: 'user-1',
			email: 'user@example.com',
			passwordHash: 'hash',
		})
		.run();
	db.insert(schema.conversations)
		.values({
			id: 'conv-1',
			userId: 'user-1',
			title: 'Report conversation',
			createdAt: now,
			updatedAt: now,
		})
		.run();
	db.insert(schema.messages)
		.values({
			id: 'assistant-1',
			conversationId: 'conv-1',
			role: 'assistant',
			content: 'Here is the report.',
			createdAt: now,
		})
		.run();
	db.insert(schema.chatGeneratedFiles)
		.values({
			id: 'file-1',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			userId: 'user-1',
			filename: 'report.pdf',
			mimeType: 'application/pdf',
			sizeBytes: 2048,
			storagePath: 'conv-1/file-1.pdf',
			createdAt: now,
		})
		.run();

	sqlite.close();
}

describe('file production service', () => {
	beforeEach(async () => {
		dbPath = `/tmp/alfyai-file-production-${randomUUID()}.db`;
		process.env.DATABASE_PATH = dbPath;
		vi.resetModules();
		await seedLegacyGeneratedFile();
	});

	afterEach(async () => {
		try {
			const { sqlite } = await import('$lib/server/db');
			sqlite.close();
		} catch {
			// The DB module may not have been imported if a test failed early.
		}
		try {
			unlinkSync(dbPath);
		} catch {
			// Temporary DB cleanup is best-effort.
		}
	});

	it('lists a legacy generated file as a succeeded file-production job', async () => {
		const { listConversationFileProductionJobs } = await import('./index');

		const jobs = await listConversationFileProductionJobs('user-1', 'conv-1');

		expect(jobs).toEqual([
			expect.objectContaining({
				conversationId: 'conv-1',
				assistantMessageId: 'assistant-1',
				title: 'report.pdf',
				status: 'succeeded',
				files: [
					expect.objectContaining({
						id: 'file-1',
						filename: 'report.pdf',
						mimeType: 'application/pdf',
						sizeBytes: 2048,
						downloadUrl: '/api/chat/files/file-1/download',
						previewUrl: '/api/chat/files/file-1/preview',
					}),
				],
			}),
		]);
	});

	it('backfills each legacy generated file into one durable job link', async () => {
		const { listConversationFileProductionJobs } = await import('./index');
		const { db } = await import('$lib/server/db');

		await listConversationFileProductionJobs('user-1', 'conv-1');
		await listConversationFileProductionJobs('user-1', 'conv-1');

		const jobs = await db
			.select()
			.from(schema.fileProductionJobs)
			.where(eq(schema.fileProductionJobs.conversationId, 'conv-1'));
		const links = await db
			.select()
			.from(schema.fileProductionJobFiles)
			.where(eq(schema.fileProductionJobFiles.chatGeneratedFileId, 'file-1'));

		expect(jobs).toHaveLength(1);
		expect(jobs[0]).toMatchObject({
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			status: 'succeeded',
			title: 'report.pdf',
		});
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({
			jobId: jobs[0].id,
			chatGeneratedFileId: 'file-1',
			sortOrder: 0,
		});
	});

	it('groups multiple produced files under one persisted job', async () => {
		const { db } = await import('$lib/server/db');
		const now = new Date('2026-05-03T19:31:00.000Z');
		await db.insert(schema.chatGeneratedFiles).values({
			id: 'file-2',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			userId: 'user-1',
			filename: 'report.html',
			mimeType: 'text/html',
			sizeBytes: 4096,
			storagePath: 'conv-1/file-2.html',
			createdAt: now,
		});
		await db.insert(schema.fileProductionJobs).values({
			id: 'job-multi-output',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			userId: 'user-1',
			title: 'Quarterly report package',
			status: 'succeeded',
			stage: null,
			origin: 'native',
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(schema.fileProductionJobFiles).values([
			{
				id: 'link-file-1',
				jobId: 'job-multi-output',
				chatGeneratedFileId: 'file-1',
				sortOrder: 0,
				createdAt: now,
			},
			{
				id: 'link-file-2',
				jobId: 'job-multi-output',
				chatGeneratedFileId: 'file-2',
				sortOrder: 1,
				createdAt: now,
			},
		]);
		const { listConversationFileProductionJobs } = await import('./index');

		const jobs = await listConversationFileProductionJobs('user-1', 'conv-1');

		expect(jobs).toHaveLength(1);
		expect(jobs[0]).toMatchObject({
			id: 'job-multi-output',
			title: 'Quarterly report package',
			status: 'succeeded',
			files: [
				expect.objectContaining({ id: 'file-1', filename: 'report.pdf' }),
				expect.objectContaining({ id: 'file-2', filename: 'report.html' }),
			],
		});
	});

	it('lists a queued production job before it has produced files', async () => {
		const { createFileProductionJob, listConversationFileProductionJobs } = await import('./index');

		const created = await createFileProductionJob({
			userId: 'user-1',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			title: 'Research brief',
			origin: 'unified_produce',
		});

		expect(created).toMatchObject({
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			title: 'Research brief',
			status: 'queued',
			files: [],
		});

		const jobs = await listConversationFileProductionJobs('user-1', 'conv-1');

		expect(jobs[0]).toMatchObject({
			id: created.id,
			title: 'Research brief',
			status: 'queued',
			files: [],
		});
	});

	it('reuses a durable production job for the same idempotency key', async () => {
		const { createOrReuseFileProductionJob } = await import('./index');

		const first = await createOrReuseFileProductionJob({
			userId: 'user-1',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			title: 'CSV export',
			origin: 'unified_produce',
			idempotencyKey: 'turn-1:file-1',
			sourceMode: 'program',
			documentIntent: null,
			requestJson: {
				sourceMode: 'program',
				program: {
					language: 'python',
					sourceCode: 'from pathlib import Path\nPath("/output/data.csv").write_text("a,b\\n1,2")',
					filename: 'data.csv',
				},
				outputs: [{ type: 'csv' }],
			},
			now: new Date('2026-05-03T19:31:30.000Z'),
		});
		const second = await createOrReuseFileProductionJob({
			userId: 'user-1',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			title: 'CSV export duplicate',
			origin: 'unified_produce',
			idempotencyKey: 'turn-1:file-1',
			sourceMode: 'program',
			documentIntent: null,
			requestJson: {
				sourceMode: 'program',
				program: {
					language: 'python',
					sourceCode: 'duplicate',
				},
				outputs: [{ type: 'csv' }],
			},
			now: new Date('2026-05-03T19:31:31.000Z'),
		});

		expect(first.reused).toBe(false);
		expect(second.reused).toBe(true);
		expect(second.job).toMatchObject({
			id: first.job.id,
			title: 'CSV export',
			status: 'queued',
		});
	});

	it('persists a failed production job for validation failures', async () => {
		const { createFailedFileProductionJob, listConversationFileProductionJobs } = await import(
			'./index'
		);

		const failed = await createFailedFileProductionJob({
			userId: 'user-1',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			title: 'Broken export',
			origin: 'unified_produce',
			idempotencyKey: 'turn-1:bad-file',
			sourceMode: 'program',
			documentIntent: null,
			requestJson: {
				sourceMode: 'program',
				program: {
					language: 'ruby',
					sourceCode: 'puts "bad"',
				},
			},
			errorCode: 'invalid_program_language',
			errorMessage: 'program.language must be python or javascript',
			retryable: false,
			now: new Date('2026-05-03T19:31:40.000Z'),
		});

		expect(failed).toMatchObject({
			title: 'Broken export',
			status: 'failed',
			error: {
				code: 'invalid_program_language',
				message: 'program.language must be python or javascript',
				retryable: false,
			},
		});
		expect((await listConversationFileProductionJobs('user-1', 'conv-1')).find((job) => job.id === failed.id)).toMatchObject({
			status: 'failed',
			error: {
				code: 'invalid_program_language',
			},
		});
	});

	it('claims the oldest queued job and records the running attempt', async () => {
		const {
			claimNextFileProductionJob,
			createFileProductionJob,
			listConversationFileProductionJobs,
		} = await import('./index');
		const first = await createFileProductionJob({
			userId: 'user-1',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			title: 'First queued report',
			origin: 'unified_produce',
			now: new Date('2026-05-03T19:32:00.000Z'),
		});
		const second = await createFileProductionJob({
			userId: 'user-1',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			title: 'Second queued report',
			origin: 'unified_produce',
			now: new Date('2026-05-03T19:33:00.000Z'),
		});

		const claimed = await claimNextFileProductionJob({
			workerId: 'worker-1',
			now: new Date('2026-05-03T19:34:00.000Z'),
		});

		expect(claimed).toMatchObject({
			job: {
				id: first.id,
				status: 'running',
			},
			attempt: {
				jobId: first.id,
				attemptNumber: 1,
				status: 'running',
				workerId: 'worker-1',
				errorCode: null,
				errorMessage: null,
				retryable: false,
			},
		});
		expect(claimed?.attempt.claimedAt).toBe(new Date('2026-05-03T19:34:00.000Z').getTime());
		expect(claimed?.attempt.heartbeatAt).toBe(
			new Date('2026-05-03T19:34:00.000Z').getTime()
		);

		const jobs = await listConversationFileProductionJobs('user-1', 'conv-1');
		expect(jobs.find((job) => job.id === first.id)?.status).toBe('running');
		expect(jobs.find((job) => job.id === second.id)?.status).toBe('queued');
	});

	it('only lets the claiming worker heartbeat or fail the current attempt', async () => {
		const {
			claimNextFileProductionJob,
			createFileProductionJob,
			failFileProductionJobAttempt,
			heartbeatFileProductionJobAttempt,
			listConversationFileProductionJobs,
		} = await import('./index');
		const job = await createFileProductionJob({
			userId: 'user-1',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			title: 'Owned attempt',
			origin: 'unified_produce',
			now: new Date('2026-05-03T19:35:00.000Z'),
		});
		const claimed = await claimNextFileProductionJob({
			workerId: 'worker-owner',
			now: new Date('2026-05-03T19:36:00.000Z'),
		});

		expect(claimed?.job.id).toBe(job.id);
		await expect(
			heartbeatFileProductionJobAttempt({
				jobId: job.id,
				attemptId: claimed!.attempt.id,
				workerId: 'worker-late',
				now: new Date('2026-05-03T19:37:00.000Z'),
			})
		).resolves.toBe(false);
		await expect(
			failFileProductionJobAttempt({
				jobId: job.id,
				attemptId: claimed!.attempt.id,
				workerId: 'worker-late',
				errorCode: 'renderer_timeout',
				errorMessage: 'Renderer timed out.',
				retryable: true,
				now: new Date('2026-05-03T19:38:00.000Z'),
			})
		).resolves.toBe(false);

		expect((await listConversationFileProductionJobs('user-1', 'conv-1')).find((row) => row.id === job.id)?.status).toBe('running');

		await expect(
			heartbeatFileProductionJobAttempt({
				jobId: job.id,
				attemptId: claimed!.attempt.id,
				workerId: 'worker-owner',
				now: new Date('2026-05-03T19:39:00.000Z'),
			})
		).resolves.toBe(true);
		await expect(
			failFileProductionJobAttempt({
				jobId: job.id,
				attemptId: claimed!.attempt.id,
				workerId: 'worker-owner',
				errorCode: 'renderer_timeout',
				errorMessage: 'Renderer timed out.',
				retryable: true,
				now: new Date('2026-05-03T19:40:00.000Z'),
			})
		).resolves.toBe(true);

		expect((await listConversationFileProductionJobs('user-1', 'conv-1')).find((row) => row.id === job.id)).toMatchObject({
			status: 'failed',
			error: {
				code: 'renderer_timeout',
				message: 'Renderer timed out.',
				retryable: true,
			},
		});
	});

	it('recovers stale running attempts as retryable infrastructure failures', async () => {
		const {
			claimNextFileProductionJob,
			createFileProductionJob,
			listConversationFileProductionJobs,
			recoverStaleFileProductionAttempts,
		} = await import('./index');
		const job = await createFileProductionJob({
			userId: 'user-1',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			title: 'Stale running report',
			origin: 'unified_produce',
			now: new Date('2026-05-03T19:41:00.000Z'),
		});
		await claimNextFileProductionJob({
			workerId: 'worker-stale',
			now: new Date('2026-05-03T19:42:00.000Z'),
		});

		const recovered = await recoverStaleFileProductionAttempts({
			staleBefore: new Date('2026-05-03T19:50:00.000Z'),
			now: new Date('2026-05-03T19:51:00.000Z'),
		});

		expect(recovered).toEqual({ recovered: 1 });
		expect((await listConversationFileProductionJobs('user-1', 'conv-1')).find((row) => row.id === job.id)).toMatchObject({
			status: 'failed',
			error: {
				code: 'worker_heartbeat_timeout',
				message: 'File production worker stopped before finishing.',
				retryable: true,
			},
		});
	});

	it('retries a retryable failed job under the same job identity with a new attempt number', async () => {
		const {
			claimNextFileProductionJob,
			createFileProductionJob,
			failFileProductionJobAttempt,
			retryFileProductionJob,
		} = await import('./index');
		const job = await createFileProductionJob({
			userId: 'user-1',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			title: 'Retryable report',
			origin: 'unified_produce',
			now: new Date('2026-05-03T19:52:00.000Z'),
		});
		const firstClaim = await claimNextFileProductionJob({
			workerId: 'worker-retry-1',
			now: new Date('2026-05-03T19:53:00.000Z'),
		});
		await failFileProductionJobAttempt({
			jobId: job.id,
			attemptId: firstClaim!.attempt.id,
			workerId: 'worker-retry-1',
			errorCode: 'renderer_timeout',
			errorMessage: 'Renderer timed out.',
			retryable: true,
			now: new Date('2026-05-03T19:54:00.000Z'),
		});

		const retried = await retryFileProductionJob({
			userId: 'user-1',
			jobId: job.id,
			now: new Date('2026-05-03T19:55:00.000Z'),
		});
		const secondClaim = await claimNextFileProductionJob({
			workerId: 'worker-retry-2',
			now: new Date('2026-05-03T19:56:00.000Z'),
		});

		expect(retried).toMatchObject({
			id: job.id,
			status: 'queued',
			error: null,
		});
		expect(secondClaim).toMatchObject({
			job: {
				id: job.id,
				status: 'running',
			},
			attempt: {
				jobId: job.id,
				attemptNumber: 2,
				status: 'running',
				workerId: 'worker-retry-2',
			},
		});
	});

	it('cancels queued and running jobs as persisted terminal states', async () => {
		const {
			cancelFileProductionJob,
			claimNextFileProductionJob,
			createFileProductionJob,
			failFileProductionJobAttempt,
			listConversationFileProductionJobs,
		} = await import('./index');
		const queuedJob = await createFileProductionJob({
			userId: 'user-1',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			title: 'Queued cancellation',
			origin: 'unified_produce',
			now: new Date('2026-05-03T19:57:00.000Z'),
		});

		await expect(
			cancelFileProductionJob({
				userId: 'user-1',
				jobId: queuedJob.id,
				now: new Date('2026-05-03T19:58:00.000Z'),
			})
		).resolves.toMatchObject({
			id: queuedJob.id,
			status: 'cancelled',
		});
		await expect(
			claimNextFileProductionJob({
				workerId: 'worker-cancel',
				now: new Date('2026-05-03T19:59:00.000Z'),
			})
		).resolves.toBeNull();

		const runningJob = await createFileProductionJob({
			userId: 'user-1',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			title: 'Running cancellation',
			origin: 'unified_produce',
			now: new Date('2026-05-03T20:00:00.000Z'),
		});
		const claimed = await claimNextFileProductionJob({
			workerId: 'worker-cancel',
			now: new Date('2026-05-03T20:01:00.000Z'),
		});

		await expect(
			cancelFileProductionJob({
				userId: 'user-1',
				jobId: runningJob.id,
				now: new Date('2026-05-03T20:02:00.000Z'),
			})
		).resolves.toMatchObject({
			id: runningJob.id,
			status: 'cancelled',
		});
		await expect(
			failFileProductionJobAttempt({
				jobId: runningJob.id,
				attemptId: claimed!.attempt.id,
				workerId: 'worker-cancel',
				errorCode: 'renderer_timeout',
				errorMessage: 'Renderer timed out.',
				retryable: true,
				now: new Date('2026-05-03T20:03:00.000Z'),
			})
		).resolves.toBe(false);

		const jobs = await listConversationFileProductionJobs('user-1', 'conv-1');
		expect(jobs.find((row) => row.id === queuedJob.id)?.status).toBe('cancelled');
		expect(jobs.find((row) => row.id === runningJob.id)?.status).toBe('cancelled');
	});

	it('executes a queued program job after creation and links produced files', async () => {
		const { db } = await import('$lib/server/db');
		const {
			createOrReuseFileProductionJob,
			executeNextFileProductionJob,
		} = await import('./index');
		const created = await createOrReuseFileProductionJob({
			userId: 'user-1',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			title: 'Executable CSV export',
			origin: 'unified_produce',
			idempotencyKey: 'turn-1:exec-file',
			sourceMode: 'program',
			documentIntent: null,
			requestJson: {
				sourceMode: 'program',
				program: {
					language: 'python',
					sourceCode: 'from pathlib import Path\nPath("/output/data.csv").write_text("a,b\\n1,2")',
					filename: 'data.csv',
				},
				outputs: [{ type: 'csv' }],
			},
			now: new Date('2026-05-03T20:04:00.000Z'),
		});
		const executeCode = vi.fn(async () => ({
			files: [
				{
					filename: 'data.csv',
					mimeType: 'text/csv',
					content: Buffer.from('a,b\n1,2'),
					sizeBytes: 7,
				},
			],
			stdout: '',
			stderr: '',
			error: null,
		}));
		const storeGeneratedFile = vi.fn(async () => {
			const now = new Date('2026-05-03T20:05:00.000Z');
			await db.insert(schema.chatGeneratedFiles).values({
				id: 'file-produced-1',
				conversationId: 'conv-1',
				assistantMessageId: 'assistant-1',
				userId: 'user-1',
				filename: 'data.csv',
				mimeType: 'text/csv',
				sizeBytes: 7,
				storagePath: 'conv-1/file-produced-1.csv',
				createdAt: now,
			});
			return {
				id: 'file-produced-1',
				conversationId: 'conv-1',
				assistantMessageId: 'assistant-1',
				artifactId: null,
				userId: 'user-1',
				filename: 'data.csv',
				mimeType: 'text/csv',
				sizeBytes: 7,
				storagePath: 'conv-1/file-produced-1.csv',
				createdAt: now.getTime(),
			};
		});

		const result = await executeNextFileProductionJob({
			workerId: 'worker-exec',
			executeCode,
			storeGeneratedFile,
			now: new Date('2026-05-03T20:05:00.000Z'),
		});

		expect(result).toMatchObject({
			job: {
				id: created.job.id,
				status: 'succeeded',
			},
			files: [
				expect.objectContaining({
					id: 'file-produced-1',
					filename: 'data.csv',
				}),
			],
		});
		expect(executeCode).toHaveBeenCalledWith(
			'from pathlib import Path\nPath("/output/data.csv").write_text("a,b\\n1,2")',
			'python'
		);
		expect(storeGeneratedFile).toHaveBeenCalledWith('conv-1', 'user-1', {
			assistantMessageId: 'assistant-1',
			filename: 'data.csv',
			mimeType: 'text/csv',
			content: expect.any(Buffer),
		});

		const links = await db
			.select()
			.from(schema.fileProductionJobFiles)
			.where(eq(schema.fileProductionJobFiles.jobId, created.job.id));
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({
			chatGeneratedFileId: 'file-produced-1',
			sortOrder: 0,
		});
	});

	it('fails oversized program outputs before storage and without produced-file links', async () => {
		const { db } = await import('$lib/server/db');
		const {
			createOrReuseFileProductionJob,
			executeNextFileProductionJob,
			listConversationFileProductionJobs,
		} = await import('./index');
		const created = await createOrReuseFileProductionJob({
			userId: 'user-1',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			title: 'Oversized CSV export',
			origin: 'unified_produce',
			idempotencyKey: 'turn-1:oversized-file',
			sourceMode: 'program',
			documentIntent: null,
			requestJson: {
				sourceMode: 'program',
				program: {
					language: 'python',
					sourceCode: 'from pathlib import Path\nPath("/output/data.csv").write_text("too large")',
					filename: 'data.csv',
				},
				outputs: [{ type: 'csv' }],
			},
			now: new Date('2026-05-03T20:06:00.000Z'),
		});
		const storeGeneratedFile = vi.fn();

		const result = await executeNextFileProductionJob({
			workerId: 'worker-limit',
			executeCode: vi.fn(async () => ({
				files: [
					{
						filename: 'data.csv',
						mimeType: 'text/csv',
						content: Buffer.from('too large'),
						sizeBytes: 9,
					},
				],
				stdout: '',
				stderr: '',
				error: null,
			})),
			storeGeneratedFile,
			limits: {
				maxOutputFileBytes: 4,
				maxTotalOutputBytes: 20,
			},
			now: new Date('2026-05-03T20:07:00.000Z'),
		});

		expect(result).toBeNull();
		expect(storeGeneratedFile).not.toHaveBeenCalled();
		expect((await listConversationFileProductionJobs('user-1', 'conv-1')).find((job) => job.id === created.job.id)).toMatchObject({
			status: 'failed',
			error: {
				code: 'output_file_too_large',
				retryable: false,
			},
		});
		const links = await db
			.select()
			.from(schema.fileProductionJobFiles)
			.where(eq(schema.fileProductionJobFiles.jobId, created.job.id));
		expect(links).toHaveLength(0);
		const attempts = await db
			.select()
			.from(schema.fileProductionJobAttempts)
			.where(eq(schema.fileProductionJobAttempts.jobId, created.job.id));
		expect(JSON.parse(attempts[0].diagnosticsJson ?? '{}')).toMatchObject({
			limit: 4,
			actual: 9,
			unit: 'bytes',
		});
	});

	it('persists generated-document source JSON and readable projection on a generated_output artifact', async () => {
		const { db } = await import('$lib/server/db');
		const { persistGeneratedDocumentSourceArtifact } = await import('./source-persistence');

		const artifact = await persistGeneratedDocumentSourceArtifact({
			userId: 'user-1',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			fileProductionJobId: 'job-document-source',
			title: 'Quarterly report',
			source: {
				title: 'Quarterly report',
				subtitle: 'Executive summary',
				blocks: [
					{ type: 'heading', level: 2, text: 'Revenue' },
					{ type: 'paragraph', text: 'Revenue increased by 12%.' },
				],
			},
		});

		const [row] = await db
			.select()
			.from(schema.artifacts)
			.where(eq(schema.artifacts.id, artifact.id));
		const metadata = JSON.parse(row.metadataJson ?? '{}');

		expect(row).toMatchObject({
			type: 'generated_output',
			retrievalClass: 'durable',
			name: 'Quarterly report',
			contentText: 'Quarterly report\nExecutive summary\n\n## Revenue\nRevenue increased by 12%.',
		});
		expect(metadata).toMatchObject({
			generatedDocumentSourceVersion: 1,
			fileProductionJobId: 'job-document-source',
			originAssistantMessageId: 'assistant-1',
			generatedDocumentSource: {
				version: 1,
				template: 'alfyai_standard_report',
				title: 'Quarterly report',
			},
		});
	});
});
