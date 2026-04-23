// Langflow API client service
import type {
	LangflowRunRequest,
	LangflowRunResponse,
	ModelId,
} from "$lib/types";
import type { ModelConfig } from "../config-store";
import { getConfig } from "../config-store";
import { getSystemPrompt } from "../prompts";
import {
	logAttachmentTrace,
	summarizeAttachmentSectionInInput,
} from "./attachment-trace";
import { buildConstructedContext, buildEnhancedSystemPrompt } from "./honcho";

type AuthenticatedPromptUser = {
	id: string;
	displayName?: string | null;
	email?: string | null;
};

const URL_LIST_TOOL_ARGUMENT_GUARD = [
	"Tool argument safety for URL-processing tools:",
	"- If a tool field is named `urls` or expects a list of URLs/links, always pass an array of strings.",
	'- For a single link, use `["https://example.com"]`, never a bare string.',
].join("\n");

const DATE_BEFORE_SEARCH_GUARD = [
	"Time-sensitive search workflow:",
	"- Before any web search, news search, or other freshness-sensitive search, first get the current date and time.",
	"- Use that date/time to frame the search query and interpret freshness.",
	"- Do not search first and check the date afterward.",
	"- When the user asks about past or future dates, events, or timeframes (e.g. March 2026, two weeks ago, next quarter):",
	"  1. Call get_current_date to get the current date.",
	"  2. Use the returned date to calculate whether the requested date is in the past, present, or future.",
	"  3. If it is a future date, acknowledge you know the current date and reason about what is publicly known up to that point (plans, scheduled events, published information).",
	"  4. If it is a past date, use the date to set the correct temporal context for your response.",
].join("\n");

const FILE_GENERATION_GUARD = [
	"Generated file workflow (split toolkit):",
	"",
	"For PDFs and static documents (reports, brochures, fact sheets):",
	"- Use `export_document` for styled PDF exports with the Terracotta Crown theme (brand colors, cover pages, styled headings, tables, code blocks, callouts).",
	"- For `export_document`: Write Markdown content with YAML frontmatter to enable styled output:",
	"  - `title: Report Title` (required for cover page)",
	"  - `subtitle: Subtitle text` (optional)",
	"  - `author: Author name` (optional)",
	"  - `date: YYYY-MM-DD` (optional)",
	"  - `cover: true` (optional — enables the styled cover page)",
	"- For `export_document`: Use Obsidian-style blockquotes for callouts: `> [!info]`, `> [!warning]`, `> [!tip]`, `> [!note]`.",
	"- For `export_document`: Embed images as `![alt text](url)` — Playwright renders them with border-radius and shadow styling.",
	"- For `export_document`: Do NOT rewrite the entire document into the tool payload. The system will automatically use the active conversation context when `markdown_content` is empty.",
	"- Use `generate_file` with `language: javascript` for programmatic PDFs via the pre-loaded `createPDF()` helper.",
	"- For `generate_file` PDF: Pass structured content blocks to `createPDF({ filename, title, content })`. Supported block types: `{ type: heading, text, level: 1|2|3 }`, `{ type: paragraph, text }`, `{ type: list, items, ordered }`, `{ type: table, headers, rows }`, `{ type: code, text }`, `{ type: separator }`, `{ type: image, src, alt }`.",
	"- For `generate_file` PDF: The `createPDF` helper applies the AlfyAI Terracotta Crown theme automatically (brand colors, DejaVu fonts, styled tables/images). Do not use `pdf-lib` directly.",
	"- Embed real-world images using `image_search` to find URLs, then include them as `![alt text](url)` in Markdown or `{ type: image, src }` in structured blocks.",
	"",
"For data science, CSV manipulation, or plain text exports:",
	"- Use the `generate_file` tool with `language: python`.",
	"- Use the Python standard library (csv, json, io) for data manipulation.",
	"- Write the final output file to `/output` or no file will be created.",
	"",
	"For binary office files (Excel .xlsx, Word .docx, PowerPoint .pptx, ODT, PDF):",
	"- Use the `generate_file` tool with `language: javascript`.",
	"- Use `exceljs` for Excel workbooks (`new ExcelJS.Workbook()`).",
	"- Use `docx` for Word documents (`new docx.Document()`).",
	"- Use `pptxgenjs` for PowerPoint presentations (`new PptxGenJS()`).",
	"- Use `jszip` for ODT packaging.",
	"- Use the pre-loaded `createPDF()` helper for programmatic PDFs.",
	"- Write the final output file to `/output` or no file will be created.",
	"",
	"General rules for both tools:",
	"- If the user asks for a downloadable file and a file-generation tool is available, call it instead of only describing the result in text.",
	"- Do not use generic code-execution tools such as `run_python_repl` as a substitute for downloadable-file requests when a dedicated file-generation tool is available.",
	"- Only tell the user a file is ready after the tool succeeds.",
	"- Do not mention the generated file name or include a file download link in your response text. The file will automatically appear in the chat UI with a download button.",
	"- Generated files appear in the chat UI after the response finishes.",
	"- If file generation fails, inspect the actual error, make one clear fix, and retry at most once without switching tools.",
].join("\n");

