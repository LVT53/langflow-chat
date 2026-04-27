<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { get } from 'svelte/store';
	import { t, type I18nKey } from '$lib/i18n';

	let {
		analyticsData = null,
		analyticsLoading = false,
		analyticsError = '',
		isAdmin = false,
		modelNames,
		onRetry,
	}: {
		analyticsData?: any;
		analyticsLoading?: boolean;
		analyticsError?: string;
		isAdmin?: boolean;
		modelNames: Record<string, string>;
		onRetry: () => void | Promise<void>;
	} = $props();

	let modelChart = $state<any>(null);
	let userChart = $state<any>(null);
	let modelChartCanvas = $state<HTMLCanvasElement | null>(null);
	let userChartCanvas = $state<HTMLCanvasElement | null>(null);

	const CHART_COLORS = [
		'rgba(194, 166, 106, 0.88)',
		'rgba(107, 149, 194, 0.88)',
		'rgba(107, 194, 149, 0.88)',
		'rgba(194, 107, 107, 0.88)',
		'rgba(149, 107, 194, 0.88)',
		'rgba(194, 172, 107, 0.88)',
	];

	function destroyCharts() {
		modelChart?.destroy();
		modelChart = null;
		userChart?.destroy();
		userChart = null;
	}

	function modelDisplayName(key: string): string {
		return modelNames[key] ?? key;
	}

	function formatMs(ms: number): string {
		if (!ms) return '—';
		return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
	}

	function formatNum(value: number): string {
		if (!value) return '0';
		return value.toLocaleString();
	}

	function formatUsd(value: number): string {
		return `$${Number(value ?? 0).toFixed(4)}`;
	}

	async function initCharts(translateFn: (key: I18nKey, params?: Record<string, string | number>) => string) {
		if (!analyticsData) return;
		await tick();
		destroyCharts();

		const { Chart } = await import('chart.js/auto');

		if (modelChartCanvas) Chart.getChart(modelChartCanvas)?.destroy();
		if (userChartCanvas) Chart.getChart(userChartCanvas)?.destroy();

		if (modelChartCanvas && analyticsData.personal.byModel?.length > 0) {
			const byModel = analyticsData.personal.byModel;
			modelChart = new Chart(modelChartCanvas, {
				type: 'doughnut',
				data: {
					labels: byModel.map((row: any) => row.displayName ?? modelDisplayName(row.model)),
					datasets: [{
						data: byModel.map((row: any) => Number(row.msgCount)),
						backgroundColor: CHART_COLORS.slice(0, byModel.length),
						borderWidth: 2,
						borderColor: 'transparent',
						hoverBorderColor: 'rgba(255,255,255,0.6)',
						hoverOffset: 10,
					}],
				},
				options: {
					cutout: '66%',
					maintainAspectRatio: false,
					animation: { animateRotate: true, duration: 700, easing: 'easeInOutQuart' },
					plugins: {
						legend: {
							position: 'bottom',
							labels: { padding: 18, font: { size: 12 }, color: 'rgba(128,128,128,0.9)' },
						},
						tooltip: {
							callbacks: {
								label: (ctx: any) =>
									` ${ctx.label}: ${ctx.raw} ${translateFn('analytics.tooltipMessages')}`,
							},
						},
					},
				},
			});
		}

		if (isAdmin && userChartCanvas && analyticsData.perUser?.length > 0) {
			const top10 = [...analyticsData.perUser]
				.sort((left: any, right: any) => right.messageCount - left.messageCount)
				.slice(0, 10);
			userChart = new Chart(userChartCanvas, {
				type: 'bar',
				data: {
					labels: top10.map((row: any) => row.displayName || row.email),
					datasets: [
						{
							label: translateFn('analytics.chartMessages'),
							data: top10.map((row: any) => row.messageCount),
							backgroundColor: 'rgba(194, 166, 106, 0.8)',
							borderRadius: 4,
						},
						{
							label: translateFn('analytics.chartConversations'),
							data: top10.map((row: any) => row.conversationCount),
							backgroundColor: 'rgba(107, 149, 194, 0.75)',
							borderRadius: 4,
						},
					],
				},
				options: {
					indexAxis: 'y',
					maintainAspectRatio: false,
					animation: { duration: 500 },
					plugins: {
						legend: {
							position: 'top',
							labels: { font: { size: 12 }, color: 'rgba(128,128,128,0.9)', padding: 16 },
						},
					},
					scales: {
						x: {
							grid: { color: 'rgba(128,128,128,0.1)' },
							ticks: { color: 'rgba(128,128,128,0.8)', font: { size: 11 } },
						},
						y: {
							grid: { display: false },
							ticks: { color: 'rgba(128,128,128,0.9)', font: { size: 12 } },
						},
					},
				},
			});
		}
	}

	$effect(() => {
		if (!analyticsData || analyticsLoading || analyticsError) {
			destroyCharts();
			return;
		}

		const translateFn = get(t);
		let cancelled = false;

		void (async () => {
			await tick();
			if (cancelled) return;
			await initCharts(translateFn);
		})();

		return () => {
			cancelled = true;
			destroyCharts();
		};
	});

	onDestroy(() => {
		destroyCharts();
	});
