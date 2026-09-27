'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { useCrm, type ActivityEntry } from '@/components/CrmProvider';
import { useToast } from '@/components/ToastProvider';

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const LIMIT = 15;

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Undoable system changes (archive, create, lane moves, won/lost/parked) from the last 7 days. */
export default function RecentChanges() {
  // Fixed at mount; the 7-day window doesn't need to tick while the page is open.
  const [now] = useState(() => Date.now());
  const { activities = [], undoActivity } = useCrm();
  const { addToast } = useToast();
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const changes = activities
    .filter((a: ActivityEntry) => a.undoPayload && now - a.timestamp <= WINDOW_MS)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, LIMIT);
  if (changes.length === 0) return null;

  const undo = async (id: string) => {
    setUndoingId(id);
    const ok = await undoActivity(id);
    setUndoingId(null);
    if (!ok) addToast('Could not undo that change', 'error');
  };

  return (
    <details className="mt-3 min-w-0">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-dashed border-clay-hairline px-4 text-sm text-clay-muted hover:text-clay-ink">
        <span>Recent changes you can undo</span>
        <span className="shrink-0 rounded-full bg-clay-surface px-2 py-0.5 text-xs font-semibold">{changes.length}</span>
      </summary>
      <ul className="mt-2 divide-y divide-clay-hairline rounded-xl border border-clay-hairline bg-white dark:bg-clay-card">
        {changes.map((a) => {
          const undone = a.applied === false;
          return (
            <li key={a.id} className={clsx('flex items-center gap-3 px-4 py-2.5', undone && 'opacity-60')}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-clay-ink break-words">{a.label}</p>
                <p className="text-xs text-clay-muted">
                  {timeLabel(a.timestamp)}
                  {a.description ? ` · ${a.description}` : ''}
                </p>
              </div>
              {undone ? (
                <span className="shrink-0 text-xs text-clay-muted">Undone</span>
              ) : (
                <button
                  type="button"
                  onClick={() => void undo(a.id)}
                  disabled={undoingId !== null}
                  aria-label={`Undo: ${a.label}`}
                  className="shrink-0 min-h-11 rounded-lg border border-clay-hairline px-3 text-xs font-semibold text-clay-ink hover:border-clay-lavender disabled:opacity-50"
                >
                  {undoingId === a.id ? 'Undoing…' : 'Undo'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
