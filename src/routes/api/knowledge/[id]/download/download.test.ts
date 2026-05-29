import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireAuth = vi.fn();
const mockGetArtifactForUser = vi.fn();
const mockGetSourceArtifactId = vi.fn();
const mockGetChatFileByUser = vi.fn();
const mockReadChatFileContentByUser = vi.fn();

vi.mock("$lib/server/auth/hooks", () => ({
	requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock("$lib/server/services/knowledge/store/core", () => ({
	getArtifactForUser: (...args: unknown[]) => mockGetArtifactForUser(...args),
	getSourceArtifactIdForNormalizedArtifact: (...args: unknown[]) =>
		mockGetSourceArtifactId(...args),
}));

vi.mock("$lib/server/services/chat-files", () => ({
	getChatFileByUser: (...args: unknown[]) => mockGetChatFileByUser(...args),
	readChatFileContentByUser: (...args: unknown[]) =>
		mockReadChatFileContentByUser(...args),
}));

import { GET } from "./+server";

type DownloadRouteEvent = Parameters<typeof GET>[0];

describe("GET /api/knowledge/[id]/download", () => {
	const mockUser = { id: "user-123", email: "test@example.com" };

	function makeDownloadEvent(artifactId: string): DownloadRouteEvent {
		return {
			locals: { user: mockUser },
			params: { id: artifactId },
		} as unknown as DownloadRouteEvent;
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockImplementation(() => {});
		mockGetSourceArtifactId.mockResolvedValue(null);
		mockGetChatFileByUser.mockResolvedValue(null);
		mockReadChatFileContentByUser.mockResolvedValue(null);
	});

	it("rejects invalid generated_output XLSX source chat files before download", async () => {
		mockGetArtifactForUser.mockResolvedValue({
			id: "generated-123",
			name: "generated_report.xlsx",
			storagePath: null,
			contentText: "Some generated text summary",
			mimeType: "text/plain",
			extension: "xlsx",
			type: "generated_output",
			metadata: { sourceChatFileId: "chatfile-456" },
		});
		mockGetChatFileByUser.mockResolvedValue({
			id: "chatfile-456",
			filename: "report.xlsx",
			mimeType:
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		});
		mockReadChatFileContentByUser.mockResolvedValue(
			Buffer.from("not an ooxml zip"),
		);

		const response = await GET(makeDownloadEvent("generated-123"));

		expect(response.status).toBe(415);
		const body = await response.json();
		expect(body.error).toBe("Invalid generated file content");
	});
});
