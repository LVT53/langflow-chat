import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			out: 'build',
			precompress: false,
			envPrefix: '',
			polyfill: true
		}),
		alias: {
			'$lib': 'src/lib'
		},
		csrf: {
			checkOrigin: process.env.NODE_ENV === 'production'
		}
	}
};

export default config;
