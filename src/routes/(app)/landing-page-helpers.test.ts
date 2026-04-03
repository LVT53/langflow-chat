import { describe, expect, it } from 'vitest';
import { canReuseLandingPreparedConversation } from './landing-page-helpers';

describe('canReuseLandingPreparedConversation', () => {
	it('reuses empty prepared conversations with the default title', () => {
		expect(
			canReuseLandingPreparedConversation({
				conversation: {
					id: 'conv-1',
					title: 'New Conversation',
					createdAt: 0,
					updatedAt: 0,
				},
				messages: [],
				generatedFiles: [],
			})
		).toBe(true);
	});

	it('rejects stored conversations that already have messages', () => {
		expect(
			canReuseLandingPreparedConversation({
				conversation: {
					id: 'conv-1',
					title: 'New Conversation',
					createdAt: 0,
					updatedAt: 0,
				},
				messages: [{ id: 'msg-1' } as never],
				generatedFiles: [],
			})
		).toBe(false);
	});

	it('rejects stored conversations that already have generated files', () => {
		expect(
			canReuseLandingPreparedConversation({
				conversation: {
					id: 'conv-1',
					title: 'New Conversation',
					createdAt: 0,
					updatedAt: 0,
				},
				messages: [],
				generatedFiles: [{ id: 'file-1' } as never],
			})
		).toBe(false);
	});

	it('rejects renamed conversations even when they are otherwise empty', () => {
		expect(
			canReuseLandingPreparedConversation({
				conversation: {
					id: 'conv-1',
					title: 'Quarterly planning',
					createdAt: 0,
					updatedAt: 0,
				},
				messages: [],
				generatedFiles: [],
			})
		).toBe(false);
	});
});
