import { describe, expect, it } from "vitest";
import {
	getMissingStandardRecallNeedles,
	parseJsonObject,
	structuredRecallHasValue,
} from "./verify-live-ai-sweep";

function standardRecallJson(
	overrides: Partial<Record<string, string>> = {},
): string {
	return JSON.stringify({
		cycle1_codename: "LANTERN-PAPAYA-17",
		cycle1_person: "Inez Vale",
		cycle1_budget_checksum: "18742.60",
		cycle1_folder: "teal folder marked 9Q",
		cycle1_appointment: "2026-06-18 14:30 Europe/Budapest",
		cycle1_handoff: "North pier C-17",
		cycle2_codename: "RIVER-ONYX-41",
		cycle2_audit_lead: "Tomasz Grell",
		cycle2_invoice_crumb: "VX-4409",
		cycle2_fallback_address: "Selyem utca 14, gate B",
		cycle2_mural_count: "11 triangles",
		cycle3_codename: "ORCHID-TUNGSTEN-58",
		cycle3_owner: "Priya Sen",
		cycle3_bridge: "Híd-3",
		cycle3_branch: "release/saffron-needle",
		cycle3_blocker: "thermal label printer jams after 42 labels",
		cycle3_crate_code: "M-77",
		...overrides,
	});
}

describe("live AI sweep structured recall validation", () => {
	it("rejects non-JSON recall output even when prose includes an expected value", () => {
		const text = 'The strict JSON is {"reviewer":"Kende Farkas"}.';
		const parsed = parseJsonObject(text);

		expect(parsed).toBeNull();
		expect(
			structuredRecallHasValue({
				parsed,
				field: "reviewer",
				acceptedValues: ["Kende Farkas"],
			}),
		).toBe(false);
	});

	it("rejects expected recall values found only in the wrong JSON field", () => {
		const parsed = parseJsonObject(
			JSON.stringify({
				notes: "The reviewer is Kende Farkas.",
				reviewer: "Mira Kovacs",
			}),
		);

		expect(
			structuredRecallHasValue({
				parsed,
				field: "reviewer",
				acceptedValues: ["Kende Farkas"],
			}),
		).toBe(false);
	});

	it("accepts configured aliases only when they match the parsed field value", () => {
		const parsed = parseJsonObject(JSON.stringify({ envelope: "envelope 6F" }));

		expect(
			structuredRecallHasValue({
				parsed,
				field: "envelope",
				acceptedValues: ["6F", "envelope 6F"],
			}),
		).toBe(true);
	});

	it("rejects standard post-compaction recall prose even when all values are present", () => {
		const prose =
			"LANTERN-PAPAYA-17, Inez Vale, 18742.60, teal folder marked 9Q, 2026-06-18 14:30 Europe/Budapest, North pier C-17, RIVER-ONYX-41, Tomasz Grell, VX-4409, Selyem utca 14, gate B, 11 triangles, ORCHID-TUNGSTEN-58, Priya Sen, Híd-3, release/saffron-needle, thermal label printer jams after 42 labels, and M-77.";

		expect(getMissingStandardRecallNeedles(prose)).toEqual([
			"LANTERN-PAPAYA-17",
			"Inez Vale",
			"18742.60",
			"teal folder marked 9Q",
			"2026-06-18 14:30 Europe/Budapest",
			"North pier C-17",
			"RIVER-ONYX-41",
			"Tomasz Grell",
			"VX-4409",
			"Selyem utca 14, gate B",
			"11 triangles",
			"ORCHID-TUNGSTEN-58",
			"Priya Sen",
			"Híd-3",
			"release/saffron-needle",
			"thermal label printer jams after 42 labels",
			"M-77",
		]);
	});

	it("rejects standard post-compaction recall values found only in the wrong JSON field", () => {
		expect(
			getMissingStandardRecallNeedles(
				standardRecallJson({
					cycle1_person: "Mira Kovacs",
					notes: "Inez Vale appears in prose, not the requested field.",
				}),
			),
		).toEqual(["Inez Vale"]);
	});

	it("accepts standard post-compaction recall values in the expected JSON fields", () => {
		expect(getMissingStandardRecallNeedles(standardRecallJson())).toEqual([]);
	});
});
