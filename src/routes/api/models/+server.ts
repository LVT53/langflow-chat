import { json } from "@sveltejs/kit";
import { getConfig } from "$lib/server/config-store";
import { getAvailableModelProviderGroups } from "$lib/server/services/available-models";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
	const providers = await getAvailableModelProviderGroups(getConfig());
	return json({ providers });
};
