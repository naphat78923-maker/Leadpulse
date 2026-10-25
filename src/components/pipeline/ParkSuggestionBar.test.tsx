import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Deal } from '@/types/crm';
import ParkSuggestionBar from './ParkSuggestionBar';

const deal = { id: 'd1', client: 'Quiet Bakery' } as Deal;

describe('ParkSuggestionBar', () => {
  afterEach(cleanup);

  it('asks, and only opens the park form when Pat chooses to', () => {
    const onPark = vi.fn();
    render(<ParkSuggestionBar items={[{ deal, sends: 4, buyerReplied: false }]} onPark={onPark} />);

    expect(screen.getByText('Park this deal?')).toBeTruthy();
    expect(screen.getByText('4 sends, no reply')).toBeTruthy();
    expect(onPark).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Park Quiet Bakery' }));
    expect(onPark).toHaveBeenCalledWith(deal);
  });

  it('shows nothing when no deal is at the limit', () => {
    const { container } = render(<ParkSuggestionBar items={[]} onPark={() => {}} />);
    expect(container.innerHTML).toBe('');
  });
});
