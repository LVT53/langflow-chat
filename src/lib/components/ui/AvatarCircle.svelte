<script lang="ts">
	import { getAvatarColor } from '$lib/utils/avatar';

	export let userId: string;
	export let name: string | null = null;
	export let avatarId: number | null = null;
	export let size: number = 28;

	$: color = getAvatarColor(avatarId, userId);
	$: initial = name ? name[0].toUpperCase() : (userId[0] ?? '?').toUpperCase();
	$: fontSize = Math.round(size * 0.42);
</script>

<div
	class="avatar-circle flex-shrink-0 select-none items-center justify-center rounded-full font-semibold text-white"
	style="width: {size}px; height: {size}px; background: {color}; font-size: {fontSize}px; line-height: {size}px; text-align: center;"
	aria-hidden="true"
>
	{initial}
</div>

<style>
	.avatar-circle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
</style>
