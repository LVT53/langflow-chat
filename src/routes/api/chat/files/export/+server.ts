import { json } from '@sveltejs/kit';
import { randomUUID } from 'crypto';
import path from 'path';
import type { RequestHandler } from './$types';
import { verifyFileGenerateServiceAssertion } from '$lib/server/auth/hooks';
import { getConversation, getConversationUserId } from '$lib/server/services/conversations';
import { storeGeneratedFile } from '$lib/server/services/chat-files';
import { runUserMemoryMaintenance } from '$lib/server/services/memory-maintenance';
import { listMessages } from '$lib/server/services/messages';
import { parseMarkdown } from '$lib/server/utils/markdown-parser';
import { generatePdfFromHtml } from '$lib/server/services/pdf-generator';
import TerracottaCrownLayout from '$lib/components/pdf/TerracottaCrownLayout.svelte';
import { render } from 'svelte/server';

interface ExportRequest {
	conversationId: string;
	filename: string;
	markdown?: string;
	format: 'pdf' | 'docx';
}

function validateRequest(body: unknown): { ok: true; value: ExportRequest } | { ok: false; error: string; status: number } {
	if (!body || typeof body !== 'object') {
		return { ok: false, error: 'Invalid request body', status: 400 };
	}

	const { conversationId, filename, markdown, format } = body as Record<string, unknown>;

	if (typeof conversationId !== 'string' || conversationId.trim().length === 0) {
		return { ok: false, error: 'conversationId is required', status: 400 };
	}

	if (typeof filename !== 'string' || filename.trim().length === 0) {
		return { ok: false, error: 'filename is required', status: 400 };
	}

	if (format !== 'pdf' && format !== 'docx') {
		return { ok: false, error: 'format must be pdf or docx', status: 400 };
	}

	return {
		ok: true,
		value: {
			conversationId: conversationId.trim(),
			filename: filename.trim(),
			markdown: typeof markdown === 'string' ? markdown.trim() : '',
			format: format as 'pdf' | 'docx'
		}
	};
}

export const POST: RequestHandler = async (event) => {
	const requestId = randomUUID().slice(0, 8);
	const user = event.locals.user ?? null;

	if (!user && !event.request.headers.get('authorization')) {
		console.warn('[FILE_EXPORT] Unauthorized request', { requestId });
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		console.warn('[FILE_EXPORT] Invalid JSON body', { requestId });
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const validation = validateRequest(body);
	if (validation.ok === false) {
		console.warn('[FILE_EXPORT] Request validation failed', {
			requestId,
			error: validation.error,
			status: validation.status,
		});
		return json({ error: validation.error }, { status: validation.status });
	}

	const { conversationId, filename, markdown: rawMarkdown, format } = validation.value;

	let markdown = rawMarkdown;
	if (!markdown) {
		const messages = await listMessages(conversationId);
		const lastAssistantMessage = messages.filter((m) => m.role === 'assistant').pop();
		if (!lastAssistantMessage) {
			console.warn('[FILE_EXPORT] No assistant message found for export', {
				requestId,
				conversationId,
			});
			return json({ error: 'No active document or previous message found to export.' }, { status: 400 });
		}
		markdown = lastAssistantMessage.content;
	}

	if (format !== 'pdf') {
		console.warn('[FILE_EXPORT] Unsupported format', { requestId, format });
		return json({ error: 'Only PDF export is currently supported' }, { status: 400 });
	}

	const serviceAssertion =
		user === null
			? verifyFileGenerateServiceAssertion(event.request.headers.get('authorization'))
			: null;
			
	if (user === null && (!serviceAssertion || !serviceAssertion.valid)) {
		const failureReason =
			serviceAssertion && serviceAssertion.valid === false
				? serviceAssertion.reason
				: 'missing_assertion';
		console.warn('[FILE_EXPORT] Invalid service assertion', {
			requestId,
			reason: failureReason,
		});
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	
	console.info('[FILE_EXPORT] Request received', {
		requestId,
		conversationId,
		authMode: user ? 'session' : 'service',
		userId: user?.id ?? null,
		filename,
		format,
		markdownLength: markdown.length
	});

	let ownerUserId: string;
	if (user) {
		const conversation = await getConversation(user.id, conversationId);
		if (!conversation) {
			console.warn('[FILE_EXPORT] Conversation not found for session request', {
				requestId,
				conversationId,
				userId: user.id,
			});
			return json({ error: 'Conversation not found' }, { status: 404 });
		}
		ownerUserId = user.id;
	} else {
		if (!serviceAssertion || !serviceAssertion.valid) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const assertedConversationId = serviceAssertion.claims.conversationId;
		if (assertedConversationId !== conversationId) {
			console.warn('[FILE_EXPORT] Service assertion conversation mismatch', {
				requestId,
				conversationId,
				assertedConversationId,
			});
			return json({ error: 'Conversation not found' }, { status: 404 });
		}

		const conversationUserId = await getConversationUserId(conversationId);
		if (!conversationUserId) {
			console.warn('[FILE_EXPORT] Conversation not found for service request', {
				requestId,
				conversationId,
				assertedUserId: serviceAssertion.claims.userId ?? null,
				conversationUserId,
			});
			return json({ error: 'Conversation not found' }, { status: 404 });
		}

		ownerUserId = conversationUserId;
	}

	void runUserMemoryMaintenance(ownerUserId, 'file_export_service').catch((error) => {
		console.error('[FILE_EXPORT] Deferred maintenance failed', {
			requestId,
			conversationId,
			ownerUserId,
			error,
		});
	});

	try {
		const { html: htmlContent, metadata: parsedMetadata } = parseMarkdown(markdown);
		
		const title = typeof parsedMetadata.title === 'string' ? parsedMetadata.title : filename.replace(/\.[^/.]+$/, "");
		const subtitle = typeof parsedMetadata.subtitle === 'string' ? parsedMetadata.subtitle : undefined;
		const author = typeof parsedMetadata.author === 'string' ? parsedMetadata.author : undefined;
		const date = typeof parsedMetadata.date === 'string' ? parsedMetadata.date : undefined;
		const cover = typeof parsedMetadata.cover === 'boolean' ? parsedMetadata.cover : false;
		
		const metadata = { title, subtitle, author, date, cover };
		
		const { html } = render(TerracottaCrownLayout, {
			props: {
				htmlContent,
				metadata
			}
		});

		const pdfBuffer = await generatePdfFromHtml(html);

		const actualFilename = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;

		const storedFile = await storeGeneratedFile(conversationId, ownerUserId, {
			filename: actualFilename,
			mimeType: 'application/pdf',
			content: pdfBuffer,
		});

		console.info('[FILE_EXPORT] Request succeeded', {
			requestId,
			conversationId,
			ownerUserId,
			fileId: storedFile.id,
		});

		return json({
			fileId: storedFile.id,
			url: `/api/chat/files/${storedFile.id}/download`,
			filename: storedFile.filename
		});
	} catch (error) {
		console.error('[FILE_EXPORT] PDF generation or storage failed', {
			requestId,
			conversationId,
			ownerUserId,
			error,
		});
		return json(
			{ error: 'Failed to generate or store PDF' },
			{ status: 500 }
		);
	}
};
