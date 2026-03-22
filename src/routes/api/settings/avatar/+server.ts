import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/avif', 'image/heic', 'image/heif', 'image/tiff', 'image/bmp',
];

function avatarsDir() {
  return join(process.cwd(), 'data', 'avatars');
}

export const POST: RequestHandler = async (event) => {
  requireAuth(event);
  const userId = event.locals.user!.id;

  let formData: FormData;
  try {
    formData = await event.request.formData();
  } catch {
    return json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('image');
  if (!(file instanceof File)) {
    return json({ error: 'No image provided' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return json({ error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return json({ error: 'File too large. Maximum size is 20MB' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const dir = avatarsDir();

  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${userId}.webp`), buffer);

  await db.update(users)
    .set({ profilePicture: userId, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return json({ success: true });
};

export const DELETE: RequestHandler = async (event) => {
  requireAuth(event);
  const userId = event.locals.user!.id;

  const filePath = join(avatarsDir(), `${userId}.webp`);
  try {
    await unlink(filePath);
  } catch {
    // File may not exist — that's fine
  }

  await db.update(users)
    .set({ profilePicture: null, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return json({ success: true });
};
