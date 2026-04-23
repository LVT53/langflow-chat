<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { logout } from '$lib/client/api/auth';
	import { markPreviousConversationId } from '$lib/client/conversation-session';
	import { portal, updateMenuPosition, setupMenuSync } from '$lib/utils/popup-menu';
	import {
		sidebarOpen,
		sidebarCollapsed,
		currentConversationId,
		SIDEBAR_DESKTOP_BREAKPOINT
	} from '$lib/stores/ui';
	let mobileMenuOpen = $state(false);
	let menuRef = $state<HTMLDivElement | undefined>(undefined);
	let triggerRef = $state<HTMLButtonElement | undefined>(undefined);
	let menuPositionStyle = $state('');
	let menuBaseBackground = $state('');

	async function handleLogout() {
		try {
			await logout();
			mobileMenuOpen = false;
			goto('/login');
		} catch (error) {
			console.error('Logout failed:', error);
		}
	}

	function toggleSidebar() {
		if (typeof window !== 'undefined' && window.innerWidth >= SIDEBAR_DESKTOP_BREAKPOINT) {
			sidebarCollapsed.update((collapsed) => !collapsed);
			return;
		}

		sidebarOpen.update((open) => !open);
	}

	async function handleNewConversation() {
		try {
			markPreviousConversationId($currentConversationId);
			currentConversationId.set(null);
			mobileMenuOpen = false;
			await goto('/');
		} catch (error) {
			console.error('Failed to create new conversation:', error);
			alert('Failed to create new conversation. Please try again.');
		}
	}

	function doUpdatePosition() {
		if (!triggerRef) return;
		updateMenuPosition(triggerRef, (style) => { menuPositionStyle = style; }, 188);
	}

	function toggleMobileMenu(event: MouseEvent) {
		event.stopPropagation();
		if (!mobileMenuOpen) {
			doUpdatePosition();
		}
		mobileMenuOpen = !mobileMenuOpen;
	}

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}

	function handleOutsideClick(event: MouseEvent) {
		const target = event.target as Node;
		if (
			mobileMenuOpen &&
			menuRef &&
			triggerRef &&
			!menuRef.contains(target) &&
			!triggerRef.contains(target)
		) {
			closeMobileMenu();
		}
	}

	onMount(() => {
		return setupMenuSync(() => mobileMenuOpen, doUpdatePosition);
	});
</script>

<svelte:window onclick={handleOutsideClick} />

<header
	class="z-10 box-border flex h-[52px] w-full max-w-full flex-none items-center border-b border-border bg-surface-page pl-4 pr-4 pt-[max(0.35rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
