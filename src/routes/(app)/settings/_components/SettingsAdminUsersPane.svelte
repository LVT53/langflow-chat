<script lang="ts">
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import type { AdminManagedUserSummary } from '$lib/types';

	type RoleFilter = 'all' | 'user' | 'admin';
	type SortKey = 'recent' | 'messages' | 'conversations' | 'tokens';

	let {
		users = [],
		usersLoading = false,
		usersError = '',
		usersMessage = '',
		currentUserId,
		modelNames,
		selectedUserId = $bindable(null),
		actionUserId = null,
		onReload,
		onOpenCreateUser,
		onPromoteUser,
		onDemoteUser,
		onDeleteUser,
		onRevokeSessions,
	}: {
		users?: AdminManagedUserSummary[];
		usersLoading?: boolean;
		usersError?: string;
		usersMessage?: string;
		currentUserId: string;
		modelNames: Record<string, string>;
		selectedUserId: string | null;
		actionUserId?: string | null;
		onReload: () => void | Promise<void>;
		onOpenCreateUser: () => void;
		onPromoteUser: (userId: string) => void | Promise<void>;
		onDemoteUser: (userId: string) => void | Promise<void>;
		onDeleteUser: (userId: string) => void | Promise<void>;
		onRevokeSessions: (userId: string) => void | Promise<void>;
	} = $props();

	let search = $state('');
	let roleFilter = $state<RoleFilter>('all');
	let sortKey = $state<SortKey>('recent');
	let deleteCandidateId = $state<string | null>(null);

	function userLabel(user: AdminManagedUserSummary): string {
		return user.name?.trim() || user.email;
	}

	function modelDisplayName(model: string | null): string {
		if (!model) return '—';
		return modelNames[model] ?? model;
	}

	function formatCount(value: number): string {
		return value.toLocaleString();
	}

	function formatDate(timestamp: number | null): string {
		if (!timestamp) return '—';
		return new Date(timestamp).toLocaleString();
	}

	function matchesSearch(user: AdminManagedUserSummary, query: string): boolean {
		if (!query) return true;
		const haystack = `${user.name ?? ''} ${user.email}`.toLowerCase();
		return haystack.includes(query.toLowerCase());
	}

	let filteredUsers = $derived(
		[...users]
			.filter((user) => (roleFilter === 'all' ? true : user.role === roleFilter))
			.filter((user) => matchesSearch(user, search.trim()))
			.sort((left, right) => {
				if (sortKey === 'messages') return right.messageCount - left.messageCount;
				if (sortKey === 'conversations') return right.conversationCount - left.conversationCount;
				if (sortKey === 'tokens') return right.totalTokenCount - left.totalTokenCount;
				const leftRecent = left.lastActiveAt ?? left.createdAt;
				const rightRecent = right.lastActiveAt ?? right.createdAt;
				return rightRecent - leftRecent;
			})
	);

	let selectedUser = $derived(
		filteredUsers.find((user) => user.id === selectedUserId) ?? filteredUsers[0] ?? null
	);

	$effect(() => {
		const nextSelected = selectedUser?.id ?? null;
		if (selectedUserId !== nextSelected) {
			selectedUserId = nextSelected;
		}
	});
</script>

