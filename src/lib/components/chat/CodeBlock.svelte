<script lang="ts">
	export let code: string = '';
	export let language: string | undefined = undefined;

	let copied = false;
	let collapsed = false;
	let copyTimeout: ReturnType<typeof setTimeout>;

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

<div
  class="group relative my-md w-full overflow-hidden rounded-lg border border-border bg-surface-code shadow-sm font-mono text-[14px]"
>
  <div
    class="flex items-center justify-between border-b border-border bg-surface-elevated px-md py-sm text-[12px] font-sans text-text-muted"
    class:border-b-0={collapsed}
  >
    <button
      type="button"
      class="flex items-center gap-1.5 hover:text-text-base transition-colors"
      on:click={() => (collapsed = !collapsed)}
      aria-label={collapsed ? 'Expand code block' : 'Collapse code block'}
      title={collapsed ? 'Expand' : 'Collapse'}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="chevron"
        class:collapsed
      >
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
      {#if language}
        <span class="lowercase">{language}</span>
      {:else}
        <span class="text-text-subtle">code</span>
      {/if}
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
    <div class="code-content w-full overflow-x-auto p-md text-[14px] leading-[1.5]">
      <slot></slot>
    </div>
  {/if}
</div>

<style lang="postcss">
	.chevron {
		transition: transform 0.15s ease;
		transform: rotate(0deg);
	}
	.chevron.collapsed {
		transform: rotate(-90deg);
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
</style>
