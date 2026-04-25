import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render } from 'svelte/server';
import TerracottaCrownLayout from '$lib/components/pdf/TerracottaCrownLayout.svelte';
import { storeGeneratedFile } from '$lib/server/services/chat-files';
import { searchImages } from '$lib/server/services/image-search';
import { listMessages } from '$lib/server/services/messages';
import { generatePdfFromHtml } from '$lib/server/services/pdf-generator';
import { executeCode } from '$lib/server/services/sandbox-execution';
import { parseMarkdown } from '$lib/server/utils/markdown-parser';
import { previewText } from '$lib/server/utils/text';
import type { ToolEvidenceCandidate } from '$lib/types';

export type OpenAiToolDefinition = {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
};

export type ProviderToolResult = {
	output: string;
	outputSummary: string | null;
	sourceType: 'web' | 'tool';
	candidates: ToolEvidenceCandidate[];
};

type ExecuteToolParams = {
	name: string;
	input: Record<string, unknown>;
	conversationId: string;
	userId: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../../..');

export const PROVIDER_TOOL_DEFINITIONS: OpenAiToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: 'image_search',
			description: 'Search the web for images and return image URLs with metadata.',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string', description: 'Image search query.' },
				},
				required: ['query'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'generate_file',
			description:
				'Generate downloadable files by executing Python or JavaScript code that writes final files to /output.',
			parameters: {
				type: 'object',
				properties: {
					language: { type: 'string', enum: ['python', 'javascript'] },
					source_code: { type: 'string', description: 'Code to execute.' },
					filename: { type: 'string', description: 'Optional final filename.' },
				},
				required: ['language', 'source_code'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'export_document',
			description:
				'Export Markdown content, or the latest assistant response when content is empty, as a styled PDF.',
			parameters: {
				type: 'object',
				properties: {
					markdown_content: { type: 'string' },
					filename: { type: 'string' },
				},
				required: ['filename'],
				additionalProperties: false,
			},
		},
	},
];

function loadFontsAsBase64() {
	const fontsDir = path.join(projectRoot, 'static', 'fonts');
	const fontFiles = {
		nimbusRegular: 'NimbusSanL-Regular.woff2',
		nimbusRegularItalic: 'NimbusSanL-RegularItalic.woff2',
		nimbusBold: 'NimbusSanL-Bold.woff2',
		nimbusBoldItalic: 'NimbusSanL-BoldItalic.woff2',
		libreRegular: 'LibreBaskerville-Regular.woff2',
		libreItalic: 'LibreBaskerville-Italic.woff2',
		libreBold: 'LibreBaskerville-Bold.woff2',
	};
	const fontData: Record<string, string> = {};
	for (const [key, filename] of Object.entries(fontFiles)) {
		try {
			const filePath = path.join(fontsDir, filename);
			fontData[key] = `data:font/woff2;base64,${readFileSync(filePath).toString('base64')}`;
		} catch {
			fontData[key] = `/fonts/${filename}`;
		}
	}
	return fontData;
}

