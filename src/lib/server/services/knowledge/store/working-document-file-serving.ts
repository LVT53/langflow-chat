import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	getChatFileByUser,
	readChatFileContentByUser,
} from "$lib/server/services/chat-files";
import {
	isGeneratedFileTypeAllowed,
	validateGeneratedOutputFile,
} from "$lib/server/services/file-production/output-validation";
import type { Artifact } from "$lib/types";
import { getPreviewContentType } from "$lib/utils/file-preview";
import {
	getArtifactForUser,
	getSourceArtifactIdForNormalizedArtifact,
} from "./core";

export type WorkingDocumentFileServingMode = "preview" | "download";

export interface WorkingDocumentFileServingSuccess {
	ok: true;
	body: Uint8Array;
	headers: Record<string, string>;
}

export interface WorkingDocumentFileServingError {
	ok: false;
	status: number;
	error: string;
}

export type WorkingDocumentFileServingResolution =
	| WorkingDocumentFileServingSuccess
	| WorkingDocumentFileServingError;

export async function resolveWorkingDocumentFileServing(params: {
	userId: string;
	artifactId: string;
	mode: WorkingDocumentFileServingMode;
}): Promise<WorkingDocumentFileServingResolution> {
	let artifact = await getArtifactForUser(params.userId, params.artifactId);
	if (!artifact) {
		return { ok: false, status: 404, error: "Artifact not found" };
	}
	const requestedArtifact = artifact;

	if (artifact.type === "normalized_document" && artifact.contentText) {
		const sourceArtifactId = await getSourceArtifactIdForNormalizedArtifact(
			params.userId,
			artifact.id,
		);
		if (sourceArtifactId) {
			const sourceArtifact = await getArtifactForUser(
				params.userId,
				sourceArtifactId,
			);
			if (sourceArtifact?.storagePath) {
				artifact = sourceArtifact;
			}
		}
	}

	const generatedSource = await resolveGeneratedOutputSource({
		userId: params.userId,
		artifact,
		mode: params.mode,
	});
	if (generatedSource) {
		return generatedSource;
	}

	return resolveStoredArtifact({
		userId: params.userId,
		requestedArtifactId: params.artifactId,
		artifact,
		filenameArtifact: params.mode === "download" ? requestedArtifact : artifact,
		mode: params.mode,
	});
}

async function resolveGeneratedOutputSource(params: {
	userId: string;
	artifact: Artifact;
	mode: WorkingDocumentFileServingMode;
}): Promise<WorkingDocumentFileServingResolution | null> {
	if (
		params.artifact.type !== "generated_output" ||
		params.artifact.storagePath
	) {
		return null;
	}

	const sourceChatFileId =
		typeof params.artifact.metadata?.sourceChatFileId === "string" &&
		params.artifact.metadata.sourceChatFileId.trim()
			? params.artifact.metadata.sourceChatFileId.trim()
			: null;
	if (!sourceChatFileId) {
		return null;
	}

	const chatFile = await getChatFileByUser(sourceChatFileId, params.userId);
	if (!chatFile) {
		return null;
	}

	if (!isGeneratedFileTypeAllowed(chatFile.filename, chatFile.mimeType)) {
		return {
			ok: false,
			status: 415,
			error: "Unsupported generated file type",
		};
	}

	const fileContent = await readChatFileContentByUser(
		sourceChatFileId,
		params.userId,
	);
	if (!fileContent) {
		return null;
	}

	const contentValidation = await validateGeneratedOutputFile({
		filename: chatFile.filename,
		mimeType: chatFile.mimeType,
		content: fileContent,
	});
	if (!contentValidation.ok) {
		return {
			ok: false,
			status: 415,
			error: "Invalid generated file content",
		};
	}

	const filename = params.artifact.name || chatFile.filename;
	const contentType =
		params.mode === "preview"
			? getPreviewContentType(chatFile.filename, chatFile.mimeType)
			: chatFile.mimeType || "application/octet-stream";

	return {
		ok: true,
		body: new Uint8Array(fileContent),
		headers: {
			"Content-Type": contentType,
			"Content-Length": fileContent.length.toString(),
			"Content-Disposition":
				params.mode === "preview"
					? `inline; filename="${encodeURIComponent(filename)}"`
					: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
			"Cache-Control":
				params.mode === "preview"
					? "private, max-age=3600"
					: "private, no-store",
		},
	};
}

async function resolveStoredArtifact(params: {
	userId: string;
	requestedArtifactId: string;
	artifact: Artifact;
	filenameArtifact: Artifact;
	mode: WorkingDocumentFileServingMode;
}): Promise<WorkingDocumentFileServingResolution> {
	const filenameArtifact =
		params.mode === "download" ? params.filenameArtifact : params.artifact;
	const safeName = filenameArtifact.name || "document";
	const downloadName =
		safeName.includes(".") || !filenameArtifact.extension
			? safeName
			: `${safeName}.${filenameArtifact.extension}`;

	if (params.artifact.contentText) {
		const textBuffer = Buffer.from(params.artifact.contentText, "utf-8");
		return {
			ok: true,
			body: textBuffer,
			headers: {
				"Content-Type": "text/plain; charset=utf-8",
				"Content-Length": textBuffer.length.toString(),
				"Content-Disposition":
					params.mode === "preview"
						? `inline; filename="${encodeURIComponent(safeName)}"`
						: `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
				"Cache-Control":
					params.mode === "preview"
						? "private, max-age=3600"
						: "private, no-store",
			},
		};
	}

	if (!params.artifact.storagePath) {
		return {
			ok: false,
			status: 404,
			error:
				params.mode === "preview"
					? "File not available for preview"
					: "File not available for download",
		};
	}

	if (
		params.artifact.storagePath.includes("..") ||
		params.artifact.storagePath.startsWith("/")
	) {
		console.error(
			params.mode === "preview"
				? "[PREVIEW] Path traversal attempt blocked:"
				: "[DOWNLOAD] Path traversal attempt blocked:",
			{
				userId: params.userId,
				artifactId: params.requestedArtifactId,
				storagePath: params.artifact.storagePath,
			},
		);
		return { ok: false, status: 400, error: "Invalid path" };
	}

	try {
		const filePath = join(process.cwd(), params.artifact.storagePath);
		const fileBuffer = await readFile(filePath);
		const previewName =
			safeName.includes(".") || !params.artifact.extension
				? safeName
				: `${safeName}.${params.artifact.extension}`;

		return {
			ok: true,
			body: fileBuffer,
			headers: {
				"Content-Type":
					params.mode === "preview"
						? getPreviewContentType(previewName, params.artifact.mimeType)
						: params.artifact.mimeType || "application/octet-stream",
				"Content-Length": fileBuffer.length.toString(),
				"Content-Disposition":
					params.mode === "preview"
						? `inline; filename="${encodeURIComponent(safeName)}"`
						: `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
				"Cache-Control":
					params.mode === "preview"
						? "private, max-age=3600"
						: "private, no-store",
			},
		};
	} catch (error: unknown) {
		const errorCode =
			typeof error === "object" && error !== null && "code" in error
				? error.code
				: undefined;
		console.error(
			params.mode === "preview"
				? "[PREVIEW] Failed to read file:"
				: "[DOWNLOAD] Failed to read file:",
			{
				userId: params.userId,
				artifactId: params.requestedArtifactId,
				storagePath: params.artifact.storagePath,
				error: error instanceof Error ? error.message : error,
			},
		);

		if (errorCode === "ENOENT") {
			return { ok: false, status: 404, error: "File not found on disk" };
		}

		return {
			ok: false,
			status: 500,
			error: "Failed to read file",
		};
	}
}
