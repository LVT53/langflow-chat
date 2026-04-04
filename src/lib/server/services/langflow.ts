// Langflow API client service
import type { LangflowRunRequest, LangflowRunResponse, ModelId } from '$lib/types';
import { getSystemPrompt } from '../prompts';
import { getConfig } from '../config-store';
import type { ModelConfig } from '../env';
import { buildConstructedContext, buildEnhancedSystemPrompt } from './honcho';
import {
	logAttachmentTrace,
	summarizeAttachmentSectionInInput,
} from './attachment-trace';

const URL_LIST_TOOL_ARGUMENT_GUARD = [
	'Tool argument safety for URL-processing tools:',
	'- If a tool field is named `urls` or expects a list of URLs/links, always pass an array of strings.',
	'- For a single link, use `["https://example.com"]`, never a bare string.',
].join('\n');

const DATE_BEFORE_SEARCH_GUARD = [
	'Time-sensitive search workflow:',
	'- Before any web search, news search, or other freshness-sensitive search, first get the current date and time.',
	'- Use that date/time to frame the search query and interpret freshness.',
	'- Do not search first and check the date afterward.',
].join('\n');

const FILE_GENERATION_GUARD = [
	'Generated file workflow:',
	'- If the user asks you to create a downloadable file, document, report, spreadsheet, chart, or image and a file-generation tool is available, call it instead of only describing the result in text.',
	'- If a dedicated file-generation tool such as `generate_file` is available, do not claim it is unavailable.',
	'- Do not use generic code-execution tools such as `run_python_repl` as a substitute for downloadable-file requests when a dedicated file-generation tool is available.',
	'- If the file-generation tool exposes `source_code`, put the script there. Use the `language` argument to choose the runtime.',
	'- Use `language: "python"` for plain text and text-like files such as `.txt`, `.md`, `.csv`, `.json`, `.html`, `.xml`, `.svg`, `.rtf`, `.css`, `.js`, and `.py` when a simple direct file write is sufficient.',
	'- Use `language: "javascript"` for `.xlsx` files with `exceljs`, `.pdf` files with `pdf-lib`, `.pptx` files with `pptxgenjs`, and `.docx` files with `docx`.',
	'- Use `language: "javascript"` plus `jszip` when building `.odt` files, because ODT is a packaged OpenDocument container.',
	'- In the JavaScript runtime, write CommonJS-style scripts for `node -e`: use `require(...)`, not top-level `import` statements.',
	'- In the JavaScript runtime, prefer the smallest direct script. Do not wrap the whole script in another framework or agent layer.',
	'- Do not claim `.xlsx`, `.pdf`, `.pptx`, `.docx`, or `.odt` generation is unavailable when `generate_file` is available. Choose the appropriate runtime and use the installed libraries directly.',
	'- For `.xlsx`, prefer `exceljs`. For `.pdf`, prefer `pdf-lib`. For `.pptx`, prefer `pptxgenjs`. For `.docx`, prefer `docx`. For `.odt`, prefer `jszip` with a valid OpenDocument structure.',
	'- For `.pdf` with `pdf-lib`, create the PDF bytes with `await pdfDoc.save()` and write them directly to `/output/your-file.pdf`.',
	'- For `.pdf` with `pdf-lib` in Node/CommonJS, prefer this exact shape: `const { PDFDocument, StandardFonts, rgb } = require("pdf-lib"); const fs = require("fs"); const pdfDoc = await PDFDocument.create(); const page = pdfDoc.addPage([595, 842]); const font = await pdfDoc.embedFont(StandardFonts.Helvetica); page.drawText("Hello", { x: 50, y: 780, size: 12, font, color: rgb(0, 0, 0) }); const pdfBytes = await pdfDoc.save(); fs.writeFileSync("/output/file.pdf", pdfBytes);`',
	'- In `pdf-lib`, always embed a standard font first, for example `const font = await pdfDoc.embedFont(StandardFonts.Helvetica)`, and pass that `font` object to `drawText`.',
	'- Do not pass `StandardFonts.Helvetica` directly as `options.font`; `drawText` expects an embedded `PDFFont` object.',
	'- Do not use incorrect `pdf-lib` patterns such as `const { pdfDoc } = require("pdf-lib")`, `await pdfDoc.create()`, or calling `.create()` on an undefined/destructured instance.',
	'- Do not use invented `pdf-lib` APIs such as `pdfDoc.getStandardFont(...)`.',
	'- For `.pdf` generation in JavaScript, use Node-compatible file writes such as `require("fs").writeFileSync("/output/file.pdf", pdfBytes)` or `await require("fs").promises.writeFile(...)`.',
	'- Do not import preview-only libraries such as `pdfjs-dist` or `pptxviewjs` when generating files. They are for previewing, not file creation.',
	'- If a file-generation tool is available and you use it, write the final output files to `/output` or no file will be created.',
	'- Only tell the user a file is ready after the tool succeeds.',
	'- Generated files appear in the chat UI after the response finishes.',
	'- Do not claim you saved a generated file to a vault unless a dedicated save tool actually exists. Otherwise tell the user to use the chat UI `Save to Vault` action.',
	'- If `generate_file` fails, inspect the actual error, make one clear fix, and retry at most once.',
].join('\n');

