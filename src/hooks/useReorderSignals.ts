'use client';

// LeadPulse — CRM-linked reorder signals for This week's customer check-ins.
// Past buyers who have gone quiet beyond their usual reorder cycle. Acting on one
// is logging a check-in; there is no separate dismiss/snooze.

import { useEffect, useMemo, useState } from 'react';
import { useCrm } from '@/components/CrmProvider';
import { fetchReorderSignalRows, rankSignals, type ReorderSignalRow } from '@/lib/historical';

export function useReorderSignals() {
  const { meetings, deals } = useCrm();
  const [rows, setRows] = useState<ReorderSignalRow[]>([]);

  useEffect(() => {
    let active = true;
    fetchReorderSignalRows()
      .then((r) => { if (active) setRows(r); })
      .catch((err) => console.error('[signals] fetchReorderSignalRows failed:', err));
    return () => { active = false; };
  }, []);

  const signals = useMemo(
    () => rankSignals(
      rows,
      meetings as unknown as Parameters<typeof rankSignals>[1],
      deals as unknown as Parameters<typeof rankSignals>[2],
      {},
    ),
    [rows, meetings, deals],
  );

  return { signals };
}
