<script lang="ts">
	let {
		active = false,
		rejected = false,
	}: {
		active?: boolean;
		rejected?: boolean;
	} = $props();
</script>

{#if active}
	<div class="drop-zone-overlay" data-testid="drop-zone-overlay">
		<div class="drop-zone-content">
			{#if rejected}
				<svg
					class="drop-zone-icon drop-zone-icon-rejected"
					xmlns="http://www.w3.org/2000/svg"
					width="48"
					height="48"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<circle cx="12" cy="12" r="10" />
					<line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
				</svg>
				<p class="drop-zone-text">Cannot upload while generating</p>
			{:else}
				<svg
					class="drop-zone-icon"
					xmlns="http://www.w3.org/2000/svg"
					width="48"
					height="48"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="17 8 12 3 7 8" />
					<line x1="12" y1="3" x2="12" y2="15" />
				</svg>
				<p class="drop-zone-text">Drop files to attach (max 100MB per file)</p>
			{/if}
		</div>
	</div>
{/if}
