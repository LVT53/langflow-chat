import type { ModelId } from "./types";

export type DeepResearchModelRole =
	| "plan_generation"
	| "plan_revision"
	| "source_review"
	| "research_task"
	| "synthesis"
	| "citation_audit"
	| "report_writing";

export type DeepResearchModelSelections = Record<
	DeepResearchModelRole,
	ModelId
>;

export type DeepResearchModelRoleDefinition = {
	id: DeepResearchModelRole;
	configKey:
		| "DEEP_RESEARCH_PLAN_MODEL"
		| "DEEP_RESEARCH_PLAN_REVISION_MODEL"
		| "DEEP_RESEARCH_SOURCE_REVIEW_MODEL"
		| "DEEP_RESEARCH_RESEARCH_TASK_MODEL"
		| "DEEP_RESEARCH_SYNTHESIS_MODEL"
		| "DEEP_RESEARCH_CITATION_AUDIT_MODEL"
		| "DEEP_RESEARCH_REPORT_MODEL";
	labelKey: string;
};

export const DEFAULT_DEEP_RESEARCH_MODEL_ID: ModelId = "model1";

export const DEEP_RESEARCH_MODEL_ROLES = [
	{
		id: "plan_generation",
		configKey: "DEEP_RESEARCH_PLAN_MODEL",
		labelKey: "admin.deepResearchModel.planGeneration",
	},
	{
		id: "plan_revision",
		configKey: "DEEP_RESEARCH_PLAN_REVISION_MODEL",
		labelKey: "admin.deepResearchModel.planRevision",
	},
	{
		id: "source_review",
		configKey: "DEEP_RESEARCH_SOURCE_REVIEW_MODEL",
		labelKey: "admin.deepResearchModel.sourceReview",
	},
	{
		id: "research_task",
		configKey: "DEEP_RESEARCH_RESEARCH_TASK_MODEL",
		labelKey: "admin.deepResearchModel.researchTask",
	},
	{
		id: "synthesis",
		configKey: "DEEP_RESEARCH_SYNTHESIS_MODEL",
		labelKey: "admin.deepResearchModel.synthesis",
	},
	{
		id: "citation_audit",
		configKey: "DEEP_RESEARCH_CITATION_AUDIT_MODEL",
		labelKey: "admin.deepResearchModel.citationAudit",
	},
	{
		id: "report_writing",
		configKey: "DEEP_RESEARCH_REPORT_MODEL",
		labelKey: "admin.deepResearchModel.reportWriting",
	},
] as const satisfies readonly DeepResearchModelRoleDefinition[];

export function defaultDeepResearchModelSelections(): DeepResearchModelSelections {
	return Object.fromEntries(
		DEEP_RESEARCH_MODEL_ROLES.map((role) => [
			role.id,
			DEFAULT_DEEP_RESEARCH_MODEL_ID,
		]),
	) as DeepResearchModelSelections;
}

export function normalizeConfiguredModelId(value: unknown): ModelId {
	if (value === "model1" || value === "model2") return value;
	if (typeof value === "string" && value.startsWith("provider:")) {
		return value as ModelId;
	}
	return DEFAULT_DEEP_RESEARCH_MODEL_ID;
}