<section class="settings-card mb-4">
	<div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
		<div>
			<h2 class="settings-section-title mb-1">Users</h2>
			<p class="text-sm text-text-secondary">
				Create accounts, manage admin access, revoke sessions, and remove users when needed.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<button class="btn-secondary" onclick={onReload} disabled={usersLoading}>
				{usersLoading ? 'Loading…' : 'Refresh'}
			</button>
			<button class="btn-primary" onclick={onOpenCreateUser}>Create User</button>
		</div>
	</div>

	<div class="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]">
		<div class="rounded-xl border border-border bg-surface-page/70 p-3">
			<div class="mb-3 flex flex-col gap-2 sm:flex-row">
				<input
					type="text"
					class="settings-input"
					bind:value={search}
					placeholder="Search by name or email"
				/>
				<select class="settings-input sm:max-w-[140px]" bind:value={roleFilter}>
					<option value="all">All roles</option>
					<option value="admin">Admins</option>
					<option value="user">Users</option>
				</select>
				<select class="settings-input sm:max-w-[170px]" bind:value={sortKey}>
					<option value="recent">Most recent</option>
					<option value="messages">Most messages</option>
					<option value="conversations">Most chats</option>
					<option value="tokens">Most tokens</option>
				</select>
			</div>

			{#if usersMessage}
				<p class="mb-3 text-sm text-success">{usersMessage}</p>
			{/if}
			{#if usersError}
				<p class="mb-3 text-sm text-danger">{usersError}</p>
			{/if}

			{#if usersLoading}
				<div class="rounded-lg border border-dashed border-border px-4 py-8 text-sm text-text-muted">
					Loading users…
				</div>
			{:else if filteredUsers.length === 0}
				<div class="rounded-lg border border-dashed border-border px-4 py-8 text-sm text-text-muted">
					No users match the current filters.
				</div>
			{:else}
				<div class="space-y-2">
					{#each filteredUsers as user}
						<button
							type="button"
							class={`w-full rounded-xl border px-4 py-3 text-left transition ${
								selectedUser?.id === user.id
									? 'border-accent bg-accent/8'
									: 'border-border bg-surface-overlay hover:border-accent/40 hover:bg-surface-elevated'
							}`}
							data-testid={`admin-user-row-${user.id}`}
							onclick={() => (selectedUserId = user.id)}
						>
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<div class="truncate font-medium text-text-primary">{userLabel(user)}</div>
									<div class="truncate text-xs text-text-muted">{user.email}</div>
								</div>
								<div class="shrink-0 rounded-full border border-border px-2 py-0.5 text-[0.68rem] uppercase tracking-[0.14em] text-text-muted">
									{user.role}
								</div>
							</div>
							<div class="mt-3 grid grid-cols-3 gap-2 text-xs text-text-secondary">
								<div>
									<div class="font-medium text-text-primary">{formatCount(user.messageCount)}</div>
									<div>Messages</div>
								</div>
								<div>
									<div class="font-medium text-text-primary">{formatCount(user.conversationCount)}</div>
									<div>Chats</div>
								</div>
								<div>
									<div class="font-medium text-text-primary">{formatCount(user.totalTokenCount)}</div>
									<div>Total tokens</div>
								</div>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<div class="rounded-xl border border-border bg-surface-page/70 p-4">
			{#if selectedUser}
				<div class="flex items-start justify-between gap-3">
					<div>
						<h3 class="text-lg font-semibold text-text-primary">{userLabel(selectedUser)}</h3>
						<p class="text-sm text-text-secondary">{selectedUser.email}</p>
					</div>
					<div class="rounded-full border border-border px-2.5 py-1 text-[0.68rem] uppercase tracking-[0.14em] text-text-muted">
						{selectedUser.role}
					</div>
				</div>

				<div class="mt-4 grid grid-cols-2 gap-3">
					<div class="stat-card">
						<div class="stat-value">{formatCount(selectedUser.conversationCount)}</div>
						<div class="stat-label">Conversations</div>
					</div>
					<div class="stat-card">
						<div class="stat-value">{formatCount(selectedUser.messageCount)}</div>
						<div class="stat-label">Messages</div>
					</div>
					<div class="stat-card">
						<div class="stat-value">{formatCount(selectedUser.completionTokens)}</div>
						<div class="stat-label">Completion tokens</div>
					</div>
					<div class="stat-card">
						<div class="stat-value">{formatCount(selectedUser.reasoningTokens)}</div>
						<div class="stat-label">Reasoning tokens</div>
					</div>
					<div class="stat-card">
						<div class="stat-value">{formatCount(selectedUser.totalTokenCount)}</div>
						<div class="stat-label">Total tokens</div>
					</div>
					<div class="stat-card">
						<div class="stat-value">{formatCount(selectedUser.activeSessionCount)}</div>
						<div class="stat-label">Active sessions</div>
					</div>
				</div>

				<div class="mt-4 space-y-2 rounded-xl border border-border bg-surface-overlay p-4 text-sm text-text-secondary">
					<div class="flex items-center justify-between gap-3">
						<span>Favorite model</span>
						<span class="text-right text-text-primary">{modelDisplayName(selectedUser.favoriteModel)}</span>
					</div>
					<div class="flex items-center justify-between gap-3">
						<span>Joined</span>
						<span class="text-right text-text-primary">{formatDate(selectedUser.createdAt)}</span>
					</div>
					<div class="flex items-center justify-between gap-3">
						<span>Last active</span>
						<span class="text-right text-text-primary">{formatDate(selectedUser.lastActiveAt)}</span>
					</div>
				</div>

				<div class="mt-4 flex flex-wrap gap-2">
					<button
						class="btn-secondary"
						disabled={actionUserId === selectedUser.id || selectedUser.id === currentUserId}
						onclick={() =>
							selectedUser.role === 'admin'
								? onDemoteUser(selectedUser.id)
								: onPromoteUser(selectedUser.id)}
					>
						{#if actionUserId === selectedUser.id}
							Saving…
						{:else if selectedUser.role === 'admin'}
							Demote to User
						{:else}
							Promote to Admin
						{/if}
					</button>
					<button
						class="btn-secondary"
						disabled={actionUserId === selectedUser.id || selectedUser.id === currentUserId}
						onclick={() => onRevokeSessions(selectedUser.id)}
					>
						{actionUserId === selectedUser.id ? 'Working…' : 'Revoke Sessions'}
					</button>
					<button
						class="btn-danger"
						disabled={actionUserId === selectedUser.id || selectedUser.id === currentUserId}
						onclick={() => (deleteCandidateId = selectedUser.id)}
					>
						Delete User
					</button>
				</div>

				{#if selectedUser.id === currentUserId}
					<p class="mt-3 text-xs text-text-muted">
						Use the Profile tab for your own account changes. Admin role, session revocation, and deletion
						are disabled here for the current user.
					</p>
				{/if}
			{:else}
				<div class="flex h-full items-center justify-center rounded-lg border border-dashed border-border px-4 py-10 text-sm text-text-muted">
					Select a user to view account details and actions.
				</div>
			{/if}
		</div>
	</div>
</section>

{#if deleteCandidateId}
	<ConfirmDialog
		title="Delete User"
		message="This will permanently delete the selected user account, chats, and stored data. This cannot be undone."
		confirmText="Delete User"
		confirmVariant="danger"
		onCancel={() => (deleteCandidateId = null)}
		onConfirm={() => {
			const targetUserId = deleteCandidateId;
			deleteCandidateId = null;
			if (targetUserId) {
				void onDeleteUser(targetUserId);
			}
		}}
	/>
{/if}
