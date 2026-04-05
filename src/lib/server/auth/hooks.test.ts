import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

const getConfigMock = vi.fn();

vi.mock('$lib/server/env', () => ({
	config: new Proxy(
		{},
		{
			get(_target, prop) {
				const cfg = getConfigMock();
				return (cfg as Record<string, unknown>)[prop as string];
			},
		}
	),
}));

import {
	getBearerToken,
	verifyFileGenerateServiceAssertion,
} from './hooks';

function signPayload(payload: Record<string, unknown>, signingKey: string): string {
	const payloadPart = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
	const signature = createHmac('sha256', signingKey).update(payloadPart).digest('base64url');
	return `${payloadPart}.${signature}`;
}

describe('auth hooks', () => {
	beforeEach(() => {
		getConfigMock.mockReturnValue({
			alfyaiApiSigningKey: 'test-signing-key',
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('extracts bearer token correctly', () => {
		expect(getBearerToken('Bearer abc123')).toBe('abc123');
		expect(getBearerToken('bearer abc123')).toBe('abc123');
		expect(getBearerToken('Basic abc123')).toBeNull();
		expect(getBearerToken(null)).toBeNull();
	});

	it('verifies a valid signed service assertion', () => {
		const payload = {
			conversationId: 'conv-1',
			userId: 'user-1',
			exp: Date.now() + 60_000,
		};
		const token = signPayload(payload, 'test-signing-key');

		const result = verifyFileGenerateServiceAssertion(`Bearer ${token}`);
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.claims.conversationId).toBe('conv-1');
			expect(result.claims.userId).toBe('user-1');
		}
	});

	it('rejects expired signed assertions', () => {
		const payload = {
			conversationId: 'conv-1',
			userId: 'user-1',
			exp: Date.now() - 1,
		};
		const token = signPayload(payload, 'test-signing-key');

		const result = verifyFileGenerateServiceAssertion(`Bearer ${token}`);
		expect(result.valid).toBe(false);
		if ('reason' in result) {
			expect(result.reason).toBe('expired');
		}
	});

	it('rejects invalid signatures', () => {
		const payload = {
			conversationId: 'conv-1',
			userId: 'user-1',
			exp: Date.now() + 60_000,
		};
		const token = signPayload(payload, 'different-signing-key');

		const result = verifyFileGenerateServiceAssertion(`Bearer ${token}`);
		expect(result.valid).toBe(false);
		if ('reason' in result) {
			expect(['invalid_signature', 'invalid_signature_length']).toContain(result.reason);
		}
	});
});
