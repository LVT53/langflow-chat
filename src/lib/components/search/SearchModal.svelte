<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { conversations, loadConversations } from '$lib/stores/conversations';
	import { projects } from '$lib/stores/projects';
	import { currentConversationId, sidebarOpen, SIDEBAR_DESKTOP_BREAKPOINT } from '$lib/stores/ui';

	let { isOpen = false, onClose = () => {} }: {
		isOpen?: boolean;
		onClose?: () => void;
	} = $props();

	let searchQuery = $state('');
	let conversationLoading = $state(false);
	let modalRef = $state<HTMLDivElement | undefined>(undefined);
	let searchInputRef = $state<HTMLInputElement | undefined>(undefined);
	let previousFocus: HTMLElement | null = null;
	let wasOpen = false;

	const focusableSelector =
		'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

	const trimmedSearchQuery = $derived(searchQuery.trim());
	const normalizedSearchQuery = $derived(trimmedSearchQuery.toLowerCase());
	const searchableConversations = $derived($conversations);
	const projectsMap = $derived(Object.fromEntries($projects.map((project) => [project.id, project.name])));
	const conversationResults = $derived(normalizedSearchQuery
		? searchableConversations.filter((conversation) =>
				conversation.title.toLowerCase().includes(normalizedSearchQuery)
			)
		: searchableConversations.slice(0, 6));

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		document.body.style.overflow = 'hidden';
		
		return {
			destroy() {
				if (node.parentNode) {
					node.parentNode.removeChild(node);
				}
				document.body.style.overflow = '';
			}
		};
	}

	$effect(() => {
		if (!browser || !isOpen || wasOpen) {
			wasOpen = isOpen;
			return;
		}

		previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

		void tick().then(() => {
			const isMobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
			if (!isMobile) {
				searchInputRef?.focus();
			}
		});

		if (get(conversations).length === 0) {
			conversationLoading = true;
			void loadConversations().finally(() => {
				conversationLoading = false;
			});
		}

		wasOpen = true;
	});

	function handleClose() {
		searchQuery = '';
		conversationLoading = false;
		onClose();
		previousFocus?.focus();
		previousFocus = null;
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			handleClose();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!isOpen) return;

		if (event.key === 'Escape') {
			event.preventDefault();
			handleClose();
			return;
		}

		if (event.key === 'Tab') {
			const focusableElements = modalRef?.querySelectorAll<HTMLElement>(focusableSelector);
			if (!focusableElements || focusableElements.length === 0) return;

			const firstElement = focusableElements[0];
			const lastElement = focusableElements[focusableElements.length - 1];

			if (event.shiftKey && document.activeElement === firstElement) {
				event.preventDefault();
				lastElement.focus();
			} else if (!event.shiftKey && document.activeElement === lastElement) {
				event.preventDefault();
				firstElement.focus();
			}
		}
	}

	async function handleSelection(id: string) {
		currentConversationId.set(id);
		handleClose();
		await goto(`/chat/${id}`);
		if (window.innerWidth < SIDEBAR_DESKTOP_BREAKPOINT) {
			sidebarOpen.set(false);
		}
	}

	onDestroy(() => {
		if (browser && document.body.style.overflow === 'hidden') {
			document.body.style.overflow = '';
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		use:portal
		class="search-portal-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4"
		onclick={handleBackdropClick}
		transition:fade={{ duration: 150 }}
	>
		<div
			bind:this={modalRef}
			role="dialog"
			aria-modal="true"
			aria-labelledby="search-dialog-title"
			tabindex="-1"
			class="search-portal-modal w-full max-w-[720px] overflow-hidden rounded-xl border border-border bg-surface-overlay shadow-2xl"
		>
			<div class="border-b border-border px-6 py-5">
				<div class="flex items-center justify-between gap-4">
				<div class="flex items-center gap-3">
					<h2 id="search-dialog-title" class="text-[20px] font-sans font-semibold text-text-primary">
						Search
					</h2>
				</div>
					<button
						type="button"
						class="btn-icon-bare h-10 w-10 rounded-full text-icon-muted hover:text-icon-primary"
						onclick={handleClose}
						aria-label="Close search"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="18" x2="6" y1="6" y2="18"></line>
							<line x1="6" x2="18" y1="6" y2="18"></line>
						</svg>
					</button>
			</div>
		</div>

			<div class="border-b border-border px-6 py-4">
				<div class="search-input-wrapper flex items-center gap-3 rounded-lg border border-border bg-surface-page px-4 py-3">
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-icon-muted">
						<circle cx="11" cy="11" r="7"></circle>
						<path d="m20 20-3.5-3.5"></path>
					</svg>
					<input
						bind:this={searchInputRef}
						bind:value={searchQuery}
						type="text"
						placeholder="Search conversations..."
						class="h-10 w-full bg-transparent text-[16px] font-sans text-text-primary outline-none placeholder:text-text-muted"
					/>
					{#if searchQuery}
						<button
							type="button"
							class="btn-icon-bare h-8 w-8 text-icon-muted hover:text-icon-primary"
							onclick={() => (searchQuery = '')}
							aria-label="Clear search"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<line x1="18" x2="6" y1="6" y2="18"></line>
								<line x1="6" x2="18" y1="6" y2="18"></line>
							</svg>
						</button>
					{/if}
				</div>
			</div>

			<div class="max-h-[423px] overflow-y-auto px-4 py-3">
				{#if conversationLoading}
					<div class="flex flex-col items-center justify-center px-4 py-16 text-center">
						<div class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated">
							<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin text-icon-muted">
								<circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12" stroke-linecap="round"></circle>
							</svg>
						</div>
						<h3 class="text-[16px] font-sans text-text-primary">Loading...</h3>
					</div>
				{:else if conversationResults.length === 0}
					<div class="flex flex-col items-center justify-center px-4 py-16 text-center">
						<div class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated">
							<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-icon-muted">
								<circle cx="11" cy="11" r="7"></circle>
								<path d="m20 20-3.5-3.5"></path>
							</svg>
						</div>
						<h3 class="text-[16px] font-sans text-text-primary">No matches found</h3>
						<p class="mt-1 text-[14px] font-sans text-text-muted">
							Try a different search term
						</p>
					</div>
				{:else}
					<div class="space-y-5">
						{#if conversationResults.length > 0}
							<section class="space-y-2">
								<div class="px-2 text-[11px] font-sans font-medium uppercase tracking-[0.14em] text-text-muted">
									{trimmedSearchQuery ? 'Conversations' : 'Recent conversations'}
								</div>
								<div class="space-y-1">
									{#each conversationResults as conversation (conversation.id)}
										<button
											type="button"
											class="search-result-item flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-elevated"
											class:active={conversation.id === $currentConversationId}
											onclick={() => handleSelection(conversation.id)}
										>
											<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated">
												<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-icon-muted">
													<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
												</svg>
											</div>
											<div class="min-w-0 flex-1">
												<div class="truncate text-[15px] font-sans font-medium text-text-primary">
													{conversation.title}
												</div>
												{#if conversation.id === $currentConversationId}
													<div class="mt-0.5 text-[12px] font-sans text-accent">Current conversation</div>
												{:else if conversation.projectId && projectsMap[conversation.projectId]}
													<div class="mt-0.5 flex items-center gap-1 text-[12px] font-sans text-text-muted">
														<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
															<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
														</svg>
														{projectsMap[conversation.projectId]}
													</div>
												{/if}
											</div>
											<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-icon-muted">
												<path d="m9 18 6-6-6-6"></path>
											</svg>
										</button>
									{/each}
								</div>
							</section>
						{/if}
					</div>
				{/if}
			</div>

		</div>
	</div>
{/if}

<style>
	.search-portal-backdrop {
		background: color-mix(in srgb, var(--surface-page) 80%, transparent 20%);
		backdrop-filter: blur(8px);
		/* Mobile: ensure proper centering when viewport changes (keyboard open, etc.) */
		align-items: center;
		justify-content: center;
	}

	/* Mobile-specific backdrop fixes for virtual keyboard scenarios */
	@media (max-width: 767px) {
		:global(.search-portal-backdrop) {
			padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
		}
	}

	:global(.dark) .search-portal-backdrop {
		background: color-mix(in srgb, var(--surface-page) 85%, transparent 15%);
	}

	.search-portal-modal {
		box-shadow:
			0 25px 50px -12px rgba(0, 0, 0, 0.25),
			0 0 0 1px color-mix(in srgb, var(--border-default) 50%, transparent 50%);
		/* Mobile: prevent modal from exceeding viewport height and ensure centering */
		max-height: 90dvh;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}

	:global(.dark) .search-portal-modal {
		box-shadow:
			0 25px 50px -12px rgba(0, 0, 0, 0.5),
			0 0 0 1px color-mix(in srgb, var(--border-default) 30%, transparent 70%);
	}

	/* Mobile-specific centering fix: ensure modal stays centered when viewport changes */
	@media (max-width: 767px) {
		.search-portal-modal {
			max-height: 85dvh;
		}
	}

	.search-input-wrapper {
		transition: border-color 150ms ease, box-shadow 150ms ease;
	}

	.search-input-wrapper:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent 85%);
	}

	:global(.dark) .search-input-wrapper:focus-within {
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent 80%);
	}

	.search-result-item {
		border: 1px solid transparent;
	}

	.search-result-item:hover {
		border-color: var(--border-subtle);
		background: color-mix(in srgb, var(--surface-elevated) 70%, var(--surface-page) 30%);
	}

	:global(.dark) .search-result-item:hover {
		background: color-mix(in srgb, var(--surface-overlay) 60%, var(--surface-elevated) 40%);
		border-color: color-mix(in srgb, var(--border-default) 60%, transparent 40%);
	}

	.search-result-item.active {
		background: color-mix(in srgb, var(--accent) 8%, var(--surface-elevated) 92%);
		border-color: color-mix(in srgb, var(--accent) 30%, var(--border-default) 70%);
	}

	:global(.dark) .search-result-item.active {
		background: color-mix(in srgb, var(--accent) 12%, var(--surface-overlay) 88%);
		border-color: color-mix(in srgb, var(--accent) 40%, var(--border-default) 60%);
	}

	/* Animation for backdrop */
	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	/* Reduced motion support */
	@media (prefers-reduced-motion: reduce) {
		:global(.search-portal-backdrop) {
			animation: none !important;
		}
	}
</style>
