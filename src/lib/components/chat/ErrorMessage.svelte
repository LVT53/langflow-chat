<script lang="ts">
	let {
		error,
		onRetry,
		onClose
	}: {
		error: string;
		onRetry: () => void;
		onClose: () => void;
	} = $props();
</script>

<div class="error-toast" role="alert" aria-live="assertive">
	<div class="error-icon">
		<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="12" cy="12" r="10"/>
			<line x1="12" y1="8" x2="12" y2="12"/>
			<line x1="12" y1="16" x2="12.01" y2="16"/>
		</svg>
	</div>
	<div class="error-content">
		<p class="error-message">{error}</p>
	</div>
	<div class="error-actions">
		<button type="button" class="error-retry" onclick={onRetry}>
			Retry
		</button>
		<button type="button" class="error-close" onclick={onClose} aria-label="Dismiss error">
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<line x1="18" y1="6" x2="6" y2="18"/>
				<line x1="6" y1="6" x2="18" y2="18"/>
			</svg>
		</button>
	</div>
</div>

<style>
	.error-toast {
		display: flex;
		align-items: flex-start;
		gap: var(--space-sm);
		margin-bottom: var(--space-lg);
		padding: var(--space-md);
		background: color-mix(in srgb, var(--danger) 12%, var(--surface-elevated) 88%);
		border: 1px solid color-mix(in srgb, var(--danger) 30%, var(--border-default) 70%);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md);
		animation: errorSlideIn var(--duration-standard) var(--ease-out);
	}

	.error-icon {
		flex-shrink: 0;
		color: var(--danger);
		padding-top: 2px;
	}

	.error-content {
		flex: 1;
		min-width: 0;
	}

	.error-message {
		margin: 0;
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-primary);
	}

	.error-actions {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		flex-shrink: 0;
	}

	.error-retry {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 13px;
		font-weight: 500;
		padding: var(--space-xs) var(--space-sm);
		background: var(--danger);
		color: white;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition:
			background-color var(--duration-standard) var(--ease-out),
			transform var(--duration-standard) var(--ease-out);
	}

	.error-retry:hover {
		background: var(--danger-hover);
		transform: translateY(-1px);
	}

	.error-retry:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px var(--focus-ring);
	}

	.error-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--icon-muted);
		cursor: pointer;
		transition:
			background-color var(--duration-standard) var(--ease-out),
			color var(--duration-standard) var(--ease-out);
	}

	.error-close:hover {
		background: color-mix(in srgb, var(--danger) 20%, transparent 80%);
		color: var(--danger);
	}

	.error-close:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px var(--focus-ring);
	}

	@keyframes errorSlideIn {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.error-toast {
			animation: none;
		}
	}
</style>
