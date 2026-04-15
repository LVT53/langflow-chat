<script lang="ts">
	import ErrorMessage from '$lib/components/chat/ErrorMessage.svelte';
	import MessageInput from '$lib/components/chat/MessageInput.svelte';
	import type {
		ArtifactSummary,
		ContextDebugState,
		ConversationContextStatus,
		PendingAttachment,
		TaskState,
		TaskSteeringPayload,
	} from '$lib/types';
	import type { DraftChangePayload, SendPayload } from '../_helpers';

	let {
		sendError,
		onRetry,
		onErrorClose,
		onSend,
		onQueue,
		onStop,
		onDraftChange,
		onEditQueuedMessage,
		onDeleteQueuedMessage,
		disabled,
		isGenerating,
		hasQueuedMessage,
		queuedMessagePreview,
		maxLength,
		conversationId,
		contextStatus,
		attachedArtifacts,
		taskState,
		contextDebug,
		draftText,
		draftAttachments,
		draftVersion,
		onSteer,
		onManageEvidence,
		onUploadReady,
	}: {
		sendError: string | null;
		onRetry: () => void;
		onErrorClose: () => void;
		onSend: (payload: SendPayload) => void;
		onQueue: (payload: SendPayload) => void;
		onStop: () => void;
		onDraftChange: (payload: DraftChangePayload) => void;
		onEditQueuedMessage: () => void;
		onDeleteQueuedMessage: () => void;
		disabled: boolean;
		isGenerating: boolean;
		hasQueuedMessage: boolean;
		queuedMessagePreview: string;
		maxLength: number;
		conversationId: string;
		contextStatus: ConversationContextStatus | null;
		attachedArtifacts: ArtifactSummary[];
		taskState: TaskState | null;
		contextDebug: ContextDebugState | null;
		draftText: string;
		draftAttachments: PendingAttachment[];
		draftVersion: number;
		onSteer: (payload: TaskSteeringPayload) => void | Promise<void>;
		onManageEvidence: () => void;
		onUploadReady?: ((uploadFn: (files: FileList | null) => Promise<void>) => void) | undefined;
	} = $props();
</script>

<div class="composer-layer">
	<div class="composer-shell mx-auto flex w-full max-w-[780px] flex-col gap-4 px-1">
		{#if sendError}
			<ErrorMessage error={sendError} onRetry={onRetry} onClose={onErrorClose} />
		{/if}

		<MessageInput
			{onSend}
			{onQueue}
			{onStop}
			{onDraftChange}
			{onEditQueuedMessage}
			{onDeleteQueuedMessage}
			{disabled}
			{isGenerating}
			{hasQueuedMessage}
			{queuedMessagePreview}
			{maxLength}
			{conversationId}
			{contextStatus}
			{attachedArtifacts}
			{taskState}
			{contextDebug}
			{draftText}
			{draftAttachments}
			{draftVersion}
			attachmentsEnabled={true}
			{onSteer}
			onManageEvidence={onManageEvidence}
			{onUploadReady}
		/>
	</div>
</div>

<style>
	.composer-layer {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 10;
		padding: 0.75rem 1rem calc(1.5rem + env(safe-area-inset-bottom));
		background: transparent;
		border: 0;
		box-shadow: none;
		isolation: isolate;
	}

	.composer-shell {
		background: transparent;
		border: 0;
		box-shadow: none;
	}

	@media (max-width: 767px) {
		.composer-layer {
			padding-bottom: calc(1.5rem + env(safe-area-inset-bottom) + 16px);
		}
	}
</style>