>
	<div class="flex min-w-0 flex-1 items-center justify-start gap-md md:gap-lg">
		<button
			class="btn-icon-bare mobile-sidebar-toggle"
			onclick={toggleSidebar}
			aria-label="Toggle sidebar"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<line x1="3" x2="21" y1="6" y2="6" />
				<line x1="3" x2="21" y1="12" y2="12" />
				<line x1="3" x2="21" y1="18" y2="18" />
			</svg>
		</button>
	</div>



	<div class="flex min-w-0 flex-1 items-center justify-end gap-2 md:gap-3 lg:gap-3">

		<div class="hide-on-desktop-lg">
			<button
				bind:this={triggerRef}
				class="btn-icon-bare mobile-user-trigger"
				onclick={toggleMobileMenu}
				aria-label="Open user menu"
				title="Open user menu"
				aria-expanded={mobileMenuOpen}
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M20 21a8 8 0 0 0-16 0" />
					<circle cx="12" cy="8" r="5" />
				</svg>
			</button>

			{#if mobileMenuOpen}
				<div
					bind:this={menuRef}
					use:portal
					class="header-menu z-[9999] overflow-hidden rounded-[0.75rem] border p-[5px]"
					style={`${menuPositionStyle} --header-menu-bg: ${menuBaseBackground}; background: ${menuBaseBackground};`}
				>
					<button
						class="header-option header-option-accent flex min-h-[38px] w-full items-center px-[3px] py-[3px] text-left text-sm font-sans text-text-primary transition-colors duration-150 focus-visible:outline-none cursor-pointer"
						onclick={handleNewConversation}
					>
						<svg class="header-option-icon header-option-icon-accent" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
							<line x1="12" x2="12" y1="5" y2="19" />
							<line x1="5" x2="19" y1="12" y2="12" />
						</svg>
						<span>New chat</span>
					</button>
					<button
						class="header-option flex min-h-[38px] w-full items-center px-[3px] py-[3px] text-left text-sm font-sans text-text-primary transition-colors duration-150 focus-visible:outline-none cursor-pointer"
						onclick={() => {
							mobileMenuOpen = false;
							goto('/settings');
						}}
					>
						<svg class="header-option-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
							<path d="M20 21a8 8 0 0 0-16 0" />
							<circle cx="12" cy="8" r="5" />
						</svg>
						<span>Profile &amp; Settings</span>
					</button>
					<button
						class="header-option header-option-danger flex min-h-[38px] w-full items-center px-[3px] py-[3px] text-left text-sm font-sans text-text-primary transition-colors duration-150 focus-visible:outline-none cursor-pointer"
						onclick={handleLogout}
					>
						<svg class="header-option-icon header-option-icon-danger" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
							<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
							<polyline points="16 17 21 12 16 7"></polyline>
							<line x1="21" y1="12" x2="9" y2="12"></line>
						</svg>
						<span>Logout</span>
					</button>
				</div>
			{/if}
		</div>
	</div>
</header>

<style>
	.mobile-user-trigger {
		color: var(--accent);
	}

	.mobile-user-trigger:hover,
	.mobile-user-trigger:focus-visible {
		color: var(--accent-hover);
	}

	.header-menu {
		border-color: color-mix(in srgb, var(--border-default) 76%, var(--surface-page) 24%);
		isolation: isolate;
		pointer-events: auto;
		box-shadow:
			0 14px 30px rgba(0, 0, 0, 0.14),
			0 1px 0 color-mix(in srgb, var(--border-default) 88%, transparent 12%);
	}

	:global(.dark) .header-menu {
		border-color: color-mix(in srgb, var(--border-default) 84%, transparent 16%);
		box-shadow:
			0 16px 32px rgba(0, 0, 0, 0.4),
			0 0 0 1px color-mix(in srgb, var(--border-default) 88%, transparent 12%);
	}

	.header-option {
		border: 0;
		border-radius: 0.75rem;
		background: var(--header-menu-bg);
		padding-inline: 0.65rem;
		gap: 0.8rem;
	}

	.header-option:hover,
	.header-option:focus-visible {
		background: rgba(194, 166, 106, 0.24) !important;
	}

	.header-option-accent:hover,
	.header-option-accent:focus-visible {
		background: rgba(194, 166, 106, 0.28) !important;
	}

	.header-option-danger:hover,
	.header-option-danger:focus-visible {
		background: rgba(186, 77, 77, 0.14) !important;
	}

	.header-option-icon {
		margin-right: 7px;
		color: color-mix(in srgb, var(--surface-overlay) 45%, var(--text-primary) 55%);
	}

	.header-option-icon-accent {
		color: var(--accent);
	}

	.header-option-icon-danger {
		color: color-mix(in srgb, var(--surface-overlay) 45%, var(--text-primary) 55%);
	}

	:global(.dark) .header-option:hover,
	:global(.dark) .header-option:focus-visible {
		background: rgba(194, 166, 106, 0.3) !important;
	}

	:global(.dark) .header-option-accent:hover,
	:global(.dark) .header-option-accent:focus-visible {
		background: rgba(194, 166, 106, 0.3) !important;
	}

	:global(.dark) .header-option-danger:hover,
	:global(.dark) .header-option-danger:focus-visible {
		background: rgba(186, 77, 77, 0.22) !important;
	}

	:global(.dark) .header-option-icon,
	:global(.dark) .header-option-icon-danger {
		color: color-mix(in srgb, var(--surface-overlay) 62%, var(--text-primary) 38%);
	}

	:global(.dark) .header-option-icon-accent {
		color: var(--accent);
	}

	@media (min-width: 1024px) {
		.mobile-sidebar-toggle {
			display: none !important;
		}
	}

	@media (min-width: 1024px) {
		.hide-on-desktop-lg {
			display: none !important;
		}
	}

</style>
