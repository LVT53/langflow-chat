import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import ModelFormModal from "./ModelFormModal.svelte";

describe("ModelFormModal", () => {
	it("hides derived context budget fields and clears stale saved overrides", async () => {
		const onSave = vi.fn();

		const { getByRole, queryByLabelText } = render(ModelFormModal, {
			model: {
				id: "provider-1",
				name: "provider-1",
				displayName: "Provider One",
				baseUrl: "https://api.example.com/v1",
				modelName: "provider/model",
				reasoningEffort: null,
				thinkingType: null,
				enabled: true,
				sortOrder: 0,
				maxModelContext: 132_000,
				compactionUiThreshold: 105_600,
				targetConstructedContext: 118_800,
				maxMessageLength: null,
				maxTokens: null,
				iconAssetId: null,
				rateLimitFallbackEnabled: false,
				rateLimitFallbackBaseUrl: null,
				rateLimitFallbackModelName: null,
				rateLimitFallbackTimeoutMs: 10_000,
				createdAt: "",
				updatedAt: "",
			},
			onSave,
			onClose: vi.fn(),
		});

		expect(queryByLabelText("Compaction UI Threshold (tokens)")).toBeNull();
		expect(queryByLabelText("Target Constructed Context (tokens)")).toBeNull();

		await fireEvent.click(getByRole("button", { name: "Save Changes" }));

		expect(onSave).toHaveBeenCalledWith(
			expect.objectContaining({
				maxModelContext: 132_000,
				compactionUiThreshold: null,
				targetConstructedContext: null,
			}),
		);
	});
});
