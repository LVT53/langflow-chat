import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	conversationTaskStates,
	taskCheckpoints,
	users,
} from '$lib/server/db/schema';
import { getConfig } from '$lib/server/config-store';
import { areNearDuplicateArtifactTexts } from './evidence-family';
import type { HonchoPersonaMemoryRecord } from './honcho';
import { forgetPersonaMemory, listPersonaMemories } from './honcho';
import { refreshPersonaClusterStates, syncPersonaMemoryClusters } from './persona-memory';
import { pruneOrphanProjectMemory, updateProjectMemoryStatuses } from './task-state';

const KEEP_MICRO_CHECKPOINTS = 6;
const KEEP_STABLE_CHECKPOINTS = 3;
const TASK_ARCHIVE_AFTER_DAYS = 30;

let schedulerStarted = false;
let schedulerHandle: ReturnType<typeof setInterval> | null = null;

function taskIsStale(updatedAt: Date, now = Date.now()): boolean {
	return now - updatedAt.getTime() >= TASK_ARCHIVE_AFTER_DAYS * 86_400_000;
}

async function dedupePersonaMemory(userId: string): Promise<HonchoPersonaMemoryRecord[]> {
	const records = await listPersonaMemories(userId).catch(() => []);
	if (records.length <= 1) return records;

	const kept: HonchoPersonaMemoryRecord[] = [];
	for (const record of records) {
		const duplicate = kept.some((existing) =>
			areNearDuplicateArtifactTexts(record.content, existing.content)
		);
		if (duplicate) {
			await forgetPersonaMemory(userId, record.id).catch((error) =>
				console.error('[MEMORY_MAINTENANCE] Failed to remove duplicate persona memory:', {
					userId,
					conclusionId: record.id,
					error,
				})
			);
			continue;
		}
		kept.push(record);
	}

	return kept;
}

async function pruneTaskCheckpoints(userId: string): Promise<void> {
	const rows = await db
		.select()
		.from(taskCheckpoints)
		.where(eq(taskCheckpoints.userId, userId))
		.orderBy(desc(taskCheckpoints.updatedAt));

	const keepIds = new Set<string>();
	const counts = new Map<string, { micro: number; stable: number }>();

	for (const row of rows) {
		const current = counts.get(row.taskId) ?? { micro: 0, stable: 0 };
		if (row.checkpointType === 'micro') {
			if (current.micro < KEEP_MICRO_CHECKPOINTS) {
				keepIds.add(row.id);
				current.micro += 1;
			}
		} else if (row.checkpointType === 'stable') {
			if (current.stable < KEEP_STABLE_CHECKPOINTS) {
				keepIds.add(row.id);
				current.stable += 1;
			}
		} else {
			keepIds.add(row.id);
		}
		counts.set(row.taskId, current);
	}

	const idsToDelete = rows.map((row) => row.id).filter((id) => !keepIds.has(id));
	if (idsToDelete.length === 0) return;

	await db
		.delete(taskCheckpoints)
		.where(and(eq(taskCheckpoints.userId, userId), inArray(taskCheckpoints.id, idsToDelete)));
}

async function archiveStaleTaskMemory(userId: string): Promise<void> {
	const rows = await db
		.select({
			taskId: conversationTaskStates.taskId,
			status: conversationTaskStates.status,
			updatedAt: conversationTaskStates.updatedAt,
		})
		.from(conversationTaskStates)
		.where(eq(conversationTaskStates.userId, userId));

	const staleIds = rows
		.filter((row) => row.status !== 'archived' && taskIsStale(row.updatedAt))
		.map((row) => row.taskId);
	if (staleIds.length === 0) return;

	await db
		.update(conversationTaskStates)
		.set({
			status: 'archived',
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(conversationTaskStates.userId, userId),
				inArray(conversationTaskStates.taskId, staleIds)
			)
		);
}

export async function runUserMemoryMaintenance(
	userId: string,
	reason = 'manual'
): Promise<void> {
	try {
		const dedupedPersonaRecords = await dedupePersonaMemory(userId);
		await syncPersonaMemoryClusters({
			userId,
			rawRecords: dedupedPersonaRecords,
			reason,
		});
		await refreshPersonaClusterStates(userId);
		await pruneTaskCheckpoints(userId);
		await archiveStaleTaskMemory(userId);
		await updateProjectMemoryStatuses(userId);
		await pruneOrphanProjectMemory(userId);
		console.info('[MEMORY_MAINTENANCE] Completed', { userId, reason });
	} catch (error) {
		console.error('[MEMORY_MAINTENANCE] Failed', { userId, reason, error });
	}
}

export async function runAllUsersMemoryMaintenance(reason = 'scheduler'): Promise<void> {
	const rows = await db.select({ id: users.id }).from(users);
	for (const row of rows) {
		await runUserMemoryMaintenance(row.id, reason);
	}
}

export function ensureMemoryMaintenanceScheduler(): void {
	if (schedulerStarted) return;
	const intervalMinutes = getConfig().memoryMaintenanceIntervalMinutes;
	if (!intervalMinutes || intervalMinutes <= 0) return;

	schedulerStarted = true;
	schedulerHandle = setInterval(() => {
		void runAllUsersMemoryMaintenance('scheduler');
	}, intervalMinutes * 60_000);
	schedulerHandle.unref?.();
	console.info('[MEMORY_MAINTENANCE] Scheduler enabled', { intervalMinutes });
}

export function stopMemoryMaintenanceScheduler(): void {
	if (schedulerHandle) {
		clearInterval(schedulerHandle);
		schedulerHandle = null;
	}
	schedulerStarted = false;
}
