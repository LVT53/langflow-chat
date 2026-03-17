import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import LoadingIndicator from './LoadingIndicator.svelte';

describe('LoadingIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders when visible=true', () => {
    const { getByText } = render(LoadingIndicator, { props: { visible: true } });
    expect(getByText(/Thinking.../i)).toBeInTheDocument();
  });

  it('hidden when visible=false', () => {
    const { queryByText } = render(LoadingIndicator, { props: { visible: false } });
    expect(queryByText(/Thinking.../i)).not.toBeInTheDocument();
  });

  it('displays custom status text', () => {
    const { getByText } = render(LoadingIndicator, { props: { visible: true, label: 'Custom text' } });
    expect(getByText(/Custom text/i)).toBeInTheDocument();
  });

  it('message changes from Thinking... to Still working... after 30s', async () => {
    const { getByText } = render(LoadingIndicator, { props: { visible: true } });
    expect(getByText(/Thinking.../i)).toBeInTheDocument();

    vi.advanceTimersByTime(30000);
    // Wait for next tick to allow reactive updates
    await new Promise(process.nextTick);
    expect(getByText(/Still working.../i)).toBeInTheDocument();
  });

  it('message changes from Still working... to Almost there... after 60s', async () => {
    const { getByText } = render(LoadingIndicator, { props: { visible: true } });
    // Start with 0 elapsed time, then advance to 60 seconds
    expect(getByText(/Thinking.../i)).toBeInTheDocument();

    vi.advanceTimersByTime(60000); // Advance to 60 seconds total
    // Wait for next tick to allow reactive updates
    await new Promise(process.nextTick);
    expect(getByText(/Almost there.../i)).toBeInTheDocument();
  });
});