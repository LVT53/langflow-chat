import { randomUUID } from 'node:crypto';

export type RestartSensitiveChatTurnPhase = 'generating' | 'persisting';
export type RestartSensitiveChatTurnMode = 'send' | 'stream';

type RestartSensitiveChatTurn = {
	id: string;
	mode: RestartSensitiveChatTurnMode;
	userId: string;
	conversationId: string;
	phase: RestartSensitiveChatTurnPhase;
	startedAt: string;
	updatedAt: string;
};

type RestartDrainState = {
	active: boolean;
	activatedAt: string | null;
	reason: string | null;
};

export type RestartGuardSnapshot = {
	draining: boolean;
	drainActivatedAt: string | null;
	drainReason: string | null;
	activeCount: number;
	operations: RestartSensitiveChatTurn[];
};

type RestartSensitiveChatTurnHandle = {
	markPersisting(): void;
	finish(): void;
};

const activeChatTurns = new Map<string, RestartSensitiveChatTurn>();
const restartDrainState: RestartDrainState = {
	active: false,
	activatedAt: null,
	reason: null,
};

function nowIso(): string {
	return new Date().toISOString();
}

export function getRestartGuardSnapshot(): RestartGuardSnapshot {
	return {
		draining: restartDrainState.active,
		drainActivatedAt: restartDrainState.activatedAt,
		drainReason: restartDrainState.reason,
		activeCount: activeChatTurns.size,
		operations: Array.from(activeChatTurns.values()).sort((left, right) =>
			left.startedAt.localeCompare(right.startedAt)
		),
	};
}

export function activateRestartDrain(reason: string | null = 'deploy'): RestartGuardSnapshot {
	restartDrainState.active = true;
	restartDrainState.activatedAt = nowIso();
	restartDrainState.reason = reason?.trim() || 'deploy';
	return getRestartGuardSnapshot();
}

export function clearRestartDrain(): RestartGuardSnapshot {
	restartDrainState.active = false;
	restartDrainState.activatedAt = null;
	restartDrainState.reason = null;
	return getRestartGuardSnapshot();
}

export function isRestartDrainActive(): boolean {
	return restartDrainState.active;
}

export function beginRestartSensitiveChatTurn(params: {
	mode: RestartSensitiveChatTurnMode;
	userId: string;
	conversationId: string;
}): RestartSensitiveChatTurnHandle | null {
	if (restartDrainState.active) {
		return null;
	}

	const id = randomUUID();
	const startedAt = nowIso();
	activeChatTurns.set(id, {
		id,
		mode: params.mode,
		userId: params.userId,
		conversationId: params.conversationId,
		phase: 'generating',
		startedAt,
		updatedAt: startedAt,
	});

	let finished = false;

	return {
		markPersisting() {
			if (finished) return;
			const current = activeChatTurns.get(id);
			if (!current) return;
			activeChatTurns.set(id, {
				...current,
				phase: 'persisting',
				updatedAt: nowIso(),
			});
		},
		finish() {
			if (finished) return;
			finished = true;
			activeChatTurns.delete(id);
		},
	};
}

export function resetRestartGuardForTests(): void {
	activeChatTurns.clear();
	restartDrainState.active = false;
	restartDrainState.activatedAt = null;
	restartDrainState.reason = null;
}
