import { describe, expect, it } from "vitest";
import {
	parseModelJsonObject,
	parseModelJsonValue,
	stringArrayValue,
} from "./llm-json";

describe("parseModelJsonObject", () => {
	it("recovers an object after a dangling extra opening brace", () => {
		expect(parseModelJsonObject('{\n {"ok": true, "label": "valid"}')).toEqual({
			ok: true,
			label: "valid",
		});
	});

	it("prefers the final valid object when prose or reasoning contains earlier JSON", () => {
		expect(
			parseModelJsonObject(
				[
					'Reasoning note with {"task":"context_compression"} that is not the answer.',
					'{"goal":"Keep the deployment stable","currentState":"Ready"}',
				].join("\n"),
			),
		).toEqual({
			goal: "Keep the deployment stable",
			currentState: "Ready",
		});
	});

	it("recovers a JSON object inside markdown code fences", () => {
		expect(
			parseModelJsonValue(
				[
					"Model notes:",
					"```json",
					'{"mode":"report","items":["a","b"]}',
					"```",
				].join("\n"),
			),
		).toEqual({
			mode: "report",
			items: ["a", "b"],
		});
	});

	it("returns null for non-object JSON payloads", () => {
		expect(parseModelJsonObject("[1,2,3]")).toBeNull();
		expect(parseModelJsonValue("[]")).toEqual([]);
	});

	it("preserves simple string normalization for arrays", () => {
		expect(stringArrayValue(["  a ", "", "b\t", 4])).toEqual(["a", "b"]);
	});
});
