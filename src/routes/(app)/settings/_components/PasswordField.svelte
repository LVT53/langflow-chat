<script lang="ts">
	import { t } from '$lib/i18n';

	let {
		id,
		label,
		value = $bindable(''),
		shown = $bindable(false),
		autocomplete,
		placeholder = '',
	}: {
		id: string;
		label: string;
		value: string;
		shown: boolean;
		autocomplete?: string;
		placeholder?: string;
	} = $props();
</script>

<div>
	<div class="mb-1 flex items-center justify-between">
		<label class="settings-label !mb-0" for={id}>{label}</label>
		<button
			type="button"
			class="pw-toggle"
			onclick={() => (shown = !shown)}
			tabindex="-1"
			aria-label={shown ? $t('settings_hidePassword') : $t('settings_showPassword')}
		>
			{#if shown}
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
				>
					<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
					<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
					<line x1="1" y1="1" x2="23" y2="23" />
				</svg>
			{:else}
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
				>
					<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
					<circle cx="12" cy="12" r="3" />
				</svg>
			{/if}
		</button>
	</div>
	<input
		{id}
		type={shown ? 'text' : 'password'}
		class="settings-input"
		bind:value
		{autocomplete}
		{placeholder}
	/>
</div>

<style>
	.pw-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: var(--text-muted);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		font-family: inherit;
		transition: color 150ms;
	}

	.pw-toggle:hover {
		color: var(--text-primary);
	}
</style>
