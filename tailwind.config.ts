/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: 'class',
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				primary: 'var(--bg-primary)',
				secondary: 'var(--bg-secondary)',
				message: {
					user: 'var(--bg-message-user)',
					assistant: 'var(--bg-message-assistant)'
				},
				code: 'var(--bg-code)',
				hover: 'var(--bg-hover)',
				text: {
					primary: 'var(--text-primary)',
					secondary: 'var(--text-secondary)',
					code: 'var(--text-code)',
					muted: 'var(--text-muted)'
				},
				accent: {
					DEFAULT: 'var(--accent)',
					hover: 'var(--accent-hover)'
				},
				border: 'var(--border)',
				focus: 'var(--border-focus)',
				// Semantic Surface Tokens
				surface: {
					page: 'var(--surface-page)',
					elevated: 'var(--surface-elevated)',
					overlay: 'var(--surface-overlay)'
				},
				// Semantic Icon Tokens
				icon: {
					primary: 'var(--icon-primary)',
					muted: 'var(--icon-muted)'
				},
				// Semantic Status Tokens
				danger: {
					DEFAULT: 'var(--danger)',
					hover: 'var(--danger-hover)'
				},
				success: {
					DEFAULT: 'var(--success)',
					hover: 'var(--success-hover)'
				},
				// Focus Ring
				'focus-ring': 'var(--focus-ring)'
			},
			spacing: {
				'xs': 'var(--space-xs)',
				'sm': 'var(--space-sm)',
				'md': 'var(--space-md)',
				'lg': 'var(--space-lg)',
				'xl': 'var(--space-xl)',
				'2xl': 'var(--space-2xl)',
			},
			borderRadius: {
				'sm': 'var(--radius-sm)',
				'md': 'var(--radius-md)',
				'lg': 'var(--radius-lg)',
				'full': 'var(--radius-full)',
			},
			boxShadow: {
				'sm': 'var(--shadow-sm)',
				'md': 'var(--shadow-md)',
				'lg': 'var(--shadow-lg)',
			},
			fontFamily: {
				sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
				serif: ["Georgia", "Times New Roman", "serif"],
				mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
			}
		},
	},
	plugins: [require('@tailwindcss/typography')],
};
