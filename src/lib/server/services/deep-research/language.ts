import type { ResearchLanguage } from "./planning";
import { detectLanguage } from "../language";

export type ResolveResearchLanguageInput = {
	userRequest: string;
	explicitOutputLanguage?: ResearchLanguage | null;
};

export function resolveResearchLanguage(
	input: ResolveResearchLanguageInput,
): ResearchLanguage {
	if (input.explicitOutputLanguage) {
		return input.explicitOutputLanguage;
	}

	return detectLanguage(input.userRequest);
}