</script>

{#if analyticsLoading}
	<div class="flex items-center justify-center py-16 text-text-muted">{$t('analytics.loadingAnalytics')}</div>
{:else if analyticsError}
	<div class="settings-card">
		<p class="text-danger text-sm">{analyticsError}</p>
		<button class="btn-secondary mt-3" onclick={onRetry}>{$t('analytics.retry')}</button>
	</div>
{:else if analyticsData}
	<section class="settings-card mb-4">
		<h2 class="settings-section-title">{$t('analytics.yourActivity')}</h2>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
			<div class="stat-card">
				<div class="stat-value">{formatNum(analyticsData.personal.totalMessages)}</div>
				<div class="stat-label">{$t('analytics.messagesSent')}</div>
			</div>
			<div class="stat-card">
				<div class="stat-value">{formatMs(analyticsData.personal.avgGenerationMs)}</div>
				<div class="stat-label">{$t('analytics.avgResponseTime')}</div>
			</div>
			<div class="stat-card">
				<div class="stat-value">{formatNum(analyticsData.personal.totalTokens)}</div>
				<div class="stat-label">{$t('analytics.tokensUsed')}</div>
			</div>
			<div class="stat-card">
				<div class="stat-value">{formatUsd(analyticsData.personal.totalCostUsd)}</div>
				<div class="stat-label">{$t('totalCost')}</div>
			</div>
			<div class="stat-card">
				<div class="stat-value">{formatNum(analyticsData.personal.promptTokens)}</div>
				<div class="stat-label">{$t('promptTokens')}</div>
			</div>
			<div class="stat-card">
				<div class="stat-value">{formatNum(analyticsData.personal.cachedInputTokens)}</div>
				<div class="stat-label">{$t('cachedInput')}</div>
			</div>
			<div class="stat-card">
				<div class="stat-value">{formatNum(analyticsData.personal.reasoningTokens)}</div>
				<div class="stat-label">{$t('analytics.reasoningTokens')}</div>
			</div>
			<div class="stat-card">
				<div class="stat-value">
					{analyticsData.personal.favoriteModel
						? modelDisplayName(analyticsData.personal.favoriteModel)
						: '—'}
				</div>
				<div class="stat-label">{$t('analytics.favoriteModel')}</div>
			</div>
			<div class="stat-card">
				<div class="stat-value">{formatNum(analyticsData.personal.chatCount)}</div>
				<div class="stat-label">{$t('analytics.conversations')}</div>
			</div>
		</div>

		{#if analyticsData.personal.byModel?.length > 0}
			<div class="mt-5">
				<p class="settings-label mb-3">{$t('analytics.modelUsage')}</p>
				<div style="max-width: 300px; height: 280px; margin: 0 auto; position: relative;">
					<canvas bind:this={modelChartCanvas} style="display: block; width: 100%; height: 100%;"></canvas>
				</div>
			</div>
		{/if}
	</section>

	{#if isAdmin && analyticsData.system}
		<section class="settings-card mb-4">
			<h2 class="settings-section-title">{$t('analytics.systemOverview')}</h2>
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
				<div class="stat-card">
					<div class="stat-value">{formatNum(analyticsData.system.totalMessages)}</div>
					<div class="stat-label">{$t('analytics.totalMessages')}</div>
				</div>
				<div class="stat-card">
					<div class="stat-value">{formatNum(analyticsData.system.totalUsers)}</div>
					<div class="stat-label">{$t('analytics.totalUsers')}</div>
				</div>
				<div class="stat-card">
					<div class="stat-value">{formatMs(analyticsData.system.avgGenerationMs)}</div>
					<div class="stat-label">{$t('analytics.avgResponseTime')}</div>
				</div>
				<div class="stat-card">
					<div class="stat-value">{formatNum(analyticsData.system.totalTokens)}</div>
					<div class="stat-label">{$t('analytics.totalTokens')}</div>
				</div>
				<div class="stat-card">
					<div class="stat-value">{formatUsd(analyticsData.system.totalCostUsd)}</div>
					<div class="stat-label">{$t('totalCost')}</div>
				</div>
				<div class="stat-card">
					<div class="stat-value">{formatNum(analyticsData.system.promptTokens)}</div>
					<div class="stat-label">{$t('promptTokens')}</div>
				</div>
				<div class="stat-card">
					<div class="stat-value">{formatNum(analyticsData.system.cachedInputTokens)}</div>
					<div class="stat-label">{$t('cachedInput')}</div>
				</div>
				<div class="stat-card">
					<div class="stat-value">{formatNum(analyticsData.system.reasoningTokens)}</div>
					<div class="stat-label">{$t('analytics.reasoningTokens')}</div>
				</div>
				<div class="stat-card">
					<div class="stat-value">{formatNum(analyticsData.system.totalConversations ?? 0)}</div>
					<div class="stat-label">{$t('analytics.totalConversations')}</div>
				</div>
			</div>
		</section>

		{#if analyticsData.perUser?.length > 0}
			<section class="settings-card mb-4">
				<h2 class="settings-section-title">{$t('analytics.userActivity')}</h2>
				<div style={`height: ${Math.min(analyticsData.perUser.slice(0, 10).length * 36 + 60, 420)}px; position: relative;`}>
					<canvas bind:this={userChartCanvas}></canvas>
				</div>
			</section>
		{/if}

		{#if analyticsData.perUser?.length > 0}
			<section class="settings-card mb-4 overflow-x-auto">
				<h2 class="settings-section-title">{$t('analytics.perUserBreakdown')}</h2>
				<table class="analytics-table w-full text-sm">
					<thead>
						<tr class="border-b border-border text-left text-xs text-text-muted">
							<th class="pb-2 pr-3 font-medium">{$t('analytics.user')}</th>
							<th class="pb-2 pr-3 font-medium">{$t('analytics.msgs')}</th>
							<th class="pb-2 pr-3 font-medium">{$t('analytics.avgTime')}</th>
							<th class="pb-2 pr-3 font-medium">{$t('promptTokens')}</th>
							<th class="pb-2 pr-3 font-medium">{$t('outputTokens')}</th>
							<th class="pb-2 pr-3 font-medium">{$t('analytics.reasoning')}</th>
							<th class="pb-2 pr-3 font-medium">{$t('analytics.totalTokens')}</th>
							<th class="pb-2 pr-3 font-medium">{$t('analytics.cost')}</th>
							<th class="pb-2 pr-3 font-medium">{$t('analytics.model')}</th>
							<th class="pb-2 font-medium">{$t('analytics.chats')}</th>
						</tr>
					</thead>
					<tbody>
						{#each analyticsData.perUser as row}
							<tr class="border-b border-border last:border-0">
								<td class="py-2 pr-3">
									<div class="font-medium text-text-primary">{row.displayName}</div>
									<div class="text-xs text-text-muted">{row.email}</div>
								</td>
								<td class="py-2 pr-3 text-text-secondary">{formatNum(row.messageCount)}</td>
								<td class="py-2 pr-3 text-text-secondary">{formatMs(row.avgGenerationMs)}</td>
								<td class="py-2 pr-3 text-text-secondary">{formatNum(row.promptTokens)}</td>
								<td class="py-2 pr-3 text-text-secondary">{formatNum(row.outputTokens)}</td>
								<td class="py-2 pr-3 text-text-secondary">{formatNum(row.reasoningTokens)}</td>
								<td class="py-2 pr-3 text-text-secondary">{formatNum(row.totalTokens)}</td>
								<td class="py-2 pr-3 text-text-secondary">{formatUsd(row.totalCostUsd)}</td>
								<td class="py-2 pr-3 text-text-secondary">
									{row.favoriteModel ? modelDisplayName(row.favoriteModel) : '—'}
								</td>
								<td class="py-2 text-text-secondary">{formatNum(row.conversationCount)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		{/if}
	{/if}
{:else}
	<div class="settings-card py-8 text-center text-sm text-text-muted">{$t('analytics.noData')}</div>
{/if}
