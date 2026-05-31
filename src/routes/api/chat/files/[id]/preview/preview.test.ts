import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/auth/hooks", () => ({
	requireAuth: vi.fn(),
}));

vi.mock("$lib/server/services/chat-files", () => ({
	getChatFileByConversationOwner: vi.fn(),
	getChatFileByUser: vi.fn(),
	readChatFileContentByConversationOwner: vi.fn(),
	readChatFileContentByUser: vi.fn(),
}));

import { requireAuth } from "$lib/server/auth/hooks";
import {
	getChatFileByConversationOwner,
	getChatFileByUser,
	readChatFileContentByConversationOwner,
	readChatFileContentByUser,
} from "$lib/server/services/chat-files";
import { GET } from "./+server";

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockGetChatFileByUser = getChatFileByUser as ReturnType<typeof vi.fn>;
const mockGetChatFileByConversationOwner =
	getChatFileByConversationOwner as ReturnType<typeof vi.fn>;
const mockReadChatFileContentByUser = readChatFileContentByUser as ReturnType<
	typeof vi.fn
>;
const mockReadChatFileContentByConversationOwner =
	readChatFileContentByConversationOwner as ReturnType<typeof vi.fn>;

function makeEvent(
	fileId = "file-1",
	user = { id: "user-1", email: "test@example.com" },
) {
	return {
		request: new Request(`http://localhost/api/chat/files/${fileId}/preview`),
		locals: { user },
		params: { id: fileId },
		url: new URL(`http://localhost/api/chat/files/${fileId}/preview`),
		route: { id: "/api/chat/files/[id]/preview" },
	} as Parameters<typeof GET>[0];
}

