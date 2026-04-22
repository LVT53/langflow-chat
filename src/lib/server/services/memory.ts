import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { getConfig } from "$lib/server/config-store";
import { db } from "$lib/server/db";
import { conversations, personaMemoryOverviews } from "$lib/server/db/schema";
import { DAY_MS } from "$lib/server/utils/constants";
import type {
	KnowledgeMemoryOverviewPayload,
	KnowledgeMemoryOverviewSource,
	KnowledgeMemoryOverviewStatus,
	KnowledgeMemoryPayload,
	KnowledgeMemorySummary,
	PersonaMemoryItem,
} from "$lib/types";
import {
	forgetAllPersonaMemories,
	forgetPersonaMemory,
	getHonchoAssistantPeerId,
	getHonchoUserPeerId,
	getPeerContext,
	isHonchoEnabled,
	rotateHonchoPeerIdentity,
} from "./honcho";
import { runUserMemoryMaintenance } from "./memory-maintenance";
import {
	deleteAllPersonaMemoryStateForUser,
	deletePersonaMemoryAttributionsByConclusionIds,
	deletePersonaMemoryClustersForConclusionIds,
	ensurePersonaMemoryClustersReady,
	getPersonaMemoryClusterConclusionIds,
	listPersonaMemoryClusters,
} from "./persona-memory";
import {
	forgetFocusContinuity,
	forgetTaskMemory,
	listFocusContinuityItems,
	listTaskMemoryItems,
} from "./task-state";

const OVERVIEW_MIN_DURABLE_ITEMS = 2;
const OVERVIEW_RECENT_SITUATIONAL_MS = 21 * DAY_MS;
const OVERVIEW_SECTION_ITEM_LIMIT = 3;
const OVERVIEW_REFRESH_BACKOFF_MS = 30_000;

type CachedKnowledgeOverview = {
	userId: string;
	overviewText: string;
	sourceFingerprint: string;
	generatedAt: number;
	lastAttemptAt: number | null;
	lastFailureAt: number | null;
	lastError: string | null;
	updatedAt: number;
};

type OverviewAttemptState = {
	lastAttemptAt: number | null;
	lastFailureAt: number | null;
	lastError: string | null;
};

type DurableOverviewSelection = {
	overview: string | null;
	durablePersonaCount: number;
	sourceFingerprint: string;
};

type KnowledgeOverviewSelection = {
	overview: string | null;
	overviewSource: KnowledgeMemoryOverviewSource;
	overviewStatus: KnowledgeMemoryOverviewStatus;
	overviewUpdatedAt: number | null;
	overviewLastAttemptAt: number | null;
	durablePersonaCount: number;
};

function logKnowledgeOverviewSelection(params: {
	userId: string;
	selection: KnowledgeOverviewSelection;
}): void {
	const key = `${params.selection.overviewSource}:${params.selection.overviewStatus}:${params.selection.durablePersonaCount}`;
	const prev = lastLoggedSelectionByUser.get(params.userId);
	if (prev === key) return;
	lastLoggedSelectionByUser.set(params.userId, key);
	console.info("[KNOWLEDGE_MEMORY] Selected overview source", {
		userId: params.userId,
		overviewSource: params.selection.overviewSource,
		overviewStatus: params.selection.overviewStatus,
		durablePersonaCount: params.selection.durablePersonaCount,
		overviewUpdatedAt: params.selection.overviewUpdatedAt,
		overviewLastAttemptAt: params.selection.overviewLastAttemptAt,
	});
}

// Memory authority map:
// - persona-memory.ts owns persona/temporal/preference clustering and freshness
// - task-state.ts owns task/workflow continuity
// - document continuity belongs to generated-output and knowledge artifacts, not persona summaries
// - honcho.ts mirrors and enriches, but local memory state remains authoritative for freshness-sensitive truth

type ResolveOverviewOptions = {
	awaitLive?: boolean;
	force?: boolean;
};

const overviewRefreshInFlight = new Map<
	string,
	Promise<CachedKnowledgeOverview | null>
>();
const overviewAttemptStates = new Map<string, OverviewAttemptState>();
const overviewRuntimeEpochByUser = new Map<string, number>();
const lastLoggedSelectionByUser = new Map<string, string>();

export type KnowledgeMemoryAction =
	| {
			action: "forget_persona_memory";
			clusterId?: string;
			conclusionId?: string;
	  }
	| { action: "forget_all_persona_memory" }
	| { action: "forget_task_memory"; taskId: string }
	| { action: "forget_focus_continuity"; continuityId: string };

