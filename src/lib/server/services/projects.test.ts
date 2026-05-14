import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import * as schema from '$lib/server/db/schema';

let dbPath: string;

function openSeedDatabase() {
	const sqlite = new Database(dbPath);
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	return { sqlite, db };
}

function seedProjectDeletionScenario() {
	const { sqlite, db } = openSeedDatabase();
	const now = new Date('2026-05-14T09:00:00.000Z');

	db.insert(schema.users)
		.values([
			{
				id: 'owner-user',
				email: 'owner@example.com',
				passwordHash: 'hash',
			},
			{
				id: 'other-user',
				email: 'other@example.com',
				passwordHash: 'hash',
			},
		])
		.run();
	db.insert(schema.memoryProjects)
		.values({
			projectId: 'memory-project-1',
			userId: 'owner-user',
			name: 'Launch continuity',
			createdAt: now,
			updatedAt: now,
		})
		.run();
	db.insert(schema.projects)
		.values({
			id: 'folder-1',
			userId: 'owner-user',
			name: 'Launch folder',
			canonicalMemoryProjectId: 'memory-project-1',
			createdAt: now,
			updatedAt: now,
		})
		.run();
	db.insert(schema.conversations)
		.values({
			id: 'conv-1',
			userId: 'owner-user',
			title: 'Launch brief conversation',
			projectId: 'folder-1',
			createdAt: now,
			updatedAt: now,
		})
		.run();
	db.insert(schema.conversationTaskStates)
		.values({
			taskId: 'task-1',
			userId: 'owner-user',
			conversationId: 'conv-1',
			status: 'active',
			objective: 'Draft the launch brief',
			confidence: 88,
			locked: 0,
			nextStepsJson: JSON.stringify(['Send the first draft']),
			createdAt: now,
			updatedAt: now,
		})
		.run();
	db.insert(schema.memoryProjectTaskLinks)
		.values({
			id: 'link-1',
			projectId: 'memory-project-1',
			taskId: 'task-1',
			userId: 'owner-user',
			conversationId: 'conv-1',
			createdAt: now,
			updatedAt: now,
		})
		.run();

	sqlite.close();
}

function readConversation(conversationId = 'conv-1') {
	const sqlite = new Database(dbPath);
	const db = drizzle(sqlite, { schema });
	const conversation = db
		.select()
		.from(schema.conversations)
		.where(eq(schema.conversations.id, conversationId))
		.get();
	sqlite.close();
	return conversation;
}

function readProjectFolder(projectId = 'folder-1') {
	const sqlite = new Database(dbPath);
	const db = drizzle(sqlite, { schema });
	const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
	sqlite.close();
	return project;
}

function readMemoryProject(projectId = 'memory-project-1') {
	const sqlite = new Database(dbPath);
	const db = drizzle(sqlite, { schema });
	const project = db
		.select()
		.from(schema.memoryProjects)
		.where(eq(schema.memoryProjects.projectId, projectId))
		.get();
	sqlite.close();
	return project;
}

function readMemoryProjectTaskLink(taskId = 'task-1') {
	const sqlite = new Database(dbPath);
	const db = drizzle(sqlite, { schema });
	const link = db
		.select()
		.from(schema.memoryProjectTaskLinks)
		.where(eq(schema.memoryProjectTaskLinks.taskId, taskId))
		.get();
	sqlite.close();
	return link;
}

describe('deleteProject', () => {
	beforeEach(() => {
		dbPath = `/tmp/alfyai-project-delete-${randomUUID()}.db`;
		process.env.DATABASE_PATH = dbPath;
		vi.resetModules();
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

	it('does not unassign conversations when the folder belongs to another user', async () => {
		seedProjectDeletionScenario();
		const { deleteProject } = await import('./projects');

		const deleted = await deleteProject('other-user', 'folder-1');

		expect(deleted).toBe(false);
		expect(readProjectFolder()?.userId).toBe('owner-user');
		expect(readConversation()?.projectId).toBe('folder-1');
		expect(readMemoryProject()?.projectId).toBe('memory-project-1');
		expect(readMemoryProjectTaskLink()?.projectId).toBe('memory-project-1');
	});

	it('removes the owned folder while preserving conversations and project continuity', async () => {
		seedProjectDeletionScenario();
		const { deleteProject } = await import('./projects');

		const deleted = await deleteProject('owner-user', 'folder-1');

		expect(deleted).toBe(true);
		expect(readProjectFolder()).toBeUndefined();
		expect(readConversation()).toEqual(
			expect.objectContaining({
				id: 'conv-1',
				userId: 'owner-user',
				projectId: null,
			})
		);
		expect(readMemoryProject()).toEqual(
			expect.objectContaining({
				projectId: 'memory-project-1',
				userId: 'owner-user',
				name: 'Launch continuity',
			})
		);
		expect(readMemoryProjectTaskLink()).toEqual(
			expect.objectContaining({
				projectId: 'memory-project-1',
				taskId: 'task-1',
				conversationId: 'conv-1',
			})
		);
	});
});
