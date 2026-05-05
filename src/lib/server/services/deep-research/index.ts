import { randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { conversations, deepResearchJobs } from '$lib/server/db/schema';
import type { DeepResearchDepth, DeepResearchJob } from '$lib/types';

export type StartDeepResearchJobShellInput = {
	userId: string;
	conversationId: string;
	triggerMessageId: string;
	userRequest: string;
	depth: DeepResearchDepth;
	now?: Date;
};

export type AssertCanStartDeepResearchJobInput = {
	userId: string;
	conversationId: string;
};

export type CancelPrePlanDeepResearchJobInput = {
	userId: string;
	jobId: string;
	now?: Date;
};

type DeepResearchJobRow = typeof deepResearchJobs.$inferSelect;

const OPEN_JOB_STATUS_FILTER = sql`${deepResearchJobs.status} NOT IN ('completed', 'failed', 'cancelled')`;

export class DeepResearchJobStartError extends Error {
	constructor(
		public readonly code: 'conversation_not_found' | 'conversation_sealed' | 'active_job_exists',
		message: string,
		public readonly status: number
	) {
		super(message);
		this.name = 'DeepResearchJobStartError';
	}
}

export function isDeepResearchJobStartError(
	error: unknown
): error is DeepResearchJobStartError {
	return error instanceof DeepResearchJobStartError;
}

export async function startDeepResearchJobShell(
	input: StartDeepResearchJobShellInput
): Promise<DeepResearchJob> {
	await assertCanStartDeepResearchJob(input);

	const now = input.now ?? new Date();
	const [job] = await db
		.insert(deepResearchJobs)
		.values({
			id: randomUUID(),
			userId: input.userId,
			conversationId: input.conversationId,
			triggerMessageId: input.triggerMessageId,
			depth: input.depth,
			status: 'awaiting_plan',
			stage: 'job_shell_created',
			title: buildJobTitle(input.userRequest),
			userRequest: input.userRequest,
			createdAt: now,
			updatedAt: now,
		})
		.returning();

	return mapDeepResearchJob(job);
}

export async function assertCanStartDeepResearchJob(
	input: AssertCanStartDeepResearchJobInput
): Promise<void> {
	const [conversation] = await db
		.select({
			id: conversations.id,
			status: conversations.status,
		})
		.from(conversations)
		.where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, input.userId)))
		.limit(1);

	if (!conversation) {
		throw new DeepResearchJobStartError(
			'conversation_not_found',
			'Conversation not found',
			404
		);
	}
	if (conversation.status === 'sealed') {
		throw new DeepResearchJobStartError(
			'conversation_sealed',
			'Deep Research cannot be started in a sealed conversation',
			409
		);
	}

	const [activeJob] = await db
		.select({ id: deepResearchJobs.id })
		.from(deepResearchJobs)
		.where(
			and(
				eq(deepResearchJobs.userId, input.userId),
				eq(deepResearchJobs.conversationId, input.conversationId),
				OPEN_JOB_STATUS_FILTER
			)
		)
		.limit(1);
	if (activeJob) {
		throw new DeepResearchJobStartError(
			'active_job_exists',
			'This conversation already has an active Deep Research job',
			409
		);
	}
}

export async function listConversationDeepResearchJobs(
	userId: string,
	conversationId: string
): Promise<DeepResearchJob[]> {
	const rows = await db
		.select()
		.from(deepResearchJobs)
		.where(
			and(
				eq(deepResearchJobs.userId, userId),
				eq(deepResearchJobs.conversationId, conversationId)
			)
		)
		.orderBy(asc(deepResearchJobs.createdAt));
	return rows.map(mapDeepResearchJob);
}

export async function cancelPrePlanDeepResearchJob(
	input: CancelPrePlanDeepResearchJobInput
): Promise<DeepResearchJob | null> {
	const now = input.now ?? new Date();
	const [job] = await db
		.update(deepResearchJobs)
		.set({
			status: 'cancelled',
			stage: 'cancelled_before_approval',
			cancelledAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(deepResearchJobs.id, input.jobId),
				eq(deepResearchJobs.userId, input.userId),
				sql`${deepResearchJobs.status} IN ('awaiting_plan', 'awaiting_approval')`
			)
		)
		.returning();

	return job ? mapDeepResearchJob(job) : null;
}

function buildJobTitle(userRequest: string): string {
	const normalized = userRequest.replace(/\s+/g, ' ').trim();
	if (normalized.length <= 80) return normalized;
	return `${normalized.slice(0, 77)}...`;
}

function mapDeepResearchJob(row: DeepResearchJobRow): DeepResearchJob {
	return {
		id: row.id,
		conversationId: row.conversationId,
		triggerMessageId: row.triggerMessageId ?? null,
		depth: row.depth as DeepResearchDepth,
		status: row.status as DeepResearchJob['status'],
		stage: row.stage ?? null,
		title: row.title,
		userRequest: row.userRequest,
		createdAt: row.createdAt.getTime(),
		updatedAt: row.updatedAt.getTime(),
		completedAt: row.completedAt ? row.completedAt.getTime() : null,
		cancelledAt: row.cancelledAt ? row.cancelledAt.getTime() : null,
	};
}
