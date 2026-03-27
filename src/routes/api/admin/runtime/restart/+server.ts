import { timingSafeEqual } from 'node:crypto';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/hooks';
import {
	activateRestartDrain,
	clearRestartDrain,
	getRestartGuardSnapshot,
} from '$lib/server/utils/restart-guard';

function hasValidBearerToken(request: Request): boolean {
	const authHeader = request.headers.get('authorization');
	if (!authHeader?.startsWith('Bearer ')) return false;

	const providedToken = authHeader.slice('Bearer '.length).trim();
	const expectedToken = process.env.DEPLOY_CONTROL_TOKEN || process.env.SESSION_SECRET || '';
	if (!providedToken || !expectedToken) return false;

	const providedBuffer = Buffer.from(providedToken);
	const expectedBuffer = Buffer.from(expectedToken);
	if (providedBuffer.length !== expectedBuffer.length) {
		return false;
	}

	return timingSafeEqual(providedBuffer, expectedBuffer);
}

function authorizeRestartControl(event: Parameters<RequestHandler>[0]): void {
	if (hasValidBearerToken(event.request)) {
		return;
	}

	requireAdmin(event);
}

async function readReason(request: Request): Promise<string | null> {
	try {
		const body = (await request.json()) as { reason?: unknown };
		return typeof body.reason === 'string' ? body.reason : null;
	} catch {
		return null;
	}
}

export const GET: RequestHandler = async (event) => {
	authorizeRestartControl(event);
	return json(getRestartGuardSnapshot());
};

export const POST: RequestHandler = async (event) => {
	authorizeRestartControl(event);
	const reason = await readReason(event.request);
	return json(activateRestartDrain(reason));
};

export const DELETE: RequestHandler = async (event) => {
	authorizeRestartControl(event);
	return json(clearRestartDrain());
};
