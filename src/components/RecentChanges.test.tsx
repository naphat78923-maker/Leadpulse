import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ActivityEntry } from '@/components/CrmProvider';

const crm = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/components/CrmProvider', () => ({ useCrm: () => crm.value }));

import RecentChanges from './RecentChanges';

afterEach(() => cleanup());

const DAY = 24 * 60 * 60 * 1000;
const entry = (overrides: Partial<ActivityEntry>): ActivityEntry => ({
  id: 'a1',
  timestamp: Date.now() - 60_000,
  type: 'delete',
  entity: 'company',
  entityId: 'c1',
  label: 'Archived company · Synthetic Bakery',
  undoPayload: {},
  ...overrides,
});

describe('RecentChanges', () => {
  it('lists undoable changes from the last 7 days and undoes one', async () => {
    const undoActivity = vi.fn(async () => true);
    crm.value = {
      undoActivity,
      activities: [
        entry({}),
        entry({ id: 'a2', label: 'Viewed only', undoPayload: undefined }),
        entry({ id: 'a3', label: 'Too old', timestamp: Date.now() - 8 * DAY }),
        entry({ id: 'a4', label: '⏸ Parked', applied: false }),
      ],
    };
    render(<RecentChanges />);

    expect(screen.getByText('Recent changes you can undo')).toBeTruthy();
    expect(screen.queryByText('Viewed only')).toBeNull();
    expect(screen.queryByText('Too old')).toBeNull();
    expect(screen.getByText('Undone')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Undo: Archived company · Synthetic Bakery' }));
    await waitFor(() => expect(undoActivity).toHaveBeenCalledExactlyOnceWith('a1'));
  });

  it('renders nothing when there is nothing to undo', () => {
    crm.value = { undoActivity: vi.fn(), activities: [] };
    const { container } = render(<RecentChanges />);
    expect(container.innerHTML).toBe('');
  });
});
