import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetArtifactForUser = vi.fn();
const mockGetSourceArtifactId = vi.fn();
const mockGetChatFileByUser = vi.fn();
const mockReadChatFileContentByUser = vi.fn();

vi.mock("./core", () => ({
	getArtifactForUser: (...args: unknown[]) => mockGetArtifactForUser(...args),
	getSourceArtifactIdForNormalizedArtifact: (...args: unknown[]) =>
		mockGetSourceArtifactId(...args),
}));

vi.mock("$lib/server/services/chat-files", () => ({
	getChatFileByUser: (...args: unknown[]) => mockGetChatFileByUser(...args),
	readChatFileContentByUser: (...args: unknown[]) =>
		mockReadChatFileContentByUser(...args),
}));

import { resolveWorkingDocumentFileServing } from "./working-document-file-serving";

async function writeKnowledgeFile(
	storagePath: string,
	contents: Buffer | string,
) {
	const absolutePath = join(process.cwd(), storagePath);
	await mkdir(dirname(absolutePath), { recursive: true });
	await writeFile(absolutePath, contents);
}

async function buildMinimalXlsxBuffer(): Promise<Buffer> {
	const JSZip = (await import("jszip")).default;
	const zip = new JSZip();
	zip.file("[Content_Types].xml", "<Types></Types>");
	zip.file("_rels/.rels", "<Relationships></Relationships>");
	zip.file("xl/workbook.xml", "<workbook></workbook>");
	zip.file("xl/_rels/workbook.xml.rels", "<Relationships></Relationships>");
	zip.file("xl/worksheets/sheet1.xml", "<worksheet></worksheet>");
	return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("resolveWorkingDocumentFileServing", () => {
	const userId = "resolver-user-123";

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetSourceArtifactId.mockResolvedValue(null);
		mockGetChatFileByUser.mockResolvedValue(null);
		mockReadChatFileContentByUser.mockResolvedValue(null);
	});

	afterEach(async () => {
		await rm(join(process.cwd(), "data", "knowledge", userId), {
			recursive: true,
			force: true,
		});
	});

	it("resolves a normalized document to its source binary for preview", async () => {
		const pdfBuffer = Buffer.from("PDF binary content");
		await writeKnowledgeFile(
			"data/knowledge/resolver-user-123/source.pdf",
			pdfBuffer,
		);

		mockGetArtifactForUser.mockImplementation(
			async (_userId: string, artifactId: string) => {
				if (artifactId === "normalized-123") {
					return {
						id: "normalized-123",
						name: "document.pdf",
						storagePath: null,
						contentText: "Extracted text content",
						mimeType: "text/plain",
						extension: "pdf",
						type: "normalized_document",
					};
				}

				if (artifactId === "source-123") {
					return {
						id: "source-123",
						name: "document.pdf",
						storagePath: "data/knowledge/resolver-user-123/source.pdf",
						contentText: null,
						mimeType: "application/pdf",
						extension: "pdf",
						type: "source_document",
					};
				}

				return null;
			},
		);
		mockGetSourceArtifactId.mockResolvedValue("source-123");

		const result = await resolveWorkingDocumentFileServing({
			userId,
			artifactId: "normalized-123",
			mode: "preview",
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected successful resolution");
		expect(result.headers["Content-Type"]).toBe("application/pdf");
		expect(result.headers["Content-Disposition"]).toContain("document.pdf");
		expect(Buffer.from(result.body).toString()).toBe("PDF binary content");
	});

	it("resolves a generated output to its source chat file for preview", async () => {
		const xlsxBuffer = await buildMinimalXlsxBuffer();
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
		mockReadChatFileContentByUser.mockResolvedValue(xlsxBuffer);

		const result = await resolveWorkingDocumentFileServing({
			userId,
			artifactId: "generated-123",
			mode: "preview",
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected successful resolution");
		expect(result.headers["Content-Type"]).toBe(
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		);
		expect(result.headers["Content-Disposition"]).toContain(
			"generated_report.xlsx",
		);
		expect(mockGetChatFileByUser).toHaveBeenCalledWith(
			"chatfile-456",
			"resolver-user-123",
		);
		expect(Buffer.from(result.body)).toEqual(xlsxBuffer);
	});

	it("keeps the requested normalized document filename when downloading source bytes", async () => {
		const pdfBuffer = Buffer.from("PDF binary content");
		await writeKnowledgeFile(
			"data/knowledge/resolver-user-123/source.pdf",
			pdfBuffer,
		);
		mockGetArtifactForUser.mockImplementation(
			async (_userId: string, artifactId: string) => {
				if (artifactId === "normalized-123") {
					return {
						id: "normalized-123",
						name: "requested-name",
						storagePath: null,
						contentText: "Extracted text content",
						mimeType: "text/plain",
						extension: "pdf",
						type: "normalized_document",
					};
				}

				if (artifactId === "source-123") {
					return {
						id: "source-123",
						name: "source-name.pdf",
						storagePath: "data/knowledge/resolver-user-123/source.pdf",
						contentText: null,
						mimeType: "application/pdf",
						extension: "pdf",
						type: "source_document",
					};
				}

				return null;
			},
		);
		mockGetSourceArtifactId.mockResolvedValue("source-123");

		const result = await resolveWorkingDocumentFileServing({
			userId,
			artifactId: "normalized-123",
			mode: "download",
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected successful resolution");
		expect(result.headers["Content-Disposition"]).toBe(
			"attachment; filename*=UTF-8''requested-name.pdf",
		);
		expect(Buffer.from(result.body).toString()).toBe("PDF binary content");
	});

	it("resolves a text-only Skill Note for download", async () => {
		const contentText = "Private note content";
		mockGetArtifactForUser.mockResolvedValue({
			id: "skill-note-123",
			name: "Skill Note",
			storagePath: null,
			contentText,
			mimeType: "text/plain",
			extension: "md",
			type: "skill_note",
			metadata: null,
		});

		const result = await resolveWorkingDocumentFileServing({
			userId,
			artifactId: "skill-note-123",
			mode: "download",
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected successful resolution");
		expect(result.headers["Content-Type"]).toBe("text/plain; charset=utf-8");
		expect(result.headers["Content-Disposition"]).toBe(
			"attachment; filename*=UTF-8''Skill%20Note.md",
		);
		expect(result.headers["Cache-Control"]).toBe("private, no-store");
		expect(Buffer.from(result.body).toString()).toBe(contentText);
	});
});
