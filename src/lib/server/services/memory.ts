import { getConfig } from "$lib/server/config-store";
import type {
	KnowledgeMemoryAction,
	KnowledgeMemoryOverviewPayload,
	KnowledgeMemoryPayload,
	KnowledgeMemorySummary,
	PersonaMemoryItem,
} from "$lib/types";
import {
	forgetAllPersonaMemories,
	forgetPersonaMemory,
	getPeerContext,
	type HonchoPersonaMemoryRecord,
	isHonchoEnabled,
	listPersonaMemories,
	rotateHonchoPeerIdentity,
} from "./honcho";
import { buildKnowledgeMemoryOverview } from "./knowledge/memory-overview";
import {
	forgetFocusContinuity,
	forgetTaskMemory,
	listFocusContinuityItems,
	listTaskMemoryItems,
} from "./task-state";

function buildKnowledgeMemorySummary(
	overview: string | null,
	personaFallbackTexts: string[],
	personaCount: number,
	activeConstraintCount: number,
	currentProjectContextCount: number,
	taskCount: number,
	focusContinuityCount: number,
	overviewUnavailable = false,
): KnowledgeMemorySummary {
	const honchoEnabled = isHonchoEnabled();
	const attemptedAt = honchoEnabled ? Date.now() : null;
	const overviewContract = buildKnowledgeMemoryOverview({
		rawOverview: overview,
		personaFallbackTexts,
		durablePersonaCount: personaCount,
		honchoEnabled,
		attemptedAt,
		overviewUnavailable,
	});

	return {
		personaCount,
		taskCount,
		focusContinuityCount,
		activeConstraintCount,
		currentProjectContextCount,
		...overviewContract,
	};
}

async function loadPeerContextOverview(
	userId: string,
	userDisplayName: string,
): Promise<{ text: string | null; unavailable: boolean }> {
	if (!isHonchoEnabled()) {
		return { text: null, unavailable: false };
	}

	try {
		const text = await getPeerContext(userId, userDisplayName, {
			timeoutMs: getConfig().honchoPersonaContextWaitMs,
		});
		return { text, unavailable: false };
	} catch (error) {
		console.warn(
			"[KNOWLEDGE_MEMORY] Honcho overview temporarily unavailable:",
			error,
		);
		return { text: null, unavailable: true };
	}
}

function mapHonchoPersonaMemory(
	record: HonchoPersonaMemoryRecord,
): PersonaMemoryItem {
	return {
		id: record.id,
		canonicalText: record.content,
		rawCanonicalText: record.content,
		domain: "persona",
		memoryClass: "long_term_context",
		state: "active",
		salienceScore: 50,
		sourceCount: 1,
		conversationTitles: [],
		firstSeenAt: record.createdAt,
		lastSeenAt: record.createdAt,
		pinned: false,
		temporal: null,
		activeConstraint: false,
		topicKey: null,
		topicStatus: "active",
		supersededById: null,
		supersessionReason: null,
		members: [
			{
				id: record.id,
				content: record.content,
				scope: record.scope,
				sessionId: record.sessionId,
				conversationTitle: null,
				createdAt: record.createdAt,
			},
		],
	};
}

export async function getKnowledgeMemory(
	userId: string,
	userDisplayName: string,
): Promise<KnowledgeMemoryPayload> {
	const [peerOverview, personaRecords, taskMemories, focusContinuities] =
		await Promise.all([
			loadPeerContextOverview(userId, userDisplayName),
			listPersonaMemories(userId),
			listTaskMemoryItems(userId),
			listFocusContinuityItems(userId),
		]);
	const personaMemories = personaRecords.map(mapHonchoPersonaMemory);

	return {
		personaMemories,
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
			peerOverview.text,
			personaRecords.map((record) => record.content),
			personaMemories.length,
			0,
			0,
			taskMemories.length,
			focusContinuities.length,
			peerOverview.unavailable,
		),
	};
}

export async function getKnowledgeMemoryOverview(
	userId: string,
	userDisplayName: string,
	_options: { awaitLive?: boolean; force?: boolean } = {},
): Promise<KnowledgeMemoryOverviewPayload> {
	const [peerOverview, personaRecords] = await Promise.all([
		loadPeerContextOverview(userId, userDisplayName),
		listPersonaMemories(userId),
	]);

	return {
		summary: buildKnowledgeMemorySummary(
			peerOverview.text,
			personaRecords.map((record) => record.content),
			personaRecords.length,
			0,
			0,
			0,
			0,
			peerOverview.unavailable,
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
			console.info(
				"[KNOWLEDGE_MEMORY] forget_persona_memory is a no-op with local clusters removed; delegated to Honcho",
			);
			break;
		}
		case "forget_all_persona_memory": {
			await forgetAllPersonaMemories(userId);
			await rotateHonchoPeerIdentity(userId);
			console.info(
				"[KNOWLEDGE_MEMORY] forget_all_persona_memory delegated to Honcho and rotated peer identity",
			);
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