function stringValue(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function toolCandidate(params: {
	id?: string;
	title: string;
	url?: string | null;
	snippet?: string | null;
	sourceType?: 'web' | 'tool';
}): ToolEvidenceCandidate {
	return {
		id: params.id ?? randomUUID(),
		title: params.title,
		url: params.url ?? null,
		snippet: params.snippet ?? null,
		sourceType: params.sourceType ?? 'tool',
	};
}

async function executeImageSearch(params: ExecuteToolParams): Promise<ProviderToolResult> {
	const query = stringValue(params.input.query);
	if (!query) {
		return {
			output: JSON.stringify({ success: false, error: 'query is required' }),
			outputSummary: null,
			sourceType: 'web',
			candidates: [],
		};
	}

	const results = await searchImages(query);
	const candidates = results.map((result, index) =>
		toolCandidate({
			id: `image-${index}`,
			title: result.title || result.url,
			url: result.url,
			snippet: result.source,
			sourceType: 'web',
		})
	);

	return {
		output: JSON.stringify({ success: true, message: `Found ${results.length} image(s)`, results }),
		outputSummary: `Found ${results.length} image(s)`,
		sourceType: 'web',
		candidates,
	};
}

async function executeGenerateFile(params: ExecuteToolParams): Promise<ProviderToolResult> {
	const language = stringValue(params.input.language);
	const code = stringValue(params.input.source_code) || stringValue(params.input.code);
	const filename = stringValue(params.input.filename);
	if (language !== 'python' && language !== 'javascript') {
		return {
			output: JSON.stringify({ success: false, error: 'language must be python or javascript' }),
			outputSummary: null,
			sourceType: 'tool',
			candidates: [],
		};
	}
	if (!code) {
		return {
			output: JSON.stringify({ success: false, error: 'source_code is required' }),
			outputSummary: null,
			sourceType: 'tool',
			candidates: [],
		};
	}

	const execution = await executeCode(code, language);
	if (execution.error) {
		return {
			output: JSON.stringify({ success: false, error: execution.error }),
			outputSummary: null,
			sourceType: 'tool',
			candidates: [],
		};
	}
	if (execution.files.length === 0) {
		return {
			output: JSON.stringify({
				success: false,
				error: 'The sandbox finished without creating a file. Write final output files to /output.',
			}),
			outputSummary: null,
			sourceType: 'tool',
			candidates: [],
		};
	}
	if (filename && execution.files.length !== 1) {
		return {
			output: JSON.stringify({
				success: false,
				error: 'filename can only be used when exactly one output file is generated.',
			}),
			outputSummary: null,
			sourceType: 'tool',
			candidates: [],
		};
	}

	const files = [];
	for (const file of execution.files) {
		const stored = await storeGeneratedFile(params.conversationId, params.userId, {
			filename: filename || file.filename,
			mimeType: file.mimeType,
			content: file.content,
		});
		files.push({
			id: stored.id,
			filename: stored.filename,
			downloadUrl: `/api/chat/files/${stored.id}/download`,
			size: stored.sizeBytes,
			mimeType: stored.mimeType || 'application/octet-stream',
		});
	}

	const outputSummary =
		files.length === 1
			? `Generated file: ${files[0].filename} (${files[0].size} bytes)`
			: `Generated ${files.length} files`;

	return {
		output: JSON.stringify({
			success: true,
			message: outputSummary,
			files,
			stdoutPreview: previewText(execution.stdout),
		}),
		outputSummary,
		sourceType: 'tool',
		candidates: files.map((file) =>
			toolCandidate({
				id: file.id,
				title: file.filename,
				url: file.downloadUrl,
				snippet: `${file.mimeType}, ${file.size} bytes`,
			})
		),
	};
}

async function executeExportDocument(params: ExecuteToolParams): Promise<ProviderToolResult> {
	const filename = stringValue(params.input.filename) || 'document';
	let markdown = stringValue(params.input.markdown_content);
	if (!markdown) {
		const messages = await listMessages(params.conversationId);
		const lastAssistant = messages.filter((message) => message.role === 'assistant').pop();
		markdown = lastAssistant?.content ?? '';
	}
	if (!markdown) {
		return {
			output: JSON.stringify({
				success: false,
				error: 'No markdown_content or previous assistant message found to export.',
			}),
			outputSummary: null,
			sourceType: 'tool',
			candidates: [],
		};
	}

	const { html: htmlContent, metadata: parsedMetadata } = parseMarkdown(markdown);
	const actualFilename = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
	const metadata = {
		title:
			typeof parsedMetadata.title === 'string'
				? parsedMetadata.title
				: actualFilename.replace(/\.[^/.]+$/, ''),
		subtitle: typeof parsedMetadata.subtitle === 'string' ? parsedMetadata.subtitle : undefined,
		author: typeof parsedMetadata.author === 'string' ? parsedMetadata.author : undefined,
		date: typeof parsedMetadata.date === 'string' ? parsedMetadata.date : undefined,
		cover: typeof parsedMetadata.cover === 'boolean' ? parsedMetadata.cover : false,
	};
	const { html } = render(TerracottaCrownLayout, {
		props: {
			htmlContent,
			metadata,
			fontData: loadFontsAsBase64(),
		},
	});
	const content = await generatePdfFromHtml(html);
	const stored = await storeGeneratedFile(params.conversationId, params.userId, {
		filename: actualFilename,
		mimeType: 'application/pdf',
		content,
	});
	const downloadUrl = `/api/chat/files/${stored.id}/download`;
	const outputSummary = `Document exported successfully: ${downloadUrl}`;

	return {
		output: JSON.stringify({
			success: true,
			message: outputSummary,
			filePath: downloadUrl,
			filename: stored.filename,
		}),
		outputSummary,
		sourceType: 'tool',
		candidates: [
			toolCandidate({
				id: stored.id,
				title: stored.filename,
				url: downloadUrl,
				snippet: 'PDF export',
			}),
		],
	};
}

export async function executeProviderTool(params: ExecuteToolParams): Promise<ProviderToolResult> {
	if (params.name === 'image_search') return executeImageSearch(params);
	if (params.name === 'generate_file') return executeGenerateFile(params);
	if (params.name === 'export_document') return executeExportDocument(params);

	return {
		output: JSON.stringify({ success: false, error: `Unknown tool: ${params.name}` }),
		outputSummary: null,
		sourceType: 'tool',
		candidates: [],
	};
}
