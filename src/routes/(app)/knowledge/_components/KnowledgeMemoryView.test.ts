import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import KnowledgeMemoryView from "./KnowledgeMemoryView.svelte";

const baseProps = {
	memoryLoading: false,
	memoryLoaded: true,
	memoryLoadError: "",
	personaMemoryCount: 2,
	focusContinuityItemCount: 0,
	honchoEnabled: true,
	overviewBullets: [
		"Levi owns an eBike that arrived on May 13, 2026.",
		"Levi is interested in comparing insurance options.",
	],
	overviewSource: "honcho_scoped" as const,
	overviewStatus: "ready" as const,
	overviewUpdatedAt: Date.now(),
	overviewLastAttemptAt: null,
	durablePersonaCount: 2,
	activeConstraintCount: 0,
	currentProjectContextCount: 0,
	liveOverviewRefreshing: false,
	onRetryLoadMemory: vi.fn(),
	onRetryLiveOverview: vi.fn(),
	onOpenMemoryModal: vi.fn(),
};

describe("KnowledgeMemoryView", () => {
	it("renders server-provided memory overview bullets as app-controlled list items", () => {
		const { container } = render(KnowledgeMemoryView, {
			props: baseProps,
		});

		expect(
			screen.getByText("Levi owns an eBike that arrived on May 13, 2026."),
		).toBeInTheDocument();
		expect(
			screen.getByText("Levi is interested in comparing insurance options."),
		).toBeInTheDocument();
		expect(
			container.querySelector(".memory-overview-list"),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("heading", {
				name: "Levi owns an eBike that arrived on May 13, 2026.",
			}),
		).not.toBeInTheDocument();
	});
});
