import {
	getProjectReferenceContext,
	type ProjectReferenceContext,
} from "$lib/server/services/task-state";
import { db } from "$lib/server/db";
import { messages } from "$lib/server/db/schema";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { clipNullableText, normalizeWhitespace } from "$lib/server/utils/text";
import type { ToolEvidenceCandidate } from "$lib/types";

const DEFAULT_MAX_SIBLINGS = 5;
const HARD_MAX_SIBLINGS = 5;
const DEFAULT_MAX_MESSAGES = 6;
const HARD_MAX_MESSAGES = 10;
const MESSAGE_CONTENT_MAX = 1_200;

export type ProjectContextMode = "summary" | "detail";

export type ProjectContextSiblingSummary = {
	conversationId: string;
	title: string;
	objective: string | null;
	summary: string | null;
};

export type ProjectContextDetailMessage = {
	role: "user" | "assistant";
	content: string;
	createdAt: number;
};

export type ProjectContextSelectedSiblingDetail = ProjectContextSiblingSummary & {
	messages: ProjectContextDetailMessage[];
	omittedMessageCount: number;
};

export type ProjectContextResult = {
	success: true;
	mode: ProjectContextMode;
	hasProjectContext: boolean;
	source: ProjectReferenceContext["source"] | "none";
	project: {
		id: string;
		name: string;
		authority: ProjectReferenceContext["source"];
	} | null;
	siblings: ProjectContextSiblingSummary[];
	omittedSiblingCount: number;
	selectedSibling?: ProjectContextSelectedSiblingDetail | null;
	evidenceCandidates: ToolEvidenceCandidate[];
	audit: {
		conversationId: string;
		scope: "conversation";
		requestedMaxSiblings: number | null;
		appliedMaxSiblings: number;
		siblingConversationId?: string | null;
		requestedMaxMessages?: number | null;
		appliedMaxMessages?: number;
		includeEvidenceCandidates: boolean;
		noProjectReason?: "no_project_context";
	};
};

export type GetProjectContextParams = {
	userId: string;
	conversationId: string;
	mode?: string | null;
	query?: string | null;
	maxSiblings?: number | null;
	siblingConversationId?: string | null;
	maxMessages?: number | null;
	includeEvidenceCandidates?: boolean;
};

function normalizeMaxSiblings(value: number | null | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return DEFAULT_MAX_SIBLINGS;
	}
	return Math.max(1, Math.min(HARD_MAX_SIBLINGS, Math.floor(value)));
}

function normalizeMaxMessages(value: number | null | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return DEFAULT_MAX_MESSAGES;
	}
	return Math.max(1, Math.min(HARD_MAX_MESSAGES, Math.floor(value)));
}

function toTimestampMs(value: Date | number | null | undefined): number {
	if (value instanceof Date) return value.getTime();
	if (typeof value === "number") return value;
	return 0;
}

function clipMessageContent(value: string): string {
	return clipNullableText(normalizeWhitespace(value), MESSAGE_CONTENT_MAX) ?? "";
}

function buildEvidenceCandidates(
	siblings: ProjectContextSiblingSummary[],
): ToolEvidenceCandidate[] {
	return siblings
		.filter((sibling) => sibling.summary?.trim())
		.map((sibling) => ({
			id: `conversation-summary:${sibling.conversationId}`,
			title: sibling.title,
			snippet: sibling.summary,
			sourceType: "memory",
		}));
}

function buildDetailEvidenceCandidate(
	sibling: ProjectContextSelectedSiblingDetail,
): ToolEvidenceCandidate {
	const snippetParts = [
		sibling.summary,
		...sibling.messages.map((message) => `${message.role}: ${message.content}`),
	].filter((value): value is string => Boolean(value?.trim()));
	return {
		id: `project-context-detail:${sibling.conversationId}`,
		title: sibling.title,
		snippet: clipNullableText(snippetParts.join(" "), 700),
		sourceType: "memory",
	};
}

async function listRecentDialogueMessages(params: {
	conversationId: string;
	maxMessages: number;
}): Promise<{
	messages: ProjectContextDetailMessage[];
	omittedMessageCount: number;
}> {
	const dialogueWhere = and(
		eq(messages.conversationId, params.conversationId),
		inArray(messages.role, ["user", "assistant"]),
	);

	const [countRows, rows] = await Promise.all([
		db.select({ messageCount: count() }).from(messages).where(dialogueWhere),
		db
			.select({
				role: messages.role,
				content: messages.content,
				createdAt: messages.createdAt,
			})
			.from(messages)
			.where(dialogueWhere)
			.orderBy(desc(messages.createdAt))
			.limit(params.maxMessages),
	]);
	const messageCount = countRows[0]?.messageCount ?? rows.length;
	const selected = rows
		.map((row) => ({
			role: row.role as "user" | "assistant",
			content: clipMessageContent(row.content),
			createdAt: toTimestampMs(row.createdAt),
		}))
		.reverse();
	return {
		messages: selected,
		omittedMessageCount: Math.max(0, messageCount - selected.length),
	};
}

