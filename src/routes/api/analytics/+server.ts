import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { db } from '$lib/server/db';
import { analyticsConversations, usageEvents, inferenceProviders } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { isProviderModelId, getProviderIdFromModelId } from '$lib/types';

const MOCK_ANALYTICS = {
	personal: {
		byModel: [
			{ model: 'model1', displayName: 'Model 1', msgCount: 87, totalCostUsd: 1.42 },
			{ model: 'model2', displayName: 'Model 2', msgCount: 34, totalCostUsd: 0.94 },
		],
		totalMessages: 121,
		avgGenerationMs: 2340,
		promptTokens: 35800,
		cachedInputTokens: 5100,
		outputTokens: 48200,
		reasoningTokens: 12400,
		totalTokens: 96400,
		totalCostUsd: 2.36,
		favoriteModel: 'model1',
		chatCount: 18,
		monthly: [{ month: '2026-04', messages: 121, totalTokens: 96400, totalCostUsd: 2.36 }],
	},
	system: {
		totalMessages: 430,
		avgGenerationMs: 2100,
		promptTokens: 132000,
		cachedInputTokens: 18800,
		outputTokens: 176000,
		reasoningTokens: 44000,
		totalTokens: 352000,
		totalCostUsd: 9.8,
		totalUsers: 5,
		totalConversations: 60,
		byModel: [
			{ model: 'model1', displayName: 'Model 1', msgCount: 310, totalCostUsd: 6.1 },
			{ model: 'model2', displayName: 'Model 2', msgCount: 120, totalCostUsd: 3.7 },
		],
		monthly: [{ month: '2026-04', messages: 430, totalTokens: 352000, totalCostUsd: 9.8 }],
	},
	perUser: [
		{ userId: '1', displayName: 'Admin', email: 'admin@demo.com', messageCount: 121, avgGenerationMs: 2340, totalTokens: 96400, promptTokens: 35800, outputTokens: 48200, reasoningTokens: 12400, totalCostUsd: 2.36, favoriteModel: 'model1', conversationCount: 18 },
		{ userId: '2', displayName: 'Alice', email: 'alice@demo.com', messageCount: 95, avgGenerationMs: 1980, totalTokens: 75200, promptTokens: 27600, outputTokens: 38100, reasoningTokens: 9500, totalCostUsd: 1.9, favoriteModel: 'model1', conversationCount: 12 },
	],
};

type UsageRow = typeof usageEvents.$inferSelect;
type ConversationRow = typeof analyticsConversations.$inferSelect;

function usd(micros: number): number {
	return Math.round((micros / 1_000_000) * 10000) / 10000;
}

function average(values: number[]): number {
	const present = values.filter((value) => Number.isFinite(value) && value > 0);
	if (present.length === 0) return 0;
	return present.reduce((sum, value) => sum + value, 0) / present.length;
}

async function modelBreakdown(rows: UsageRow[]) {
	const grouped = new Map<string, {
		model: string;
		displayName: string;
		providerDisplayName: string | null;
		msgCount: number;
		promptTokens: number;
		cachedInputTokens: number;
		outputTokens: number;
		reasoningTokens: number;
		totalTokens: number;
		totalCostMicros: number;
	}>();

	// Collect provider IDs that need display name resolution
	const providerIds = new Set<string>();
	for (const row of rows) {
		if (!row.modelDisplayName && isProviderModelId(row.modelId)) {
			const pid = getProviderIdFromModelId(row.modelId);
			if (pid) providerIds.add(pid);
		}
	}

	// Batch-resolve provider display names from the DB
	const providerNames = new Map<string, string>();
	if (providerIds.size > 0) {
		const providers = await db
			.select({ id: inferenceProviders.id, displayName: inferenceProviders.displayName })
			.from(inferenceProviders)
			.where(inArray(inferenceProviders.id, [...providerIds]));
		for (const p of providers) {
			providerNames.set(p.id, p.displayName);
		}
	}

	for (const row of rows) {
		const key = row.modelId;
		const pid = isProviderModelId(row.modelId) ? getProviderIdFromModelId(row.modelId as any) : null;
		const resolvedName = row.modelDisplayName ?? (pid ? providerNames.get(pid) : null) ?? row.providerModelName ?? row.modelId;
		const current = grouped.get(key) ?? {
			model: row.modelId,
			displayName: resolvedName,
			providerDisplayName: row.providerDisplayName,
			msgCount: 0,
			promptTokens: 0,
			cachedInputTokens: 0,
			outputTokens: 0,
			reasoningTokens: 0,
			totalTokens: 0,
			totalCostMicros: 0,
		};
		current.msgCount += 1;
		current.promptTokens += row.promptTokens;
		current.cachedInputTokens += row.cachedInputTokens;
		current.outputTokens += row.completionTokens;
		current.reasoningTokens += row.reasoningTokens;
		current.totalTokens += row.totalTokens;
		current.totalCostMicros += row.costUsdMicros;
		grouped.set(key, current);
	}

	return [...grouped.values()]
		.map((row) => ({ ...row, totalCostUsd: usd(row.totalCostMicros) }))
		.sort((left, right) => right.msgCount - left.msgCount);
}

