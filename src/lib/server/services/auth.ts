import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { db } from '../db/index';
import { sessions, users } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import type { SessionUser } from '../../types';

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: number }> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

  await db.insert(sessions).values({
    id: token,
    userId: userId,
    expiresAt: sql`${expiresAt}`,
  });

  return { token, expiresAt };
}

export async function validateSession(token: string): Promise<SessionUser | null> {
  const sessionResult = await db
    .select()
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, token));

  const [session] = sessionResult;
  if (!session) {
    return null;
  }

  const { sessions: sessionObj, users: userObj } = session;
  
  if (Number(sessionObj.expiresAt) < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, token));
    return null;
  }

  return {
    id: userObj.id,
    email: userObj.email,
    displayName: userObj.name ?? userObj.email,
    role: (userObj.role ?? 'user') as import('../../types').UserRole,
    avatarId: userObj.avatarId ?? null,
    profilePicture: userObj.profilePicture ?? null,
    translationEnabled: (userObj.translationEnabled ?? 0) === 1,
  };
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, token));
}

export function setSessionCookie(cookies: any, token: string, expiresAt: number): void {
  const maxAge = Math.floor((expiresAt - Date.now()) / 1000);
  cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export function clearSessionCookie(cookies: any): void {
  cookies.delete('session', {
    path: '/',
  });
}