describe("GET /api/chat/files/[id]/preview", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue(undefined);
	});

	it("returns 401 when unauthenticated", async () => {
		mockRequireAuth.mockImplementation(() => {
			throw new Error("Unauthorized");
		});

		const response = await GET(makeEvent());
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body.error).toBe("Unauthorized");
		expect(mockGetChatFileByUser).not.toHaveBeenCalled();
	});

	it("returns 404 when the generated file cannot be previewed", async () => {
		mockGetChatFileByUser.mockResolvedValue(null);
		mockGetChatFileByConversationOwner.mockResolvedValue(null);

		const response = await GET(makeEvent());
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body.error).toBe("File not found");
		expect(mockGetChatFileByUser).toHaveBeenCalledWith("file-1", "user-1");
		expect(mockGetChatFileByConversationOwner).toHaveBeenCalledWith(
			"file-1",
			"user-1",
		);
	});

	it("quarantines unassigned generated files from direct preview access", async () => {
		mockGetChatFileByUser.mockResolvedValue({
			id: "file-1",
			conversationId: "conv-1",
			assistantMessageId: null,
			userId: "user-1",
			filename: "staged.txt",
			mimeType: "text/plain",
			sizeBytes: 11,
			storagePath: "conv-1/file-1.txt",
			createdAt: Date.now(),
		});

		const response = await GET(makeEvent());
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body.error).toBe("File not found");
		expect(mockReadChatFileContentByUser).not.toHaveBeenCalled();
		expect(mockReadChatFileContentByConversationOwner).not.toHaveBeenCalled();
	});

	it("returns inline preview content for a user-owned generated file", async () => {
		mockGetChatFileByUser.mockResolvedValue({
			id: "file-1",
			conversationId: "conv-1",
			userId: "user-1",
			filename: "notes.txt",
			mimeType: "text/plain",
			sizeBytes: 11,
			storagePath: "conv-1/file-1.txt",
			createdAt: Date.now(),
		});
		mockReadChatFileContentByUser.mockResolvedValue(Buffer.from("hello world"));

		const response = await GET(makeEvent());

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/plain");
		expect(response.headers.get("Content-Length")).toBe("11");
		expect(response.headers.get("Content-Disposition")).toContain(
			'inline; filename="notes.txt"',
		);
		expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");

		const body = await response.arrayBuffer();
		expect(Buffer.from(body).toString()).toBe("hello world");
	});

	it("previews legacy generated shell scripts stored with generic MIME", async () => {
		mockGetChatFileByUser.mockResolvedValue({
			id: "file-1",
			conversationId: "conv-1",
			userId: "user-1",
			filename: "install.sh",
			mimeType: "application/octet-stream",
			sizeBytes: 31,
			storagePath: "conv-1/file-1.sh",
			createdAt: Date.now(),
		});
		mockReadChatFileContentByUser.mockResolvedValue(
			Buffer.from("#!/usr/bin/env bash\necho ok\n"),
		);

		const response = await GET(makeEvent());

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("application/x-sh");
		expect(response.headers.get("Content-Disposition")).toContain(
			'inline; filename="install.sh"',
		);
		expect(await response.text()).toBe("#!/usr/bin/env bash\necho ok\n");
	});

	it("returns 500 when the generated file content cannot be read", async () => {
		mockGetChatFileByUser.mockResolvedValue({
			id: "file-1",
			conversationId: "conv-1",
			userId: "user-1",
			filename: "notes.txt",
			mimeType: null,
			sizeBytes: 11,
			storagePath: "conv-1/file-1.txt",
			createdAt: Date.now(),
		});
		mockReadChatFileContentByUser.mockResolvedValue(null);
		mockReadChatFileContentByConversationOwner.mockResolvedValue(null);

		const response = await GET(makeEvent());
		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body.error).toBe("Failed to read file content");
	});

	it("falls back to conversation ownership lookup when userId scoped lookup misses", async () => {
		mockGetChatFileByUser.mockResolvedValue(null);
		mockGetChatFileByConversationOwner.mockResolvedValue({
			id: "file-1",
			conversationId: "conv-1",
			userId: "legacy-mismatch",
			filename: "legacy.txt",
			mimeType: "text/plain",
			sizeBytes: 5,
			storagePath: "conv-1/file-1.txt",
			createdAt: Date.now(),
		});
		mockReadChatFileContentByUser.mockResolvedValue(null);
		mockReadChatFileContentByConversationOwner.mockResolvedValue(
			Buffer.from("hello"),
		);

		const response = await GET(makeEvent());

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("hello");
	});

	it("infers ODT preview content type from the filename", async () => {
		mockGetChatFileByUser.mockResolvedValue({
			id: "file-1",
			conversationId: "conv-1",
			userId: "user-1",
			filename: "draft.odt",
			mimeType: null,
			sizeBytes: 9,
			storagePath: "conv-1/file-1.odt",
			createdAt: Date.now(),
		});
		mockReadChatFileContentByUser.mockResolvedValue(Buffer.from("odt bytes"));

		const response = await GET(makeEvent());

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"application/vnd.oasis.opendocument.text",
		);
	});

	it("rejects mismatched generated-file MIME type and extension before preview", async () => {
		mockGetChatFileByUser.mockResolvedValue({
			id: "file-1",
			conversationId: "conv-1",
			userId: "user-1",
			filename: "report.pdf",
			mimeType: "text/plain",
			sizeBytes: 11,
			storagePath: "conv-1/file-1.pdf",
			createdAt: Date.now(),
		});
		mockReadChatFileContentByUser.mockResolvedValue(Buffer.from("hello world"));

		const response = await GET(makeEvent());
		const body = await response.json();

		expect(response.status).toBe(415);
		expect(body.error).toBe("Unsupported generated file type");
	});

	it("rejects invalid XLSX bytes before preview", async () => {
		mockGetChatFileByUser.mockResolvedValue({
			id: "file-1",
			conversationId: "conv-1",
			userId: "user-1",
			filename: "workbook.xlsx",
			mimeType:
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			sizeBytes: 16,
			storagePath: "conv-1/file-1.xlsx",
			createdAt: Date.now(),
		});
		mockReadChatFileContentByUser.mockResolvedValue(
			Buffer.from("not an ooxml zip"),
		);

		const response = await GET(makeEvent());
		const body = await response.json();

		expect(response.status).toBe(415);
		expect(body.error).toBe("Invalid generated file content");
	});

	it("rejects binary content hidden behind a generic text/code extension", async () => {
		mockGetChatFileByUser.mockResolvedValue({
			id: "file-1",
			conversationId: "conv-1",
			userId: "user-1",
			filename: "install.sh",
			mimeType: "application/octet-stream",
			sizeBytes: 4,
			storagePath: "conv-1/file-1.sh",
			createdAt: Date.now(),
		});
		mockReadChatFileContentByUser.mockResolvedValue(
			Buffer.from([0x00, 0x01, 0x02, 0x03]),
		);

		const response = await GET(makeEvent());
		const body = await response.json();

		expect(response.status).toBe(415);
		expect(body.error).toBe("Invalid generated file content");
	});

	it("serves generated HTML previews with restrictive CSP and sandbox headers", async () => {
		mockGetChatFileByUser.mockResolvedValue({
			id: "file-1",
			conversationId: "conv-1",
			userId: "user-1",
			filename: "report.html",
			mimeType: "text/html",
			sizeBytes: 31,
			storagePath: "conv-1/file-1.html",
			createdAt: Date.now(),
		});
		mockReadChatFileContentByUser.mockResolvedValue(
			Buffer.from("<!doctype html><h1>Report</h1>"),
		);

		const response = await GET(makeEvent());

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"text/html; charset=utf-8",
		);
		expect(response.headers.get("Content-Security-Policy")).toBe(
			"default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
		);
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(response.headers.get("Content-Disposition")).toContain(
			'inline; filename="report.html"',
		);
	});
});
