import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	build: {
		// Lazy-loaded Shiki grammars compress well but can exceed Vite's default 500 kB warning threshold.
		chunkSizeWarningLimit: 800
	},
	ssr: {
		external: ['@sveltejs/adapter-node']
	},
	optimizeDeps: {
		include: ['chart.js/auto']
	}
});
