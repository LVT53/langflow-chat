import type { ResearchLanguage } from "./planning";

export type ResolveResearchLanguageInput = {
	userRequest: string;
	explicitOutputLanguage?: ResearchLanguage | null;
};

const hungarianMarkers = [
	"a",
	"az",
	"és",
	"hogy",
	"kérlek",
	"kutass",
	"kutat",
	"magyar",
	"aktuális",
	"feltételeit",
	"össze",
	"jelentés",
];

const hungarianAccentPattern = /[áéíóöőúüű]/i;

export function resolveResearchLanguage(
	input: ResolveResearchLanguageInput,
): ResearchLanguage {
	if (input.explicitOutputLanguage) {
		return input.explicitOutputLanguage;
	}

	const normalizedRequest = input.userRequest.toLocaleLowerCase("hu-HU");
	if (hungarianAccentPattern.test(normalizedRequest)) {
		return "hu";
	}

	const words = normalizedRequest.match(/\p{L}+/gu) ?? [];
	const markerCount = words.filter((word) =>
		hungarianMarkers.includes(word),
	).length;

	return markerCount >= 2 ? "hu" : "en";
}
