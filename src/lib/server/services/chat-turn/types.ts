import type {
	ContextDebugState,
	ConversationContextStatus,
	HonchoContextInfo,
	HonchoContextSnapshot,
	ModelId,
	TaskState,
	ToolCallEntry,
} from '$lib/types';

export type ChatTurnRoute = 'send' | 'stream';

export type ChatTurnRequestError = {
	status: number;
	error: string;
	code?: string;
	attachmentIds?: string[];
};

export type ParsedChatTurnRequest = {
	conversationId: string;
	normalizedMessage: string;
	streamId?: string;
	modelId: ModelId | undefined;
	modelDisplayName: string;
	attachmentIds: string[];
	activeDocumentArtifactId?: string;
	skipPersistUserMessage: boolean;
	attachmentTraceId?: string;
};

export type PreflightedChatTurn = ParsedChatTurnRequest & {
	sourceLanguage: string;
	translationEnabled: boolean;
};

export type WorkingSetItem = {
	id: string;
	type: string;
	name: string;
	mimeType: string | null;
	sizeBytes: number | null;
	conversationId: string | null;
	summary: string | null;
	createdAt: number;
	updatedAt: number;
};

export type WorkCapsuleSummary =
	| {
			workflowSummary: string | null;
			taskSummary: string | null;
			artifact: { name: string };
	  }
	| null
	| undefined;

export type AssistantAnalytics = {
	model: string;
	completionTokens?: number;
	reasoningTokens?: number;
	generationTimeMs?: number;
};

export type PersistAssistantTurnStateParams = {
	userId: string;
	conversationId: string;
	normalizedMessage: string;
	assistantResponse: string;
	attachmentIds: string[];
	activeDocumentArtifactId?: string;
	contextStatus?: ConversationContextStatus | null;
	initialTaskState?: TaskState | null;
	initialContextDebug?: ContextDebugState | null;
	honchoContext?: HonchoContextInfo | null;
	honchoSnapshot?: HonchoContextSnapshot | null;
	userMessageId?: string | null;
	assistantMessageId: string;
	analytics?: AssistantAnalytics | null;
	continuitySource: 'send' | 'stream';
};

export type PersistAssistantTurnStateResult = {
	activeWorkingSet: WorkingSetItem[] | undefined;
	taskState: TaskState | null | undefined;
	contextDebug: ContextDebugState | null | undefined;
	workCapsule: WorkCapsuleSummary;
};

export type PersistAssistantEvidenceParams = {
	logPrefix: '[SEND]' | '[STREAM]';
	userId: string;
	conversationId: string;
	assistantMessageId: string;
	normalizedMessage: string;
	attachmentIds: string[];
	taskState?: TaskState | null;
	contextStatus?: ConversationContextStatus | null;
	contextDebug?: ContextDebugState | null;
	initialTaskState?: TaskState | null;
	initialContextDebug?: ContextDebugState | null;
	toolCalls?: ToolCallEntry[];
};

export type RunPostTurnTasksParams = {
	logPrefix: '[SEND]' | '[STREAM]';
	userId: string;
	conversationId: string;
	upstreamMessage: string;
	assistantMirrorContent?: string;
	workCapsule?: WorkCapsuleSummary;
	maintenanceReason: 'chat_send' | 'chat_stream';
};
