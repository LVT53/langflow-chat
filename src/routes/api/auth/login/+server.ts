import type { RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { json } from '@sveltejs/kit';
import { verifyPassword, createSession } from '$lib/server/services/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// Validation schema for login request
const loginSchema = z.object({
	email: z.string().min(1, 'Invalid email or password'),
	password: z.string().min(1, 'Invalid email or password')
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const result = loginSchema.safeParse(body);
		
		if (!result.success) {
			return json(
				{ error: 'Invalid email or password' },
				{ status: 400 }
			);
		}

		const { email, password } = result.data;

		// Find user by email
		const userResult = await db
			.select()
			.from(users)
			.where(eq(users.email, email))
			.limit(1);

		if (userResult.length === 0) {
			// Return generic error to prevent email enumeration
			return json(
				{ error: 'Invalid email or password' },
				{ status: 401 }
			);
		}

		const user = userResult[0];

		// Verify password
		const passwordValid = await verifyPassword(password, user.passwordHash);
		
		if (!passwordValid) {
			return json(
				{ error: 'Invalid email or password' },
				{ status: 401 }
			);
		}

		// Create session and set cookie
		const { token, expiresAt } = await createSession(user.id);

		return json(
			{
				user: {
					id: user.id,
					email: user.email,
					displayName: user.name ?? user.email
				}
			},
			{
				headers: {
					'Set-Cookie': `session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor((expiresAt - Date.now()) / 1000)}`
				}
			}
		);
	} catch (err) {
		console.error('Login error:', err);
		return json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
};