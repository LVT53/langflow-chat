import { render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import { uiLanguage } from "$lib/stores/settings";
import EvidenceManager from "./EvidenceManager.svelte";
import type { ContextDebugState } from "$lib/types";

describe("EvidenceManager context source labels", () => {
	afterEach(() => {
		uiLanguage.set("en");
	});

	it("renders the conversation-level Context Sources surface in English", () => {
		const { getByRole, getByText } = render(EvidenceManager, {
			open: true,
			contextDebug: makeContextDebug(),
		});

		expect(getByRole("dialog", { name: "Context Sources" })).toBeInTheDocument();
		expect(getByText("Manage context sources")).toBeInTheDocument();
		expect(getByText("Current sources")).toBeInTheDocument();
		expect(getByText("Context source preference")).toBeInTheDocument();
		expect(getByText("Auto")).toBeInTheDocument();
	});

	it("renders the conversation-level Context Sources surface in Hungarian", () => {
		uiLanguage.set("hu");

		const { getByRole, getByText } = render(EvidenceManager, {
			open: true,
			contextDebug: makeContextDebug(),
		});

		expect(getByRole("dialog", { name: "Kontextusforrások" })).toBeInTheDocument();
		expect(getByText("Kontextusforrások kezelése")).toBeInTheDocument();
		expect(getByText("Jelenlegi források")).toBeInTheDocument();
		expect(getByText("Kontextusforrás-preferencia")).toBeInTheDocument();
		expect(getByText("Automatikus")).toBeInTheDocument();
	});
});

function makeContextDebug(): ContextDebugState {
	return {
		activeTaskId: null,
		activeTaskObjective: null,
		taskLocked: false,
		routingStage: "deterministic",
		routingConfidence: 0,
		verificationStatus: "skipped",
		selectedEvidence: [
			{
				artifactId: "artifact-1",
				name: "Planning document",
				artifactType: "document",
				sourceType: "document",
				role: "selected",
				origin: "system",
				confidence: 0.9,
				reason: "Current task source",
			},
		],
		selectedEvidenceBySource: [{ sourceType: "document", count: 1 }],
		pinnedEvidence: [],
		excludedEvidence: [],
	};
}
