import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handle } from './hooks.server';
import { validateSession } from '$lib/server/services/auth';

console.log('validateSession:', validateSession);

describe('hooks.server.ts', () => {
  it('should be a test file', async () => {
    expect(true).toBe(true);
  });
});