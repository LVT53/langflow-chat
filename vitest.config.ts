import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit() as any],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    globals: true,
    setupFiles: ['./src/vitest-setup.ts']
  },
  resolve: {
    conditions: ['mode=test', 'browser'],
    alias: [{ find: '$lib', replacement: '/src/lib' }]
  }
});