const IMAGE_SEARCH_GUARD = [
	"Image search workflow:",
	"- When the user asks for images, call the `image_search` tool.",
	"- The tool returns a JSON list of image URLs.",
	"- You MUST embed these URLs into your final text response using standard markdown syntax: `![alt text](url)` exactly where you want them to appear.",
	"- The user cannot see the raw tool output, so if you do not write the markdown tags, the images will be invisible.",
].join("\n");

const PERSONA_MEMORY_GUARD = [
	"Persona Memory Usage:",
	"- Persona memory describes the human user for personalization and direct address.",
	"- Do NOT incorporate persona facts (pet ownership, hobbies, biographical details) into generated documents, reports, or file content unless the user explicitly asks for them.",
].join("\n");

function containsHttpUrl(value: string): boolean {
	return /https?:\/\/[^\s)>\]]+/i.test(value);
}

function buildOutboundSystemPrompt(params: {
	basePrompt: string;
	inputValue: string;
	systemPromptAppendix?: string;
}): string {
	const basePrompt = params.basePrompt.trim();
	const todayStr = new Date().toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});
	const explicitDateContext = `[SYSTEM TIME CONTEXT: Today is ${todayStr}. Use this exact date as your current temporal anchor for all relative timeframes. You do not need to call a tool to find the date.]`;
	const additions: string[] = [
		explicitDateContext,
		DATE_BEFORE_SEARCH_GUARD,
		FILE_GENERATION_GUARD,
		IMAGE_SEARCH_GUARD,
		PERSONA_MEMORY_GUARD,
	];

	if (containsHttpUrl(params.inputValue)) {
		additions.push(URL_LIST_TOOL_ARGUMENT_GUARD);
	}

	if (
		typeof params.systemPromptAppendix === "string" &&
		params.systemPromptAppendix.trim()
	) {
		additions.push(params.systemPromptAppendix.trim());
	}

	if (additions.length === 0) {
		return basePrompt;
	}

	const uniqueAdditions = Array.from(new Set(additions));
	if (!basePrompt) {
		return `## Tool And Search Guidance\n${uniqueAdditions.join("\n\n")}`;
	}

	return `${basePrompt}\n\n## Tool And Search Guidance\n${uniqueAdditions.join("\n\n")}`;
}

function buildLangflowTweaks(
	modelConfig: ModelConfig,
	systemPrompt: string,
): Record<string, unknown> {
	const componentId = modelConfig.componentId.trim();
	const componentTweaks = {
		model_name: modelConfig.modelName,
		api_base: modelConfig.baseUrl,
		system_prompt: systemPrompt,
	};

	if (!componentId) {
		return componentTweaks;
	}

	return {
		[componentId]: componentTweaks,
	};
}

function mergeAbortSignals(
	...signals: Array<AbortSignal | undefined>
): AbortSignal {
	const activeSignals = signals.filter((signal): signal is AbortSignal =>
		Boolean(signal),
	);

	if (activeSignals.length === 1) {
		return activeSignals[0];
	}

	const controller = new AbortController();
	const abort = () => controller.abort();

	for (const signal of activeSignals) {
		if (signal.aborted) {
			controller.abort();
			break;
		}

		signal.addEventListener("abort", abort, { once: true });
	}

	return controller.signal;
}

