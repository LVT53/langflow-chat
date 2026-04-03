import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redirect } from '@sveltejs/kit';

const mockValidateSession = vi.fn();
const mockRefreshConfig = vi.fn(async () => undefined);
const mockEnsureMemoryMaintenanceScheduler = vi.fn();
const mockPrewarmSandboxImageInBackground = vi.fn();

vi.mock('$lib/server/services/auth', () => ({
	validateSession: mockValidateSession,
}));

vi.mock('$lib/server/services/webhook-buffer', () => ({
	webhookBuffer: { id: 'test-buffer' },
}));

vi.mock('$lib/server/config-store', () => ({
	refreshConfig: mockRefreshConfig,
}));

vi.mock('$lib/server/services/memory-maintenance', () => ({
	ensureMemoryMaintenanceScheduler: mockEnsureMemoryMaintenanceScheduler,
}));

vi.mock('$lib/server/sandbox/config', () => ({
	prewarmSandboxImageInBackground: mockPrewarmSandboxImageInBackground,
}));

describe('hooks.server.ts', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it('allows public routes without a session', async () => {
		const { handle } = await import('./hooks.server');
		const resolve = vi.fn(async ({ locals }) => new Response(JSON.stringify({ user: locals.user })));
		const event = {
			cookies: { get: vi.fn(() => undefined) },
			locals: {},
			url: new URL('http://localhost/api/auth/login'),
		} as any;

		await handle({ event, resolve });

		expect(resolve).toHaveBeenCalledOnce();
		expect(event.locals.user).toBeNull();
		expect(event.locals.webhookBuffer).toEqual({ id: 'test-buffer' });
		expect(mockPrewarmSandboxImageInBackground).toHaveBeenCalledOnce();
	});

	it('allows the health check route without a session', async () => {
		const { handle } = await import('./hooks.server');
		const resolve = vi.fn(async () => new Response('ok'));
		const event = {
			cookies: { get: vi.fn(() => undefined) },
			locals: {},
			url: new URL('http://localhost/api/health'),
		} as any;

		await handle({ event, resolve });

		expect(resolve).toHaveBeenCalledOnce();
		expect(event.locals.user).toBeNull();
	});

	it('redirects protected routes to /login when no user is present', async () => {
		const { handle } = await import('./hooks.server');
		const event = {
			cookies: { get: vi.fn(() => undefined) },
			locals: {},
			url: new URL('http://localhost/'),
		} as any;

		await expect(handle({ event, resolve: vi.fn() })).rejects.toMatchObject({
			status: 303,
			location: '/login',
		});
	});

	it('loads the session user when a valid token is present', async () => {
		const { handle } = await import('./hooks.server');
		const sessionUser = {
			id: 'user-1',
			email: 'test@example.com',
			displayName: 'Test User',
			role: 'user',
			avatarId: null,
			profilePicture: null,
			translationEnabled: false,
		};
		mockValidateSession.mockResolvedValue(sessionUser);
		const resolve = vi.fn(async () => new Response('ok'));
		const event = {
			cookies: { get: vi.fn(() => 'session-token') },
			locals: {},
			url: new URL('http://localhost/'),
		} as any;

		await handle({ event, resolve });

		expect(mockValidateSession).toHaveBeenCalledWith('session-token');
		expect(event.locals.user).toEqual(sessionUser);
		expect(resolve).toHaveBeenCalledOnce();
	});

	it('redirects authenticated users away from /login', async () => {
		const { handle } = await import('./hooks.server');
		mockValidateSession.mockResolvedValue({
			id: 'user-1',
			email: 'test@example.com',
			displayName: 'Test User',
			role: 'user',
			avatarId: null,
			profilePicture: null,
			translationEnabled: false,
		});
		const event = {
			cookies: { get: vi.fn(() => 'session-token') },
			locals: {},
			url: new URL('http://localhost/login'),
		} as any;

		await expect(handle({ event, resolve: vi.fn() })).rejects.toMatchObject({
			status: 303,
			location: '/',
		});
	});
});
