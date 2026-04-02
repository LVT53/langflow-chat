import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { db } from '$lib/server/db';
import { artifacts, knowledgeVaults } from '$lib/server/db/schema';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

const TOTAL_STORAGE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;
const WARNING_THRESHOLD_PERCENT = 80;

interface VaultQuota {
	vaultId: string;
	vaultName: string;
	fileCount: number;
	storageUsed: number;
}

interface StorageQuotaResponse {
	totalStorageUsed: number;
	totalFiles: number;
	storageLimit: number;
	usagePercent: number;
	isWarning: boolean;
	warningThreshold: number;
	vaults: VaultQuota[];
}

export const GET: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;

	const [totalsResult] = await db
		.select({
			totalStorage: sql<number>`COALESCE(SUM(${artifacts.sizeBytes}), 0)`,
			totalFiles: sql<number>`COUNT(*)`,
		})
		.from(artifacts)
		.where(
			and(
				eq(artifacts.userId, user.id),
				isNotNull(artifacts.vaultId)
			)
		);

	const totalStorageUsed = Number(totalsResult?.totalStorage ?? 0);
	const totalFiles = Number(totalsResult?.totalFiles ?? 0);

	const vaultStats = await db
		.select({
			vaultId: artifacts.vaultId,
			fileCount: sql<number>`COUNT(*)`,
			storageUsed: sql<number>`COALESCE(SUM(${artifacts.sizeBytes}), 0)`,
		})
		.from(artifacts)
		.where(
			and(
				eq(artifacts.userId, user.id),
				isNotNull(artifacts.vaultId)
			)
		)
		.groupBy(artifacts.vaultId);

	const vaultIds = vaultStats.map((stat) => stat.vaultId).filter((id): id is string => id !== null);

	let vaultNamesMap = new Map<string, string>();
	if (vaultIds.length > 0) {
		const vaultRows = await db
			.select({
				id: knowledgeVaults.id,
				name: knowledgeVaults.name,
			})
			.from(knowledgeVaults)
			.where(
				and(
					eq(knowledgeVaults.userId, user.id),
					sql`${knowledgeVaults.id} IN (${sql.join(vaultIds.map((id) => sql`${id}`))})`
				)
			);

		vaultNamesMap = new Map(vaultRows.map((row) => [row.id, row.name]));
	}

	const vaults: VaultQuota[] = vaultStats.map((stat) => ({
		vaultId: stat.vaultId!,
		vaultName: vaultNamesMap.get(stat.vaultId!) ?? 'Unknown Vault',
		fileCount: Number(stat.fileCount),
		storageUsed: Number(stat.storageUsed),
	}));

	const usagePercent = (totalStorageUsed / TOTAL_STORAGE_LIMIT_BYTES) * 100;
	const isWarning = usagePercent >= WARNING_THRESHOLD_PERCENT;

	const response: StorageQuotaResponse = {
		totalStorageUsed,
		totalFiles,
		storageLimit: TOTAL_STORAGE_LIMIT_BYTES,
		usagePercent: Math.round(usagePercent * 100) / 100,
		isWarning,
		warningThreshold: WARNING_THRESHOLD_PERCENT,
		vaults,
	};

	return json(response);
};
