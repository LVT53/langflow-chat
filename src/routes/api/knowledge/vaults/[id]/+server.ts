import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { getVault, updateVault, deleteVault } from '$lib/server/services/knowledge/store/vaults';

interface UpdateVaultBody {
	name?: string;
	color?: string | null;
	sortOrder?: number;
}

type ValidationSuccess = {
	ok: true;
	value: UpdateVaultBody;
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

function validateUpdateRequest(body: unknown): ValidationResult {
	if (typeof body !== 'object' || body === null) {
		return { ok: false, error: 'Invalid request body', status: 400 };
	}

	const { name, color, sortOrder } = body as Record<string, unknown>;
	const updates: UpdateVaultBody = {};

	if (name !== undefined) {
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

		updates.name = trimmedName;
	}

	if (color !== undefined) {
		if (color !== null) {
			if (typeof color !== 'string') {
				return { ok: false, error: 'Color must be a string', status: 400 };
			}

			if (!isValidHexColor(color)) {
				return { ok: false, error: 'Color must be a valid hex color (#RGB or #RRGGBB)', status: 400 };
			}
		}

		updates.color = color as string | null;
	}

	if (sortOrder !== undefined) {
		if (typeof sortOrder !== 'number' || !Number.isInteger(sortOrder)) {
			return { ok: false, error: 'sortOrder must be an integer', status: 400 };
		}

		updates.sortOrder = sortOrder;
	}

	if (Object.keys(updates).length === 0) {
		return { ok: false, error: 'No valid fields to update', status: 400 };
	}

	return { ok: true, value: updates };
}

export const GET: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const vaultId = event.params.id;

	const vault = await getVault(user.id, vaultId);

	if (!vault) {
		return json({ error: 'Vault not found' }, { status: 404 });
	}

	return json(vault);
};

export const PATCH: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const vaultId = event.params.id;

	const body = await event.request.json().catch(() => ({}));
	const validation = validateUpdateRequest(body);

	if (validation.ok === false) {
		return json({ error: validation.error }, { status: validation.status });
	}

	const vault = await updateVault(user.id, vaultId, validation.value);

	if (!vault) {
		return json({ error: 'Vault not found' }, { status: 404 });
	}

	return json(vault);
};

export const DELETE: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const vaultId = event.params.id;

	const deleted = await deleteVault(user.id, vaultId);

	if (!deleted) {
		return json({ error: 'Vault not found' }, { status: 404 });
	}

	return new Response(null, { status: 204 });
};
