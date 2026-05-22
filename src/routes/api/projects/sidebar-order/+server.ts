import { json } from "@sveltejs/kit";
import { requireAuth } from "$lib/server/auth/hooks";
import {
	listProjects,
	saveProjectSidebarOrder,
} from "$lib/server/services/projects";
import type { RequestHandler } from "./$types";

function parseOptionalIds(value: unknown): string[] | undefined | null {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) return null;
	if (
		!value.every((item) => typeof item === "string" && item.trim().length > 0)
	) {
		return null;
	}
	return value.map((item) => item.trim());
}

export const PATCH: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user;
	if (!user) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}
	const body = await event.request.json().catch(() => null);
	const ids = parseOptionalIds(body?.ids);
	if (!body || ids === null) {
		return json(
			{
				error: "ids must be an array of project ids when provided",
			},
			{ status: 400 },
		);
	}

	try {
		await saveProjectSidebarOrder(user.id, { ids });
	} catch (error) {
		return json(
			{
				error: error instanceof Error ? error.message : "Invalid sidebar order",
			},
			{ status: 400 },
		);
	}

	const projects = await listProjects(user.id);
	return json({ projects });
};
