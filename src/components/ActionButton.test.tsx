import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import ActionButton, { DONE_MS } from './ActionButton';

describe('ActionButton', () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('shows its label when idle and can be pressed', () => {
    const onClick = vi.fn();
    render(<ActionButton busy={false} onClick={onClick}>Save reply</ActionButton>);
    const button = screen.getByRole('button', { name: 'Save reply' });
    expect(button.getAttribute('data-phase')).toBe('idle');
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled and says it is working while busy', () => {
    render(<ActionButton busy onClick={() => {}}>Save reply</ActionButton>);
    const button = screen.getByRole('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('data-phase')).toBe('busy');
    expect(screen.getByRole('status', { name: 'Working' })).toBeTruthy();
  });

  it('shows a tick when the work finishes, then its label again', () => {
    vi.useFakeTimers();
    const { rerender } = render(<ActionButton busy onClick={() => {}}>Save reply</ActionButton>);
    rerender(<ActionButton busy={false} onClick={() => {}}>Save reply</ActionButton>);
    expect(screen.getByRole('button').getAttribute('data-phase')).toBe('done');
    expect(screen.getByRole('status', { name: 'Done' })).toBeTruthy();
    act(() => { vi.advanceTimersByTime(DONE_MS + 10); });
    expect(screen.getByRole('button').getAttribute('data-phase')).toBe('idle');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('never shows a tick for work that did not happen', () => {
    render(<ActionButton busy={false} disabled onClick={() => {}}>Save reply</ActionButton>);
    expect(screen.getByRole('button').getAttribute('data-phase')).toBe('idle');
  });
});