function getOverviewRuntimeEpoch(userId: string): number {
	return overviewRuntimeEpochByUser.get(userId) ?? 0;
}

function isOverviewRuntimeEpochCurrent(userId: string, epoch: number): boolean {
	return getOverviewRuntimeEpoch(userId) === epoch;
}

export function clearKnowledgeMemoryRuntimeStateForUser(userId: string): void {
	overviewRuntimeEpochByUser.set(userId, getOverviewRuntimeEpoch(userId) + 1);
	overviewRefreshInFlight.delete(userId);
	overviewAttemptStates.delete(userId);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceAllCaseInsensitive(
	text: string,
	needle: string,
	replacement: string,
): string {
	if (!needle.trim()) return text;
	return text.replace(new RegExp(escapeRegExp(needle), "gi"), replacement);
}

function sanitizeMemoryText(
	text: string | null,
	userId: string,
	userDisplayName: string,
): string | null {
	if (!text?.trim()) return text;

	const safeDisplayName = userDisplayName.trim() || "the user";
	const honchoUserPeerId = getHonchoUserPeerId(userId);
	const honchoAssistantPeerId = getHonchoAssistantPeerId(userId);
	let sanitized = text;

	sanitized = sanitized.replace(
		new RegExp(`\\bthe user\\s+${escapeRegExp(userId)}\\b`, "gi"),
		safeDisplayName,
	);
	sanitized = sanitized.replace(
		new RegExp(`\\buser\\s+${escapeRegExp(userId)}\\b`, "gi"),
		safeDisplayName,
	);
	sanitized = sanitized.replace(
		new RegExp(`\\bthe user\\s+${escapeRegExp(honchoUserPeerId)}\\b`, "gi"),
		safeDisplayName,
	);
	sanitized = sanitized.replace(
		new RegExp(`\\buser\\s+${escapeRegExp(honchoUserPeerId)}\\b`, "gi"),
		safeDisplayName,
	);
	sanitized = replaceAllCaseInsensitive(
		sanitized,
		honchoAssistantPeerId,
		"AlfyAI",
	);
	sanitized = replaceAllCaseInsensitive(
		sanitized,
		honchoUserPeerId,
		safeDisplayName,
	);
	sanitized = replaceAllCaseInsensitive(sanitized, userId, safeDisplayName);

	return sanitized;
}

function normalizeOverviewSentence(text: string): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized) return "";
	return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function normalizeForTemporalMatch(text: string): string {
	return text
		.toLowerCase()
		.replace(/\s+/g, " ")
		.replace(/[.!?]+$/g, "")
		.trim();
}

function withoutLeadingActor(text: string): string {
	return text
		.replace(/^(?:the user|user|he|she|they)\s+(?:is|was|has|had)\s+/i, "")
		.trim();
}

function mentionsExpiredTemporalMemory(
	overviewText: string,
	personaMemories: PersonaMemoryItem[],
): boolean {
	const normalizedOverview = normalizeForTemporalMatch(overviewText);
	if (!normalizedOverview) return false;

	return personaMemories.some((memory) => {
		if (
			memory.temporal?.freshness !== "expired" &&
			memory.temporal?.freshness !== "historical"
		) {
			return false;
		}

		const candidates = [memory.rawCanonicalText, memory.canonicalText]
			.filter((value): value is string => Boolean(value))
			.flatMap((value) => {
				const normalized = normalizeForTemporalMatch(value);
				const actorless = normalizeForTemporalMatch(withoutLeadingActor(value));
				return actorless && actorless !== normalized
					? [normalized, actorless]
					: [normalized];
			})
			.filter((value) => value.length >= 12);

		return candidates.some((candidate) =>
			normalizedOverview.includes(candidate),
		);
	});
}

