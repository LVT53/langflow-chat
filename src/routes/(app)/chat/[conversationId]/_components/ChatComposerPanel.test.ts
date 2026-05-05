import { fireEvent, render } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChatComposerPanel from "./ChatComposerPanel.svelte";

beforeEach(() => {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		value: vi.fn().mockImplementation((query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	});
});

function renderComposerPanel(props: Partial<Parameters<typeof render>[1]> = {}) {
	return render(ChatComposerPanel, {
		sendError: null,
		onRetry: vi.fn(),
		onErrorClose: vi.fn(),
		onSend: vi.fn(),
		onQueue: vi.fn(),
		onStop: vi.fn(),
		onDraftChange: vi.fn(),
		onEditQueuedMessage: vi.fn(),
		onDeleteQueuedMessage: vi.fn(),
		disabled: false,
		isGenerating: false,
		hasQueuedMessage: false,
		queuedMessagePreview: "",
		maxLength: 12000,
		conversationId: "conv-1",
		contextStatus: null,
		attachedArtifacts: [],
		taskState: null,
		contextDebug: null,
		draftText: "",
		draftAttachments: [],
		draftVersion: 0,
		onSteer: vi.fn(),
		onManageEvidence: vi.fn(),
		totalCostUsd: 0,
		totalTokens: 0,
		personalityProfiles: [],
		selectedPersonalityId: null,
		onPersonalityChange: vi.fn(),
		...props,
	});
}

describe("ChatComposerPanel", () => {
	it("passes the Deep Research feature flag into the composer", async () => {
		const { queryByRole, rerender } = renderComposerPanel({
			deepResearchEnabled: false,
		});

		expect(queryByRole("button", { name: "Deep Research" })).toBeNull();

		await rerender({
			deepResearchEnabled: true,
		});

		expect(queryByRole("button", { name: "Deep Research" })).not.toBeNull();
	});

	it("passes the selected Deep Research depth through chat sends", async () => {
		const onSend = vi.fn();
		const { getByPlaceholderText, getByRole } = renderComposerPanel({
			deepResearchEnabled: true,
			onSend,
		});

		await fireEvent.click(getByRole("button", { name: "Deep Research" }));
		await fireEvent.click(getByRole("button", { name: "Focused Deep Research" }));
		await fireEvent.input(getByPlaceholderText("Type a message..."), {
			target: { value: "Research battery recycling policy" },
		});
		await fireEvent.click(getByRole("button", { name: "Send message" }));

		expect(onSend).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "Research battery recycling policy",
				deepResearchDepth: "focused",
			}),
		);
	});

	it("does not send from a disabled composer", async () => {
		const onSend = vi.fn();
		const { getByPlaceholderText, getByRole } = renderComposerPanel({
			disabled: true,
			onSend,
		});

		await fireEvent.input(getByPlaceholderText("Type a message..."), {
			target: { value: "Try to continue the sealed conversation" },
		});

		expect(getByRole("button", { name: "Send message" })).toBeDisabled();

		await fireEvent.keyDown(getByPlaceholderText("Type a message..."), {
			key: "Enter",
		});

		expect(onSend).not.toHaveBeenCalled();
	});
});
