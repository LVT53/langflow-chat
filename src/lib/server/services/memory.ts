import { getConfig } from "$lib/server/config-store";
import type {
	KnowledgeMemoryAction,
	KnowledgeMemoryOverviewPayload,
	KnowledgeMemoryPayload,
	KnowledgeMemorySummary,
} from "$lib/types";
import {
	forgetAllPersonaMemories,
	forgetPersonaMemory,
	getPeerContext,
	isHonchoEnabled,
} from "./honcho";
import {
	forgetFocusContinuity,
	forgetTaskMemory,
	listFocusContinuityItems,
	listTaskMemoryItems,
} from "./task-state";

function buildKnowledgeMemorySummary(
	overview: string | null,
	personaCount: number,
	activeConstraintCount: number,
	currentProjectContextCount: number,
	taskCount: number,
	focusContinuityCount: number,
): {
	personaCount: number;
	taskCount: number;
	focusContinuityCount: number;
	activeConstraintCount: number;
	currentProjectContextCount: number;
	overview: string | null;
	overviewSource: "honcho_live" | null;
	overviewStatus: "ready" | "disabled";
	overviewUpdatedAt: number | null;
	overviewLastAttemptAt: number | null;
	durablePersonaCount: number;
} {
	const hasOverview = Boolean(overview?.trim());
	return {
		personaCount,
		taskCount,
		focusContinuityCount,
		activeConstraintCount,
		currentProjectContextCount,
		overview: hasOverview ? overview!.trim() : null,
		overviewSource: hasOverview ? "honcho_live" : null,
		overviewStatus: isHonchoEnabled() ? "ready" : "disabled",
		overviewUpdatedAt: hasOverview ? Date.now() : null,
		overviewLastAttemptAt: hasOverview ? Date.now() : null,
		durablePersonaCount: 0,
	};
}

export async function getKnowledgeMemory(
	userId: string,
	userDisplayName: string,
): Promise<KnowledgeMemoryPayload> {
	const [peerContext, taskMemories, focusContinuities] = await Promise.all([
		getPeerContext(userId, userDisplayName, { timeoutMs: getConfig().honchoPersonaContextWaitMs }),
		listTaskMemoryItems(userId),
		listFocusContinuityItems(userId),
	]);

	return {
		personaMemories: [],
		activeConstraints: [],
		currentProjectContext: [],
		taskMemories: taskMemories.map((taskMemory) => ({
			...taskMemory,
			objective: taskMemory.objective,
			checkpointSummary: taskMemory.checkpointSummary,
		})),
		focusContinuities: focusContinuities.map((continuity) => ({
			...continuity,
			name: continuity.name,
			summary: continuity.summary,
			conversationTitles: continuity.conversationTitles,
		})),
		summary: buildKnowledgeMemorySummary(
			peerContext,
			0,
			0,
			0,
			taskMemories.length,
			focusContinuities.length,
		),
	};
}

export async function getKnowledgeMemoryOverview(
	userId: string,
	userDisplayName: string,
	_options: { awaitLive?: boolean; force?: boolean } = {},
): Promise<KnowledgeMemoryOverviewPayload> {
	const peerContext = await getPeerContext(userId, userDisplayName, {
		timeoutMs: getConfig().honchoPersonaContextWaitMs,
	});

	return {
		summary: buildKnowledgeMemorySummary(
			peerContext,
			0,
			0,
			0,
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
		case "forget_persona_memory": {
			if (typeof payload.conclusionId === "string") {
				await forgetPersonaMemory(userId, payload.conclusionId);
			}
			console.info("[KNOWLEDGE_MEMORY] forget_persona_memory is a no-op with local clusters removed; delegated to Honcho");
			break;
		}
		case "forget_all_persona_memory": {
			await forgetAllPersonaMemories(userId);
			console.info("[KNOWLEDGE_MEMORY] forget_all_persona_memory delegated to Honcho");
			break;
		}
		case "forget_task_memory":
			await forgetTaskMemory(userId, payload.taskId);
			break;
		case "forget_focus_continuity":
			await forgetFocusContinuity(userId, payload.continuityId);
			break;
		case "forget_project_memory":
			await forgetFocusContinuity(userId, payload.projectId);
			break;
	}

	return getKnowledgeMemory(userId, userDisplayName);
}
