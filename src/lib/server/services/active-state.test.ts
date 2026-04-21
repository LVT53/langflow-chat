import { describe, expect, it } from "vitest";
import {
	buildActiveDocumentState,
	deriveCurrentTurnReasonCodes,
	hasRecentUserCorrectionSignal,
} from "./active-state";

describe("active-state signals", () => {
	it("detects document-focused turns from message text or attachments", () => {
		const state1 = buildActiveDocumentState({
			message: "Please update this document.",
			currentConversationId: "conv-1",
			artifacts: [],
		});
		expect(state1.documentFocused).toBe(true);

		const state2 = buildActiveDocumentState({
			message: "General brainstorming",
			currentConversationId: "conv-1",
			artifacts: [],
			attachmentIds: ["artifact-1"],
		});
		expect(state2.documentFocused).toBe(true);

		const state3 = buildActiveDocumentState({
			message: "General brainstorming",
			currentConversationId: "conv-1",
			artifacts: [],
		});
		expect(state3.documentFocused).toBe(false);
	});

	it("detects explicit user correction/refinement signals", () => {
		expect(
			hasRecentUserCorrectionSignal(
				"Actually, use the previous version instead.",
			),
		).toBe(true);
		expect(hasRecentUserCorrectionSignal("Let's discuss another topic.")).toBe(
			false,
		);
	});

	it("detects explicit context-reset phrasing", () => {
		const state1 = buildActiveDocumentState({
			message: "We are done with that now, let's talk about something else.",
			currentConversationId: "conv-1",
			artifacts: [],
		});
		expect(state1.hasContextResetSignal).toBe(true);

		const state2 = buildActiveDocumentState({
			message: "Please refine the same brief again.",
			currentConversationId: "conv-1",
			artifacts: [],
		});
		expect(state2.hasContextResetSignal).toBe(false);
	});
	it("assembles active document state from workspace focus, current output, and correction phrasing", () => {
		const state = buildActiveDocumentState({
			message: "Actually, refine this brief instead.",
			activeDocumentArtifactId: "brief-v1",
			currentConversationId: "conv-1",
			artifacts: [
				{
					id: "brief-v1",
					userId: "user-1",
					type: "generated_output",
					retrievalClass: "durable",
					name: "brief-v1.pdf",
					mimeType: "application/pdf",
					sizeBytes: 100,
					conversationId: "conv-1",
					summary: null,
					createdAt: 1,
					updatedAt: 1,
					extension: "pdf",
					storagePath: null,
					contentText: null,
					metadata: {
						documentFamilyId: "family-brief",
						documentLabel: "Project brief",
						versionNumber: 1,
					},
				},
				{
					id: "brief-v2",
					userId: "user-1",
					type: "generated_output",
					retrievalClass: "durable",
					name: "brief-v2.pdf",
					mimeType: "application/pdf",
					sizeBytes: 100,
					conversationId: "conv-1",
					summary: null,
					createdAt: 2,
					updatedAt: 2,
					extension: "pdf",
					storagePath: null,
					contentText: null,
					metadata: {
						documentFamilyId: "family-brief",
						documentLabel: "Project brief",
						versionNumber: 2,
					},
				},
			],
		});

		expect(state.documentFocused).toBe(true);
		expect(state.hasRecentUserCorrection).toBe(true);
		expect(Array.from(state.activeDocumentIds)).toEqual(["brief-v1"]);
		expect(Array.from(state.correctionTargetIds).sort()).toEqual(["brief-v1"]);
		expect(state.currentGeneratedArtifactId).toBe("brief-v1");
	});

	it("keeps the most recently refined document family active across generic follow-up turns", () => {
		const state = buildActiveDocumentState({
			message: "Please make it shorter.",
			currentConversationId: "conv-1",
			artifacts: [
				{
					id: "brief-v2",
					userId: "user-1",
					type: "generated_output",
					retrievalClass: "durable",
					name: "brief-v2.pdf",
					mimeType: "application/pdf",
					sizeBytes: 100,
					conversationId: "conv-1",
					summary: null,
					createdAt: 2,
					updatedAt: 2,
					extension: "pdf",
					storagePath: null,
					contentText: null,
					metadata: {
						documentFamilyId: "family-brief",
						documentLabel: "Project brief",
						versionNumber: 2,
						supersedesArtifactId: "brief-v1",
					},
				},
				{
					id: "slides-v1",
					userId: "user-1",
					type: "generated_output",
					retrievalClass: "durable",
					name: "slides-v1.pdf",
					mimeType: "application/pdf",
					sizeBytes: 100,
					conversationId: "conv-1",
					summary: null,
					createdAt: 3,
					updatedAt: 3,
					extension: "pdf",
					storagePath: null,
					contentText: null,
					metadata: {
						documentFamilyId: "family-slides",
						documentLabel: "Investor slides",
						versionNumber: 1,
					},
				},
			],
		});

		expect(state.recentlyRefinedFamilyId).toBe("family-brief");
		expect(Array.from(state.recentlyRefinedArtifactIds)).toEqual(["brief-v2"]);
		expect(state.currentGeneratedArtifactId).toBe("brief-v2");
		expect(Array.from(state.currentGeneratedReasonCodes)).toContain(
			"recently_refined_document_family",
		);
	});

	it("suppresses document carryover when the user clearly moves on", () => {
		const state = buildActiveDocumentState({
			message:
				"We are done with that document, let's talk about something else.",
			activeDocumentArtifactId: "brief-v2",
			currentConversationId: "conv-1",
			artifacts: [
				{
					id: "brief-v2",
					userId: "user-1",
					type: "generated_output",
					retrievalClass: "durable",
					name: "brief-v2.pdf",
					mimeType: "application/pdf",
					sizeBytes: 100,
					conversationId: "conv-1",
					summary: null,
					createdAt: 2,
					updatedAt: 2,
					extension: "pdf",
					storagePath: null,
					contentText: null,
					metadata: {
						documentFamilyId: "family-brief",
						documentLabel: "Project brief",
						versionNumber: 2,
						supersedesArtifactId: "brief-v1",
					},
				},
			],
		});

		expect(state.hasContextResetSignal).toBe(true);
		expect(state.documentFocused).toBe(false);
		expect(Array.from(state.activeDocumentIds)).toEqual([]);
		expect(Array.from(state.recentlyRefinedArtifactIds)).toEqual([]);
		expect(state.currentGeneratedArtifactId).toBe(null);
	});

	it("recomputes live document reason codes for the current turn instead of trusting stale working-set codes", () => {
		const activeDocumentState = buildActiveDocumentState({
			message: "We're done with that, let's talk about something else.",
			currentConversationId: "conv-1",
			artifacts: [],
		});

		const reasonCodes = deriveCurrentTurnReasonCodes({
			artifactId: "brief-v2",
			reasonCodes: [
				"active_document_focus",
				"recent_user_correction",
				"recently_refined_document_family",
				"current_generated_document",
				"matched_current_turn",
				"persisted_from_previous_turn",
			],
			activeDocumentState,
		});

		expect(reasonCodes).toEqual(["persisted_from_previous_turn"]);
	});
});
