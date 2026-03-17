import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ErrorMessage from './ErrorMessage.svelte';

describe('ErrorMessage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders error message correctly', () => {
		const errorText = 'Something went wrong';
		const { getByText } = render(ErrorMessage, { 
			props: { 
				error: errorText,
				onRetry: vi.fn() 
			} 
		});
		
		expect(getByText(errorText)).toBeInTheDocument();
	});

	it('displays retry button', () => {
		const onRetry = vi.fn();
		const { getByRole } = render(ErrorMessage, { 
			props: { 
				error: 'Error occurred',
				onRetry 
			} 
		});
		
		const button = getByRole('button', { name: /retry/i });
		expect(button).toBeInTheDocument();
	});

	it('calls onRetry when button is clicked', async () => {
		const onRetry = vi.fn();
		const { getByRole } = render(ErrorMessage, { 
			props: { 
				error: 'Error occurred',
				onRetry 
			} 
		});
		
		const button = getByRole('button', { name: /retry/i });
		await fireEvent.click(button);
		
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it('shows error icon', () => {
		const { getByRole } = render(ErrorMessage, { 
			props: { 
				error: 'Error occurred',
				onRetry: vi.fn() 
			} 
		});
		
		expect(getByRole('img', { name: /error/i })).toBeInTheDocument();
	});

	it('applies correct styling classes', () => {
		const { container } = render(ErrorMessage, { 
			props: { 
				error: 'Error occurred',
				onRetry: vi.fn() 
			} 
		});
		
		expect(container.firstChild).toHaveClass('border-t');
		expect(container.firstChild).toHaveClass('flex');
		expect(container.firstChild).toHaveClass('items-center');
	});
});