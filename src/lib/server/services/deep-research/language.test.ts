import { describe, expect, it } from "vitest";
import { resolveResearchLanguage } from "./language";

describe("resolveResearchLanguage", () => {
	it("defaults Research Language to the latest user request unless an explicit output language is provided", () => {
		expect(
			resolveResearchLanguage({
				userRequest:
					"Kérlek kutasd ki a magyar napelem pályázatok aktuális feltételeit.",
			}),
		).toBe("hu");

		expect(
			resolveResearchLanguage({
				userRequest:
					"Please research current procurement rules for private AI coding assistants.",
			}),
		).toBe("en");

		expect(
			resolveResearchLanguage({
				userRequest:
					"Kérlek kutasd ki a magyar napelem pályázatok aktuális feltételeit.",
				explicitOutputLanguage: "en",
			}),
		).toBe("en");
	});
});