function containsHttpUrl(value: string): boolean {
	return /https?:\/\/[^\s)>\]]+/i.test(value);
}

function buildOutboundSystemPrompt(params: {
	basePrompt: string;
	inputValue: string;
	systemPromptAppendix?: string;
}): string {
	const basePrompt = params.basePrompt.trim();
	const additions: string[] = [DATE_BEFORE_SEARCH_GUARD, FILE_GENERATION_GUARD];

	if (containsHttpUrl(params.inputValue)) {
		additions.push(URL_LIST_TOOL_ARGUMENT_GUARD);
	}

	if (typeof params.systemPromptAppendix === 'string' && params.systemPromptAppendix.trim()) {
		additions.push(params.systemPromptAppendix.trim());
	}

	if (additions.length === 0) {
		return basePrompt;
	}

	const uniqueAdditions = Array.from(new Set(additions));
	if (!basePrompt) {
		return `## Tool And Search Guidance\n${uniqueAdditions.join('\n\n')}`;
	}

	return `${basePrompt}\n\n## Tool And Search Guidance\n${uniqueAdditions.join('\n\n')}`;
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

function mergeAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal {
  const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));

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

    signal.addEventListener('abort', abort, { once: true });
  }

  return controller.signal;
}

export function extractMessageText(response: LangflowRunResponse): string {
  try {
    const text = response.outputs?.[0]?.outputs?.[0]?.results?.message?.text;
    
    if (typeof text !== 'string' || text === '') {
      throw new Error('Could not extract message text from Langflow response');
    }
    
    return text;
  } catch (error) {
    throw new Error(`Failed to extract message text: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function sendMessage(
  message: string,
  sessionId: string,
  modelId?: ModelId,
  userId?: string,
  options?: {
    signal?: AbortSignal;
    attachmentIds?: string[];
    attachmentTraceId?: string;
    systemPromptAppendix?: string;
  }
): Promise<{
  text: string;
  rawResponse: LangflowRunResponse;
  contextStatus?: import('$lib/types').ConversationContextStatus;
  taskState?: import('$lib/types').TaskState | null;
  contextDebug?: import('$lib/types').ContextDebugState | null;
  honchoContext?: import('$lib/types').HonchoContextInfo | null;
  honchoSnapshot?: import('$lib/types').HonchoContextSnapshot | null;
}> {
  const config = getConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  const signal = mergeAbortSignals(options?.signal, controller.signal);

  try {
    const modelConfig = modelId ? config[modelId] : config.model1;
    const flowId = modelConfig.flowId || config.langflowFlowId;
    const url = `${config.langflowApiUrl}/api/v1/run/${flowId}`;
    const modelName = modelConfig.modelName;
    const baseUrl = modelConfig.baseUrl;

    let inputValue = message;
    let contextStatus: import('$lib/types').ConversationContextStatus | undefined;
    let taskState: import('$lib/types').TaskState | null | undefined;
    let contextDebug: import('$lib/types').ContextDebugState | null | undefined;
    let honchoContext: import('$lib/types').HonchoContextInfo | null | undefined;
    let honchoSnapshot: import('$lib/types').HonchoContextSnapshot | null | undefined;
    if (userId) {
      const constructed = await buildConstructedContext({
        userId,
        conversationId: sessionId,
        message,
        attachmentIds: options?.attachmentIds,
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
      logAttachmentTrace('langflow_request', {
        traceId: options?.attachmentTraceId ?? null,
        sessionId,
        inputValueLength: inputValue.length,
        hasCurrentAttachmentsMarker: attachmentSection.hasMarker,
        attachmentSectionPreview: attachmentSection.preview,
        attachmentSectionPreviewHash: attachmentSection.previewHash,
      });
      if (!attachmentSection.hasMarker) {
        console.warn('[LANGFLOW] Attachment marker missing from outgoing request bundle', {
          sessionId,
          attachmentIds: options?.attachmentIds ?? [],
          traceId: options?.attachmentTraceId ?? null,
          inputValueLength: inputValue.length,
        });
      }
    }

    const baseSystemPrompt = userId
      ? await buildEnhancedSystemPrompt(modelConfig.systemPrompt, userId)
      : getSystemPrompt(modelConfig.systemPrompt);
    const systemPrompt = buildOutboundSystemPrompt({
      basePrompt: baseSystemPrompt,
      inputValue,
      systemPromptAppendix: options?.systemPromptAppendix,
    });

    const body: LangflowRunRequest & { tweaks?: Record<string, unknown> } = {
      input_value: inputValue,
      input_type: 'chat',
      output_type: 'chat',
      session_id: sessionId,
      tweaks: buildLangflowTweaks(modelConfig, systemPrompt)
    };

    console.info('[LANGFLOW] Starting request', {
      url,
      flowId,
      sessionId,
      userId: userId ?? null,
      modelId: modelId ?? 'model1',
      modelName,
      attachmentCount: options?.attachmentIds?.length ?? 0,
      inputLength: inputValue.length,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.langflowApiKey
      },
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error('[LANGFLOW] sendMessage non-OK response', {
        url,
        status: response.status,
        statusText: response.statusText,
        bodyPreview: errorBody.slice(0, 1000)
      });
      throw new Error(`Langflow API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody.slice(0, 500)}` : ''}`);
    }

    const rawResponse: LangflowRunResponse = await response.json();
    const text = extractMessageText(rawResponse);

    return { text, rawResponse, contextStatus, taskState, contextDebug, honchoContext, honchoSnapshot };
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
    userId?: string;
    attachmentIds?: string[];
    attachmentTraceId?: string;
    systemPromptAppendix?: string;
  }
): Promise<{
  stream?: ReadableStream<Uint8Array>;
  text?: string;
  rawResponse?: LangflowRunResponse;
  contextStatus?: import('$lib/types').ConversationContextStatus;
  taskState?: import('$lib/types').TaskState | null;
  contextDebug?: import('$lib/types').ContextDebugState | null;
  honchoContext?: import('$lib/types').HonchoContextInfo | null;
  honchoSnapshot?: import('$lib/types').HonchoContextSnapshot | null;
}> {
  const config = getConfig();
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), config.requestTimeoutMs);
  const connectTimeoutMs = Math.min(
    config.requestTimeoutMs,
    Math.max(1000, options?.connectTimeoutMs ?? config.requestTimeoutMs)
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
    connectTimeoutController.signal
  );

  try {
    const modelConfig = modelId ? config[modelId] : config.model1;
    const flowId = modelConfig.flowId || config.langflowFlowId;
    const url = `${config.langflowApiUrl}/api/v1/run/${flowId}?stream=true`;
    const modelName = modelConfig.modelName;
    const baseUrl = modelConfig.baseUrl;

    let inputValue = message;
    let contextStatus: import('$lib/types').ConversationContextStatus | undefined;
    let taskState: import('$lib/types').TaskState | null | undefined;
    let contextDebug: import('$lib/types').ContextDebugState | null | undefined;
    let honchoContext: import('$lib/types').HonchoContextInfo | null | undefined;
    let honchoSnapshot: import('$lib/types').HonchoContextSnapshot | null | undefined;
    if (options?.userId) {
      const constructed = await buildConstructedContext({
        userId: options.userId,
        conversationId: sessionId,
        message,
        attachmentIds: options.attachmentIds,
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
      logAttachmentTrace('langflow_request', {
        traceId: options?.attachmentTraceId ?? null,
        sessionId,
        inputValueLength: inputValue.length,
        hasCurrentAttachmentsMarker: attachmentSection.hasMarker,
        attachmentSectionPreview: attachmentSection.preview,
        attachmentSectionPreviewHash: attachmentSection.previewHash,
      });
      if (!attachmentSection.hasMarker) {
        console.warn('[LANGFLOW] Attachment marker missing from outgoing streaming bundle', {
          sessionId,
          attachmentIds: options?.attachmentIds ?? [],
          traceId: options?.attachmentTraceId ?? null,
          inputValueLength: inputValue.length,
        });
      }
    }

    const baseSystemPrompt = options?.userId
      ? await buildEnhancedSystemPrompt(modelConfig.systemPrompt, options.userId)
      : getSystemPrompt(modelConfig.systemPrompt);
    const systemPrompt = buildOutboundSystemPrompt({
      basePrompt: baseSystemPrompt,
      inputValue,
      systemPromptAppendix: options?.systemPromptAppendix,
    });

    const body: LangflowRunRequest & { tweaks?: Record<string, unknown> } = {
      input_value: inputValue,
      input_type: 'chat',
      output_type: 'chat',
      session_id: sessionId,
      tweaks: buildLangflowTweaks(modelConfig, systemPrompt)
    };

    console.info('[LANGFLOW] Starting streaming request', {
      url,
      flowId,
      sessionId,
      userId: options?.userId ?? null,
      modelId: modelId ?? 'model1',
      modelName,
      attachmentCount: options?.attachmentIds?.length ?? 0,
      inputLength: inputValue.length,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'x-api-key': config.langflowApiKey,
      },
      body: JSON.stringify(body),
      signal
    });
    clearTimeout(connectTimeoutId);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error('[LANGFLOW] sendMessageStream non-OK response', {
        url,
        status: response.status,
        statusText: response.statusText,
        bodyPreview: errorBody.slice(0, 1000)
      });
      throw new Error(`Langflow API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody.slice(0, 500)}` : ''}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream')) {
      const rawResponse: LangflowRunResponse = await response.json();
      const text = extractMessageText(rawResponse);
      console.warn('[LANGFLOW] sendMessageStream received non-stream JSON response', {
        url,
        sessionId,
        contentType,
        textLength: text.length,
      });
      return { text, rawResponse, contextStatus, taskState, contextDebug, honchoContext, honchoSnapshot };
    }

    if (!response.body) {
      console.error('[LANGFLOW] sendMessageStream missing response body', { url, sessionId });
      throw new Error('Response body is empty');
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
        `Timed out waiting ${connectTimeoutMs}ms for Langflow streaming response headers`
      ) as Error & { code?: string };
      timeoutError.name = 'LangflowStreamConnectTimeoutError';
      timeoutError.code = 'langflow_stream_connect_timeout';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    clearTimeout(connectTimeoutId);
  }
}
