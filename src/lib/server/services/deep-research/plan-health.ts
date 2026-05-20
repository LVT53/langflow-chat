import type { ResearchPlan } from "./planning";

export const PLAN_HEALTH_MIN_REVIEWED_SOURCES = 20;

export type PlanHealthFailure = {
	reason: string;
	signals: string[];
};

export function assessPlanHealthBeforeEvidenceLimitation(input: {
	plan: ResearchPlan;
	userRequest: string;
	reviewedSourceCount: number;
	acceptedTopicRelevantSourceCount: number;
}): PlanHealthFailure | null {
	if (input.reviewedSourceCount < PLAN_HEALTH_MIN_REVIEWED_SOURCES) return null;
	if (input.acceptedTopicRelevantSourceCount !== 0) return null;

	const signals = collectPlanPoisonSignals(input.plan, input.userRequest);
	if (signals.length === 0) return null;

	return {
		reason:
			"The Research Plan appears to have framed the request incorrectly, so the reviewed sources cannot be treated as evidence that the real topic lacks support.",
		signals,
	};
}

function collectPlanPoisonSignals(
	plan: ResearchPlan,
	userRequest: string,
): string[] {
	const signals: string[] = [];
	const comparedEntities = plan.comparedEntities ?? [];
	const invalidComparedEntities = comparedEntities.filter(
		isInvalidComparedEntityCandidate,
	);
	if (invalidComparedEntities.length > 0) {
		signals.push(
			`Invalid compared entities: ${invalidComparedEntities.join(", ")}`,
		);
	}

	if (
		plan.reportIntent === "comparison" &&
		isAbstractArchitecturePrompt(userRequest)
	) {
		signals.push(
			"Abstract architecture recommendation was treated as a strict entity comparison.",
		);
	}

	const mismatchedQuestions = plan.keyQuestions.filter(
		isProductOrVehicleQuestion,
	);
	if (
		isAbstractArchitecturePrompt(userRequest) &&
		mismatchedQuestions.length > 0
	) {
		signals.push(
			`Product or vehicle questions leaked into an architecture plan: ${mismatchedQuestions.join("; ")}`,
		);
	}

	if (
		plan.reportIntent === "comparison" &&
		plan.planNormalizationNote &&
		/architecture patterns? will be discovered|option category|pre-filled as compared entities|abstract architecture/iu.test(
			plan.planNormalizationNote,
		)
	) {
		signals.push(
			"Plan Normalization Note indicates corrected abstract-decision framing was needed.",
		);
	}

	return signals;
}

function isAbstractArchitecturePrompt(value: string): boolean {
	const text = value.toLocaleLowerCase();
	return (
		/\barchitecture|architectural|architecture patterns?|deep research assistant|research assistant\b/u.test(
			text,
		) &&
		/\bcompare\s+(?:at\s+least\s+)?(?:two|three|four|five|\d+)\s+[\w -]+(?:patterns?|options?|approaches?|architectures?|designs?|strategies?|systems?|solutions?|categories?)\b/u.test(
			text,
		) &&
		/\brecommend|recommendation|choose|most reliable|one design|roadmap\b/u.test(
			text,
		)
	);
}

function isInvalidComparedEntityCandidate(value: string): boolean {
	const normalized = value.trim().toLocaleLowerCase();
	return (
		/^(?:at\s+least\s+)?(?:one|two|three|four|five|six|\d+)\s+[\w -]+(?:patterns?|options?|approaches?|architectures?|designs?|strategies?|systems?|solutions?|categories?)$/u.test(
			normalized,
		) ||
		/^(?:identify|recommend|include|compare|evaluate|assess|analy[sz]e|map|research|find)\b/u.test(
			normalized,
		)
	);
}

function isProductOrVehicleQuestion(value: string): boolean {
	return /\b(manufacturers?|trim(?:s)?|dealer(?:s| listings)?|model years?|rider use cases?)\b/iu.test(
		value,
	);
}
