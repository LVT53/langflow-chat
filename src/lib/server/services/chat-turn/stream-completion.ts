import { applyWebCitationQualityGate } from "$lib/server/services/web-citation-audit";
import type { ToolCallEntry, WebCitationAudit } from "$lib/types";
import type { WorkCapsuleSummary } from "./types";

export interface CompleteStreamTurnParams {
	wasStopped: boolean;
	conversationId: string;
	streamId: string | null;
	modelId: string | null;
	modelDisplayName: string | null;
	userId: string;
	normalizedMessage: string;
	upstreamMessage: string;
	skipPersistUserMessage: boolean;
	isReconnect: boolean | undefined;
	thinkingContent: string;
	fullResponse: string;
	toolCallRecords: ToolCallEntry[];
	serverSegments: Array<unknown>;
	attachmentIds: string[];
	activeDocumentArtifactId: string | null;
	requestStartTime: number;
	fileProductionJobIdsAtStart: Set<string>;
	latestContextStatus: unknown;
	latestActiveWorkingSet: unknown;
	latestTaskState: unknown;
	latestContextDebug: unknown;
	latestHonchoContext: unknown;
	latestHonchoSnapshot: unknown;
	latestProviderUsage: unknown;
	initialContextStatus: unknown;
	initialTaskState: unknown;
	initialContextDebug: unknown;
	createMessage: (
		conversationId: string,
		role: "user" | "assistant",
		content: string,
		thinking?: string,
		serverSegments?: Array<unknown>,
		metadata?: Record<string, unknown>,
	) => Promise<{ id: string } | undefined>;
	persistUserTurnAttachments: (params: {
		userId: string;
		conversationId: string;
		messageId: string;
		normalizedMessage: string;
		attachmentIds: string[];
	}) => Promise<unknown>;
	persistAssistantTurnState: (params: {
		userId: string;
		conversationId: string;
		normalizedMessage: string;
		assistantResponse: string;
		attachmentIds: string[];
		activeDocumentArtifactId: string | null;
		contextStatus: unknown;
		initialTaskState: unknown;
		initialContextDebug: unknown;
		userMessageId: string | null;
		assistantMessageId: string;
		analytics: {
			model: string;
			modelDisplayName: string | null;
			promptTokens: number;
			completionTokens: number;
			reasoningTokens: number;
			generationTimeMs: number;
			providerUsage: unknown;
		};
		continuitySource: string;
		honchoContext: unknown;
		honchoSnapshot: unknown;
	}) => Promise<{
		activeWorkingSet: unknown;
		taskState: unknown;
		contextDebug: unknown;
		workCapsule: WorkCapsuleSummary;
	}>;
	persistAssistantEvidence: (params: {
		logPrefix: string;
		userId: string;
		conversationId: string;
		assistantMessageId: string;
		normalizedMessage: string;
		assistantResponse: string;
		attachmentIds: string[];
		taskState: unknown;
		contextStatus: unknown;
		contextDebug: unknown;
		initialTaskState: unknown;
		initialContextDebug: unknown;
		toolCalls: ToolCallEntry[];
		webCitationAudit?: WebCitationAudit | null;
	}) => Promise<void>;
	runPostTurnTasks: (params: {
		logPrefix: string;
		userId: string;
		conversationId: string;
		upstreamMessage: string;
		assistantMirrorContent: string;
		workCapsule: WorkCapsuleSummary;
		maintenanceReason: string;
	}) => Promise<void>;
	touchConversation: (
		userId: string,
		conversationId: string,
	) => Promise<unknown>;
	enqueueChunk: (chunk: string) => boolean;
	closeDownstream: () => void;
	clearStreamBuffer: (streamId: string) => void;
	getStreamBuffer: (streamId: string) => { userMessage?: string } | null;
	syncGeneratedFilesToMemory: (params: {
		userId: string;
		conversationId: string;
		assistantMessageId: string;
		fileIds: string[];
		assistantResponse: string;
	}) => Promise<void>;
	getChatFilesForAssistantMessage: (
		conversationId: string,
		assistantMessageId: string,
	) => Promise<Array<{ id: string; name: string }>>;
	getFileProductionJobs: (
		userId: string,
		conversationId: string,
	) => Promise<Array<{ id: string; files?: Array<{ id: string }> }>>;
	assignFileProductionJobsToAssistantMessage: (
		userId: string,
		conversationId: string,
		assistantMessageId: string,
		jobIds: string[],
	) => Promise<void>;
	estimateTokenCount: (text: string) => number;
}

