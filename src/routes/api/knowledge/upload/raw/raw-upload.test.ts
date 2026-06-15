import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	createKnowledgeUploadRouteHarness,
	makeKnowledgeUploadEvent,
	makeKnowledgeUploadHeaders,
	mockCompleteKnowledgeUploadFromStoredFile,
	mockIsKnowledgeUploadConversationError,
	mockValidateKnowledgeUploadConversation,
} from "../test-helpers";
import { POST } from "./+server";

const harness = createKnowledgeUploadRouteHarness({ userId: "raw-user" });

describe("POST /api/knowledge/upload/raw", () => {
	it("streams the raw file body to temporary storage and persists a source artifact", async () => {
		const bytes = Buffer.from("hello");
		const response = await POST(
			makeKnowledgeUploadEvent({
				body: bytes,
				headers: makeKnowledgeUploadHeaders({
					"x-alfyai-upload-trace-id": "upload-rawtest",
					"x-alfyai-upload-name": encodeURIComponent("scan.pdf"),
					"x-alfyai-upload-size": String(bytes.length),
					"x-alfyai-conversation-id": "conv-1",
				}),
				requestUrl: "http://localhost/api/knowledge/upload/raw",
				routeId: "/api/knowledge/upload/raw",
				userId: "raw-user",
			}),
		);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.artifact.id).toBe("artifact-1");
		expect(mockCompleteKnowledgeUploadFromStoredFile).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "raw-user",
				conversationId: "conv-1",
				fileName: "scan.pdf",
				mimeType: "application/pdf",
				sizeBytes: bytes.length,
				binaryHash: createHash("sha256").update(bytes).digest("hex"),
				tempPathAbsolute: expect.stringContaining(".incoming"),
				traceId: "upload-rawtest",
				logPrefix: "Raw",
			}),
		);
		expect(harness.consoleInfoSpy).toHaveBeenCalledWith(
			"[KNOWLEDGE] Raw upload receive completed",
			expect.objectContaining({
				traceId: "upload-rawtest",
				receivedBytes: bytes.length,
			}),
		);
	});

	it("rejects raw uploads when the declared browser size does not match received bytes", async () => {
		const response = await POST(
			makeKnowledgeUploadEvent({
				body: Buffer.from("hello"),
				headers: makeKnowledgeUploadHeaders({
					"x-alfyai-upload-trace-id": "upload-mismatch",
					"x-alfyai-upload-name": "scan.pdf",
					"x-alfyai-upload-size": "6",
				}),
				requestUrl: "http://localhost/api/knowledge/upload/raw",
				routeId: "/api/knowledge/upload/raw",
				userId: "raw-user",
			}),
		);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.code).toBe("upload_size_mismatch");
		expect(mockCompleteKnowledgeUploadFromStoredFile).not.toHaveBeenCalled();
	});

	it("rejects an invalid conversation before writing a raw temporary file", async () => {
		const error = new Error("Conversation not found or access denied");
		mockValidateKnowledgeUploadConversation.mockRejectedValueOnce(error);
		mockIsKnowledgeUploadConversationError.mockReturnValueOnce(true);

		const response = await POST(
			makeKnowledgeUploadEvent({
				body: Buffer.from("hello"),
				headers: makeKnowledgeUploadHeaders({
					"x-alfyai-upload-trace-id": "upload-missing-conv-early",
					"x-alfyai-conversation-id": "missing-conv",
					"x-alfyai-upload-name": "scan.pdf",
					"x-alfyai-upload-size": "5",
				}),
				requestUrl: "http://localhost/api/knowledge/upload/raw",
				routeId: "/api/knowledge/upload/raw",
				userId: "raw-user",
			}),
		);
		const data = await response.json();
		const incomingDir = await stat(
			join(process.cwd(), "data", "knowledge", "raw-user", ".incoming"),
		).catch(() => null);

		expect(response.status).toBe(400);
		expect(data).toMatchObject({
			error: "Conversation not found or access denied",
			code: "conversation_not_found",
			traceId: "upload-missing-conv-early",
		});
		expect(incomingDir).toBeNull();
		expect(mockCompleteKnowledgeUploadFromStoredFile).not.toHaveBeenCalled();
	});

	it("translates intake conversation validation failures without changing the public raw-upload response", async () => {
		const error = new Error("Conversation not found or access denied");
		mockCompleteKnowledgeUploadFromStoredFile.mockRejectedValueOnce(error);
		mockIsKnowledgeUploadConversationError.mockReturnValueOnce(true);

		const response = await POST(
			makeKnowledgeUploadEvent({
				body: Buffer.from("hello"),
				headers: makeKnowledgeUploadHeaders({
					"x-alfyai-upload-trace-id": "upload-missing-conv",
					"x-alfyai-conversation-id": "missing-conv",
					"x-alfyai-upload-name": "scan.pdf",
					"x-alfyai-upload-size": "5",
				}),
				requestUrl: "http://localhost/api/knowledge/upload/raw",
				routeId: "/api/knowledge/upload/raw",
				userId: "raw-user",
			}),
		);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data).toMatchObject({
			error: "Conversation not found or access denied",
			code: "conversation_not_found",
			traceId: "upload-missing-conv",
		});
	});
});
