import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/services/conversation-drafts", () => ({
	clearConversationDraft: vi.fn(),
	parsePendingSkillSelection: vi.fn((value: unknown) => {
		if (typeof value !== "object" || value === null) return null;
		const record = value as Record<string, unknown>;
		if (
			typeof record.id !== "string" ||
			(record.ownership !== "user" && record.ownership !== "system") ||
			typeof record.displayName !== "string"
		) {
			return null;
		}
		return {
			id: record.id,
			ownership: record.ownership,
			skillKind: record.skillKind,
			displayName: record.displayName,
			baseSkillId: record.baseSkillId,
			baseSkillDisplayName: record.baseSkillDisplayName,
			unavailable: record.unavailable,
		};
	}),
	upsertConversationDraft: vi.fn(),
}));

vi.mock("$lib/server/services/conversations", () => ({
	getConversation: vi.fn(),
}));

vi.mock("$lib/server/config-store", () => ({
	getConfig: vi.fn(),
}));

import { getConfig } from "$lib/server/config-store";
import { upsertConversationDraft } from "$lib/server/services/conversation-drafts";
import { getConversation } from "$lib/server/services/conversations";
import { PUT } from "./+server";

const mockUpsert = vi.mocked(upsertConversationDraft);
const mockGetConversation = vi.mocked(getConversation);
const mockGetConfig = vi.mocked(getConfig);

function makeEvent(body: unknown) {
	return {
		locals: { user: { id: "user-1", role: "user" } },
		params: { id: "conv-1" },
		request: new Request("http://localhost/api/conversations/conv-1/draft", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
		url: new URL("http://localhost/api/conversations/conv-1/draft"),
		route: { id: "/api/conversations/[id]/draft" },
	} as Parameters<typeof PUT>[0];
}

describe("PUT /api/conversations/[id]/draft", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetConversation.mockResolvedValue({
			id: "conv-1",
			userId: "user-1",
			title: "Conversation",
			createdAt: 1,
			updatedAt: 2,
		} as Awaited<ReturnType<typeof getConversation>>);
		mockUpsert.mockResolvedValue(null);
		mockGetConfig.mockReturnValue({
			composerCommandRegistryEnabled: true,
		} as ReturnType<typeof getConfig>);
	});

	it("persists linked source draft state with text and selected attachments", async () => {
		const response = await PUT(
			makeEvent({
				draftText: "Use this source later",
				selectedAttachmentIds: ["attachment-1"],
				selectedLinkedSources: [
					{
						displayArtifactId: "display-1",
						promptArtifactId: "prompt-1",
						familyArtifactIds: ["display-1", "prompt-1"],
						name: "Report.pdf",
						type: "document",
					},
				],
				pendingSkill: {
					id: "variant-1",
					ownership: "user",
					skillKind: "skill_variant",
					displayName: "Daily workbook variant",
					baseSkillId: "system:spreadsheet-builder",
					baseSkillDisplayName: "Spreadsheet Builder",
					unavailable: true,
				},
			}),
		);

		expect(response.status).toBe(200);
		expect(mockUpsert).toHaveBeenCalledWith({
			userId: "user-1",
			conversationId: "conv-1",
			draftText: "Use this source later",
			selectedAttachmentIds: ["attachment-1"],
			selectedLinkedSources: [
				expect.objectContaining({
					displayArtifactId: "display-1",
					promptArtifactId: "prompt-1",
					type: "document",
				}),
			],
			pendingSkill: {
				id: "variant-1",
				ownership: "user",
				skillKind: "skill_variant",
				displayName: "Daily workbook variant",
				baseSkillId: "system:spreadsheet-builder",
				baseSkillDisplayName: "Spreadsheet Builder",
				unavailable: true,
			},
		});
	});

	it("rejects pending skill draft state when Composer Command Registry is disabled", async () => {
		mockGetConfig.mockReturnValue({
			composerCommandRegistryEnabled: false,
		} as ReturnType<typeof getConfig>);

		const response = await PUT(
			makeEvent({
				draftText: "Use this later",
				selectedAttachmentIds: [],
				selectedLinkedSources: [],
				pendingSkill: {
					id: "skill-1",
					ownership: "user",
					displayName: "Interview coach",
				},
			}),
		);
		const data = await response.json();

		expect(response.status).toBe(403);
		expect(data.code).toBe("composer_commands_disabled");
		expect(mockUpsert).not.toHaveBeenCalled();
	});

	it("rejects selected linked source draft state when Composer Command Registry is disabled", async () => {
		mockGetConfig.mockReturnValue({
			composerCommandRegistryEnabled: false,
		} as ReturnType<typeof getConfig>);

		const response = await PUT(
			makeEvent({
				draftText: "Use this later",
				selectedAttachmentIds: [],
				selectedLinkedSources: [
					{
						displayArtifactId: "display-1",
						promptArtifactId: "prompt-1",
						familyArtifactIds: ["display-1", "prompt-1"],
						name: "Report.pdf",
						type: "document",
					},
				],
				pendingSkill: null,
			}),
		);
		const data = await response.json();

		expect(response.status).toBe(403);
		expect(data.code).toBe("composer_commands_disabled");
		expect(mockUpsert).not.toHaveBeenCalled();
	});
});
