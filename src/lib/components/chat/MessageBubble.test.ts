import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import MessageBubble from './MessageBubble.svelte';
import type { ChatMessage, DocumentWorkspaceItem } from '$lib/types';

describe('MessageBubble', () => {
	it('opens attached artifacts through the shared document workspace callback', async () => {
		const onOpenDocument = vi.fn<(document: DocumentWorkspaceItem) => void>();
		const timestamp = Date.now();
		const message: ChatMessage = {
			id: 'user-message-1',
			renderKey: 'user-message-1',
			role: 'user',
			content: 'Please refine this attachment.',
			timestamp,
			attachments: [
				{
					id: 'artifact-123',
					type: 'source_document',
					retrievalClass: 'durable',
					name: 'brief.docx',
					mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
					sizeBytes: 1024,
					conversationId: 'conv-1',
					vaultId: null,
					summary: null,
					createdAt: timestamp,
					updatedAt: timestamp,
				},
			],
			isStreaming: false,
			isThinkingStreaming: false,
		};

		render(MessageBubble, {
			message,
			conversationId: 'conv-1',
			onOpenDocument,
		});

		await fireEvent.click(screen.getByRole('button', { name: 'View brief.docx' }));

		expect(onOpenDocument).toHaveBeenCalledWith({
			id: 'artifact:artifact-123',
			source: 'knowledge_artifact',
			filename: 'brief.docx',
			title: 'brief.docx',
			mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			artifactId: 'artifact-123',
			conversationId: 'conv-1',
		});
	});
});
