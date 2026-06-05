import { z } from "zod";

export const researchWebInputSchema = z.object({
	query: z.string().min(1),
	mode: z.enum(["quick", "research", "exact"]).optional(),
	freshness: z.enum(["auto", "live", "recent", "cache"]).optional(),
	sourcePolicy: z
		.enum([
			"general",
			"technical",
			"news",
			"commerce",
			"medical_legal_financial",
		])
		.optional(),
	maxSources: z.number().int().min(1).max(12).optional(),
	quoteRequired: z.boolean().optional(),
});

export type ResearchWebInput = z.infer<typeof researchWebInputSchema>;

export function sanitizeResearchWebInput(
	input: ResearchWebInput,
): ResearchWebInput {
	return {
		query: input.query,
		...(input.mode ? { mode: input.mode } : {}),
		...(input.freshness ? { freshness: input.freshness } : {}),
		...(input.sourcePolicy ? { sourcePolicy: input.sourcePolicy } : {}),
		...(input.maxSources ? { maxSources: input.maxSources } : {}),
		...(input.quoteRequired !== undefined
			? { quoteRequired: input.quoteRequired }
			: {}),
	};
}
