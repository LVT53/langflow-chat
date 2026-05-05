import { describe, expect, it } from "vitest";
import { buildContextSourcesState } from "./context-sources";
import type { ArtifactSummary, ContextDebugState, ConversationContextStatus } from "$lib/types";

describe("buildContextSourcesState", () => {
	it("summarizes active, pinned, excluded, reduced, and compacted context sources", () => {
		const contextStatus: ConversationContextStatus = {
			conversationId: "conv-1",
			userId: "user-1",
			estimatedTokens: 72_000,
			maxContextTokens: 100_000,
			thresholdTokens: 80_000,
			targetTokens: 90_000,
			compactionApplied: true,
			compactionMode: "deterministic",
			routingStage: "semantic",
			routingConfidence: 0.8,
			verificationStatus: "passed",
			layersUsed: ["working_set", "task_state"],
			workingSetCount: 1,
			workingSetArtifactIds: ["artifact-work"],
			workingSetApplied: true,
			taskStateApplied: true,
			promptArtifactCount: 1,
			recentTurnCount: 3,
			summary: null,
			updatedAt: 1_777_140_000_000,
		};
		const contextDebug: ContextDebugState = {
			activeTaskId: "task-1",
			activeTaskObjective: "Compare documents",
			taskLocked: false,
			routingStage: "semantic",
			routingConfidence: 0.8,
			verificationStatus: "passed",
			selectedEvidence: [
				{
					artifactId: "artifact-selected",
					name: "Selected source",
					artifactType: "document",
					sourceType: "document",
					role: "selected",
					origin: "system",
					confidence: 0.9,
					reason: "matches the current request",
				},
			],
			selectedEvidenceBySource: [{ sourceType: "document", count: 1 }],
			pinnedEvidence: [
				{
					artifactId: "artifact-pinned",
					name: "Pinned source",
					artifactType: "document",
					sourceType: "document",
					role: "pinned",
					origin: "user",
					confidence: 1,
					reason: "pinned by user",
				},
			],
			excludedEvidence: [
				{
					artifactId: "artifact-excluded",
					name: "Excluded source",
					artifactType: "document",
					sourceType: "document",
					role: "excluded",
					origin: "user",
					confidence: 1,
					reason: "excluded by user",
				},
			],
			honcho: null,
		};

		const state = buildContextSourcesState({
			userId: "user-1",
			conversationId: "conv-1",
			contextStatus,
			contextDebug,
			attachedArtifacts: [artifact("artifact-attachment", "Attached source")],
			activeWorkingSet: [artifact("artifact-work", "Working set source")],
			now: new Date("2026-05-05T10:00:00.000Z"),
		});

		expect(state).toMatchObject({
			conversationId: "conv-1",
			userId: "user-1",
			selectedCount: 1,
			pinnedCount: 1,
			excludedCount: 1,
			reduced: true,
			compacted: true,
			updatedAt: new Date("2026-05-05T10:00:00.000Z").getTime(),
		});
		expect(state.activeCount).toBe(4);
		expect(state.groups.map((group) => group.kind)).toEqual([
			"attachments",
			"working_set",
			"task_evidence",
			"pinned",
			"excluded",
		]);
		expect(state.groups[0].items[0]).toMatchObject({
			artifactId: "artifact-attachment",
			title: "Attached source",
			state: "active",
			reduced: true,
			compacted: true,
		});
	});
});

function artifact(id: string, name: string): ArtifactSummary {
	return {
		id,
		name,
		type: "document",
		retrievalClass: "durable",
		mimeType: "text/plain",
		sizeBytes: 1024,
		conversationId: "conv-1",
		summary: null,
		createdAt: 1_777_140_000_000,
		updatedAt: 1_777_140_000_000,
	};
}
