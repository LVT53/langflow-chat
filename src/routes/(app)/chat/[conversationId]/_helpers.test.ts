import { describe, expect, it } from 'vitest';
import type { I18nKey } from '$lib/i18n';
import { toFriendlySendError } from './_helpers';

describe('toFriendlySendError', () => {
	const translate = (key: I18nKey) => `translated:${key}`;

	it('uses localized messages for known stream error codes', () => {
		const error = new Error('Stream error') as Error & { code?: string };
		error.code = 'timeout';

		expect(toFriendlySendError(error, translate)).toBe('translated:chat.error.timeout');
	});

	it('maps unknown generation failures to the descriptive backend message', () => {
		expect(toFriendlySendError(new Error('Langflow down'), translate)).toBe(
			'translated:chat.error.backend'
		);
	});
});
