<script lang="ts">
	import { t } from "$lib/i18n";
	import type { SkillSession } from "$lib/types";

	interface Props {
		session: SkillSession;
		busy?: boolean;
		error?: string | null;
		onFinish: () => void | Promise<void>;
		onDismiss: () => void | Promise<void>;
	}

	let { session, busy = false, error = null, onFinish, onDismiss }: Props = $props();

	const statusLabel = $derived($t(`skillSessions.status.${session.status}`));
	const sourceScopeLabel = $derived($t(`skills.source.${session.sourceScope === "selected_sources_only" ? "selectedSourcesOnly" : "currentConversation"}`));
	const notesPolicyLabel = $derived($t(`skills.notes.${session.notesPolicy === "create_private_notes" ? "createPrivate" : "none"}`));
	const latestNoteFailure = $derived(
		session.milestones
			.filter((milestone) => milestone.kind === "failed_note")
			.at(-1),
	);
	const latestNoteFailureMessage = $derived(
		typeof latestNoteFailure?.messageParams.errorMessage === "string"
			? latestNoteFailure.messageParams.errorMessage
			: $t("skillSessions.noteFailureFallback"),
	);
</script>

<section class="skill-session-panel" aria-label={$t("skillSessions.panelLabel")}>
	<div class="skill-session-panel__main">
		<div>
			<p class="skill-session-panel__eyebrow">{$t("skillSessions.activeLabel")}</p>
			<h2>{session.skillDisplayName}</h2>
		</div>
		<span class="skill-session-panel__status" class:paused={session.status === "paused"}>{statusLabel}</span>
	</div>

	<p class="skill-session-panel__next">
		{$t("skillSessions.expectedNextAction")}
	</p>
	<p class="skill-session-panel__meta">
		{sourceScopeLabel} · {notesPolicyLabel}
	</p>

	{#if latestNoteFailure}
		<p class="skill-session-panel__note-failure" role="status">
			{$t("skillSessions.noteFailure")}: {latestNoteFailureMessage}
		</p>
	{/if}

	{#if error}
		<p class="skill-session-panel__error" role="alert">{error}</p>
	{/if}

	<div class="skill-session-panel__actions">
		<button type="button" onclick={onFinish} disabled={busy}>
			{$t("skillSessions.finish")}
		</button>
		<button type="button" class="secondary" onclick={onDismiss} disabled={busy}>
			{$t("skillSessions.dismiss")}
		</button>
	</div>
</section>

<style>
	.skill-session-panel {
		position: relative;
		z-index: 2;
		width: min(90%, 44rem);
		margin: 0 auto;
		border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border-default) 72%);
		border-radius: 8px;
		background:
			linear-gradient(
				135deg,
				color-mix(in srgb, var(--accent) 9%, var(--surface-overlay) 91%),
				color-mix(in srgb, var(--surface-elevated) 90%, var(--surface-page) 10%)
			);
		box-shadow:
			0 10px 24px color-mix(in srgb, var(--accent) 12%, transparent 88%),
			0 1px 0 color-mix(in srgb, var(--surface-overlay) 86%, transparent 14%) inset;
		padding: 0.875rem 1rem;
		color: var(--text-primary);
		backdrop-filter: blur(14px);
	}

	.skill-session-panel::before {
		position: absolute;
		inset: 0 auto 0 0;
		width: 3px;
		border-radius: 8px 0 0 8px;
		background: var(--accent);
		content: "";
	}

	.skill-session-panel__main {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.skill-session-panel__eyebrow,
	.skill-session-panel__meta {
		margin: 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	h2 {
		margin: 0.125rem 0 0;
		font-size: 0.95rem;
		font-weight: 650;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}

	.skill-session-panel__status {
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, var(--success) 28%, transparent 72%);
		background: color-mix(in srgb, var(--success) 14%, var(--surface-elevated) 86%);
		color: var(--success);
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.2rem 0.55rem;
		white-space: nowrap;
	}

	.skill-session-panel__status.paused {
		border-color: color-mix(in srgb, var(--accent) 30%, transparent 70%);
		background: color-mix(in srgb, var(--accent) 14%, var(--surface-elevated) 86%);
		color: var(--accent);
	}

	.skill-session-panel__next {
		margin: 0.65rem 0 0.2rem;
		font-size: 0.875rem;
	}

	.skill-session-panel__error {
		margin: 0.65rem 0 0;
		font-size: 0.8125rem;
		color: var(--danger);
	}

	.skill-session-panel__note-failure {
		margin: 0.65rem 0 0;
		border-left: 3px solid var(--accent);
		padding-left: 0.55rem;
		font-size: 0.8125rem;
		color: color-mix(in srgb, var(--accent) 72%, var(--text-primary) 28%);
	}

	.skill-session-panel__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	button {
		border: 1px solid var(--accent);
		border-radius: 8px;
		background: var(--accent);
		color: white;
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 600;
		padding: 0.4rem 0.7rem;
		cursor: pointer;
		transition:
			background-color var(--duration-standard) var(--ease-out),
			border-color var(--duration-standard) var(--ease-out),
			box-shadow var(--duration-standard) var(--ease-out),
			color var(--duration-standard) var(--ease-out),
			transform var(--duration-standard) var(--ease-out);
	}

	button.secondary {
		border-color: color-mix(in srgb, var(--border-default) 82%, transparent 18%);
		background: color-mix(in srgb, var(--surface-overlay) 58%, transparent 42%);
		color: var(--text-primary);
	}

	button:hover:not(:disabled),
	button:focus-visible:not(:disabled) {
		background: var(--accent-hover);
		border-color: var(--accent-hover);
		transform: translateY(-1px);
	}

	button.secondary:hover:not(:disabled),
	button.secondary:focus-visible:not(:disabled) {
		background: color-mix(in srgb, var(--accent) 12%, var(--surface-overlay) 88%);
		border-color: color-mix(in srgb, var(--accent) 45%, var(--border-default) 55%);
		color: var(--accent);
	}

	button:focus-visible {
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus-ring) 38%, transparent 62%);
		outline: none;
	}

	button:active:not(:disabled) {
		transform: translateY(0);
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.65;
	}

	:global(.dark) .skill-session-panel {
		background:
			linear-gradient(
				135deg,
				color-mix(in srgb, var(--accent) 14%, var(--surface-overlay) 86%),
				color-mix(in srgb, var(--surface-elevated) 82%, #111 18%)
			);
		box-shadow:
			0 16px 34px rgba(0, 0, 0, 0.34),
			0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent 90%);
	}

	@media (max-width: 640px) {
		.skill-session-panel {
			width: calc(100% - 0.5rem);
			padding: 0.7rem 0.75rem;
		}

		.skill-session-panel__main {
			gap: 0.65rem;
		}

		.skill-session-panel__next {
			margin-top: 0.45rem;
			font-size: 0.8125rem;
		}

		.skill-session-panel__actions {
			display: grid;
			grid-template-columns: 1fr 1fr;
		}

		button {
			min-height: 36px;
			padding: 0.4rem 0.55rem;
		}
	}
</style>
