import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
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
});
