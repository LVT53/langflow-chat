<script lang="ts">
	import { getAvatarColor } from '$lib/utils/avatar';

	export let userId: string;
	export let name: string | null = null;
	export let avatarId: number | null = null;
	export let size: number = 28;
	export let profilePicture: string | null = null;
	export let cacheBuster: number = 0;

	$: color = getAvatarColor(avatarId, userId);
	$: initial = name ? name[0].toUpperCase() : (userId[0] ?? '?').toUpperCase();
	$: fontSize = Math.round(size * 0.42);
	$: imgSrc = profilePicture
		? `/api/avatar/${userId}${cacheBuster ? `?t=${cacheBuster}` : ''}`
		: null;
</script>

{#if imgSrc}
	<img
		src={imgSrc}
		alt={name ?? userId}
		class="avatar-circle flex-shrink-0 select-none rounded-full object-cover"
		style="width: {size}px; height: {size}px;"
		aria-hidden="true"
	/>
{:else}
	<div
		class="avatar-circle flex-shrink-0 select-none items-center justify-center rounded-full font-semibold text-white"
		style="width: {size}px; height: {size}px; background: {color}; font-size: {fontSize}px; line-height: {size}px; text-align: center;"
		aria-hidden="true"
	>
		{initial}
	</div>
{/if}

<style>
	.avatar-circle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
</style>
