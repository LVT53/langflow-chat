import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { getVaults, createVault } from '$lib/server/services/knowledge/store/vaults';

interface CreateVaultBody {
	name: string;
	color?: string | null;
}

type ValidationSuccess = {
	ok: true;
	value: CreateVaultBody;
};

type ValidationError = {
	ok: false;
	error: string;
	status: number;
};

type ValidationResult = ValidationSuccess | ValidationError;

function isValidHexColor(color: string): boolean {
	return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
}

function validateCreateRequest(body: unknown): ValidationResult {
	if (typeof body !== 'object' || body === null) {
		return { ok: false, error: 'Invalid request body', status: 400 };
	}

	const { name, color } = body as Record<string, unknown>;

	if (name === undefined || name === null) {
		return { ok: false, error: 'Name is required', status: 400 };
	}

	if (typeof name !== 'string') {
		return { ok: false, error: 'Name must be a string', status: 400 };
	}

	const trimmedName = name.trim();
	if (trimmedName === '') {
		return { ok: false, error: 'Name cannot be empty', status: 400 };
	}

	if (trimmedName.length > 100) {
		return { ok: false, error: 'Name cannot exceed 100 characters', status: 400 };
	}

	if (color !== undefined && color !== null) {
		if (typeof color !== 'string') {
			return { ok: false, error: 'Color must be a string', status: 400 };
		}

		if (!isValidHexColor(color)) {
			return { ok: false, error: 'Color must be a valid hex color (#RGB or #RRGGBB)', status: 400 };
		}
	}

	return {
		ok: true,
		value: {
			name: trimmedName,
			color: color === undefined ? undefined : (color as string | null)
		}
	};
}

export const GET: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;

	const vaults = await getVaults(user.id);
	return json({ vaults });
};

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;

	const body = await event.request.json().catch(() => ({}));
	const validation = validateCreateRequest(body);

	if (validation.ok === false) {
		return json({ error: validation.error }, { status: validation.status });
	}

	const { name, color } = validation.value;
	const vault = await createVault(user.id, name, color);

	return json(vault, { status: 201 });
};
