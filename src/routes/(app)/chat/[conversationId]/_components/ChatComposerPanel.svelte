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
		hasMessages,
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
	}: {
		hasMessages: boolean;
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
	} = $props();
</script>

<div class="composer-layer" class:composer-layer-active={hasMessages}>
	<div class="mx-auto flex w-full max-w-[780px] flex-col gap-4 px-1">
		<div class="intro-copy px-2 text-center" class:intro-copy-hidden={hasMessages}>
			<h1
				class="text-balance text-[2rem] font-serif font-medium tracking-[-0.05em] md:text-[3rem]"
				style="color: color-mix(in srgb, var(--text-primary) 60%, var(--accent) 40%); font-weight: 500;"
			>
				What can I help you with?
			</h1>
		</div>

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
		/>
	</div>
</div>

<style>
	.composer-layer {
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		transform: translateY(-50%);
		transition:
			top 320ms cubic-bezier(0.22, 1, 0.36, 1),
			transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.composer-layer-active {
		top: 100%;
		transform: translateY(calc(-100% - max(1.5rem, env(safe-area-inset-bottom))));
	}

	.intro-copy {
		max-height: 10rem;
		opacity: 1;
		transform: translateY(0);
		transition:
			opacity 220ms cubic-bezier(0.22, 1, 0.36, 1),
			transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
			max-height 240ms cubic-bezier(0.22, 1, 0.36, 1),
			margin 240ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.intro-copy-hidden {
		max-height: 0;
		margin: 0;
		opacity: 0;
		transform: translateY(-12px);
		overflow: hidden;
		pointer-events: none;
	}
</style>
