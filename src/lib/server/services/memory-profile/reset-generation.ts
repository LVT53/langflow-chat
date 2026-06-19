import { eq, sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { memoryResetGenerations } from "$lib/server/db/schema";

export class StaleMemoryResetGenerationError extends Error {
	constructor() {
		super("Memory reset generation advanced before memory work could apply.");
		this.name = "StaleMemoryResetGenerationError";
	}
}

async function ensureMemoryResetGenerationRow(userId: string): Promise<void> {
	await db
		.insert(memoryResetGenerations)
		.values({
			userId,
			resetGeneration: 0,
			createdAt: new Date(),
			updatedAt: new Date(),
		})
		.onConflictDoNothing({ target: memoryResetGenerations.userId })
		.run();
}

export async function getCurrentMemoryResetGeneration(
	userId: string,
): Promise<number> {
	await ensureMemoryResetGenerationRow(userId);

	const [row] = await db
		.select({ resetGeneration: memoryResetGenerations.resetGeneration })
		.from(memoryResetGenerations)
		.where(eq(memoryResetGenerations.userId, userId))
		.limit(1);

	return row?.resetGeneration ?? 0;
}

export async function advanceMemoryResetGeneration(
	userId: string,
): Promise<number> {
	await ensureMemoryResetGenerationRow(userId);
	const now = new Date();

	await db
		.update(memoryResetGenerations)
		.set({
			resetGeneration: sql`${memoryResetGenerations.resetGeneration} + 1`,
			advancedAt: now,
			updatedAt: now,
		})
		.where(eq(memoryResetGenerations.userId, userId))
		.run();

	return getCurrentMemoryResetGeneration(userId);
}

export async function isCurrentMemoryResetGeneration(params: {
	userId: string;
	resetGeneration: number;
}): Promise<boolean> {
	return (
		(await getCurrentMemoryResetGeneration(params.userId)) ===
		params.resetGeneration
	);
}

export function isStaleMemoryResetGenerationError(
	error: unknown,
): error is StaleMemoryResetGenerationError {
	return error instanceof StaleMemoryResetGenerationError;
}

export async function assertExpectedMemoryResetGeneration(params: {
	userId: string;
	expectedResetGeneration?: number;
}): Promise<number> {
	if (params.expectedResetGeneration === undefined) {
		return getCurrentMemoryResetGeneration(params.userId);
	}
	if (
		!(await isCurrentMemoryResetGeneration({
			userId: params.userId,
			resetGeneration: params.expectedResetGeneration,
		}))
	) {
		throw new StaleMemoryResetGenerationError();
	}
	return params.expectedResetGeneration;
}
