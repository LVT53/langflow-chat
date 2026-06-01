import { json } from "@sveltejs/kit";
import { requireAuth } from "$lib/server/auth/hooks";
import { applyKnowledgeMemoryAction } from "$lib/server/services/memory";
import type { RequestHandler } from "./$types";

function isValidPayload(body: unknown): body is
	| {
			action: "forget_persona_memory";
			clusterId?: string;
			conclusionId?: string;
	  }
	| { action: "forget_all_persona_memory" }
	| { action: "forget_task_memory"; taskId: string }
	| { action: "forget_focus_continuity"; continuityId: string }
	| { action: "forget_project_memory"; projectId: string } {
	if (!body || typeof body !== "object") return false;
	const action = (body as Record<string, unknown>).action;
	const hasNonEmptyString = (value: unknown) =>
		typeof value === "string" && value.trim().length > 0;

	if (action === "forget_persona_memory") {
		return (
			hasNonEmptyString((body as Record<string, unknown>).clusterId) ||
			hasNonEmptyString((body as Record<string, unknown>).conclusionId)
		);
	}

	if (action === "forget_task_memory") {
		return hasNonEmptyString((body as Record<string, unknown>).taskId);
	}

	if (action === "forget_focus_continuity") {
		return hasNonEmptyString((body as Record<string, unknown>).continuityId);
	}

	if (action === "forget_project_memory") {
		return hasNonEmptyString((body as Record<string, unknown>).projectId);
	}

	return action === "forget_all_persona_memory";
}

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user;
	if (!user) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = await event.request.json().catch(() => null);
	if (!isValidPayload(body)) {
		return json({ error: "Invalid memory action payload" }, { status: 400 });
	}

	try {
		const memory = await applyKnowledgeMemoryAction(
			user.id,
			user.displayName,
			body,
		);
		return json(memory);
	} catch (error) {
		console.error("[KNOWLEDGE_MEMORY] Failed to apply memory action:", error);
		return json({ error: "Failed to update memory profile" }, { status: 500 });
	}
};
