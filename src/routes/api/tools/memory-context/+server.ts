import { json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { verifyFileProductionServiceAssertion } from "$lib/server/auth/hooks";
import { db } from "$lib/server/db";
import { conversations } from "$lib/server/db/schema";
import { getMemoryContext } from "$lib/server/services/memory-context";
import type { RequestHandler } from "./$types";

function optionalString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

function optionalPositiveInt(
	value: unknown,
	fieldName: string,
): number | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${fieldName} is invalid`);
	}
	return Math.max(1, Math.floor(value));
}

export const POST: RequestHandler = async (event) => {
	const user = event.locals.user ?? null;

	if (!user && !event.request.headers.get("authorization")) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: "Invalid JSON body" }, { status: 400 });
	}

	if (!body || typeof body !== "object") {
		return json({ error: "Invalid request body" }, { status: 400 });
	}

	const data = body as Record<string, unknown>;
	const conversationId = optionalString(data.conversationId);
	if (!conversationId) {
		return json({ error: "conversationId is required" }, { status: 400 });
	}

	const serviceAssertion =
		user === null
			? verifyFileProductionServiceAssertion(
					event.request.headers.get("authorization"),
				)
			: null;
	if (user === null && !serviceAssertion?.valid) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}
	if (
		user === null &&
		serviceAssertion?.claims.conversationId !== conversationId
	) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}

	const conversation = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	if (!conversation || (user && conversation.userId !== user.id)) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const result = await getMemoryContext({
			userId: conversation.userId,
			conversationId,
			mode: optionalString(data.mode) ?? "project",
			query: optionalString(data.query) ?? null,
			userDisplayName: optionalString(user?.displayName),
			maxSiblings: optionalPositiveInt(data.maxSiblings, "maxSiblings"),
			siblingConversationId: optionalString(data.siblingConversationId) ?? null,
			maxMessages: optionalPositiveInt(data.maxMessages, "maxMessages"),
			maxHistoryConversations: optionalPositiveInt(
				data.maxHistoryConversations,
				"maxHistoryConversations",
			),
			historyConversationId: optionalString(data.historyConversationId) ?? null,
			selectedConversationId:
				optionalString(data.selectedConversationId) ?? null,
			includeEvidenceCandidates:
				typeof data.includeEvidenceCandidates === "boolean"
					? data.includeEvidenceCandidates
					: undefined,
		});
		return json(result);
	} catch (error) {
		const rawMessage =
			error instanceof Error ? error.message : "Memory context lookup failed";
		const message = rawMessage.replaceAll("project_context", "memory_context");
		const status =
			/invalid|required|supported|outside (project_context|memory_context)( history)? scope|not a valid project_context sibling/.test(
				rawMessage,
			)
				? 400
				: 500;
		return json({ error: message }, { status });
	}
};
