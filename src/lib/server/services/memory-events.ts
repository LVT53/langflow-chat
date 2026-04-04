import { randomUUID } from 'crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { memoryEvents } from '$lib/server/db/schema';
import type { MemoryEvent, MemoryEventDomain, MemoryEventType } from '$lib/types';
import { parseJsonRecord } from '$lib/server/utils/json';

type MemoryEventPayload = Record<string, unknown>;

export interface MemoryEventInput {
	eventKey: string;
	userId: string;
	domain: MemoryEventDomain;
	eventType: MemoryEventType;
	conversationId?: string | null;
	messageId?: string | null;
	subjectId?: string | null;
	relatedId?: string | null;
	observedAt?: number | Date;
	payload?: MemoryEventPayload | null;
}

function normalizeObservedAt(value?: number | Date): Date {
	if (value instanceof Date) {
		return value;
	}
	if (typeof value === 'number' && Number.isFinite(value)) {
		return new Date(value);
	}
	return new Date();
}

function scopeEventKey(userId: string, eventKey: string): string {
	return `u:${userId}:${eventKey}`;
}

function unscopeEventKey(userId: string, storedEventKey: string): string {
	const prefix = `u:${userId}:`;
	return storedEventKey.startsWith(prefix)
		? storedEventKey.slice(prefix.length)
		: storedEventKey;
}

function mapMemoryEventRow(row: typeof memoryEvents.$inferSelect): MemoryEvent {
	return {
		id: row.id,
		eventKey: unscopeEventKey(row.userId, row.eventKey),
		userId: row.userId,
		conversationId: row.conversationId ?? null,
		messageId: row.messageId ?? null,
		domain: row.domain as MemoryEventDomain,
		eventType: row.eventType as MemoryEventType,
		subjectId: row.subjectId ?? null,
		relatedId: row.relatedId ?? null,
		observedAt: row.observedAt.getTime(),
		createdAt: row.createdAt.getTime(),
		payload: parseJsonRecord(row.payloadJson) ?? null,
	};
}

export async function recordMemoryEvent(params: MemoryEventInput): Promise<void> {
	await db
		.insert(memoryEvents)
		.values({
			id: randomUUID(),
			eventKey: scopeEventKey(params.userId, params.eventKey),
			userId: params.userId,
			conversationId: params.conversationId ?? null,
			messageId: params.messageId ?? null,
			domain: params.domain,
			eventType: params.eventType,
			subjectId: params.subjectId ?? null,
			relatedId: params.relatedId ?? null,
			observedAt: normalizeObservedAt(params.observedAt),
			payloadJson: params.payload ? JSON.stringify(params.payload) : null,
		})
		.onConflictDoNothing({
			target: memoryEvents.eventKey,
		});
}

export async function recordMemoryEvents(params: MemoryEventInput[]): Promise<void> {
	if (params.length === 0) {
		return;
	}

	await db
		.insert(memoryEvents)
		.values(
			params.map((event) => ({
				id: randomUUID(),
				eventKey: scopeEventKey(event.userId, event.eventKey),
				userId: event.userId,
				conversationId: event.conversationId ?? null,
				messageId: event.messageId ?? null,
				domain: event.domain,
				eventType: event.eventType,
				subjectId: event.subjectId ?? null,
				relatedId: event.relatedId ?? null,
				observedAt: normalizeObservedAt(event.observedAt),
				payloadJson: event.payload ? JSON.stringify(event.payload) : null,
			}))
		)
		.onConflictDoNothing({
			target: memoryEvents.eventKey,
		});
}

export async function listMemoryEvents(params: {
	userId: string;
	domain?: MemoryEventDomain;
	eventTypes?: MemoryEventType[];
	subjectId?: string | null;
	subjectIds?: string[];
	limit?: number;
}): Promise<MemoryEvent[]> {
	const conditions = [eq(memoryEvents.userId, params.userId)];
	if (params.domain) {
		conditions.push(eq(memoryEvents.domain, params.domain));
	}
	if (params.subjectId) {
		conditions.push(eq(memoryEvents.subjectId, params.subjectId));
	}
	if (params.subjectIds && params.subjectIds.length > 0) {
		conditions.push(inArray(memoryEvents.subjectId, params.subjectIds));
	}
	if (params.eventTypes && params.eventTypes.length > 0) {
		conditions.push(inArray(memoryEvents.eventType, params.eventTypes));
	}

	const rows = await db
		.select()
		.from(memoryEvents)
		.where(and(...conditions))
		.orderBy(desc(memoryEvents.observedAt))
		.limit(params.limit ?? 20);

	return rows.map(mapMemoryEventRow);
}

export async function listLatestMemoryEventsBySubject(params: {
	userId: string;
	domain?: MemoryEventDomain;
	eventTypes?: MemoryEventType[];
	subjectIds: string[];
	limitPerSubject?: number;
}): Promise<Map<string, MemoryEvent>> {
	if (params.subjectIds.length === 0) {
		return new Map();
	}

	const rows = await listMemoryEvents({
		userId: params.userId,
		domain: params.domain,
		eventTypes: params.eventTypes,
		subjectIds: params.subjectIds,
		limit: Math.max(params.subjectIds.length * (params.limitPerSubject ?? 4), params.subjectIds.length),
	});

	const latestBySubject = new Map<string, MemoryEvent>();
	for (const row of rows) {
		if (!row.subjectId || latestBySubject.has(row.subjectId)) continue;
		latestBySubject.set(row.subjectId, row);
	}

	return latestBySubject;
}

export async function countRecentMemoryEventsBySubject(params: {
	userId: string;
	domain?: MemoryEventDomain;
	eventTypes?: MemoryEventType[];
	subjectIds: string[];
	since?: number | Date;
	limitPerSubject?: number;
}): Promise<Map<string, number>> {
	if (params.subjectIds.length === 0) {
		return new Map();
	}

	const sinceTimestamp =
		params.since instanceof Date
			? params.since.getTime()
			: typeof params.since === 'number' && Number.isFinite(params.since)
				? params.since
				: null;

	const rows = await listMemoryEvents({
		userId: params.userId,
		domain: params.domain,
		eventTypes: params.eventTypes,
		subjectIds: params.subjectIds,
		limit: Math.max(params.subjectIds.length * (params.limitPerSubject ?? 8), params.subjectIds.length),
	});

	const counts = new Map<string, number>();
	for (const row of rows) {
		if (!row.subjectId) continue;
		if (sinceTimestamp !== null && row.observedAt < sinceTimestamp) continue;
		counts.set(row.subjectId, (counts.get(row.subjectId) ?? 0) + 1);
	}

	return counts;
}
