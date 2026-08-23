// LeadPulse — Synced signal-dismissal store (Supabase-backed).
//
// Replaces the old per-browser localStorage map. One row per historical
// customer; `dismissed_until` is epoch ms until which the signal is hidden
// (Number.MAX_SAFE_INTEGER = permanent, Date.now() + 30d = snooze) — the same
// contract rankSignals() already consumes.
//
// Solo mode: the table's RLS policy allows all, matching every other table.

import { supabase } from '@/lib/supabase';

const PERMANENT = Number.MAX_SAFE_INTEGER;
export const PERMANENT_DISMISS = PERMANENT;

/** customerId → epoch ms until which hidden (empty map = none). */
export type DismissalMap = Record<string, number>;

/** Load all dismissals. Returns {} on any failure so signals still render. */
export async function fetchSignalDismissals(): Promise<DismissalMap> {
  try {
    const { data, error } = await supabase
      .from('signal_dismissals')
      .select('customer_id, dismissed_until');
    if (error) throw error;
    const map: DismissalMap = {};
    for (const row of data ?? []) {
      if (row.customer_id != null && row.dismissed_until != null) {
        map[String(row.customer_id)] = Number(row.dismissed_until);
      }
    }
    return map;
  } catch (err) {
    console.error('[signals] fetchSignalDismissals failed:', err);
    return {};
  }
}

/**
 * Hide a signal: upsert the hide-window for its customer.
 * Returns the stored row on success, null on failure.
 */
export async function saveSignalDismissal(
  customerId: string,
  until: number,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('signal_dismissals')
      .upsert(
        { customer_id: customerId, dismissed_until: until },
        { onConflict: 'customer_id' },
      );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[signals] saveSignalDismissal failed:', err);
    return false;
  }
}

/**
 * Undo surface: restore a previous value, or delete the row when there was
 * none (dismissal never happened). Returns true on success.
 */
export async function restoreSignalDismissal(
  customerId: string,
  previousUntil: number | undefined,
): Promise<boolean> {
  try {
    if (previousUntil === undefined) {
      const { error } = await supabase
        .from('signal_dismissals')
        .delete()
        .eq('customer_id', customerId);
      if (error) throw error;
      return true;
    }
    return await saveSignalDismissal(customerId, previousUntil);
  } catch (err) {
    console.error('[signals] restoreSignalDismissal failed:', err);
    return false;
  }
}