function monthlyBreakdown(rows: UsageRow[]) {
	const grouped = new Map<string, {
		month: string;
		messages: number;
		promptTokens: number;
		cachedInputTokens: number;
		outputTokens: number;
		reasoningTokens: number;
		totalTokens: number;
		totalCostMicros: number;
	}>();

	for (const row of rows) {
		const current = grouped.get(row.billingMonth) ?? {
			month: row.billingMonth,
			messages: 0,
			promptTokens: 0,
			cachedInputTokens: 0,
			outputTokens: 0,
			reasoningTokens: 0,
			totalTokens: 0,
			totalCostMicros: 0,
		};
		current.messages += 1;
		current.promptTokens += row.promptTokens;
		current.cachedInputTokens += row.cachedInputTokens;
		current.outputTokens += row.completionTokens;
		current.reasoningTokens += row.reasoningTokens;
		current.totalTokens += row.totalTokens;
		current.totalCostMicros += row.costUsdMicros;
		grouped.set(row.billingMonth, current);
	}

	return [...grouped.values()]
		.map((row) => ({ ...row, totalCostUsd: usd(row.totalCostMicros) }))
		.sort((left, right) => left.month.localeCompare(right.month));
}

async function summarize(rows: UsageRow[], conversations: ConversationRow[]) {
	const byModel = await modelBreakdown(rows);
	const promptTokens = rows.reduce((sum, row) => sum + row.promptTokens, 0);
	const cachedInputTokens = rows.reduce((sum, row) => sum + row.cachedInputTokens, 0);
	const outputTokens = rows.reduce((sum, row) => sum + row.completionTokens, 0);
	const reasoningTokens = rows.reduce((sum, row) => sum + row.reasoningTokens, 0);
	const totalTokens = rows.reduce((sum, row) => sum + row.totalTokens, 0);
	const totalCostMicros = rows.reduce((sum, row) => sum + row.costUsdMicros, 0);

	return {
		byModel,
		totalMessages: rows.length,
		avgGenerationMs: average(rows.map((row) => row.generationTimeMs ?? 0)),
		promptTokens,
		cachedInputTokens,
		outputTokens,
		reasoningTokens,
		totalTokens,
		totalCostUsd: usd(totalCostMicros),
		favoriteModel: byModel[0]?.model ?? null,
		chatCount: new Set(conversations.map((row) => row.conversationId)).size,
		monthly: monthlyBreakdown(rows),
	};
}

export const GET: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const isAdmin = user.role === 'admin';

	if (event.url.searchParams.get('mock') === '1') {
		return json(isAdmin ? MOCK_ANALYTICS : { personal: MOCK_ANALYTICS.personal });
	}

	const [usageRows, conversationRows] = await Promise.all([
		db.select().from(usageEvents),
		db.select().from(analyticsConversations),
	]);

	const personalUsageRows = usageRows.filter((row) => row.userId === user.id);
	const personalConversationRows = conversationRows.filter((row) => row.userId === user.id);
	const personal = await summarize(personalUsageRows, personalConversationRows);

	if (!isAdmin) {
		return json({ personal });
	}

	const system = {
		...(await summarize(usageRows, conversationRows)),
		totalUsers: new Set([
			...usageRows.map((row) => row.userId),
			...conversationRows.map((row) => row.userId),
		]).size,
		totalConversations: new Set(conversationRows.map((row) => row.conversationId)).size,
	};

	const userIds = new Set([
		...usageRows.map((row) => row.userId),
		...conversationRows.map((row) => row.userId),
	]);
	const perUser = (await Promise.all([...userIds]
		.map(async (userId) => {
			const rows = usageRows.filter((row) => row.userId === userId);
			const convRows = conversationRows.filter((row) => row.userId === userId);
			const summary = await summarize(rows, convRows);
			const latestSnapshot = rows[rows.length - 1] ?? null;
			const latestConversationSnapshot = convRows[convRows.length - 1] ?? null;
			return {
				userId,
				displayName:
					latestSnapshot?.userName ??
					latestConversationSnapshot?.userName ??
					latestSnapshot?.userEmail ??
					latestConversationSnapshot?.userEmail ??
					userId,
				email: latestSnapshot?.userEmail ?? latestConversationSnapshot?.userEmail ?? '',
				messageCount: summary.totalMessages,
				avgGenerationMs: summary.avgGenerationMs,
				totalTokens: summary.totalTokens,
				promptTokens: summary.promptTokens,
				cachedInputTokens: summary.cachedInputTokens,
				outputTokens: summary.outputTokens,
				reasoningTokens: summary.reasoningTokens,
				totalCostUsd: summary.totalCostUsd,
				favoriteModel: summary.favoriteModel,
				conversationCount: summary.chatCount,
			};
		})))
		.sort((left, right) => right.messageCount - left.messageCount);

	return json({ personal, system, perUser });
};
