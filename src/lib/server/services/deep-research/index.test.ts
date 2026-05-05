import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import * as schema from '$lib/server/db/schema';

let dbPath: string;

async function seedConversation() {
	const sqlite = new Database(dbPath);
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });

	const now = new Date('2026-05-05T10:00:00.000Z');
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
			title: 'Research conversation',
			createdAt: now,
			updatedAt: now,
		})
		.run();
	db.insert(schema.messages)
		.values({
			id: 'user-msg-1',
			conversationId: 'conv-1',
			role: 'user',
			content: 'Compare EU and US AI copyright training data rules',
			createdAt: now,
		})
		.run();

	sqlite.close();
}

describe('deep research job shell service', () => {
	beforeEach(async () => {
		dbPath = `/tmp/alfyai-deep-research-${randomUUID()}.db`;
		process.env.DATABASE_PATH = dbPath;
		vi.resetModules();
		await seedConversation();
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

	it('creates and reloads a durable Deep Research Job shell for a conversation', async () => {
		const { startDeepResearchJobShell, listConversationDeepResearchJobs } = await import('./index');

		const created = await startDeepResearchJobShell({
			userId: 'user-1',
			conversationId: 'conv-1',
			triggerMessageId: 'user-msg-1',
			userRequest: 'Compare EU and US AI copyright training data rules',
			depth: 'standard',
			now: new Date('2026-05-05T10:01:00.000Z'),
		});
		const jobs = await listConversationDeepResearchJobs('user-1', 'conv-1');

		expect(created).toMatchObject({
			conversationId: 'conv-1',
			triggerMessageId: 'user-msg-1',
			depth: 'standard',
			status: 'awaiting_plan',
			stage: 'job_shell_created',
			title: 'Compare EU and US AI copyright training data rules',
			userRequest: 'Compare EU and US AI copyright training data rules',
		});
		expect(jobs).toEqual([created]);
	});

	it('cancels an awaiting-plan Deep Research Job before approval', async () => {
		const {
			cancelPrePlanDeepResearchJob,
			listConversationDeepResearchJobs,
			startDeepResearchJobShell,
		} = await import('./index');
		const created = await startDeepResearchJobShell({
			userId: 'user-1',
			conversationId: 'conv-1',
			triggerMessageId: 'user-msg-1',
			userRequest: 'Compare EU and US AI copyright training data rules',
			depth: 'standard',
			now: new Date('2026-05-05T10:01:00.000Z'),
		});

		const cancelled = await cancelPrePlanDeepResearchJob({
			userId: 'user-1',
			jobId: created.id,
			now: new Date('2026-05-05T10:02:00.000Z'),
		});
		const jobs = await listConversationDeepResearchJobs('user-1', 'conv-1');

		expect(cancelled).toMatchObject({
			id: created.id,
			status: 'cancelled',
			stage: 'cancelled_before_approval',
			cancelledAt: new Date('2026-05-05T10:02:00.000Z').getTime(),
		});
		expect(jobs).toEqual([cancelled]);
	});

	it('rejects a new Deep Research Job while another job is active', async () => {
		const { startDeepResearchJobShell } = await import('./index');
		await startDeepResearchJobShell({
			userId: 'user-1',
			conversationId: 'conv-1',
			triggerMessageId: 'user-msg-1',
			userRequest: 'Compare EU and US AI copyright training data rules',
			depth: 'standard',
			now: new Date('2026-05-05T10:01:00.000Z'),
		});

		await expect(
			startDeepResearchJobShell({
				userId: 'user-1',
				conversationId: 'conv-1',
				triggerMessageId: 'user-msg-1',
				userRequest: 'Start another research pass',
				depth: 'focused',
				now: new Date('2026-05-05T10:02:00.000Z'),
			})
		).rejects.toMatchObject({
			code: 'active_job_exists',
			status: 409,
		});
	});

	it('rejects a Deep Research Job in a sealed conversation', async () => {
		const { db } = await import('$lib/server/db');
		const { startDeepResearchJobShell } = await import('./index');
		await db
			.update(schema.conversations)
			.set({
				status: 'sealed',
				sealedAt: new Date('2026-05-05T10:00:30.000Z'),
			})
			.where(eq(schema.conversations.id, 'conv-1'));

		await expect(
			startDeepResearchJobShell({
				userId: 'user-1',
				conversationId: 'conv-1',
				triggerMessageId: 'user-msg-1',
				userRequest: 'Research in a sealed conversation',
				depth: 'standard',
				now: new Date('2026-05-05T10:01:00.000Z'),
			})
		).rejects.toMatchObject({
			code: 'conversation_sealed',
			status: 409,
		});
	});

	it('cancels an awaiting-approval Deep Research Job before approval', async () => {
		const { db } = await import('$lib/server/db');
		const {
			cancelPrePlanDeepResearchJob,
			listConversationDeepResearchJobs,
			startDeepResearchJobShell,
		} = await import('./index');
		const created = await startDeepResearchJobShell({
			userId: 'user-1',
			conversationId: 'conv-1',
			triggerMessageId: 'user-msg-1',
			userRequest: 'Compare EU and US AI copyright training data rules',
			depth: 'standard',
			now: new Date('2026-05-05T10:01:00.000Z'),
		});
		await db
			.update(schema.deepResearchJobs)
			.set({ status: 'awaiting_approval', stage: 'plan_drafted' })
			.where(eq(schema.deepResearchJobs.id, created.id));

		const cancelled = await cancelPrePlanDeepResearchJob({
			userId: 'user-1',
			jobId: created.id,
			now: new Date('2026-05-05T10:03:00.000Z'),
		});
		const jobs = await listConversationDeepResearchJobs('user-1', 'conv-1');

		expect(cancelled).toMatchObject({
			id: created.id,
			status: 'cancelled',
			stage: 'cancelled_before_approval',
			cancelledAt: new Date('2026-05-05T10:03:00.000Z').getTime(),
		});
		expect(jobs).toEqual([cancelled]);
	});

	it('does not cancel a running Deep Research Job through the pre-plan cancellation path', async () => {
		const { db } = await import('$lib/server/db');
		const {
			cancelPrePlanDeepResearchJob,
			listConversationDeepResearchJobs,
			startDeepResearchJobShell,
		} = await import('./index');
		const created = await startDeepResearchJobShell({
			userId: 'user-1',
			conversationId: 'conv-1',
			triggerMessageId: 'user-msg-1',
			userRequest: 'Compare EU and US AI copyright training data rules',
			depth: 'standard',
			now: new Date('2026-05-05T10:01:00.000Z'),
		});
		await db
			.update(schema.deepResearchJobs)
			.set({ status: 'running', stage: 'source_discovery' })
			.where(eq(schema.deepResearchJobs.id, created.id));

		const cancelled = await cancelPrePlanDeepResearchJob({
			userId: 'user-1',
			jobId: created.id,
			now: new Date('2026-05-05T10:03:00.000Z'),
		});
		const [job] = await listConversationDeepResearchJobs('user-1', 'conv-1');

		expect(cancelled).toBeNull();
		expect(job).toMatchObject({
			id: created.id,
			status: 'running',
			stage: 'source_discovery',
			cancelledAt: null,
		});
	});

	it('allows a later Deep Research Job after the previous job was cancelled', async () => {
		const { cancelPrePlanDeepResearchJob, startDeepResearchJobShell } = await import('./index');
		const firstJob = await startDeepResearchJobShell({
			userId: 'user-1',
			conversationId: 'conv-1',
			triggerMessageId: 'user-msg-1',
			userRequest: 'Compare EU and US AI copyright training data rules',
			depth: 'standard',
			now: new Date('2026-05-05T10:01:00.000Z'),
		});
		await cancelPrePlanDeepResearchJob({
			userId: 'user-1',
			jobId: firstJob.id,
			now: new Date('2026-05-05T10:02:00.000Z'),
		});

		const nextJob = await startDeepResearchJobShell({
			userId: 'user-1',
			conversationId: 'conv-1',
			triggerMessageId: 'user-msg-1',
			userRequest: 'Research follow-up sources',
			depth: 'focused',
			now: new Date('2026-05-05T10:04:00.000Z'),
		});

		expect(nextJob).toMatchObject({
			status: 'awaiting_plan',
			depth: 'focused',
			userRequest: 'Research follow-up sources',
		});
		expect(nextJob.id).not.toBe(firstJob.id);
	});

	it('allows a later Deep Research Job after the previous job failed', async () => {
		const { db } = await import('$lib/server/db');
		const { startDeepResearchJobShell } = await import('./index');
		const firstJob = await startDeepResearchJobShell({
			userId: 'user-1',
			conversationId: 'conv-1',
			triggerMessageId: 'user-msg-1',
			userRequest: 'Compare EU and US AI copyright training data rules',
			depth: 'standard',
			now: new Date('2026-05-05T10:01:00.000Z'),
		});
		await db
			.update(schema.deepResearchJobs)
			.set({
				status: 'failed',
				stage: 'failed_before_research',
				updatedAt: new Date('2026-05-05T10:02:00.000Z'),
			})
			.where(eq(schema.deepResearchJobs.id, firstJob.id));

		const nextJob = await startDeepResearchJobShell({
			userId: 'user-1',
			conversationId: 'conv-1',
			triggerMessageId: 'user-msg-1',
			userRequest: 'Try research again',
			depth: 'focused',
			now: new Date('2026-05-05T10:04:00.000Z'),
		});

		expect(nextJob).toMatchObject({
			status: 'awaiting_plan',
			depth: 'focused',
			userRequest: 'Try research again',
		});
		expect(nextJob.id).not.toBe(firstJob.id);
	});
});
