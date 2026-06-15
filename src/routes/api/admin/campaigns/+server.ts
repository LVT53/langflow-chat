import { json } from "@sveltejs/kit";
import { requireAdmin } from "$lib/server/auth/hooks";
import {
	createCampaignDraft,
	listCampaigns,
} from "$lib/server/services/announcement-campaigns";
import { campaignErrorResponse } from "./_shared";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
	requireAdmin(event);
	return json({ campaigns: await listCampaigns() });
};

export const POST: RequestHandler = async (event) => {
	requireAdmin(event);
	const createdByUserId = event.locals.user.id;
	const body = await event.request.json().catch(() => ({}));
	try {
		const campaign = await createCampaignDraft({
			type: body?.type,
			releaseVersion: body?.releaseVersion,
			name: body?.name,
			createdByUserId,
		});
		return json({ campaign }, { status: 201 });
	} catch (error) {
		return campaignErrorResponse(error, "Failed to create campaign draft.");
	}
};