async function buildDetailResult(params: {
	reference: ProjectReferenceContext;
	conversationId: string;
	siblingConversationId: string | null | undefined;
	requestedMaxSiblings: number | null;
	appliedMaxSiblings: number;
	requestedMaxMessages: number | null;
	appliedMaxMessages: number;
	includeEvidenceCandidates: boolean;
}): Promise<ProjectContextResult> {
	const siblingConversationId = params.siblingConversationId?.trim();
	if (!siblingConversationId) {
		throw new Error("siblingConversationId is required for detail mode");
	}
	if (siblingConversationId === params.conversationId) {
		throw new Error("Current conversation is not a valid project_context sibling");
	}

	const sibling =
		params.reference.entries.find(
			(entry) => entry.conversationId === siblingConversationId,
		) ?? null;
	if (!sibling) {
		throw new Error("siblingConversationId is outside project_context scope");
	}

	const detailMessages = await listRecentDialogueMessages({
		conversationId: siblingConversationId,
		maxMessages: params.appliedMaxMessages,
	});
	const selectedSibling: ProjectContextSelectedSiblingDetail = {
		conversationId: sibling.conversationId,
		title: sibling.title,
		objective: sibling.objective,
		summary: sibling.summary,
		messages: detailMessages.messages,
		omittedMessageCount: detailMessages.omittedMessageCount,
	};

	return {
		success: true,
		mode: "detail",
		hasProjectContext: true,
		source: params.reference.source,
		project: {
			id: params.reference.projectId,
			name: params.reference.projectName,
			authority: params.reference.source,
		},
		siblings: [],
		omittedSiblingCount: params.reference.omittedSiblingCount,
		selectedSibling,
		evidenceCandidates: params.includeEvidenceCandidates
			? [buildDetailEvidenceCandidate(selectedSibling)]
			: [],
		audit: {
			conversationId: params.conversationId,
			scope: "conversation",
			requestedMaxSiblings: params.requestedMaxSiblings,
			appliedMaxSiblings: params.appliedMaxSiblings,
			siblingConversationId,
			requestedMaxMessages: params.requestedMaxMessages,
			appliedMaxMessages: params.appliedMaxMessages,
			includeEvidenceCandidates: params.includeEvidenceCandidates,
		},
	};
}

export async function getProjectContext(
	params: GetProjectContextParams,
): Promise<ProjectContextResult> {
	const mode = params.mode?.trim() || "summary";
	if (mode !== "summary" && mode !== "detail") {
		throw new Error("Unsupported project_context mode");
	}

	const requestedMaxSiblings =
		typeof params.maxSiblings === "number" && Number.isFinite(params.maxSiblings)
			? params.maxSiblings
			: null;
	const maxSiblings = normalizeMaxSiblings(params.maxSiblings);
	const requestedMaxMessages =
		typeof params.maxMessages === "number" && Number.isFinite(params.maxMessages)
			? params.maxMessages
			: null;
	const maxMessages = normalizeMaxMessages(params.maxMessages);
	const includeEvidenceCandidates =
		params.includeEvidenceCandidates !== false;

	const reference = await getProjectReferenceContext({
		userId: params.userId,
		conversationId: params.conversationId,
	});

	if (!reference) {
		return {
			success: true,
			mode,
			hasProjectContext: false,
			source: "none",
			project: null,
			siblings: [],
			omittedSiblingCount: 0,
			selectedSibling: mode === "detail" ? null : undefined,
			evidenceCandidates: [],
			audit: {
				conversationId: params.conversationId,
				scope: "conversation",
				requestedMaxSiblings,
				appliedMaxSiblings: maxSiblings,
				siblingConversationId:
					mode === "detail" ? (params.siblingConversationId?.trim() ?? null) : undefined,
				requestedMaxMessages,
				appliedMaxMessages: maxMessages,
				includeEvidenceCandidates,
				noProjectReason: "no_project_context",
			},
		};
	}

	if (mode === "detail") {
		return buildDetailResult({
			reference,
			conversationId: params.conversationId,
			siblingConversationId: params.siblingConversationId,
			requestedMaxSiblings,
			appliedMaxSiblings: maxSiblings,
			requestedMaxMessages,
			appliedMaxMessages: maxMessages,
			includeEvidenceCandidates,
		});
	}

	const siblings = reference.entries.slice(0, maxSiblings).map((entry) => ({
		conversationId: entry.conversationId,
		title: entry.title,
		objective: entry.objective,
		summary: entry.summary,
	}));
	const omittedByRequest = Math.max(0, reference.entries.length - siblings.length);
	const omittedSiblingCount = reference.omittedSiblingCount + omittedByRequest;

	return {
		success: true,
		mode: "summary",
		hasProjectContext: true,
		source: reference.source,
		project: {
			id: reference.projectId,
			name: reference.projectName,
			authority: reference.source,
		},
		siblings,
		omittedSiblingCount,
		evidenceCandidates: includeEvidenceCandidates
			? buildEvidenceCandidates(siblings)
			: [],
		audit: {
			conversationId: params.conversationId,
			scope: "conversation",
			requestedMaxSiblings,
			appliedMaxSiblings: maxSiblings,
			includeEvidenceCandidates,
		},
	};
}
