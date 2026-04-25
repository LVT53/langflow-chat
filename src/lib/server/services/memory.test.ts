import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetPeerContext = vi.fn();
const mockListPersonaMemories = vi.fn();
const mockForgetAllPersonaMemories = vi.fn();
const mockForgetPersonaMemory = vi.fn();
const mockRotateHonchoPeerIdentity = vi.fn();
const mockIsHonchoEnabled = vi.fn();
const mockListTaskMemoryItems = vi.fn();
const mockListFocusContinuityItems = vi.fn();
const mockForgetFocusContinuity = vi.fn();
const mockForgetTaskMemory = vi.fn();

vi.mock('$lib/server/config-store', () => ({
	getConfig: () => ({ honchoPersonaContextWaitMs: 1500 }),
}));

vi.mock('./honcho', () => ({
	forgetAllPersonaMemories: mockForgetAllPersonaMemories,
	forgetPersonaMemory: mockForgetPersonaMemory,
	getPeerContext: mockGetPeerContext,
	isHonchoEnabled: mockIsHonchoEnabled,
	listPersonaMemories: mockListPersonaMemories,
	rotateHonchoPeerIdentity: mockRotateHonchoPeerIdentity,
}));

vi.mock('./task-state', () => ({
	forgetFocusContinuity: mockForgetFocusContinuity,
	forgetTaskMemory: mockForgetTaskMemory,
	listFocusContinuityItems: mockListFocusContinuityItems,
	listTaskMemoryItems: mockListTaskMemoryItems,
}));

describe('knowledge memory service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockIsHonchoEnabled.mockReturnValue(true);
		mockGetPeerContext.mockResolvedValue(null);
		mockListPersonaMemories.mockResolvedValue([]);
		mockListTaskMemoryItems.mockResolvedValue([]);
		mockListFocusContinuityItems.mockResolvedValue([]);
		mockForgetAllPersonaMemories.mockResolvedValue(0);
		mockForgetPersonaMemory.mockResolvedValue(true);
		mockRotateHonchoPeerIdentity.mockResolvedValue(1);
	});

	it('does not render a memory overview for an empty scoped Honcho memory set', async () => {
		const { getKnowledgeMemory } = await import('./memory');

		const payload = await getKnowledgeMemory('user-1', 'Test User');

		expect(payload.personaMemories).toEqual([]);
		expect(payload.summary.overview).toBeNull();
		expect(payload.summary.overviewSource).toBeNull();
		expect(payload.summary.overviewStatus).toBe('not_enough_durable_memory');
		expect(payload.summary.durablePersonaCount).toBe(0);
	});

	it('maps scoped Honcho conclusions into visible persona memory and overview source', async () => {
		mockGetPeerContext.mockResolvedValue('Scoped user memory from Honcho conclusions:\n- Prefers concise responses');
		mockListPersonaMemories.mockResolvedValue([
			{
				id: 'conclusion-1',
				content: 'Prefers concise responses',
				scope: 'assistant_about_user',
				sessionId: 'session-1',
				createdAt: 1234,
			},
		]);

		const { getKnowledgeMemory } = await import('./memory');
		const payload = await getKnowledgeMemory('user-1', 'Test User');

		expect(payload.personaMemories).toHaveLength(1);
		expect(payload.personaMemories[0]).toMatchObject({
			id: 'conclusion-1',
			canonicalText: 'Prefers concise responses',
			memoryClass: 'long_term_context',
			state: 'active',
		});
		expect(payload.summary.overviewSource).toBe('honcho_scoped');
		expect(payload.summary.personaCount).toBe(1);
		expect(payload.summary.durablePersonaCount).toBe(1);
	});

	it('rotates Honcho peer identity after forget-all persona memory', async () => {
		const { applyKnowledgeMemoryAction } = await import('./memory');

		await applyKnowledgeMemoryAction('user-1', 'Test User', {
			action: 'forget_all_persona_memory',
		});

		expect(mockForgetAllPersonaMemories).toHaveBeenCalledWith('user-1');
		expect(mockRotateHonchoPeerIdentity).toHaveBeenCalledWith('user-1');
	});
});
