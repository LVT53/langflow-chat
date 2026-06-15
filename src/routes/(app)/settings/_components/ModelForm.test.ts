import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import ModelForm from "./ModelForm.svelte";

function modelFixture(overrides: Record<string, unknown> = {}) {
	return {
		id: "model-1",
		providerId: "provider-1",
		name: "gpt-example",
		displayName: "GPT Example",
		iconAssetId: null,
		fallbackProviderModelId: null,
		maxModelContext: 128_000,
		compactionUiThreshold: null,
		targetConstructedContext: null,
		maxMessageLength: null,
		maxTokens: null,
		reasoningEffort: null,
		thinkingType: null,
		capabilitiesJson: "{}",
		inputUsdMicrosPer1m: 1_000_000,
		cachedInputUsdMicrosPer1m: 100_000,
		cacheHitUsdMicrosPer1m: 999_000,
		cacheMissUsdMicrosPer1m: 0,
		outputUsdMicrosPer1m: 2_000_000,
		enabled: true,
		sortOrder: 0,
		createdAt: "",
		updatedAt: "",
		...overrides,
	};
}

describe("ModelForm pricing fields", () => {
	it("shows three primary price fields and maps cached input onto the legacy cache-hit rate", async () => {
		const onSave = vi.fn();
		const { getByLabelText, getByRole, queryByLabelText } = render(ModelForm, {
			providerId: "provider-1",
			model: modelFixture(),
			onSave,
			onClose: vi.fn(),
		});

		expect(getByLabelText("Input")).toBeTruthy();
		expect(getByLabelText("Cached Input")).toBeTruthy();
		expect(getByLabelText("Output")).toBeTruthy();
		expect(queryByLabelText("Cache Hit")).toBeNull();
		expect(queryByLabelText("Cache Miss")).toBeNull();

		await fireEvent.input(getByLabelText("Cached Input"), {
			target: { value: "0.25" },
		});
		await fireEvent.click(getByRole("button", { name: "Save Changes" }));

		expect(onSave).toHaveBeenCalledWith(
			expect.objectContaining({
				cachedInputUsdMicrosPer1m: 250_000,
				cacheHitUsdMicrosPer1m: 250_000,
			}),
		);
	});

	it("keeps cache write/miss pricing behind the advanced disclosure", async () => {
		const onSave = vi.fn();
		const { getByLabelText, getByRole, getByText } = render(ModelForm, {
			providerId: "provider-1",
			model: modelFixture(),
			onSave,
			onClose: vi.fn(),
		});

		expect(getByText("Advanced cache pricing")).toBeTruthy();

		await fireEvent.input(getByLabelText("Cache write / miss"), {
			target: { value: "0.75" },
		});
		await fireEvent.click(getByRole("button", { name: "Save Changes" }));

		expect(onSave).toHaveBeenCalledWith(
			expect.objectContaining({
				cacheMissUsdMicrosPer1m: 750_000,
			}),
		);
	});
});
