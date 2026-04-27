<script lang="ts">
	import { slide } from 'svelte/transition';
	import { preserveScrollOnToggle } from '$lib/actions/preserve-scroll';
	import { t } from '$lib/i18n';

	let {
		code = '',
		language = undefined,
		contentHtml = ''
	}: {
		code?: string;
		language?: string;
		contentHtml?: string;
	} = $props();

	let copied = $state(false);
	let collapsed = $state(false);
	let container = $state<HTMLDivElement | undefined>(undefined);
	let copyTimeout: ReturnType<typeof setTimeout> | undefined;

	async function toggleCollapse() {
		await preserveScrollOnToggle(container, collapsed, () => { collapsed = !collapsed; });
	}

	async function copyToClipboard() {
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
			clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy code: ', err);
		}
	}
</script>

<div class="code-block relative my-md w-full font-mono text-[14px]" bind:this={container}>
	<div class="code-header">
			<button
				type="button"
				class="code-toggle"
				onclick={toggleCollapse}
				aria-label={collapsed ? $t('codeBlock.expand') : $t('codeBlock.collapse')}
			>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="chevron"
				class:collapsed
			>
				<polyline points="6 9 12 15 18 9"></polyline>
			</svg>
			<span class="lowercase">{language ?? 'code'}</span>
		</button>

		{#if !collapsed}
			<button
				type="button"
				class="btn-icon-bare copy-button gap-1.5"
				onclick={copyToClipboard}
			aria-label={$t('codeBlock.copyCode')}
			title={$t('codeBlock.copyCode')}
			>
				{#if copied}
					<span class="text-success font-sans text-[12px] font-medium">Copied!</span>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
						<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
					</svg>
				{/if}
			</button>
		{/if}
	</div>

	{#if !collapsed}
		<div class="code-body" transition:slide={{ duration: 200 }}>
			<div class="code-content w-full overflow-x-auto p-md text-[14px] leading-[1.5]">
				{@html contentHtml}
			</div>
		</div>
	{/if}
</div>

<style lang="postcss">
	.code-block {
		position: relative;
	}

	.code-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-xs) 0;
	}

	.code-toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0;
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 14px;
		font-weight: 500;
		color: var(--text-muted);
		transition: color var(--duration-standard) var(--ease-out);
	}

	.code-toggle:hover {
		color: var(--text-primary);
	}

	.code-toggle:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px var(--focus-ring);
		border-radius: 2px;
	}

	.chevron {
		color: var(--icon-muted);
		transition: transform var(--duration-standard) var(--ease-out);
		flex-shrink: 0;
	}

	.chevron.collapsed {
		transform: rotate(-90deg);
	}

	.code-body {
		border-radius: var(--radius-md, 0.5rem);
		border: 1px solid var(--border-default);
		background: var(--surface-code);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
	}

	.code-content :global(pre) {
		margin: 0 !important;
		padding: 0 !important;
		background: transparent !important;
		min-width: 100%;
		width: max-content;
	}

	.code-content :global(code) {
		font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
	}

	.copy-button {
		transition: opacity var(--duration-standard) var(--ease-out);
	}

	@media (min-width: 768px) {
		.copy-button {
			opacity: 0;
		}

		.code-block:hover .copy-button,
		.copy-button:focus-visible {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.chevron {
			transition: none;
		}
	}
</style>
