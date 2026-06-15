import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "$lib/server/db/schema";

export function seedRetryCleanupBaseData(dbPath: string) {
	const sqlite = new Database(dbPath);
	sqlite.pragma("foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: "./drizzle" });

	db.insert(schema.users)
		.values({ id: "user-1", email: "user-1@example.com", passwordHash: "hash" })
		.run();
	db.insert(schema.conversations)
		.values({ id: "conv-1", userId: "user-1", title: "Owned conversation" })
		.run();
	db.insert(schema.messages)
		.values([
			{
				id: "assistant-0",
				conversationId: "conv-1",
				role: "assistant",
				content: "Created note.",
			},
			{
				id: "assistant-1",
				conversationId: "conv-1",
				role: "assistant",
				content: "Updated note.",
			},
			{
				id: "assistant-2",
				conversationId: "conv-1",
				role: "assistant",
				content: "Created temporary note.",
			},
		])
		.run();

	sqlite.close();
}

export async function createRetryCleanupFixture(
	dbPath: string,
	options: {
		createInitialNote?: boolean;
	} = {},
) {
	seedRetryCleanupBaseData(dbPath);

	const { createUserSkillDefinition } = await import("../skills/user-skills");
	const { startSkillSession, applySkillControlOperations } = await import(
		"../skills/sessions"
	);
	const { applySkillNoteOperations } = await import("../skills/notes");
	const { cleanupFailedTurn } = await import("./retry-cleanup");
	const { db } = await import("$lib/server/db");

	const skill = await createUserSkillDefinition("user-1", {
		displayName: "Meeting critic",
		description: "Reviews notes.",
		instructions: "Capture durable decisions.",
		durationPolicy: "session",
		notesPolicy: "create_private_notes",
	});
	const session = await startSkillSession("user-1", "conv-1", {
		id: skill.id,
		ownership: "user",
		displayName: skill.displayName,
	});
	let created = null;
	if (options.createInitialNote !== false) {
		created = await applySkillNoteOperations({
			userId: "user-1",
			conversationId: "conv-1",
			sessionId: session.id,
			assistantMessageId: "assistant-0",
			operations: [
				{
					operationId: "note-create-0",
					kind: "note_intent",
					action: "create",
					title: "Decision",
					body: "Original body.",
				},
			],
		});
	}

	return {
		artifactId: created?.applied[0]?.artifactId ?? "missing",
		applySkillControlOperations,
		applySkillNoteOperations,
		cleanupFailedTurn,
		db,
		sessionId: session.id,
	};
}
