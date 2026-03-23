<script lang="ts">
	import { slide } from 'svelte/transition';
	import { tick } from 'svelte';

	export let code: string = '';
	export let language: string | undefined = undefined;

	let copied = false;
	let collapsed = false;
	let container: HTMLDivElement;
	let copyTimeout: ReturnType<typeof setTimeout>;

	async function toggleCollapse() {
		const scrollEl = container?.closest('.scroll-container') as HTMLElement | null;
		const blockTop = container?.getBoundingClientRect().top ?? 0;
		collapsed = !collapsed;
		if (scrollEl) {
			await tick();
			requestAnimationFrame(() => {
				const newBlockTop = container?.getBoundingClientRect().top ?? 0;
				scrollEl.scrollTop += newBlockTop - blockTop;
			});
		}
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

<div class="group relative my-md w-full font-mono text-[14px]" bind:this={container}>
	<div class="code-header">
		<button
			type="button"
			class="code-toggle"
			on:click={toggleCollapse}
			aria-label={collapsed ? 'Expand code block' : 'Collapse code block'}
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
				class="btn-icon-bare gap-1.5 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
				on:click={copyToClipboard}
				aria-label="Copy code"
				title="Copy code"
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
		<div class="code-body" transition:slide|local={{ duration: 200 }}>
			<div class="code-content w-full overflow-x-auto p-md text-[14px] leading-[1.5]">
				<slot></slot>
			</div>
		</div>
	{/if}
</div>

<style lang="postcss">
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

	@media (prefers-reduced-motion: reduce) {
		.chevron {
			transition: none;
		}
	}
</style>
