import { json } from "@sveltejs/kit";
import { requireAdmin } from "$lib/server/auth/hooks";
import { publishCampaign } from "$lib/server/services/announcement-campaigns";
import { getAppVersionMetadata } from "$lib/server/services/app-version";
import { campaignErrorResponse } from "../../_shared";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
	requireAdmin(event);
	const actorUserId = event.locals.user.id;
	try {
		const campaign = await publishCampaign(event.params.id, actorUserId);
		if (campaign.type === "release_update") {
			await getAppVersionMetadata();
		}
		return json({ campaign });
	} catch (error) {
		return campaignErrorResponse(error, "Failed to publish campaign.");
	}
};