function isDurableOverviewCandidate(
	memory: PersonaMemoryItem,
	now = Date.now(),
): boolean {
	if (memory.state === "archived") return false;
	if (memory.topicStatus === "historical") return false;
	if (
		memory.temporal?.freshness === "expired" ||
		memory.temporal?.freshness === "historical"
	) {
		return false;
	}

	switch (memory.memoryClass) {
		case "perishable_fact":
			return false;
		case "short_term_constraint":
			return memory.state === "active" && Boolean(memory.activeConstraint);
		case "active_project_context":
			return (
				memory.state === "active" ||
				(memory.state === "dormant" &&
					now - memory.lastSeenAt <= OVERVIEW_RECENT_SITUATIONAL_MS &&
					memory.salienceScore >= 54)
			);
		case "situational_context":
			return (
				memory.state === "active" &&
				now - memory.lastSeenAt <= OVERVIEW_RECENT_SITUATIONAL_MS &&
				memory.salienceScore >= 52
			);
		case "long_term_context":
			return (
				memory.pinned || memory.state === "active" || memory.salienceScore >= 58
			);
		case "stable_preference":
		case "identity_profile":
			return true;
	}
}

function sortOverviewMemories(
	left: PersonaMemoryItem,
	right: PersonaMemoryItem,
): number {
	const stateRank = (state: PersonaMemoryItem["state"]) =>
		state === "active" ? 0 : state === "dormant" ? 1 : 2;
	return (
		stateRank(left.state) - stateRank(right.state) ||
		Number(right.pinned) - Number(left.pinned) ||
		right.salienceScore - left.salienceScore ||
		right.lastSeenAt - left.lastSeenAt
	);
}

function buildOverviewSection(
	title: string,
	memories: PersonaMemoryItem[],
): string | null {
	if (memories.length === 0) return null;
	const items = memories
		.slice()
		.sort(sortOverviewMemories)
		.slice(0, OVERVIEW_SECTION_ITEM_LIMIT)
		.map((memory) => `- ${normalizeOverviewSentence(memory.canonicalText)}`);

	return `### ${title}\n${items.join("\n")}`;
}

function selectActiveConstraintMemories(
	personaMemories: PersonaMemoryItem[],
): PersonaMemoryItem[] {
	return personaMemories.filter(
		(memory) =>
			memory.memoryClass === "short_term_constraint" &&
			memory.state === "active" &&
			Boolean(memory.activeConstraint) &&
			memory.temporal?.freshness !== "expired" &&
			memory.temporal?.freshness !== "historical",
	);
}

function selectCurrentProjectContextMemories(
	personaMemories: PersonaMemoryItem[],
): PersonaMemoryItem[] {
	return personaMemories.filter((memory) => {
		if (
			memory.temporal?.freshness === "expired" ||
			memory.temporal?.freshness === "historical"
		) {
			return false;
		}

		if (memory.memoryClass === "active_project_context") {
			return memory.state === "active" || memory.state === "dormant";
		}

		return (
			memory.memoryClass === "situational_context" && memory.state === "active"
		);
	});
}

