import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeTime } from './time';

describe('formatRelativeTime', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-03-15T12:00:00.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns "just now" for less than 30 seconds ago', () => {
		const timestamp = new Date('2024-03-15T11:59:45.000Z').getTime();
		expect(formatRelativeTime(timestamp)).toBe('just now');
	});

	it('returns "[n] min ago" for less than 60 minutes ago', () => {
		const timestamp = new Date('2024-03-15T11:55:00.000Z').getTime();
		expect(formatRelativeTime(timestamp)).toBe('5 min ago');
	});

	it('returns "Yesterday" for between 1 and 2 days ago', () => {
		const timestamp = new Date('2024-03-14T08:00:00.000Z').getTime();
		expect(formatRelativeTime(timestamp)).toBe('Yesterday');
	});

	it('returns date string for older dates', () => {
		const timestamp = new Date('2024-03-12T12:00:00.000Z').getTime();
		expect(formatRelativeTime(timestamp)).toBe('Mar 12');
	});

	it('handles unix timestamp in seconds', () => {
		const timestamp = Math.floor(new Date('2024-03-15T11:55:00.000Z').getTime() / 1000);
		expect(formatRelativeTime(timestamp)).toBe('5 min ago');
	});
});
