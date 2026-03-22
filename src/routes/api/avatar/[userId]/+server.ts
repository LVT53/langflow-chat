import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const GET: RequestHandler = async ({ params }) => {
  const { userId } = params;

  // Sanitize userId to prevent path traversal
  if (!userId || !/^[a-zA-Z0-9_-]+$/.test(userId)) {
    throw error(400, 'Invalid user ID');
  }

  const filePath = join(process.cwd(), 'data', 'avatars', `${userId}.webp`);

  try {
    const data = await readFile(filePath);
    return new Response(data, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    throw error(404, 'Avatar not found');
  }
};
