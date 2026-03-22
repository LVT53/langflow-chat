<script lang="ts">
	import { onMount } from 'svelte';
	import { selectedModel, setSelectedModel, type ModelId } from '$lib/stores/settings';

	interface Model {
		id: ModelId;
		displayName: string;
	}

	let models: Model[] = [];
	let isOpen = false;
	let isLoading = true;
	let error: string | null = null;
	let dropdownRef: HTMLDivElement;

	onMount(async () => {
		try {
			const response = await fetch('/api/models');
			if (!response.ok) {
				throw new Error('Failed to fetch models');
			}
			const data = await response.json();
			models = data.models;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load models';
			// Fallback to default models if API fails
			models = [
				{ id: 'model1', displayName: 'Model 1' },
				{ id: 'model2', displayName: 'Model 2' }
			];
		} finally {
			isLoading = false;
		}

		// Close dropdown when clicking outside
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
				isOpen = false;
			}
		};

		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	});

	function handleSelect(modelId: ModelId) {
		setSelectedModel(modelId);
		isOpen = false;
	}

	function toggleDropdown() {
		isOpen = !isOpen;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			isOpen = false;
		}
	}

	$: currentModel = models.find((m) => m.id === $selectedModel);
</script>

<div class="model-selector" bind:this={dropdownRef} on:keydown={handleKeydown} role="presentation">
	<button
		type="button"
		class="model-selector__trigger"
		on:click={toggleDropdown}
		aria-haspopup="listbox"
		aria-expanded={isOpen}
		aria-label="Select model"
		disabled={isLoading}
		data-testid="model-selector-trigger"
	>
		{#if isLoading}
			<span class="model-selector__text">Loading...</span>
		{:else if currentModel}
			<span class="model-selector__text">{currentModel.displayName}</span>
		{:else}
			<span class="model-selector__text">Select model</span>
		{/if}
		<svg
			class="model-selector__chevron"
			class:model-selector__chevron--open={isOpen}
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
			<polyline points="6 9 12 15 18 9" />
		</svg>
	</button>

	{#if isOpen && models.length > 0}
		<ul class="model-selector__dropdown" role="listbox" aria-label="Available models">
			{#each models as model}
				<li
					role="option"
					aria-selected={$selectedModel === model.id}
					class="model-selector__option"
					class:model-selector__option--selected={$selectedModel === model.id}
					on:click={() => handleSelect(model.id)}
					on:keydown={(e) => e.key === 'Enter' && handleSelect(model.id)}
					tabindex="0"
					data-testid="model-option-{model.id}"
				>
					{model.displayName}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.model-selector {
		position: relative;
		display: inline-block;
	}

	.model-selector__trigger {
		display: flex;
		align-items: center;
		gap: var(--space-xs, 4px);
		padding: var(--space-sm, 8px) 10px;
		background: transparent;
		border: 1px solid var(--border, rgba(0, 0, 0, 0.08));
		border-radius: var(--radius-md, 8px);
		color: var(--text-primary, #1a1a1a);
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 14px;
		font-weight: 400;
		cursor: pointer;
		transition: all 150ms ease-out;
		min-height: 36px;
	}

	.model-selector__trigger:hover:not(:disabled) {
		background: var(--bg-hover, #eeedea);
		border-color: var(--border, rgba(0, 0, 0, 0.08));
	}

	.model-selector__trigger:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px var(--border-focus, #c15f3c);
	}

	.model-selector__trigger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.model-selector__text {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 120px;
	}

	.model-selector__chevron {
		flex-shrink: 0;
		transition: transform 200ms ease-out;
		color: var(--text-secondary, #6b6b6b);
		margin-left: 4px;
	}

	.model-selector__chevron--open {
		transform: rotate(180deg);
	}

	.model-selector__dropdown {
		position: absolute;
		bottom: 100%;
		left: 0;
		margin-bottom: var(--space-xs, 4px);
		padding: var(--space-xs, 4px);
		background: var(--bg-primary, #ffffff);
		display: flex;
		flex-direction: column;
		gap: 4px;
		border: 1px solid var(--border, rgba(0, 0, 0, 0.08));
		border-radius: var(--radius-md, 8px);
		box-shadow: var(--shadow-lg, 0 4px 16px rgba(0, 0, 0, 0.08));
		list-style: none;
		min-width: 100%;
		z-index: 100;
		animation: dropdownFadeIn 150ms ease-out;
	}

	.model-selector__option {
		padding: var(--space-sm, 8px) var(--space-md, 16px);
		border-radius: var(--radius-sm, 4px);
		cursor: pointer;
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 14px;
		color: var(--text-primary, #1a1a1a);
		transition: background-color 150ms ease-out;
		white-space: nowrap;
	}

	.model-selector__option:hover,
	.model-selector__option:focus {
		background: var(--bg-hover, #eeedea);
		outline: none;
	}

	.model-selector__option--selected {
		background: var(--bg-hover, #eeedea);
		font-weight: 500;
	}

	@keyframes dropdownFadeIn {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Dark mode support */
	:global(.dark) .model-selector__trigger {
		color: var(--text-primary, #ececec);
		border-color: var(--border, rgba(255, 255, 255, 0.08));
	}

	:global(.dark) .model-selector__trigger:hover:not(:disabled) {
		background: var(--bg-hover, #333333);
	}

	:global(.dark) .model-selector__dropdown {
		background: var(--bg-primary, #1a1a1a);
		border-color: var(--border, rgba(255, 255, 255, 0.08));
	}

	:global(.dark) .model-selector__option {
		color: var(--text-primary, #ececec);
	}

	:global(.dark) .model-selector__option:hover,
	:global(.dark) .model-selector__option:focus {
		background: var(--bg-hover, #333333);
	}

	:global(.dark) .model-selector__option--selected {
		background: var(--bg-hover, #333333);
	}

	/* Mobile adjustments */
	@media (max-width: 768px) {
		.model-selector__trigger {
			min-height: 44px;
			padding: var(--space-sm, 8px) var(--space-md, 12px);
		}

		.model-selector__text {
			max-width: 100px;
		}
	}
</style>
