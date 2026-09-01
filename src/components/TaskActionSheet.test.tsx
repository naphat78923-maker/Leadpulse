import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TaskActionSheet from './TaskActionSheet';

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  onFollowUp: vi.fn(),
  onNewLead: vi.fn(),
  onLogTouch: vi.fn(),
};

describe('TaskActionSheet', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders nothing when not mounted', () => {
    render(<TaskActionSheet {...defaultProps} open={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the dialog with the three actions when open', () => {
    render(<TaskActionSheet {...defaultProps} />);
    expect(screen.getByRole('dialog', { name: 'Choose your next sales action' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Follow up with someone/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add a new lead/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Log a touch/ })).toBeTruthy();
  });

  it('fires onFollowUp when the first action is clicked', async () => {
    render(<TaskActionSheet {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Follow up with someone/ }));
    await waitFor(() => expect(defaultProps.onFollowUp).toHaveBeenCalledTimes(1));
  });

  it('fires onNewLead when the second action is clicked', async () => {
    render(<TaskActionSheet {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Add a new lead/ }));
    await waitFor(() => expect(defaultProps.onNewLead).toHaveBeenCalledTimes(1));
  });

  it('fires onLogTouch when the third action is clicked', async () => {
    render(<TaskActionSheet {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Log a touch/ }));
    await waitFor(() => expect(defaultProps.onLogTouch).toHaveBeenCalledTimes(1));
  });

  it('closes when the backdrop is clicked', () => {
    render(<TaskActionSheet {...defaultProps} />);
    fireEvent.click(screen.getByRole('dialog').parentElement!.firstChild as HTMLElement);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the close button is clicked', () => {
    render(<TaskActionSheet {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    render(<TaskActionSheet {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('does not nest interactive controls inside action cards', () => {
    render(<TaskActionSheet {...defaultProps} />);
    const actionButtons = screen.getAllByRole('button').filter(
      (btn) => btn.getAttribute('aria-label')?.includes('.')
    );
    actionButtons.forEach((btn) => {
      expect(btn.querySelectorAll('button')).toHaveLength(0);
    });
  });

  it('exposes accessible names that combine title and description', () => {
    render(<TaskActionSheet {...defaultProps} />);
    const followUp = screen.getByRole('button', { name: /Follow up with someone/ });
    expect(followUp.getAttribute('aria-label')).toContain('See who needs a touch today.');
  });
});