export function extractMessageText(response: LangflowRunResponse): string {
	try {
		const text = response.outputs?.[0]?.outputs?.[0]?.results?.message?.text;

		if (typeof text !== "string" || text === "") {
			throw new Error("Could not extract message text from Langflow response");
		}

		return text;
	} catch (error) {
		throw new Error(
			`Failed to extract message text: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export async function sendMessage(
	message: string,
	sessionId: string,
	modelId?: ModelId,
	user?: AuthenticatedPromptUser,
	options?: {
		signal?: AbortSignal;
		attachmentIds?: string[];
		activeDocumentArtifactId?: string;
		attachmentTraceId?: string;
		systemPromptAppendix?: string;
	},
): Promise<{
	text: string;
	rawResponse: LangflowRunResponse;
	contextStatus?: import("$lib/types").ConversationContextStatus;
	taskState?: import("$lib/types").TaskState | null;
	contextDebug?: import("$lib/types").ContextDebugState | null;
	honchoContext?: import("$lib/types").HonchoContextInfo | null;
	honchoSnapshot?: import("$lib/types").HonchoContextSnapshot | null;
}> {
	const config = getConfig();
	const controller = new AbortController();
	const timeoutId = setTimeout(
		() => controller.abort(),
		config.requestTimeoutMs,
	);
	const signal = mergeAbortSignals(options?.signal, controller.signal);

	try {
		const modelConfig = modelId ? config[modelId] : config.model1;
		const flowId = modelConfig.flowId || config.langflowFlowId;
		const url = `${config.langflowApiUrl}/api/v1/run/${flowId}`;
		const modelName = modelConfig.modelName;
		const baseUrl = modelConfig.baseUrl;

		let inputValue = message;
		let contextStatus:
			| import("$lib/types").ConversationContextStatus
			| undefined;
		let taskState: import("$lib/types").TaskState | null | undefined;
		let contextDebug: import("$lib/types").ContextDebugState | null | undefined;
		let honchoContext:
			| import("$lib/types").HonchoContextInfo
			| null
			| undefined;
		let honchoSnapshot:
			| import("$lib/types").HonchoContextSnapshot
			| null
			| undefined;
		if (user?.id) {
			const constructed = await buildConstructedContext({
				userId: user.id,
				conversationId: sessionId,
				message,
				attachmentIds: options?.attachmentIds,
				activeDocumentArtifactId: options?.activeDocumentArtifactId,
				attachmentTraceId: options?.attachmentTraceId,
			});
			inputValue = constructed.inputValue;
			contextStatus = constructed.contextStatus;
			taskState = constructed.taskState;
			contextDebug = constructed.contextDebug;
			honchoContext = constructed.honchoContext;
			honchoSnapshot = constructed.honchoSnapshot;
		}

		const attachmentSection = summarizeAttachmentSectionInInput(inputValue);
		if ((options?.attachmentIds?.length ?? 0) > 0) {
			logAttachmentTrace("langflow_request", {
				traceId: options?.attachmentTraceId ?? null,
				sessionId,
				inputValueLength: inputValue.length,
				hasCurrentAttachmentsMarker: attachmentSection.hasMarker,
				attachmentSectionPreview: attachmentSection.preview,
				attachmentSectionPreviewHash: attachmentSection.previewHash,
			});
			if (!attachmentSection.hasMarker) {
				console.warn(
					"[LANGFLOW] Attachment marker missing from outgoing request bundle",
					{
						sessionId,
						attachmentIds: options?.attachmentIds ?? [],
						traceId: options?.attachmentTraceId ?? null,
						inputValueLength: inputValue.length,
					},
				);
			}
		}

		const baseSystemPrompt = user?.id
			? await buildEnhancedSystemPrompt(modelConfig.systemPrompt, {
					userId: user.id,
					displayName: user.displayName,
					email: user.email,
				})
			: getSystemPrompt(modelConfig.systemPrompt);
		const systemPrompt = buildOutboundSystemPrompt({
			basePrompt: baseSystemPrompt,
			inputValue,
			systemPromptAppendix: options?.systemPromptAppendix,
		});

		const body: LangflowRunRequest & { tweaks?: Record<string, unknown> } = {
			input_value: inputValue,
			input_type: "chat",
			output_type: "chat",
			session_id: sessionId,
			tweaks: buildLangflowTweaks(modelConfig, systemPrompt),
		};

		console.info("[LANGFLOW] Starting request", {
			url,
			flowId,
			sessionId,
			userId: user?.id ?? null,
			modelId: modelId ?? "model1",
			modelName,
			attachmentCount: options?.attachmentIds?.length ?? 0,
			inputLength: inputValue.length,
		});

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": config.langflowApiKey,
			},
			body: JSON.stringify(body),
			signal,
		});

		if (!response.ok) {
			const errorBody = await response.text().catch(() => "");
			console.error("[LANGFLOW] sendMessage non-OK response", {
				url,
				status: response.status,
				statusText: response.statusText,
				bodyPreview: errorBody.slice(0, 1000),
			});
			throw new Error(
				`Langflow API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody.slice(0, 500)}` : ""}`,
			);
		}

		const rawResponse: LangflowRunResponse = await response.json();
		const text = extractMessageText(rawResponse);

		return {
			text,
			rawResponse,
			contextStatus,
			taskState,
			contextDebug,
			honchoContext,
			honchoSnapshot,
		};
	} catch (error) {
		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
}

