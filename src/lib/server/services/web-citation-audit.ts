import type {
	ToolCallEntry,
	ToolEvidenceCandidate,
	WebCitationAudit,
	WebCitationAuditCitation,
	WebCitationAuditStatus,
	WebCitationMatchType,
} from "$lib/types";

type RetrievedWebSource = {
	id: string;
	title: string;
	url: string;
	canonicalUrl: string;
	host: string;
};

const MARKDOWN_LINK_RE = /\[[^\]]+\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/gi;
const BARE_URL_RE = /https?:\/\/[^\s<>)\]]+/gi;
const TRAILING_PUNCTUATION_RE = /[.,;:!?]+$/;

function canonicalizeUrl(
	value: string,
): { canonicalUrl: string; host: string } | null {
	try {
		const url = new URL(value.trim().replace(TRAILING_PUNCTUATION_RE, ""));
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		url.hash = "";
		for (const key of [...url.searchParams.keys()]) {
			if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) {
				url.searchParams.delete(key);
			}
		}
		url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
		url.pathname = url.pathname.replace(/\/+$/, "") || "/";
		return { canonicalUrl: url.toString(), host: url.hostname };
	} catch {
		return null;
	}
}

function extractAssistantUrls(assistantResponse: string): string[] {
	const urls = new Set<string>();
	for (const match of assistantResponse.matchAll(MARKDOWN_LINK_RE)) {
		if (match[1]) urls.add(match[1]);
	}
	for (const match of assistantResponse.matchAll(BARE_URL_RE)) {
		const value = match[0];
		if (value) urls.add(value);
	}
	return [...urls];
}

function isResearchWebTool(tool: ToolCallEntry): boolean {
	return tool.status === "done" && tool.name === "research_web";
}

function candidateToRetrievedSource(
	candidate: ToolEvidenceCandidate,
): RetrievedWebSource | null {
	if (candidate.sourceType !== "web" || !candidate.url) return null;
	const canonical = canonicalizeUrl(candidate.url);
	if (!canonical) return null;
	return {
		id: candidate.id,
		title: candidate.title,
		url: candidate.url,
		canonicalUrl: canonical.canonicalUrl,
		host: canonical.host,
	};
}

function extractResearchWebSources(
	toolCalls: ToolCallEntry[],
): RetrievedWebSource[] {
	const sources = toolCalls
		.filter(isResearchWebTool)
		.flatMap((tool) => tool.candidates ?? [])
		.map(candidateToRetrievedSource)
		.filter((source): source is RetrievedWebSource => Boolean(source));

	return Array.from(
		new Map(sources.map((source) => [source.canonicalUrl, source])).values(),
	);
}

function matchCitation(
	url: string,
	sources: RetrievedWebSource[],
): WebCitationAuditCitation | null {
	const canonical = canonicalizeUrl(url);
	if (!canonical) return null;

	const exact = sources.find(
		(source) => source.canonicalUrl === canonical.canonicalUrl,
	);
	if (exact) {
		return {
			url,
			canonicalUrl: canonical.canonicalUrl,
			supported: true,
			matchType: "exact",
			matchedSourceId: exact.id,
			matchedSourceTitle: exact.title,
			matchedSourceUrl: exact.url,
		};
	}

	const hostMatch = sources.find((source) => source.host === canonical.host);
	const matchType: WebCitationMatchType = hostMatch ? "host" : "none";
	return {
		url,
		canonicalUrl: canonical.canonicalUrl,
		supported: false,
		matchType,
		matchedSourceId: hostMatch?.id ?? null,
		matchedSourceTitle: hostMatch?.title ?? null,
		matchedSourceUrl: hostMatch?.url ?? null,
	};
}

function auditStatus(params: {
	retrievedSourceCount: number;
	citedUrlCount: number;
	unsupportedCitationCount: number;
}): WebCitationAuditStatus {
	if (params.retrievedSourceCount === 0 && params.citedUrlCount === 0)
		return "none";
	if (params.retrievedSourceCount > 0 && params.citedUrlCount === 0)
		return "missing_citations";
	if (params.unsupportedCitationCount > 0) return "unsupported_citations";
	return "passed";
}

export function buildWebCitationAudit(params: {
	assistantResponse: string;
	toolCalls?: ToolCallEntry[];
}): WebCitationAudit | null {
	const toolCalls = params.toolCalls ?? [];
	const sources = extractResearchWebSources(toolCalls);
	const citationUrls = extractAssistantUrls(params.assistantResponse);

	if (sources.length === 0 && citationUrls.length === 0) {
		return null;
	}

	const citations = citationUrls
		.map((url) => matchCitation(url, sources))
		.filter((citation): citation is WebCitationAuditCitation =>
			Boolean(citation),
		);
	const supportedCitationCount = citations.filter(
		(citation) => citation.supported,
	).length;
	const unsupportedCitationCount = citations.length - supportedCitationCount;

	return {
		status: auditStatus({
			retrievedSourceCount: sources.length,
			citedUrlCount: citations.length,
			unsupportedCitationCount,
		}),
		retrievedSourceCount: sources.length,
		citedUrlCount: citations.length,
		supportedCitationCount,
		unsupportedCitationCount,
		citations,
	};
}
