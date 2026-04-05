import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ChatComposerPanel from './ChatComposerPanel.svelte';

describe('ChatComposerPanel', () => {
	it('renders the docked chat composer without the landing-page hero copy', () => {
		const { container, queryByText } = render(ChatComposerPanel, {
			sendError: null,
			onRetry: vi.fn(),
			onErrorClose: vi.fn(),
			onSend: vi.fn(),
			onQueue: vi.fn(),
			onStop: vi.fn(),
			onDraftChange: vi.fn(),
			onEditQueuedMessage: vi.fn(),
			onDeleteQueuedMessage: vi.fn(),
			disabled: false,
			isGenerating: false,
			hasQueuedMessage: false,
			queuedMessagePreview: '',
			maxLength: 10000,
			conversationId: 'conv-1',
			contextStatus: null,
			attachedArtifacts: [],
			taskState: null,
			contextDebug: null,
			draftText: '',
			draftAttachments: [],
			draftVersion: 0,
			onSteer: vi.fn(),
			onManageEvidence: vi.fn(),
		});

		expect(queryByText('What can I help you with?')).toBeNull();
		expect(container.querySelector('.composer-layer')).toBeTruthy();
	});
});
