import type { ServerLoad } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import { getAuthenticatedAppShellData } from "$lib/server/services/app-shell";

export const load: ServerLoad = async (event) => {
	if (!event.locals.user) {
		throw redirect(302, "/login");
	}

	event.depends("app:shell");
	event.depends("app:shell:conversations");

	return getAuthenticatedAppShellData(event.locals.user);
};
