import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, vi } from "vitest";

vi.mock("$lib/server/auth/hooks", () => ({
	requireAuth: vi.fn(),
}));

vi.mock("$lib/server/services/attachment-trace", () => ({
	createAttachmentTraceId: vi.fn(() => "trace-upload"),
	logAttachmentTrace: vi.fn(),
}));

vi.mock("$lib/server/services/knowledge/upload-intake", () => ({
	completeKnowledgeUploadFromStoredFile: vi.fn(),
	isKnowledgeUploadConversationError: vi.fn(() => false),
	resolveKnowledgeUploadLimits: vi.fn(() => ({
		maxFileUploadSize: 100 * 1024 * 1024,
		adapterBodySizeLimit: 100 * 1024 * 1024,
		multipartBodyLimit: 100 * 1024 * 1024,
		storedFileLimit: 100 * 1024 * 1024,
		chunkFileLimit: 100 * 1024 * 1024,
		chunkBodyLimit: 1024 * 1024,
		multipartOverheadAllowance: 1024 * 1024,
	})),
	validateKnowledgeUploadConversation: vi.fn(
		async (params: { conversationId?: string | null }) =>
			params.conversationId?.trim() || null,
	),
}));

import { requireAuth } from "$lib/server/auth/hooks";
import {
	completeKnowledgeUploadFromStoredFile,
	isKnowledgeUploadConversationError,
	validateKnowledgeUploadConversation,
} from "$lib/server/services/knowledge/upload-intake";

const defaultCompleteKnowledgeUploadResponse = {
	artifact: {
		id: "artifact-1",
		type: "source_document",
		retrievalClass: "durable",
		name: "scan.pdf",
		mimeType: "application/pdf",
		sizeBytes: 5,
		conversationId: "conv-1",
		summary: "scan.pdf",
		createdAt: Date.now(),
		updatedAt: Date.now(),
	},
	normalizedArtifact: null,
	reusedExistingArtifact: false,
	honcho: { uploaded: false, mode: "none" },
	promptReady: true,
} as const;

const mockRequireAuth = vi.mocked(requireAuth);
export const mockCompleteKnowledgeUploadFromStoredFile = vi.mocked(
	completeKnowledgeUploadFromStoredFile,
);
export const mockIsKnowledgeUploadConversationError = vi.mocked(
	isKnowledgeUploadConversationError,
);
export const mockValidateKnowledgeUploadConversation = vi.mocked(
	validateKnowledgeUploadConversation,
);

export type KnowledgeUploadRouteEvent = {
	request: Request;
	locals: { user: { id: string; email: string } };
	params: Record<string, never>;
	url: URL;
	route: { id: string };
};

export function makeKnowledgeUploadHeaders(
	overrides: Record<string, string> = {},
) {
	return {
		"content-type": "application/pdf",
		"x-alfyai-upload-name": "scan.pdf",
		"x-alfyai-upload-size": "10",
		"x-alfyai-upload-trace-id": "upload-test",
		"x-alfyai-conversation-id": "conv-1",
		...overrides,
	};
}

export function makeKnowledgeUploadEvent(params: {
	body: BodyInit;
	headers: Record<string, string>;
	requestUrl: string;
	routeId: string;
	userId: string;
	email?: string;
}): KnowledgeUploadRouteEvent {
	return {
		request: new Request(params.requestUrl, {
			method: "POST",
			headers: params.headers,
			body: params.body,
		}),
		locals: {
			user: {
				id: params.userId,
				email: params.email ?? "test@example.com",
			},
		},
		params: {},
		url: new URL(params.requestUrl),
		route: { id: params.routeId },
	} as unknown as KnowledgeUploadRouteEvent;
}

export function makeKnowledgeUploadRequestEvent(params: {
	headers: Record<string, string>;
	requestUrl: string;
	routeId: string;
	userId: string;
	email?: string;
}): KnowledgeUploadRouteEvent {
	return {
		request: {
			headers: new Headers(params.headers),
			arrayBuffer: vi.fn(),
		},
		locals: {
			user: {
				id: params.userId,
				email: params.email ?? "test@example.com",
			},
		},
		params: {},
		url: new URL(params.requestUrl),
		route: { id: params.routeId },
	} as unknown as KnowledgeUploadRouteEvent;
}

export function createKnowledgeUploadRouteHarness(params: {
	userId: string;
	incomingCleanupUserId?: string;
}) {
	const state = {
		consoleInfoSpy: null as ReturnType<typeof vi.spyOn> | null,
		consoleWarnSpy: null as ReturnType<typeof vi.spyOn> | null,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		state.consoleInfoSpy = vi
			.spyOn(console, "info")
			.mockImplementation(() => undefined);
		state.consoleWarnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => undefined);
		mockRequireAuth.mockReturnValue(undefined);
		mockIsKnowledgeUploadConversationError.mockReturnValue(false);
		mockValidateKnowledgeUploadConversation.mockImplementation(
			async (candidate: { conversationId?: string | null }) =>
				candidate.conversationId?.trim() || null,
		);
		mockCompleteKnowledgeUploadFromStoredFile.mockResolvedValue(
			defaultCompleteKnowledgeUploadResponse,
		);
	});

	afterEach(async () => {
		state.consoleInfoSpy?.mockRestore();
		state.consoleWarnSpy?.mockRestore();
		state.consoleInfoSpy = null;
		state.consoleWarnSpy = null;
		await rm(
			join(
				process.cwd(),
				"data",
				"knowledge",
				params.incomingCleanupUserId ?? params.userId,
				".incoming",
			),
			{
				force: true,
				recursive: true,
			},
		);
	});

	return state;
}
