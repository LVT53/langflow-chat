import { describe, expect, it, beforeEach } from 'vitest';
import {
	activateRestartDrain,
	beginRestartSensitiveChatTurn,
	clearRestartDrain,
	getRestartGuardSnapshot,
	resetRestartGuardForTests,
} from './restart-guard';

describe('restart-guard', () => {
	beforeEach(() => {
		resetRestartGuardForTests();
	});

	it('tracks active chat turns and phase transitions', () => {
		const guard = beginRestartSensitiveChatTurn({
			mode: 'stream',
			userId: 'user-1',
			conversationId: 'conv-1',
		});

		expect(guard).not.toBeNull();
		expect(getRestartGuardSnapshot()).toMatchObject({
			draining: false,
			activeCount: 1,
			operations: [
				{
					mode: 'stream',
					userId: 'user-1',
					conversationId: 'conv-1',
					phase: 'generating',
				},
			],
		});

		guard!.markPersisting();
		expect(getRestartGuardSnapshot().operations[0]?.phase).toBe('persisting');

		guard!.finish();
		expect(getRestartGuardSnapshot()).toMatchObject({
			draining: false,
			activeCount: 0,
			operations: [],
		});
	});

	it('blocks new chat turns while restart drain is active', () => {
		activateRestartDrain('deploy');

		expect(getRestartGuardSnapshot()).toMatchObject({
			draining: true,
			drainReason: 'deploy',
			activeCount: 0,
		});
		expect(
			beginRestartSensitiveChatTurn({
				mode: 'send',
				userId: 'user-1',
				conversationId: 'conv-1',
			})
		).toBeNull();

		clearRestartDrain();

		expect(
			beginRestartSensitiveChatTurn({
				mode: 'send',
				userId: 'user-1',
				conversationId: 'conv-1',
			})
		).not.toBeNull();
	});
});
