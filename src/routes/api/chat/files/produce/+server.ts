import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyFileGenerateServiceAssertion } from '$lib/server/auth/hooks';
import { getConversation, getConversationUserId } from '$lib/server/services/conversations';
import {
	createFailedFileProductionJob,
	createOrReuseFileProductionJob,
	wakeFileProductionWorker,
} from '$lib/server/services/file-production';

type ProduceProgramLanguage = 'python' | 'javascript';

interface ProduceProgramRequest {
	conversationId: string;
	assistantMessageId?: string | null;
	idempotencyKey: string;
	requestTitle: string;
	sourceMode: 'program';
	outputs?: Array<{ type: string }>;
	documentIntent?: string | null;
	program: {
		language: ProduceProgramLanguage;
		sourceCode: string;
		filename?: string;
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function validateProgramRequest(
	body: unknown
):
	| { ok: true; value: ProduceProgramRequest }
	| { ok: false; error: string; code: string; status: number } {
	if (!isRecord(body)) {
		return { ok: false, error: 'JSON body is required', code: 'invalid_json_body', status: 400 };
	}
	const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : '';
	const idempotencyKey =
		typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
	const requestTitle = typeof body.requestTitle === 'string' ? body.requestTitle.trim() : '';
	const sourceMode = body.sourceMode;
	const program = isRecord(body.program) ? body.program : null;
	const language = program && typeof program.language === 'string' ? program.language.trim() : '';
	const sourceCode =
		program && typeof program.sourceCode === 'string' ? program.sourceCode.trim() : '';

	if (!conversationId) {
		return { ok: false, error: 'conversationId is required', code: 'missing_conversation_id', status: 400 };
	}
	if (!idempotencyKey) {
		return { ok: false, error: 'idempotencyKey is required', code: 'missing_idempotency_key', status: 400 };
	}
	if (!requestTitle) {
		return { ok: false, error: 'requestTitle is required', code: 'missing_request_title', status: 400 };
	}
	if (sourceMode !== 'program') {
		return { ok: false, error: 'sourceMode must be program', code: 'unsupported_source_mode', status: 422 };
	}
	if (language !== 'python' && language !== 'javascript') {
		return {
			ok: false,
			error: 'program.language must be python or javascript',
			code: 'invalid_program_language',
			status: 422,
		};
	}
	if (!sourceCode) {
		return { ok: false, error: 'program.sourceCode is required', code: 'missing_program_source', status: 422 };
	}

	return {
		ok: true,
		value: {
			conversationId,
			assistantMessageId:
				typeof body.assistantMessageId === 'string' && body.assistantMessageId.trim()
					? body.assistantMessageId.trim()
					: null,
			idempotencyKey,
			requestTitle,
			sourceMode: 'program',
			outputs: Array.isArray(body.outputs)
				? body.outputs
						.filter((output): output is Record<string, unknown> => isRecord(output))
						.map((output) => ({
							type: typeof output.type === 'string' ? output.type.trim() : 'file',
						}))
				: [],
			documentIntent:
				typeof body.documentIntent === 'string' && body.documentIntent.trim()
					? body.documentIntent.trim()
					: null,
			program: {
				language: language as ProduceProgramLanguage,
				sourceCode,
				filename:
					program && typeof program.filename === 'string' && program.filename.trim()
						? program.filename.trim()
						: undefined,
			},
		},
	};
}

function extractFailureDraft(body: unknown) {
	if (!isRecord(body)) return null;
	const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : '';
	const idempotencyKey =
		typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
	const requestTitle = typeof body.requestTitle === 'string' ? body.requestTitle.trim() : '';
	if (!conversationId || !idempotencyKey || !requestTitle) return null;

	return {
		conversationId,
		assistantMessageId:
			typeof body.assistantMessageId === 'string' && body.assistantMessageId.trim()
				? body.assistantMessageId.trim()
				: null,
		idempotencyKey,
		requestTitle,
		sourceMode: typeof body.sourceMode === 'string' && body.sourceMode.trim()
			? body.sourceMode.trim()
			: 'unknown',
		documentIntent:
			typeof body.documentIntent === 'string' && body.documentIntent.trim()
				? body.documentIntent.trim()
				: null,
		requestJson: isRecord(body)
			? {
					sourceMode: typeof body.sourceMode === 'string' ? body.sourceMode : null,
					outputs: Array.isArray(body.outputs) ? body.outputs : [],
					documentIntent: typeof body.documentIntent === 'string' ? body.documentIntent : null,
					program: isRecord(body.program) ? body.program : null,
				}
			: null,
	};
}

async function resolveOwnerUserId(event: Parameters<RequestHandler>[0], conversationId: string) {
	const user = event.locals.user ?? null;

	if (!user && !event.request.headers.get('authorization')) {
		return { ok: false as const, response: json({ error: 'Unauthorized' }, { status: 401 }) };
	}

	if (user) {
		const conversation = await getConversation(user.id, conversationId);
		if (!conversation) {
			return {
				ok: false as const,
				response: json({ error: 'Conversation not found' }, { status: 404 }),
			};
		}
		return { ok: true as const, userId: user.id };
	}

	const serviceAssertion = verifyFileGenerateServiceAssertion(
		event.request.headers.get('authorization')
	);
	if (!serviceAssertion?.valid || serviceAssertion.claims.conversationId !== conversationId) {
		return { ok: false as const, response: json({ error: 'Unauthorized' }, { status: 401 }) };
	}
	const conversationUserId = await getConversationUserId(conversationId);
	if (!conversationUserId) {
		return {
			ok: false as const,
			response: json({ error: 'Conversation not found' }, { status: 404 }),
		};
	}
	return { ok: true as const, userId: conversationUserId };
}

export const POST: RequestHandler = async (event) => {
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const validation = validateProgramRequest(body);
	if (!validation.ok) {
		const failureDraft = extractFailureDraft(body);
		if (failureDraft && validation.status >= 422) {
			const owner = await resolveOwnerUserId(event, failureDraft.conversationId);
			if (!owner.ok) return owner.response;
			const job = await createFailedFileProductionJob({
				userId: owner.userId,
				conversationId: failureDraft.conversationId,
				assistantMessageId: failureDraft.assistantMessageId,
				title: failureDraft.requestTitle,
				origin: 'unified_produce',
				idempotencyKey: failureDraft.idempotencyKey,
				sourceMode: failureDraft.sourceMode,
				documentIntent: failureDraft.documentIntent,
				requestJson: failureDraft.requestJson,
				errorCode: validation.code,
				errorMessage: validation.error,
				retryable: false,
			});
			return json({ error: validation.error, job }, { status: validation.status });
		}
		return json({ error: validation.error }, { status: validation.status });
	}

	const request = validation.value;
	const owner = await resolveOwnerUserId(event, request.conversationId);
	if (!owner.ok) return owner.response;

	const result = await createOrReuseFileProductionJob({
		userId: owner.userId,
		conversationId: request.conversationId,
		assistantMessageId: request.assistantMessageId ?? null,
		title: request.requestTitle,
		origin: 'unified_produce',
		idempotencyKey: request.idempotencyKey,
		sourceMode: request.sourceMode,
		documentIntent: request.documentIntent ?? null,
		requestJson: {
			sourceMode: request.sourceMode,
			outputs: request.outputs ?? [],
			documentIntent: request.documentIntent ?? null,
			program: request.program,
		},
	});

	if (result.job.status === 'queued' || result.job.status === 'running') {
		await wakeFileProductionWorker();
	}

	return json({ job: result.job, reused: result.reused }, { status: 202 });
};
