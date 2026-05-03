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
});