function createOverviewFingerprint(memories: PersonaMemoryItem[]): string {
	const payload = memories
		.slice()
		.sort(
			(left, right) =>
				left.id.localeCompare(right.id) ||
				left.lastSeenAt - right.lastSeenAt ||
				left.salienceScore - right.salienceScore,
		)
		.map((memory) => ({
			id: memory.id,
			canonicalText: memory.canonicalText.trim().toLowerCase(),
			memoryClass: memory.memoryClass,
			state: memory.state,
			salienceScore: memory.salienceScore,
			pinned: memory.pinned,
			lastSeenAt: memory.lastSeenAt,
		}));

	return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function buildLocalPersonaOverview(
	personaMemories: PersonaMemoryItem[],
): DurableOverviewSelection {
	const durableMemories = personaMemories.filter((memory) =>
		isDurableOverviewCandidate(memory),
	);
	const activeConstraints = selectActiveConstraintMemories(durableMemories);
	const currentProjectContext =
		selectCurrentProjectContextMemories(durableMemories);
	const durablePersonaCount = durableMemories.length;
	const sourceFingerprint = createOverviewFingerprint(durableMemories);
	if (durablePersonaCount < OVERVIEW_MIN_DURABLE_ITEMS) {
		return { overview: null, durablePersonaCount, sourceFingerprint };
	}

	const sections = [
		buildOverviewSection("Active Constraints", activeConstraints),
		buildOverviewSection("Current Project Context", currentProjectContext),
		buildOverviewSection(
			"Stable Preferences",
			durableMemories.filter(
				(memory) => memory.memoryClass === "stable_preference",
			),
		),
		buildOverviewSection(
			"Identity And Profile",
			durableMemories.filter(
				(memory) => memory.memoryClass === "identity_profile",
			),
		),
		buildOverviewSection(
			"Long-Term Context",
			durableMemories.filter(
				(memory) => memory.memoryClass === "long_term_context",
			),
		),
	].filter((section): section is string => Boolean(section));

	return {
		overview: sections.length > 0 ? sections.join("\n\n") : null,
		durablePersonaCount,
		sourceFingerprint,
	};
}

function getOverviewAttemptState(
	userId: string,
	cachedOverview: CachedKnowledgeOverview | null,
): OverviewAttemptState {
	const transient = overviewAttemptStates.get(userId) ?? {
		lastAttemptAt: null,
		lastFailureAt: null,
		lastError: null,
	};
	if (!cachedOverview) return transient;

	return {
		lastAttemptAt: cachedOverview.lastAttemptAt ?? transient.lastAttemptAt,
		lastFailureAt: cachedOverview.lastFailureAt ?? transient.lastFailureAt,
		lastError: cachedOverview.lastError ?? transient.lastError,
	};
}

function updateOverviewAttemptState(
	userId: string,
	state: Partial<OverviewAttemptState>,
): void {
	const current = overviewAttemptStates.get(userId) ?? {
		lastAttemptAt: null,
		lastFailureAt: null,
		lastError: null,
	};
	overviewAttemptStates.set(userId, {
		lastAttemptAt: state.lastAttemptAt ?? current.lastAttemptAt,
		lastFailureAt: Object.hasOwn(state, "lastFailureAt")
			? (state.lastFailureAt ?? null)
			: current.lastFailureAt,
		lastError: Object.hasOwn(state, "lastError")
			? (state.lastError ?? null)
			: current.lastError,
	});
}

async function getCachedKnowledgeOverview(
	userId: string,
): Promise<CachedKnowledgeOverview | null> {
	const rows = await db
		.select()
		.from(personaMemoryOverviews)
		.where(eq(personaMemoryOverviews.userId, userId));
	const row = rows[0];
	if (!row) return null;

	return {
		userId: row.userId,
		overviewText: row.overviewText,
		sourceFingerprint: row.sourceFingerprint,
		generatedAt: row.generatedAt.getTime(),
		lastAttemptAt: row.lastAttemptAt?.getTime() ?? null,
		lastFailureAt: row.lastFailureAt?.getTime() ?? null,
		lastError: row.lastError ?? null,
		updatedAt: row.updatedAt.getTime(),
	};
}

async function upsertCachedKnowledgeOverview(params: {
	userId: string;
	overviewText: string;
	sourceFingerprint: string;
	generatedAt: number;
	lastAttemptAt: number;
	lastFailureAt: number | null;
	lastError: string | null;
}): Promise<CachedKnowledgeOverview> {
	const now = new Date();
	await db
		.insert(personaMemoryOverviews)
		.values({
			userId: params.userId,
			overviewText: params.overviewText,
			sourceFingerprint: params.sourceFingerprint,
			generatedAt: new Date(params.generatedAt),
			lastAttemptAt: new Date(params.lastAttemptAt),
			lastFailureAt: params.lastFailureAt
				? new Date(params.lastFailureAt)
				: null,
			lastError: params.lastError,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: personaMemoryOverviews.userId,
			set: {
				overviewText: params.overviewText,
				sourceFingerprint: params.sourceFingerprint,
				generatedAt: new Date(params.generatedAt),
				lastAttemptAt: new Date(params.lastAttemptAt),
				lastFailureAt: params.lastFailureAt
					? new Date(params.lastFailureAt)
					: null,
				lastError: params.lastError,
				updatedAt: now,
			},
		});

	return {
		userId: params.userId,
		overviewText: params.overviewText,
		sourceFingerprint: params.sourceFingerprint,
		generatedAt: params.generatedAt,
		lastAttemptAt: params.lastAttemptAt,
		lastFailureAt: params.lastFailureAt,
		lastError: params.lastError,
		updatedAt: now.getTime(),
	};
}

async function recordKnowledgeOverviewFailure(params: {
	userId: string;
	lastAttemptAt: number;
	errorMessage: string;
	cachedOverview: CachedKnowledgeOverview | null;
}): Promise<void> {
	updateOverviewAttemptState(params.userId, {
		lastAttemptAt: params.lastAttemptAt,
		lastFailureAt: params.lastAttemptAt,
		lastError: params.errorMessage,
	});

	if (!params.cachedOverview) return;

	await db
		.update(personaMemoryOverviews)
		.set({
			lastAttemptAt: new Date(params.lastAttemptAt),
			lastFailureAt: new Date(params.lastAttemptAt),
			lastError: params.errorMessage,
			updatedAt: new Date(),
		})
		.where(eq(personaMemoryOverviews.userId, params.userId));
}

function startBackgroundPersonaRefresh(userId: string, reason: string): void {
	void ensurePersonaMemoryClustersReady(userId, reason).catch((error) => {
		console.warn(
			"[KNOWLEDGE_MEMORY] Background persona cluster refresh failed",
			{
				userId,
				reason,
				error,
			},
		);
	});
}

function shouldStartOverviewRefresh(params: {
	userId: string;
	force?: boolean;
	cachedOverview: CachedKnowledgeOverview | null;
}): boolean {
	if (!isHonchoEnabled()) return false;
	if (overviewRefreshInFlight.has(params.userId)) return false;
	if (params.force) return true;

	const attemptState = getOverviewAttemptState(
		params.userId,
		params.cachedOverview,
	);
	const lastAttemptAt = attemptState.lastAttemptAt ?? 0;
	return Date.now() - lastAttemptAt >= OVERVIEW_REFRESH_BACKOFF_MS;
}

async function refreshKnowledgeOverview(params: {
	userId: string;
	userDisplayName: string;
	sourceFingerprint: string;
	personaMemories: PersonaMemoryItem[];
	force?: boolean;
}): Promise<CachedKnowledgeOverview | null> {
	const durableOverview = buildLocalPersonaOverview(params.personaMemories);
	if (durableOverview.durablePersonaCount < OVERVIEW_MIN_DURABLE_ITEMS) {
		return null;
	}

	const existing = overviewRefreshInFlight.get(params.userId);
	if (existing) return existing;

	const refresh = (async () => {
		const runtimeEpoch = getOverviewRuntimeEpoch(params.userId);
		const startedAt = Date.now();
		const cachedOverview = await getCachedKnowledgeOverview(params.userId);
		if (!isOverviewRuntimeEpochCurrent(params.userId, runtimeEpoch)) {
			return null;
		}
		updateOverviewAttemptState(params.userId, {
			lastAttemptAt: startedAt,
			lastError: null,
		});

		// Overview timeout is configurable via HONCHO_OVERVIEW_WAIT_MS (default 10s).
		// If Honcho is slow, this times out gracefully and falls back to the cached
		// or local persona overview. Increase the env var if timeouts are frequent.
		try {
			const liveOverview = await getPeerContext(
				params.userId,
				params.userDisplayName,
				{
					timeoutMs: Math.max(1, getConfig().honchoOverviewWaitMs),
				},
			);
			const normalizedOverview =
				sanitizeMemoryText(
					liveOverview,
					params.userId,
					params.userDisplayName,
				)?.trim() ?? "";

			if (!normalizedOverview) {
				await recordKnowledgeOverviewFailure({
					userId: params.userId,
					lastAttemptAt: startedAt,
					errorMessage: "empty_live_overview",
					cachedOverview,
				});
				console.warn(
					"[KNOWLEDGE_MEMORY] Live Honcho overview returned no text",
					{
						userId: params.userId,
						durationMs: Date.now() - startedAt,
						sourceServed: cachedOverview ? "cache" : "fallback",
					},
				);
				return null;
			}
			if (
				mentionsExpiredTemporalMemory(
					normalizedOverview,
					params.personaMemories,
				)
			) {
				await recordKnowledgeOverviewFailure({
					userId: params.userId,
					lastAttemptAt: startedAt,
					errorMessage: "stale_temporal_live_overview",
					cachedOverview,
				});
				console.warn(
					"[KNOWLEDGE_MEMORY] Rejected stale Honcho overview with expired temporal memory",
					{
						userId: params.userId,
						durationMs: Date.now() - startedAt,
					},
				);
				return null;
			}
			if (!isOverviewRuntimeEpochCurrent(params.userId, runtimeEpoch)) {
				return null;
			}

			const nextCachedOverview = await upsertCachedKnowledgeOverview({
				userId: params.userId,
				overviewText: normalizedOverview,
				sourceFingerprint: params.sourceFingerprint,
				generatedAt: Date.now(),
				lastAttemptAt: startedAt,
				lastFailureAt: null,
				lastError: null,
			});
			updateOverviewAttemptState(params.userId, {
				lastAttemptAt: nextCachedOverview.lastAttemptAt,
				lastFailureAt: null,
				lastError: null,
			});
			console.info("[KNOWLEDGE_MEMORY] Refreshed live Honcho overview", {
				userId: params.userId,
				durationMs: Date.now() - startedAt,
				sourceServed: "live",
				cacheAgeMs: 0,
				fingerprintMatch: true,
			});
			return nextCachedOverview;
		} catch (error) {
			if (!isOverviewRuntimeEpochCurrent(params.userId, runtimeEpoch)) {
				return null;
			}
			const errorMessage =
				error instanceof Error
					? error.message
					: "unknown_honcho_overview_error";
			await recordKnowledgeOverviewFailure({
				userId: params.userId,
				lastAttemptAt: startedAt,
				errorMessage,
				cachedOverview,
			});
			console.warn("[KNOWLEDGE_MEMORY] Live Honcho overview refresh failed", {
				userId: params.userId,
				durationMs: Date.now() - startedAt,
				error: errorMessage,
				sourceServed: cachedOverview ? "cache" : "fallback",
				cacheAgeMs: cachedOverview
					? Date.now() - cachedOverview.generatedAt
					: null,
				fingerprintMatch:
					cachedOverview?.sourceFingerprint === params.sourceFingerprint,
			});
			return null;
		}
	})().finally(() => {
		overviewRefreshInFlight.delete(params.userId);
	});

	overviewRefreshInFlight.set(params.userId, refresh);
	return refresh;
}

async function selectKnowledgeOverview(params: {
	userId: string;
	userDisplayName: string;
	personaMemories: PersonaMemoryItem[];
	awaitLive?: boolean;
	force?: boolean;
}): Promise<KnowledgeOverviewSelection> {
	const honchoEnabled = isHonchoEnabled();
	const fallback = buildLocalPersonaOverview(params.personaMemories);

	if (!honchoEnabled) {
		const selection = {
			overview: fallback.overview,
			overviewSource: fallback.overview ? "persona_fallback" : null,
			overviewStatus: "disabled",
			overviewUpdatedAt: null,
			overviewLastAttemptAt: null,
			durablePersonaCount: fallback.durablePersonaCount,
		};
		logKnowledgeOverviewSelection({ userId: params.userId, selection });
		return selection;
	}

	let cachedOverview = await getCachedKnowledgeOverview(params.userId);
	const attemptState = getOverviewAttemptState(params.userId, cachedOverview);
	if (fallback.durablePersonaCount < OVERVIEW_MIN_DURABLE_ITEMS) {
		const selection = {
			overview: null,
			overviewSource: null,
			overviewStatus: "not_enough_durable_memory",
			overviewUpdatedAt: null,
			overviewLastAttemptAt: attemptState.lastAttemptAt,
			durablePersonaCount: fallback.durablePersonaCount,
		};
		logKnowledgeOverviewSelection({ userId: params.userId, selection });
		return selection;
	}

	const hasMatchingCache = Boolean(
		cachedOverview?.overviewText.trim() &&
			cachedOverview.sourceFingerprint === fallback.sourceFingerprint,
	);
	let refreshPromise: Promise<CachedKnowledgeOverview | null> | null = null;
	const shouldRefresh = shouldStartOverviewRefresh({
		userId: params.userId,
		force: params.force,
		cachedOverview,
	});

	if (shouldRefresh) {
		refreshPromise = refreshKnowledgeOverview({
			userId: params.userId,
			userDisplayName: params.userDisplayName,
			sourceFingerprint: fallback.sourceFingerprint,
			personaMemories: params.personaMemories,
			force: params.force,
		});
	} else if (overviewRefreshInFlight.has(params.userId)) {
		refreshPromise = overviewRefreshInFlight.get(params.userId) ?? null;
	}

	if (params.awaitLive && refreshPromise) {
		const refreshedOverview = await refreshPromise;
		if (
			refreshedOverview?.overviewText.trim() &&
			!mentionsExpiredTemporalMemory(
				refreshedOverview.overviewText,
				params.personaMemories,
			)
		) {
			cachedOverview = refreshedOverview;
			if (refreshedOverview.sourceFingerprint === fallback.sourceFingerprint) {
				const selection = {
					overview: refreshedOverview.overviewText,
					overviewSource: "honcho_live",
					overviewStatus: "ready",
					overviewUpdatedAt: refreshedOverview.generatedAt,
					overviewLastAttemptAt: refreshedOverview.lastAttemptAt,
					durablePersonaCount: fallback.durablePersonaCount,
				};
				logKnowledgeOverviewSelection({ userId: params.userId, selection });
				return selection;
			}
		}
	}

	if (
		hasMatchingCache &&
		cachedOverview &&
		!mentionsExpiredTemporalMemory(
			cachedOverview.overviewText,
			params.personaMemories,
		)
	) {
		const selection = {
			overview: cachedOverview.overviewText,
			overviewSource: "honcho_cache",
			overviewStatus: "refreshing",
			overviewUpdatedAt: cachedOverview.generatedAt,
			overviewLastAttemptAt: attemptState.lastAttemptAt,
			durablePersonaCount: fallback.durablePersonaCount,
		};
		logKnowledgeOverviewSelection({ userId: params.userId, selection });
		return selection;
	}

	if (fallback.overview) {
		const selection = {
			overview: fallback.overview,
			overviewSource: "persona_fallback",
			overviewStatus: "refreshing",
			overviewUpdatedAt: null,
			overviewLastAttemptAt: attemptState.lastAttemptAt,
			durablePersonaCount: fallback.durablePersonaCount,
		};
		logKnowledgeOverviewSelection({ userId: params.userId, selection });
		return selection;
	}

	const selection = {
		overview: null,
		overviewSource: null,
		overviewStatus:
			fallback.durablePersonaCount >= OVERVIEW_MIN_DURABLE_ITEMS
				? "temporarily_unavailable"
				: "not_enough_durable_memory",
		overviewUpdatedAt: null,
		overviewLastAttemptAt: attemptState.lastAttemptAt,
		durablePersonaCount: fallback.durablePersonaCount,
	};
	logKnowledgeOverviewSelection({ userId: params.userId, selection });
	return selection;
}

async function enrichPersonaMemories(
	userId: string,
	userDisplayName: string,
): Promise<PersonaMemoryItem[]> {
	const records = await listPersonaMemoryClusters(userId);
	const conversationIds = Array.from(
		new Set(
			records.flatMap((record) =>
				record.members
					.map((member) => member.sessionId)
					.filter((sessionId): sessionId is string => Boolean(sessionId)),
			),
		),
	);

	const titleRows =
		conversationIds.length > 0
			? await db
					.select({
						id: conversations.id,
						title: conversations.title,
					})
					.from(conversations)
					.where(inArray(conversations.id, conversationIds))
			: [];
	const titleMap = new Map(titleRows.map((row) => [row.id, row.title]));

	return records.map((record) => ({
		...record,
		canonicalText:
			sanitizeMemoryText(record.canonicalText, userId, userDisplayName) ??
			record.canonicalText,
		rawCanonicalText: record.rawCanonicalText
			? (sanitizeMemoryText(record.rawCanonicalText, userId, userDisplayName) ??
				record.rawCanonicalText)
			: record.rawCanonicalText,
		conversationTitles: record.conversationTitles.map(
			(title) => sanitizeMemoryText(title, userId, userDisplayName) ?? title,
		),
		members: record.members.map((member) => ({
			...member,
			content:
				sanitizeMemoryText(member.content, userId, userDisplayName) ??
				member.content,
			conversationTitle: member.sessionId
				? (titleMap.get(member.sessionId) ?? member.conversationTitle)
				: member.conversationTitle,
		})),
	}));
}

function buildKnowledgeMemorySummary(
	overview: KnowledgeOverviewSelection,
	personaCount: number,
	activeConstraintCount: number,
	currentProjectContextCount: number,
	taskCount: number,
	focusContinuityCount: number,
): KnowledgeMemorySummary {
	return {
		personaCount,
		taskCount,
		focusContinuityCount,
		activeConstraintCount,
		currentProjectContextCount,
		overview: overview.overview,
		overviewSource: overview.overviewSource,
		overviewStatus: overview.overviewStatus,
		overviewUpdatedAt: overview.overviewUpdatedAt,
		overviewLastAttemptAt: overview.overviewLastAttemptAt,
		durablePersonaCount: overview.durablePersonaCount,
	};
}

export async function getKnowledgeMemory(
	userId: string,
	userDisplayName: string,
): Promise<KnowledgeMemoryPayload> {
	startBackgroundPersonaRefresh(userId, "knowledge_read");

	const [personaMemories, taskMemories, focusContinuities] = await Promise.all([
		enrichPersonaMemories(userId, userDisplayName),
		listTaskMemoryItems(userId),
		listFocusContinuityItems(userId),
	]);
	const overviewSummary = await selectKnowledgeOverview({
		userId,
		userDisplayName,
		personaMemories,
		awaitLive: false,
	});
	const activeConstraints = selectActiveConstraintMemories(personaMemories);
	const currentProjectContext =
		selectCurrentProjectContextMemories(personaMemories);

	return {
		personaMemories,
		activeConstraints,
		currentProjectContext,
		taskMemories: taskMemories.map((taskMemory) => ({
			...taskMemory,
			objective:
				sanitizeMemoryText(taskMemory.objective, userId, userDisplayName) ??
				taskMemory.objective,
			checkpointSummary: sanitizeMemoryText(
				taskMemory.checkpointSummary,
				userId,
				userDisplayName,
			),
		})),
		focusContinuities: focusContinuities.map((continuity) => ({
			...continuity,
			name:
				sanitizeMemoryText(continuity.name, userId, userDisplayName) ??
				continuity.name,
			summary: sanitizeMemoryText(continuity.summary, userId, userDisplayName),
			conversationTitles: continuity.conversationTitles.map(
				(title) => sanitizeMemoryText(title, userId, userDisplayName) ?? title,
			),
		})),
		summary: buildKnowledgeMemorySummary(
			overviewSummary,
			personaMemories.length,
			activeConstraints.length,
			currentProjectContext.length,
			taskMemories.length,
			focusContinuities.length,
		),
	};
}

export async function getKnowledgeMemoryOverview(
	userId: string,
	userDisplayName: string,
	options: ResolveOverviewOptions = {},
): Promise<KnowledgeMemoryOverviewPayload> {
	startBackgroundPersonaRefresh(userId, "knowledge_overview_read");
	const personaMemories = await enrichPersonaMemories(userId, userDisplayName);
	const overviewSummary = await selectKnowledgeOverview({
		userId,
		userDisplayName,
		personaMemories,
		// Default to non-blocking for client polls; background refresh
		// updates the cache asynchronously. Callers may pass true to
		// await the live result (used in tests and internal paths).
		awaitLive: options.awaitLive ?? false,
		force: options.force ?? false,
	});

	return {
		summary: buildKnowledgeMemorySummary(
			overviewSummary,
			personaMemories.length,
			selectActiveConstraintMemories(personaMemories).length,
			selectCurrentProjectContextMemories(personaMemories).length,
			0,
			0,
		),
	};
}

export async function applyKnowledgeMemoryAction(
	userId: string,
	userDisplayName: string,
	payload: KnowledgeMemoryAction,
): Promise<KnowledgeMemoryPayload> {
	switch (payload.action) {
		case "forget_persona_memory":
			clearKnowledgeMemoryRuntimeStateForUser(userId);
			if (typeof payload.clusterId === "string") {
				const conclusionIds = await getPersonaMemoryClusterConclusionIds(
					userId,
					payload.clusterId,
				);
				for (const conclusionId of conclusionIds) {
					await forgetPersonaMemory(userId, conclusionId);
					await deletePersonaMemoryAttributionsByConclusionIds(userId, [
						conclusionId,
					]);
				}
				await deletePersonaMemoryClustersForConclusionIds(
					userId,
					conclusionIds,
				);
			} else if (typeof payload.conclusionId === "string") {
				await forgetPersonaMemory(userId, payload.conclusionId);
				await deletePersonaMemoryAttributionsByConclusionIds(userId, [
					payload.conclusionId,
				]);
				await deletePersonaMemoryClustersForConclusionIds(userId, [
					payload.conclusionId,
				]);
			}
			break;
		case "forget_all_persona_memory":
			clearKnowledgeMemoryRuntimeStateForUser(userId);
			await forgetAllPersonaMemories(userId);
			await deleteAllPersonaMemoryStateForUser(userId);
			await rotateHonchoPeerIdentity(userId);
			break;
		case "forget_task_memory":
			await forgetTaskMemory(userId, payload.taskId);
			break;
		case "forget_focus_continuity":
			await forgetFocusContinuity(userId, payload.continuityId);
			break;
	}

	await runUserMemoryMaintenance(userId, `knowledge_memory:${payload.action}`);
	return getKnowledgeMemory(userId, userDisplayName);
}
