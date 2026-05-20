import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "$lib/server/db/schema";

let dbPath: string;

function seedBaseData() {
	const sqlite = new Database(dbPath);
	sqlite.pragma("foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: "./drizzle" });

	db.insert(schema.users)
		.values([
			{ id: "user-1", email: "user-1@example.com", passwordHash: "hash" },
			{ id: "user-2", email: "user-2@example.com", passwordHash: "hash" },
		])
		.run();

	db.insert(schema.conversations)
		.values([
			{ id: "conv-1", userId: "user-1", title: "Owned conversation" },
			{ id: "conv-2", userId: "user-2", title: "Other conversation" },
		])
		.run();

	sqlite.close();
}

describe("skill sessions", () => {
	beforeEach(() => {
		dbPath = `/tmp/alfyai-skill-sessions-${randomUUID()}.db`;
		process.env.DATABASE_PATH = dbPath;
		process.env.COMPOSER_COMMAND_REGISTRY_ENABLED = "true";
		vi.resetModules();
	});

	afterEach(async () => {
		try {
			const { sqlite } = await import("$lib/server/db");
			sqlite.close();
		} catch {
			// The DB module may not have been imported if a test failed early.
		}
		try {
			unlinkSync(dbPath);
		} catch {
			// Temporary DB cleanup is best-effort.
		}
		delete process.env.COMPOSER_COMMAND_REGISTRY_ENABLED;
	});

	it("starts one durable active session per conversation with an immutable skill snapshot", async () => {
		seedBaseData();
		const { createUserSkillDefinition, updateUserSkillDefinition } =
			await import("./user-skills");
		const {
			getActiveSkillSession,
			serializePublicSkillSession,
			startSkillSession,
		} = await import("./sessions");

		const skill = await createUserSkillDefinition("user-1", {
			displayName: "Meeting critic",
			description: "Reviews notes.",
			instructions: "Find weak claims and missing owners.",
			activationExamples: ["review these notes"],
			durationPolicy: "session",
			questionPolicy: "ask_when_needed",
			notesPolicy: "create_private_notes",
			sourceScope: "selected_sources_only",
		});

		const started = await startSkillSession("user-1", "conv-1", {
			id: skill.id,
			ownership: "user",
			displayName: "Meeting critic",
		});
		const repeated = await startSkillSession("user-1", "conv-1", {
			id: skill.id,
			ownership: "user",
			displayName: "Meeting critic",
		});

		expect(repeated.id).toBe(started.id);
		expect(started).toMatchObject({
			userId: "user-1",
			conversationId: "conv-1",
			skillId: skill.id,
			skillOwnership: "user",
			status: "active",
			skillDisplayName: "Meeting critic",
			skillDescription: "Reviews notes.",
			skillInstructions: "Find weak claims and missing owners.",
			activationExamples: ["review these notes"],
			durationPolicy: "session",
			questionPolicy: "ask_when_needed",
			notesPolicy: "create_private_notes",
			sourceScope: "selected_sources_only",
			skillVersion: 1,
			startedFrom: "pending_skill",
			milestones: [
				expect.objectContaining({
					kind: "started",
					messageKey: "skillSessions.milestones.started",
				}),
			],
		});

		await updateUserSkillDefinition("user-1", skill.id, {
			displayName: "Meeting critic v2",
			instructions: "Changed instructions.",
		});

		await expect(
			getActiveSkillSession("user-1", "conv-1"),
		).resolves.toMatchObject({
			id: started.id,
			status: "active",
			skillDisplayName: "Meeting critic",
			skillInstructions: "Find weak claims and missing owners.",
			skillVersion: 1,
		});

		const publicSession = serializePublicSkillSession(started);
		expect(publicSession).toMatchObject({
			id: started.id,
			skillDisplayName: "Meeting critic",
		});
		expect(publicSession).not.toHaveProperty("skillInstructions");
	});

	it("snapshots variant effective instructions and revalidates availability when the same active variant is selected again", async () => {
		seedBaseData();
		const { createSystemSkillDefinition, updateSystemSkillDefinition } =
			await import("./user-skills");
		const { getActiveSkillSession, startSkillSession } = await import(
			"./sessions"
		);
		const { db } = await import("$lib/server/db");

		const pack = await createSystemSkillDefinition("user-1", {
			displayName: "Research Pack",
			description: "Grounds answers in selected sources.",
			instructions: "BASE_V1: Use only selected sources.",
			activationExamples: ["research this"],
			published: true,
			durationPolicy: "next_message",
			questionPolicy: "ask_when_needed",
			notesPolicy: "none",
			sourceScope: "selected_sources_only",
		});
		await db
			.insert(schema.userSkillDefinitions)
			.values({
				id: "variant-1",
				userId: "user-1",
				ownership: "user",
				skillKind: "skill_variant",
				baseSkillId: pack.id,
				baseSkillVersion: pack.version,
				displayName: "Research Pack with my voice",
				description: "Personal overlay.",
				instructions: "OVERLAY_V1: Use a terse executive voice.",
				activationExamplesJson: JSON.stringify(["research in my voice"]),
				enabled: true,
				published: false,
				durationPolicy: "session",
				questionPolicy: "none",
				notesPolicy: "create_private_notes",
				sourceScope: "current_conversation",
				creationSource: "user_created",
			})
			.run();

		const started = await startSkillSession("user-1", "conv-1", {
			id: "variant-1",
			ownership: "user",
			skillKind: "skill_variant",
			displayName: "Research Pack with my voice",
		});

		expect(started).toMatchObject({
			status: "active",
			skillId: "variant-1",
			skillOwnership: "user",
			skillKind: "skill_variant",
			skillDisplayName: "Research Pack with my voice",
			skillDescription: "Personal overlay.",
			skillInstructions:
				"BASE_V1: Use only selected sources.\n\nOVERLAY_V1: Use a terse executive voice.",
			activationExamples: ["research in my voice"],
			durationPolicy: "next_message",
			questionPolicy: "ask_when_needed",
			notesPolicy: "none",
			sourceScope: "selected_sources_only",
			skillVersion: 1,
			packSkillId: pack.id,
			packSkillVersion: 1,
			variantSkillId: "variant-1",
			variantSkillVersion: 1,
		});
		expect(started.effectiveInstructionsHash).toMatch(/^[a-f0-9]{64}$/);

		await updateSystemSkillDefinition(pack.id, {
			instructions: "BASE_V2: Updated pack base.",
		});
		await db
			.update(schema.userSkillDefinitions)
			.set({
				instructions: "OVERLAY_V2: Ask in bullet points.",
				version: 2,
				updatedAt: new Date(),
			})
			.where(eq(schema.userSkillDefinitions.id, "variant-1"))
			.run();

		await expect(
			getActiveSkillSession("user-1", "conv-1"),
		).resolves.toMatchObject({
			id: started.id,
			status: "active",
			skillInstructions:
				"BASE_V1: Use only selected sources.\n\nOVERLAY_V1: Use a terse executive voice.",
			packSkillVersion: 1,
			variantSkillVersion: 1,
			effectiveInstructionsHash: started.effectiveInstructionsHash,
		});

		await updateSystemSkillDefinition(pack.id, { enabled: false });
		await expect(
			startSkillSession("user-1", "conv-1", {
				id: "variant-1",
				ownership: "user",
				skillKind: "skill_variant",
				displayName: "Research Pack with my voice",
			}),
		).rejects.toMatchObject({
			code: "skill_unavailable",
			status: 409,
		});
		await expect(
			getActiveSkillSession("user-1", "conv-1"),
		).resolves.toMatchObject({
			id: started.id,
			status: "paused",
			pauseReason: "unavailable",
		});
	});

	it("pauses active variant sessions when the backing variant or pack becomes unavailable", async () => {
		seedBaseData();
		const { createSystemSkillDefinition, updateSystemSkillDefinition } =
			await import("./user-skills");
		const { getActiveSkillSession, startSkillSession } = await import(
			"./sessions"
		);
		const { db } = await import("$lib/server/db");

		await db
			.insert(schema.conversations)
			.values([
				{
					id: "conv-disabled-variant",
					userId: "user-1",
					title: "Disabled variant",
				},
				{
					id: "conv-missing-variant",
					userId: "user-1",
					title: "Missing variant",
				},
				{
					id: "conv-unpublished-pack",
					userId: "user-1",
					title: "Unpublished pack",
				},
				{
					id: "conv-missing-pack",
					userId: "user-1",
					title: "Missing pack",
				},
			])
			.run();

		const makePack = async (displayName: string) =>
			createSystemSkillDefinition("user-1", {
				displayName,
				description: "Pack guidance.",
				instructions: `${displayName} base.`,
				published: true,
				durationPolicy: "session",
			});
		const insertVariant = async (
			id: string,
			packId: string,
			packVersion: number,
		) =>
			db
				.insert(schema.userSkillDefinitions)
				.values({
					id,
					userId: "user-1",
					ownership: "user",
					skillKind: "skill_variant",
					baseSkillId: packId,
					baseSkillVersion: packVersion,
					displayName: `${id} display`,
					description: "Variant overlay.",
					instructions: `${id} overlay.`,
					activationExamplesJson: "[]",
					enabled: true,
					published: false,
					durationPolicy: "session",
					questionPolicy: "none",
					notesPolicy: "none",
					sourceScope: "current_conversation",
					creationSource: "user_created",
				})
				.run();
		const startVariant = (conversationId: string, variantId: string) =>
			startSkillSession("user-1", conversationId, {
				id: variantId,
				ownership: "user",
				skillKind: "skill_variant",
				displayName: `${variantId} display`,
			});

		const disabledVariantPack = await makePack("Disabled Variant Pack");
		await insertVariant(
			"variant-disabled",
			disabledVariantPack.id,
			disabledVariantPack.version,
		);
		const disabledVariant = await startVariant(
			"conv-disabled-variant",
			"variant-disabled",
		);
		await db
			.update(schema.userSkillDefinitions)
			.set({ enabled: false, updatedAt: new Date() })
			.where(eq(schema.userSkillDefinitions.id, "variant-disabled"))
			.run();

		const missingVariantPack = await makePack("Missing Variant Pack");
		await insertVariant(
			"variant-missing",
			missingVariantPack.id,
			missingVariantPack.version,
		);
		const missingVariant = await startVariant(
			"conv-missing-variant",
			"variant-missing",
		);
		await db
			.delete(schema.userSkillDefinitions)
			.where(eq(schema.userSkillDefinitions.id, "variant-missing"))
			.run();

		const unpublishedPack = await makePack("Unpublished Pack");
		await insertVariant(
			"variant-unpublished-pack",
			unpublishedPack.id,
			unpublishedPack.version,
		);
		const unpublishedPackSession = await startVariant(
			"conv-unpublished-pack",
			"variant-unpublished-pack",
		);
		await updateSystemSkillDefinition(unpublishedPack.id, { published: false });

		const missingPack = await makePack("Missing Pack");
		await insertVariant(
			"variant-missing-pack",
			missingPack.id,
			missingPack.version,
		);
		const missingPackSession = await startVariant(
			"conv-missing-pack",
			"variant-missing-pack",
		);
		await db
			.delete(schema.userSkillDefinitions)
			.where(eq(schema.userSkillDefinitions.id, missingPack.id))
			.run();

		await expect(
			getActiveSkillSession("user-1", "conv-disabled-variant"),
		).resolves.toMatchObject({
			id: disabledVariant.id,
			status: "paused",
			pauseReason: "unavailable",
		});
		await expect(
			getActiveSkillSession("user-1", "conv-missing-variant"),
		).resolves.toMatchObject({
			id: missingVariant.id,
			status: "paused",
			pauseReason: "unavailable",
		});
		await expect(
			getActiveSkillSession("user-1", "conv-unpublished-pack"),
		).resolves.toMatchObject({
			id: unpublishedPackSession.id,
			status: "paused",
			pauseReason: "unavailable",
		});
		await expect(
			getActiveSkillSession("user-1", "conv-missing-pack"),
		).resolves.toMatchObject({
			id: missingPackSession.id,
			status: "paused",
			pauseReason: "unavailable",
		});
	});

	it("rejects starting a different active skill in the same conversation", async () => {
		seedBaseData();
		const { createUserSkillDefinition } = await import("./user-skills");
		const { startSkillSession } = await import("./sessions");

		const firstSkill = await createUserSkillDefinition("user-1", {
			displayName: "Meeting critic",
			description: "Reviews notes.",
			instructions: "Find weak claims.",
			durationPolicy: "session",
		});
		const secondSkill = await createUserSkillDefinition("user-1", {
			displayName: "Interview coach",
			description: "Asks questions.",
			instructions: "Ask short questions first.",
			durationPolicy: "session",
		});

		const started = await startSkillSession("user-1", "conv-1", {
			id: firstSkill.id,
			ownership: "user",
			displayName: firstSkill.displayName,
		});

		await expect(
			startSkillSession("user-1", "conv-1", {
				id: secondSkill.id,
				ownership: "user",
				displayName: secondSkill.displayName,
			}),
		).rejects.toMatchObject({
			code: "active_skill_session_conflict",
			status: 409,
		});

		await expect(
			startSkillSession("user-1", "conv-1", {
				id: firstSkill.id,
				ownership: "user",
				displayName: firstSkill.displayName,
			}),
		).resolves.toMatchObject({ id: started.id });
	});

	it("enforces ownership, feature flag, unavailable skill pause, and end milestones", async () => {
		seedBaseData();
		const { createUserSkillDefinition, updateUserSkillDefinition } =
			await import("./user-skills");
		const { getActiveSkillSession, startSkillSession } = await import(
			"./sessions"
		);

		const skill = await createUserSkillDefinition("user-1", {
			displayName: "Interview coach",
			description: "Asks follow-up questions.",
			instructions: "Ask short questions first.",
		});

		await expect(
			startSkillSession("user-2", "conv-1", {
				id: skill.id,
				ownership: "user",
				displayName: skill.displayName,
			}),
		).rejects.toMatchObject({ code: "conversation_not_found", status: 404 });

		const started = await startSkillSession("user-1", "conv-1", {
			id: skill.id,
			ownership: "user",
			displayName: skill.displayName,
		});

		process.env.COMPOSER_COMMAND_REGISTRY_ENABLED = "false";
		vi.resetModules();
		const disabledModule = await import("./sessions");
		await expect(
			disabledModule.startSkillSession("user-1", "conv-1", {
				id: skill.id,
				ownership: "user",
				displayName: skill.displayName,
			}),
		).rejects.toMatchObject({ code: "skill_sessions_disabled", status: 403 });

		process.env.COMPOSER_COMMAND_REGISTRY_ENABLED = "true";
		vi.resetModules();
		const {
			getActiveSkillSession: getAfterFlagReset,
			endSkillSession: endAfterFlagReset,
		} = await import("./sessions");

		await updateUserSkillDefinition("user-1", skill.id, { enabled: false });
		const paused = await getAfterFlagReset("user-1", "conv-1");
		expect(paused).toMatchObject({
			id: started.id,
			status: "paused",
			pauseReason: "unavailable",
			milestones: expect.arrayContaining([
				expect.objectContaining({
					kind: "unavailable",
					messageKey: "skillSessions.milestones.unavailable",
				}),
			]),
		});

		const ended = await endAfterFlagReset("user-1", "conv-1", "dismissed");
		expect(ended).toMatchObject({
			id: started.id,
			status: "ended",
			endReason: "dismissed",
			milestones: expect.arrayContaining([
				expect.objectContaining({
					kind: "dismissed",
					messageKey: "skillSessions.milestones.dismissed",
				}),
			]),
		});

		await expect(getActiveSkillSession("user-1", "conv-1")).resolves.toBeNull();
	});

	it("applies Skill Control Envelope transitions once per operation id", async () => {
		seedBaseData();
		const { createUserSkillDefinition } = await import("./user-skills");
		const {
			applySkillControlOperations,
			getActiveSkillSession,
			startSkillSession,
		} = await import("./sessions");

		const skill = await createUserSkillDefinition("user-1", {
			displayName: "Interview coach",
			description: "Asks follow-up questions.",
			instructions: "Ask short questions first.",
			questionPolicy: "ask_when_needed",
		});
		const started = await startSkillSession("user-1", "conv-1", {
			id: skill.id,
			ownership: "user",
			displayName: skill.displayName,
		});

		await applySkillControlOperations({
			userId: "user-1",
			conversationId: "conv-1",
			assistantMessageId: "assistant-1",
			operations: [
				{
					operationId: "ask-deadline",
					kind: "session_transition",
					transition: "awaiting_user",
				},
			],
		});
		await applySkillControlOperations({
			userId: "user-1",
			conversationId: "conv-1",
			assistantMessageId: "assistant-1",
			operations: [
				{
					operationId: "ask-deadline",
					kind: "session_transition",
					transition: "awaiting_user",
				},
			],
		});

		const session = await getActiveSkillSession("user-1", "conv-1");
		expect(session).toMatchObject({
			id: started.id,
			status: "active",
			milestones: expect.arrayContaining([
				expect.objectContaining({
					kind: "awaiting_user",
					messageKey: "skillSessions.milestones.awaitingUser",
					messageParams: expect.objectContaining({
						envelopeOperationId: "ask-deadline",
						assistantMessageId: "assistant-1",
					}),
				}),
			]),
		});
		expect(
			session?.milestones.filter(
				(milestone) =>
					milestone.messageParams.envelopeOperationId === "ask-deadline",
			),
		).toHaveLength(1);
	});

	it("maps terminal Skill Control Envelope transitions to ended sessions", async () => {
		seedBaseData();
		const { createUserSkillDefinition } = await import("./user-skills");
		const {
			applySkillControlOperations,
			getActiveSkillSession,
			startSkillSession,
		} = await import("./sessions");

		const skill = await createUserSkillDefinition("user-1", {
			displayName: "Planner",
			description: "Plans work.",
			instructions: "Keep the plan moving.",
		});
		const started = await startSkillSession("user-1", "conv-1", {
			id: skill.id,
			ownership: "user",
			displayName: skill.displayName,
		});

		const ended = await applySkillControlOperations({
			userId: "user-1",
			conversationId: "conv-1",
			assistantMessageId: "assistant-2",
			operations: [
				{
					operationId: "finish-session",
					kind: "session_transition",
					transition: "finished",
				},
			],
		});

		expect(ended).toMatchObject({
			id: started.id,
			status: "ended",
			endReason: "ended",
			milestones: expect.arrayContaining([
				expect.objectContaining({
					kind: "ended",
					messageParams: expect.objectContaining({
						envelopeOperationId: "finish-session",
					}),
				}),
			]),
		});
		await expect(getActiveSkillSession("user-1", "conv-1")).resolves.toBeNull();
	});
});
