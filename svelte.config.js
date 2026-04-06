import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		csrf: {
			trustedOrigins: ['*']
		},
		adapter: adapter({
			out: 'build',
			precompress: false,
			envPrefix: ''
		}),
		alias: {
			'$lib': 'src/lib'
		}
	}
};

export default config;