export async function completeStreamTurn(
	params: CompleteStreamTurnParams,
): Promise<void> {
	const {
		wasStopped,
		conversationId,
		streamId,
		modelId,
		modelDisplayName,
		userId,
		normalizedMessage,
		upstreamMessage,
		skipPersistUserMessage,
		isReconnect,
		thinkingContent,
		fullResponse,
		toolCallRecords,
		serverSegments,
		attachmentIds,
		activeDocumentArtifactId,
		requestStartTime,
		fileProductionJobIdsAtStart,
		latestContextStatus,
		latestActiveWorkingSet,
		latestTaskState,
		latestContextDebug,
		latestHonchoContext,
		latestHonchoSnapshot,
		latestProviderUsage,
		initialContextStatus,
		initialTaskState,
		initialContextDebug,
		createMessage,
		persistUserTurnAttachments,
		persistAssistantTurnState,
		persistAssistantEvidence,
		runPostTurnTasks,
		touchConversation,
		enqueueChunk,
		closeDownstream,
		clearStreamBuffer,
		getStreamBuffer,
		syncGeneratedFilesToMemory,
		getChatFilesForAssistantMessage,
		getFileProductionJobs,
		assignFileProductionJobsToAssistantMessage,
		estimateTokenCount,
	} = params;

	const citationGate = wasStopped
		? null
		: applyWebCitationQualityGate({
				assistantResponse: fullResponse,
				toolCalls: toolCallRecords,
			});
	const finalResponse = citationGate?.response ?? fullResponse;
	if (citationGate?.appendedNotice) {
		enqueueChunk(
			`event: token\ndata: ${JSON.stringify({ text: `\n\n${citationGate.appendedNotice}` })}\n\n`,
		);
		console.warn("[CHAT_STREAM] Appended web citation quality notice", {
			conversationId,
			streamId,
			status: citationGate.audit?.status,
		});
	}

	const thinkingTokenCount = estimateTokenCount(thinkingContent);
	const responseTokenCount = estimateTokenCount(finalResponse);
	const totalTokenCount = thinkingTokenCount + responseTokenCount;
	const genTimeMs = Date.now() - requestStartTime;
	const analyticsModel = modelId ?? "model1";
	const persistUserMessage = !skipPersistUserMessage;
	const toolCallSummary = toolCallRecords.map((record) => ({
		name: record.name,
		status: record.status,
	}));
	const hadFileProductionToolCall = toolCallSummary.some(
		(record) => record.name === "produce_file",
	);

	console.info("[CHAT_STREAM] Tool-call summary", {
		conversationId,
		streamId,
		wasStopped,
		toolCallCount: toolCallSummary.length,
		fileProductionCallCount: toolCallSummary.filter(
			(record) => record.name === "produce_file",
		).length,
		toolCalls: toolCallSummary,
	});

	let userMessageToPersist = normalizedMessage;
	if (isReconnect && streamId) {
		const buffer = getStreamBuffer(streamId);
		if (buffer?.userMessage) {
			userMessageToPersist = buffer.userMessage;
		}
	}
	const userMsgPromise = persistUserMessage
		? createMessage(conversationId, "user", userMessageToPersist).catch(
				() => undefined,
			)
		: Promise.resolve(undefined);
	const assistantMsgPromise = finalResponse.trim()
		? createMessage(
				conversationId,
				"assistant",
				finalResponse,
				thinkingContent || undefined,
				serverSegments.length > 0 ? serverSegments : undefined,
				{
					evidenceStatus: "pending",
					modelDisplayName,
				},
			).catch(() => undefined)
		: Promise.resolve(undefined);

	const sendEndAndClose = async (
		userMsgId?: string,
		assistantMsgId?: string,
	) => {
		let generatedFiles: Array<{ id: string; name: string }> = [];
		try {
			if (assistantMsgId && hadFileProductionToolCall) {
				const fileProductionJobs = await getFileProductionJobs(
					userId,
					conversationId,
				);
				const newFileProductionJobs = fileProductionJobs.filter(
					(job) => !fileProductionJobIdsAtStart.has(job.id),
				);
				const newFileProductionJobIds = newFileProductionJobs.map(
					(job) => job.id,
				);

				if (newFileProductionJobIds.length > 0) {
					await assignFileProductionJobsToAssistantMessage(
						userId,
						conversationId,
						assistantMsgId,
						newFileProductionJobIds,
					);
				}

				const newGeneratedFileIds = Array.from(
					new Set(
						newFileProductionJobs.flatMap((job) =>
							(job.files ?? []).map((file) => file.id),
						),
					),
				);

				if (newGeneratedFileIds.length > 0) {
					void syncGeneratedFilesToMemory({
						userId,
						conversationId,
						assistantMessageId: assistantMsgId,
						fileIds: newGeneratedFileIds,
						assistantResponse: finalResponse,
					}).catch((error) => {
						console.error(
							"[CHAT_STREAM] Background generated-file memory sync failed",
							{
								conversationId,
								streamId,
								assistantMessageId: assistantMsgId,
								fileIds: newGeneratedFileIds,
								error,
							},
						);
					});
				}

				generatedFiles = await getChatFilesForAssistantMessage(
					conversationId,
					assistantMsgId,
				);
			}
		} catch (error) {
			console.error(
				"[CHAT_STREAM] Failed to load generated files for end event",
				{
					conversationId,
					streamId,
					error,
				},
			);
		}

		enqueueChunk(
			`event: end\ndata: ${JSON.stringify({
				thinkingTokenCount,
				responseTokenCount,
				totalTokenCount,
				thinking: thinkingContent || undefined,
				wasStopped,
				userMessageId: userMsgId,
				assistantMessageId: assistantMsgId,
				modelId,
				modelDisplayName,
				contextStatus: latestContextStatus,
				activeWorkingSet: latestActiveWorkingSet,
				taskState: latestTaskState,
				contextDebug: latestContextDebug,
				generatedFiles,
			})}\n\n`,
		);
		touchConversation(userId, conversationId).catch(() => undefined);
		if (streamId) clearStreamBuffer(streamId);
		closeDownstream();
	};

	return Promise.all([userMsgPromise, assistantMsgPromise])
		.then(([userMsg, assistantMsg]) => {
			const postPersistTasks: Promise<unknown>[] = [];
			let uiStateTask: Promise<unknown> = Promise.resolve();
			if (persistUserMessage && userMsg && attachmentIds.length > 0) {
				postPersistTasks.push(
					persistUserTurnAttachments({
						userId,
						conversationId,
						messageId: userMsg.id,
						normalizedMessage,
						attachmentIds,
					}).catch(() => undefined),
				);
			}

			let latestWorkCapsule: WorkCapsuleSummary;
			if (assistantMsg) {
				uiStateTask = persistAssistantTurnState({
					userId,
					conversationId,
					normalizedMessage,
					assistantResponse: finalResponse,
					attachmentIds,
					activeDocumentArtifactId,
					contextStatus: latestContextStatus,
					initialTaskState,
					initialContextDebug,
					userMessageId: userMsg?.id ?? null,
					assistantMessageId: assistantMsg.id,
					analytics: {
						model: analyticsModel,
						modelDisplayName,
						promptTokens: estimateTokenCount(upstreamMessage),
						completionTokens: responseTokenCount,
						reasoningTokens: thinkingTokenCount,
						generationTimeMs: genTimeMs,
						providerUsage: latestProviderUsage,
					},
					continuitySource: "stream",
					honchoContext: latestHonchoContext,
					honchoSnapshot: latestHonchoSnapshot,
				}).then((turnState) => {
					latestWorkCapsule = turnState.workCapsule;
				});
				postPersistTasks.push(uiStateTask);

				postPersistTasks.push(
					(async () => {
						await uiStateTask.catch(() => undefined);
						await persistAssistantEvidence({
							logPrefix: "[STREAM]",
							userId,
							conversationId,
							assistantMessageId: assistantMsg.id,
							normalizedMessage,
							assistantResponse: finalResponse,
							attachmentIds,
							taskState: latestTaskState,
							contextStatus:
								(latestContextStatus as unknown) ??
								(initialContextStatus as unknown) ??
								null,
							contextDebug: latestContextDebug,
							initialTaskState,
							initialContextDebug,
							toolCalls: toolCallRecords,
							webCitationAudit: citationGate?.audit,
						});
					})(),
				);
			}

			return uiStateTask
				.then(() => sendEndAndClose(userMsg?.id, assistantMsg?.id))
				.then(() =>
					Promise.allSettled(postPersistTasks).then(() =>
						runPostTurnTasks({
							logPrefix: "[STREAM]",
							userId,
							conversationId,
							upstreamMessage,
							assistantMirrorContent: finalResponse,
							workCapsule: latestWorkCapsule,
							maintenanceReason: "chat_stream",
						}),
					),
				);
		})
		.catch(() => {
			return sendEndAndClose();
		});
}
