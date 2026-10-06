import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import NameLookup from './NameLookup';

const match = { id: 'p1', name: 'Maison Verte', address: '12 Sukhumvit 49, Bangkok', phone: '+66 2 123 4567', website: 'https://maisonverte.co.th/', kind: 'Bakery', mapsUrl: null };
const pageLead = { name: 'x', description: 'Pastry made without dairy.', website: 'https://maisonverte.co.th', email: 'hello@maisonverte.co.th', phone: null, line: null, instagram: null, facebook: null, address: null, logoUrl: null };

const json = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn((url: string) => (url.startsWith('/api/enrich/search') ? json({ configured: true, matches: [match] }) : json({ lead: pageLead })));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const pause = () => act(async () => { await vi.advanceTimersByTimeAsync(800); });

describe('NameLookup', () => {
  it('waits for a pause in typing, and for a name long enough to search', async () => {
    const { rerender } = render(<NameLookup name="Ma" onPick={vi.fn()} />);
    await pause();
    expect(fetchMock).not.toHaveBeenCalled();

    rerender(<NameLookup name="Mais" onPick={vi.fn()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    rerender(<NameLookup name="Maison" onPick={vi.fn()} />);
    await pause();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/enrich/search?q=Maison');
    expect(screen.getByText('Maison Verte')).toBeTruthy();
    expect(screen.getByText('Bakery')).toBeTruthy();
  });

  it('fills from the listing and its website when a match is picked, then stops offering', async () => {
    const onPick = vi.fn();
    const { rerender } = render(<NameLookup name="Maison" onPick={onPick} />);
    await pause();
    await act(async () => { fireEvent.click(screen.getByText('Maison Verte')); await vi.advanceTimersByTimeAsync(0); });

    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Maison Verte', address: '12 Sukhumvit 49, Bangkok', phone: '+66 2 123 4567', email: 'hello@maisonverte.co.th' }),
      'Bakery',
    );
    // The form now holds the picked name; it is not searched again.
    rerender(<NameLookup name="Maison Verte" onPick={onPick} />);
    await pause();
    expect(screen.queryByTestId('name-lookup')).toBeNull();
    expect(fetchMock.mock.calls.filter(call => String(call[0]).startsWith('/api/enrich/search'))).toHaveLength(1);
  });

  it('stays silent, and stops asking, when lookup is not set up', async () => {
    fetchMock.mockImplementation(() => json({ configured: false, matches: [] }));
    const { rerender } = render(<NameLookup name="Maison" onPick={vi.fn()} />);
    await pause();
    rerender(<NameLookup name="Maison Verte" onPick={vi.fn()} />);
    await pause();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('name-lookup')).toBeNull();
  });
});
