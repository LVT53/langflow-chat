import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/auth/hooks", () => ({
	requireAdmin: vi.fn(),
}));

vi.mock("$lib/server/services/normal-chat-stability-snapshot", () => ({
	getNormalChatStabilitySnapshot: vi.fn(),
}));

import { requireAdmin } from "$lib/server/auth/hooks";
import { getNormalChatStabilitySnapshot } from "$lib/server/services/normal-chat-stability-snapshot";
import { GET } from "./+server";

const mockRequireAdmin = requireAdmin as ReturnType<typeof vi.fn>;
const mockGetNormalChatStabilitySnapshot =
	getNormalChatStabilitySnapshot as ReturnType<typeof vi.fn>;

type StabilityEvent = Parameters<typeof GET>[0];

function makeEvent(): StabilityEvent {
	return {
		request: new Request("http://localhost/api/admin/normal-chat-stability"),
		locals: { user: { id: "admin-1", role: "admin" } },
		params: {},
		url: new URL("http://localhost/api/admin/normal-chat-stability"),
		route: { id: "/api/admin/normal-chat-stability" },
	} as StabilityEvent;
}

describe("admin normal chat stability route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAdmin.mockReturnValue(undefined);
		mockGetNormalChatStabilitySnapshot.mockResolvedValue({
			generatedAt: "2026-06-04T10:00:00.000Z",
			status: "ok",
		});
	});

	it("returns the stability snapshot for admins", async () => {
		const response = await GET(makeEvent());
		const data = await response.json();

		expect(mockRequireAdmin).toHaveBeenCalled();
		expect(mockGetNormalChatStabilitySnapshot).toHaveBeenCalled();
		expect(response.status).toBe(200);
		expect(data).toEqual({
			snapshot: {
				generatedAt: "2026-06-04T10:00:00.000Z",
				status: "ok",
			},
		});
	});

	it("does not build a snapshot when admin authorization fails", async () => {
		const forbidden = new Error("Forbidden");
		mockRequireAdmin.mockImplementation(() => {
			throw forbidden;
		});

		await expect(GET(makeEvent())).rejects.toBe(forbidden);
		expect(mockGetNormalChatStabilitySnapshot).not.toHaveBeenCalled();
	});
});
