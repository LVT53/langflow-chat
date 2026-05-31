import { json } from "@sveltejs/kit";
import { requireAuth } from "$lib/server/auth/hooks";
import {
	getChatFileByConversationOwner,
	getChatFileByUser,
	readChatFileContentByConversationOwner,
	readChatFileContentByUser,
} from "$lib/server/services/chat-files";
import {
	isGeneratedFileTypeAllowed,
	validateGeneratedOutputFile,
} from "$lib/server/services/file-production/output-validation";
import { getPreviewContentType } from "$lib/utils/file-preview";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
	try {
		requireAuth(event);
	} catch {
		return json({ error: "Unauthorized" }, { status: 401 });
	}

	const user = event.locals.user;
	if (!user) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}
	const fileId = event.params.id;
	const chatFile =
		(await getChatFileByUser(fileId, user.id)) ??
		(await getChatFileByConversationOwner(fileId, user.id));
	if (!chatFile) {
		return json({ error: "File not found" }, { status: 404 });
	}
	if (chatFile.assistantMessageId === null) {
		return json({ error: "File not found" }, { status: 404 });
	}

	if (!isGeneratedFileTypeAllowed(chatFile.filename, chatFile.mimeType)) {
		return json({ error: "Unsupported generated file type" }, { status: 415 });
	}

	const fileContent =
		(await readChatFileContentByUser(fileId, user.id)) ??
		(await readChatFileContentByConversationOwner(fileId, user.id));
	if (!fileContent) {
		return json({ error: "Failed to read file content" }, { status: 500 });
	}
	const contentValidation = await validateGeneratedOutputFile({
		filename: chatFile.filename,
		mimeType: chatFile.mimeType,
		content: fileContent,
	});
	if (!contentValidation.ok) {
		return json({ error: "Invalid generated file content" }, { status: 415 });
	}

	return new Response(new Uint8Array(fileContent), {
		status: 200,
		headers: {
			"Content-Type": getPreviewContentType(
				chatFile.filename,
				chatFile.mimeType,
			),
			"Content-Length": fileContent.length.toString(),
			"Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(chatFile.filename)}`,
			"Cache-Control": "private, no-store",
		},
	});
};