export async function sendMessageStream(
	message: string,
	sessionId: string,
	modelId?: ModelId,
	options?: {
		connectTimeoutMs?: number;
		signal?: AbortSignal;
		user?: AuthenticatedPromptUser;
		attachmentIds?: string[];
		activeDocumentArtifactId?: string;
		attachmentTraceId?: string;
		systemPromptAppendix?: string;
	},
): Promise<{
	stream?: ReadableStream<Uint8Array>;
	text?: string;
	rawResponse?: LangflowRunResponse;
	contextStatus?: import("$lib/types").ConversationContextStatus;
	taskState?: import("$lib/types").TaskState | null;
	contextDebug?: import("$lib/types").ContextDebugState | null;
	honchoContext?: import("$lib/types").HonchoContextInfo | null;
	honchoSnapshot?: import("$lib/types").HonchoContextSnapshot | null;
}> {
	const config = getConfig();
	const timeoutController = new AbortController();
	const timeoutId = setTimeout(
		() => timeoutController.abort(),
		config.requestTimeoutMs,
	);
	const connectTimeoutMs = Math.min(
		config.requestTimeoutMs,
		Math.max(1000, options?.connectTimeoutMs ?? config.requestTimeoutMs),
	);
	const connectTimeoutController = new AbortController();
	let connectTimedOut = false;
	const connectTimeoutId = setTimeout(() => {
		connectTimedOut = true;
		connectTimeoutController.abort();
	}, connectTimeoutMs);
	const signal = mergeAbortSignals(
		options?.signal,
		timeoutController.signal,
		connectTimeoutController.signal,
	);

	try {
		const modelConfig = modelId ? config[modelId] : config.model1;
		const flowId = modelConfig.flowId || config.langflowFlowId;
		const url = `${config.langflowApiUrl}/api/v1/run/${flowId}?stream=true`;
		const modelName = modelConfig.modelName;
		const baseUrl = modelConfig.baseUrl;

		let inputValue = message;
		let contextStatus:
			| import("$lib/types").ConversationContextStatus
			| undefined;
		let taskState: import("$lib/types").TaskState | null | undefined;
		let contextDebug: import("$lib/types").ContextDebugState | null | undefined;
		let honchoContext:
			| import("$lib/types").HonchoContextInfo
			| null
			| undefined;
		let honchoSnapshot:
			| import("$lib/types").HonchoContextSnapshot
			| null
			| undefined;
		if (options?.user?.id) {
			const constructed = await buildConstructedContext({
				userId: options.user.id,
				conversationId: sessionId,
				message,
				attachmentIds: options.attachmentIds,
				activeDocumentArtifactId: options.activeDocumentArtifactId,
				attachmentTraceId: options.attachmentTraceId,
			});
			inputValue = constructed.inputValue;
			contextStatus = constructed.contextStatus;
			taskState = constructed.taskState;
			contextDebug = constructed.contextDebug;
			honchoContext = constructed.honchoContext;
			honchoSnapshot = constructed.honchoSnapshot;
		}

		const attachmentSection = summarizeAttachmentSectionInInput(inputValue);
		if ((options?.attachmentIds?.length ?? 0) > 0) {
			logAttachmentTrace("langflow_request", {
				traceId: options?.attachmentTraceId ?? null,
				sessionId,
				inputValueLength: inputValue.length,
				hasCurrentAttachmentsMarker: attachmentSection.hasMarker,
				attachmentSectionPreview: attachmentSection.preview,
				attachmentSectionPreviewHash: attachmentSection.previewHash,
			});
			if (!attachmentSection.hasMarker) {
				console.warn(
					"[LANGFLOW] Attachment marker missing from outgoing streaming bundle",
					{
						sessionId,
						attachmentIds: options?.attachmentIds ?? [],
						traceId: options?.attachmentTraceId ?? null,
						inputValueLength: inputValue.length,
					},
				);
			}
		}

		const baseSystemPrompt = options?.user?.id
			? await buildEnhancedSystemPrompt(modelConfig.systemPrompt, {
					userId: options.user.id,
					displayName: options.user.displayName,
					email: options.user.email,
				})
			: getSystemPrompt(modelConfig.systemPrompt);
		const systemPrompt = buildOutboundSystemPrompt({
			basePrompt: baseSystemPrompt,
			inputValue,
			systemPromptAppendix: options?.systemPromptAppendix,
		});

		const body: LangflowRunRequest & { tweaks?: Record<string, unknown> } = {
			input_value: inputValue,
			input_type: "chat",
			output_type: "chat",
			session_id: sessionId,
			tweaks: buildLangflowTweaks(modelConfig, systemPrompt),
		};

		console.info("[LANGFLOW] Starting streaming request", {
			url,
			flowId,
			sessionId,
			userId: options?.user?.id ?? null,
			modelId: modelId ?? "model1",
			modelName,
			attachmentCount: options?.attachmentIds?.length ?? 0,
			inputLength: inputValue.length,
		});

		const response = await fetch(url, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Cache-Control": "no-cache",
				"Content-Type": "application/json",
				"x-api-key": config.langflowApiKey,
			},
			body: JSON.stringify(body),
			signal,
		});
		clearTimeout(connectTimeoutId);

		if (!response.ok) {
			const errorBody = await response.text().catch(() => "");
			console.error("[LANGFLOW] sendMessageStream non-OK response", {
				url,
				status: response.status,
				statusText: response.statusText,
				bodyPreview: errorBody.slice(0, 1000),
			});
			throw new Error(
				`Langflow API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody.slice(0, 500)}` : ""}`,
			);
		}

		const contentType = response.headers.get("content-type") ?? "";
		if (!contentType.includes("text/event-stream")) {
			const rawResponse: LangflowRunResponse = await response.json();
			const text = extractMessageText(rawResponse);
			console.warn(
				"[LANGFLOW] sendMessageStream received non-stream JSON response",
				{
					url,
					sessionId,
					contentType,
					textLength: text.length,
				},
			);
			return {
				text,
				rawResponse,
				contextStatus,
				taskState,
				contextDebug,
				honchoContext,
				honchoSnapshot,
			};
		}

		if (!response.body) {
			console.error("[LANGFLOW] sendMessageStream missing response body", {
				url,
				sessionId,
			});
			throw new Error("Response body is empty");
		}

		return {
			stream: response.body as ReadableStream<Uint8Array>,
			contextStatus,
			taskState,
			contextDebug,
			honchoContext,
			honchoSnapshot,
		};
	} catch (error) {
		if (connectTimedOut) {
			const timeoutError = new Error(
				`Timed out waiting ${connectTimeoutMs}ms for Langflow streaming response headers`,
			) as Error & { code?: string };
			timeoutError.name = "LangflowStreamConnectTimeoutError";
			timeoutError.code = "langflow_stream_connect_timeout";
			throw timeoutError;
		}
		throw error;
	} finally {
		clearTimeout(timeoutId);
		clearTimeout(connectTimeoutId);
	}
}
