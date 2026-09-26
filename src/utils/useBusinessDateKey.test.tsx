import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBusinessDateKey } from './useBusinessDateKey';

function DateProbe() {
  return <p>{useBusinessDateKey()}</p>;
}

function BoundaryProbe() {
  const businessDay = useBusinessDateKey();
  return (
    <div>
      <span data-testid="business-day">{businessDay}</span>
      <span data-testid="utc-day">{new Date().toISOString().slice(0, 10)}</span>
    </div>
  );
}

describe('useBusinessDateKey', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('refreshes the queue date at Bangkok midnight while the page remains open', async () => {
    vi.setSystemTime(new Date('2026-09-14T16:59:59.000Z'));
    render(<DateProbe />);
    expect(screen.getByText('2026-09-14')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    expect(screen.getByText('2026-09-15')).toBeTruthy();
  });

  it('rerenders at UTC midnight too, even when the Bangkok date is unchanged', async () => {
    vi.setSystemTime(new Date('2026-09-14T23:59:59.000Z'));
    render(<BoundaryProbe />);

    expect(screen.getByTestId('business-day').textContent).toBe('2026-09-15');
    expect(screen.getByTestId('utc-day').textContent).toBe('2026-09-14');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });
    expect(screen.getByTestId('business-day').textContent).toBe('2026-09-15');
    expect(screen.getByTestId('utc-day').textContent).toBe('2026-09-15');
  });
});
