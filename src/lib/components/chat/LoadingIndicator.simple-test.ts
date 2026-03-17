import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import LoadingIndicator from './LoadingIndicator.svelte';

describe('LoadingIndicator simple', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with custom label', () => {
    const { getByText } = render(LoadingIndicator, { props: { visible: true, label: 'Test Label' } });
    expect(getByText(/Test Label/i)).toBeInTheDocument();
  });

  it('renders default thinking message when visible=true', () => {
    const { getByText } = render(LoadingIndicator, { props: { visible: true } });
    expect(getByText(/Thinking.../i)).toBeInTheDocument();
  });

  it('does not render when visible=false', () => {
    const { queryByText } = render(LoadingIndicator, { props: { visible: false } });
    expect(queryByText(/Thinking.../i)).not.toBeInTheDocument();
  });
});