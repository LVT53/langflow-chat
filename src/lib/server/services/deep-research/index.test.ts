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

	it('creates and reloads a durable Deep Research Job with its first Research Plan', async () => {
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
			status: 'awaiting_approval',
			stage: 'plan_drafted',
			title: 'Compare EU and US AI copyright training data rules',
			userRequest: 'Compare EU and US AI copyright training data rules',
			currentPlan: {
				version: 1,
				status: 'awaiting_approval',
				contextDisclosure: null,
				effortEstimate: {
					selectedDepth: 'standard',
					sourceReviewCeiling: 40,
				},
			},
		});
		expect(created.currentPlan?.renderedPlan).toContain('# Research Plan');
		expect(created.currentPlan?.rawPlan.goal).toBe(
			'Compare EU and US AI copyright training data rules'
		);
		expect(jobs).toEqual([created]);
	});

	it('writes a plan-drafted Activity Timeline event when the first Research Plan is created', async () => {
		const { startDeepResearchJobShell } = await import('./index');
		const { listResearchTimelineEvents } = await import('./timeline');

		const created = await startDeepResearchJobShell({
			userId: 'user-1',
			conversationId: 'conv-1',
			triggerMessageId: 'user-msg-1',
			userRequest: 'Compare EU and US AI copyright training data rules',
			depth: 'standard',
			now: new Date('2026-05-05T10:01:00.000Z'),
		});
		const events = await listResearchTimelineEvents({
			userId: 'user-1',
			jobId: created.id,
		});

		expect(events).toEqual([
			expect.objectContaining({
				jobId: created.id,
				conversationId: 'conv-1',
				userId: 'user-1',
				taskId: null,
				stage: 'plan_generation',
				kind: 'plan_generated',
				occurredAt: '2026-05-05T10:01:00.000Z',
				messageKey: 'deepResearch.timeline.planGenerated',
				sourceCounts: {
					discovered: 0,
					reviewed: 0,
					cited: 0,
				},
				summary: 'Research Plan drafted for approval.',
			}),
		]);
	});

	it('writes plan-generation Research Usage when usage is available at job start', async () => {
		const { startDeepResearchJobShell } = await import('./index');
		const { listResearchUsageRecords } = await import('./usage');

		const created = await startDeepResearchJobShell({
			userId: 'user-1',
			conversationId: 'conv-1',
			triggerMessageId: 'user-msg-1',
			userRequest: 'Compare EU and US AI copyright training data rules',
			depth: 'standard',
			now: new Date('2026-05-05T10:01:00.000Z'),
			planGenerationUsage: {
				modelId: 'research-planner',
				modelDisplayName: 'Research Planner',
				providerId: 'internal',
				providerDisplayName: 'Internal',
				runtimeMs: 234,
				providerUsage: {
					promptTokens: 900,
					completionTokens: 180,
					reasoningTokens: 40,
					source: 'provider',
				},
				costUsdMicros: 12,
			},
		});
		const records = await listResearchUsageRecords({
			userId: 'user-1',
			jobId: created.id,
		});

		expect(records).toEqual([
			expect.objectContaining({
				jobId: created.id,
				taskId: null,
				conversationId: 'conv-1',
				userId: 'user-1',
				stage: 'plan_generation',
				operation: 'plan_generation',
				modelId: 'research-planner',
				modelDisplayName: 'Research Planner',
				providerId: 'internal',
				providerDisplayName: 'Internal',
				billingMonth: '2026-05',
				occurredAt: '2026-05-05T10:01:00.000Z',
				promptTokens: 900,
				completionTokens: 180,
				reasoningTokens: 40,
				totalTokens: 1120,
				usageSource: 'provider',
				runtimeMs: 234,
				costUsdMicros: 12,
			}),
		]);
		expect('messageId' in records[0]).toBe(false);
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
			status: 'awaiting_approval',
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
			status: 'awaiting_approval',
			depth: 'focused',
			userRequest: 'Try research again',
		});
		expect(nextJob.id).not.toBe(firstJob.id);
	});

	it('applies a freeform Plan Edit as version 2 without starting source-heavy research', async () => {
		const { editDeepResearchPlan, listConversationDeepResearchJobs, startDeepResearchJobShell } =
			await import('./index');
		const created = await startDeepResearchJobShell({
			userId: 'user-1',
			conversationId: 'conv-1',
			triggerMessageId: 'user-msg-1',
			userRequest: 'Compare EU and US AI copyright training data rules',
			depth: 'standard',
			now: new Date('2026-05-05T10:01:00.000Z'),
		});

		const edited = await editDeepResearchPlan({
			userId: 'user-1',
			jobId: created.id,
			editInstruction: 'Focus more on practical startup compliance risks and exclude policy blogs.',
			now: new Date('2026-05-05T10:05:00.000Z'),
		});
		const [reloaded] = await listConversationDeepResearchJobs('user-1', 'conv-1');

		expect(edited).toMatchObject({
			id: created.id,
			status: 'awaiting_approval',
			stage: 'plan_revised',
			currentPlan: {
				version: 2,
				status: 'awaiting_approval',
			},
		});
		expect(edited.currentPlan?.renderedPlan).toContain(
			'Focus more on practical startup compliance risks and exclude policy blogs.'
		);
		expect(reloaded).toEqual(edited);
		expect(reloaded.status).not.toBe('running');
	});

	it('approves the current Research Plan and transitions the job into an approved runnable state', async () => {
		const {
			approveDeepResearchPlan,
			editDeepResearchPlan,
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
		await editDeepResearchPlan({
			userId: 'user-1',
			jobId: created.id,
			editInstruction: 'Focus more on practical startup compliance risks.',
			now: new Date('2026-05-05T10:05:00.000Z'),
		});

		const approved = await approveDeepResearchPlan({
			userId: 'user-1',
			jobId: created.id,
			now: new Date('2026-05-05T10:06:00.000Z'),
		});
		const [reloaded] = await listConversationDeepResearchJobs('user-1', 'conv-1');

		expect(approved).toMatchObject({
			id: created.id,
			status: 'approved',
			stage: 'plan_approved',
			currentPlan: {
				version: 2,
				status: 'approved',
			},
			updatedAt: new Date('2026-05-05T10:06:00.000Z').getTime(),
		});
		expect(reloaded).toEqual(approved);
	});

	it('rejects Plan Edits after the Research Plan is approved', async () => {
		const { approveDeepResearchPlan, editDeepResearchPlan, startDeepResearchJobShell } =
			await import('./index');
		const created = await startDeepResearchJobShell({
			userId: 'user-1',
			conversationId: 'conv-1',
			triggerMessageId: 'user-msg-1',
			userRequest: 'Compare EU and US AI copyright training data rules',
			depth: 'standard',
			now: new Date('2026-05-05T10:01:00.000Z'),
		});
		await approveDeepResearchPlan({
			userId: 'user-1',
			jobId: created.id,
			now: new Date('2026-05-05T10:06:00.000Z'),
		});

		await expect(
			editDeepResearchPlan({
				userId: 'user-1',
				jobId: created.id,
				editInstruction: 'Now add a new scope after approval.',
				now: new Date('2026-05-05T10:07:00.000Z'),
			})
		).rejects.toMatchObject({
			code: 'plan_already_approved',
			status: 409,
		});
	});

	it('treats repeated Research Plan approval as idempotent', async () => {
		const { approveDeepResearchPlan, startDeepResearchJobShell } = await import('./index');
		const created = await startDeepResearchJobShell({
			userId: 'user-1',
			conversationId: 'conv-1',
			triggerMessageId: 'user-msg-1',
			userRequest: 'Compare EU and US AI copyright training data rules',
			depth: 'standard',
			now: new Date('2026-05-05T10:01:00.000Z'),
		});
		const firstApproval = await approveDeepResearchPlan({
			userId: 'user-1',
			jobId: created.id,
			now: new Date('2026-05-05T10:06:00.000Z'),
		});

		const secondApproval = await approveDeepResearchPlan({
			userId: 'user-1',
			jobId: created.id,
			now: new Date('2026-05-05T10:07:00.000Z'),
		});

		expect(secondApproval).toEqual(firstApproval);
	});
});
