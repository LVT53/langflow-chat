import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { ThinkingSegment } from '$lib/types';
import ThinkingBlock from './ThinkingBlock.svelte';

describe('ThinkingBlock', () => {
	it('labels file-production tool calls as produce_file instead of Fetching', () => {
		const segments: ThinkingSegment[] = [
			{
				type: 'tool_call',
				name: 'produce_file',
				status: 'done',
				input: {
					requestTitle: 'Quarterly report',
					previewUrl: 'https://example.com/report.pdf',
				},
			},
		];

		render(ThinkingBlock, {
			props: {
				content: '',
				thinkingIsDone: true,
				segments,
			},
		});

		expect(screen.getByText('produce_file')).toBeInTheDocument();
		expect(screen.queryByText(/Fetching:/)).not.toBeInTheDocument();
	});

	it('keeps real URL-fetch tools as Fetching links', () => {
		const segments: ThinkingSegment[] = [
			{
				type: 'tool_call',
				name: 'fetch_url',
				status: 'done',
				input: {
					url: 'https://example.com/article',
				},
			},
		];

		render(ThinkingBlock, {
			props: {
				content: '',
				thinkingIsDone: true,
				segments,
			},
		});

		expect(screen.getByText('example.com')).toBeInTheDocument();
		expect(screen.getByText(/Fetching:/)).toBeInTheDocument();
	});
});
