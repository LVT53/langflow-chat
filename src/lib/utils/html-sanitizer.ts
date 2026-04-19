import DOMPurify from 'isomorphic-dompurify';

export function sanitizeHtml(html: string): string {
	if (!html) return '';

	return DOMPurify.sanitize(html, {
		USE_PROFILES: { html: true },
		FORBID_TAGS: ['script', 'style'],
		FORBID_ATTR: ['style'],
		ALLOW_DATA_ATTR: false,
		ALLOW_UNKNOWN_PROTOCOLS: false,
	});
}

export function escapeHtml(
	value: string,
	options: { apostropheEntity?: '&#39;' | '&#039;' } = {}
): string {
	const apostropheEntity = options.apostropheEntity ?? '&#39;';

	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", apostropheEntity);
}
