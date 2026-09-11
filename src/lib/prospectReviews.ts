// LeadPulse Intelligence — Prospect Review: the saved-review writer.
//
// The ONLY module that writes a review row, and the only one that may touch
// `deals.followup_date` on behalf of a review. Read the two constraints before
// adding anything here:
//
//   1. A review save never writes to `companies`, `deals.stage`, `deals.nudge_stage`
//      or `deals.last_outcome`. The one permitted CRM write is a single
//      `followup_date` field on an existing open deal, so the next action surfaces
//      on the board Pat actually works from.
//   2. The evaluator never reads this table. Fit score, reachability and archetype
//      membership are computed from companies/deals/meetings/account_events/contacts
//      alone, so a human decision cannot silently rewrite the evidence.

import { supabase } from './supabase';
import { updateDeal } from './crm';
import type { ReviewDecision, ReviewReasonCode, ReviewRowPayload } from '@/utils/prospectReviewDecision';

export interface ProspectReviewRow {
  id: string;
  company_id: string;
  decision: ReviewDecision;
  reason_code: ReviewReasonCode;
  reason_note: string | null;
  criterion_ref: string | null;
  reviewed_at: string;
  next_action: string | null;
  next_action_owner: string | null;
  next_action_due: string | null;
  evidence_note: string | null;
  evidence_links: string[] | null;
  needs_data_review: boolean;
  created_at: string;
  updated_at: string;
}

export type ReviewsLoad =
  | { ok: true; rows: ProspectReviewRow[] }
  | { ok: false; error: string; tableMissing: boolean };

function looksLikeMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  const message = (error.message ?? '').toLowerCase();
  return message.includes('does not exist') || message.includes('schema cache');
}

/**
 * Load every review row. A missing table is reported as such rather than thrown: the
 * screen must stay usable (and say so) when the migration has not been applied yet.
 */
export async function loadProspectReviews(): Promise<ReviewsLoad> {
  const { data, error } = await supabase.from('prospect_reviews').select('*');
  if (error) {
    return { ok: false, error: error.message, tableMissing: looksLikeMissingTable(error) };
  }
  return { ok: true, rows: (data ?? []) as ProspectReviewRow[] };
}

/** Upsert one review. One row per company: the unique constraint is on `company_id`. */
export async function saveProspectReview(payload: ReviewRowPayload): Promise<ProspectReviewRow> {
  const { data, error } = await supabase
    .from('prospect_reviews')
    .upsert({ ...payload, updated_at: new Date().toISOString() }, { onConflict: 'company_id' })
    .select()
    .single();
  if (error) throw error;
  return data as ProspectReviewRow;
}

/** Restore a row verbatim — used by undo, which must not re-derive a past state. */
export async function restoreProspectReview(row: ProspectReviewRow): Promise<ProspectReviewRow> {
  const { data, error } = await supabase
    .from('prospect_reviews')
    .upsert(
      {
        company_id: row.company_id,
        decision: row.decision,
        reason_code: row.reason_code,
        reason_note: row.reason_note,
        criterion_ref: row.criterion_ref,
        reviewed_at: row.reviewed_at,
        next_action: row.next_action,
        next_action_owner: row.next_action_owner,
        next_action_due: row.next_action_due,
        evidence_note: row.evidence_note,
        evidence_links: row.evidence_links,
        needs_data_review: row.needs_data_review,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data as ProspectReviewRow;
}

/**
 * Remove a review row. This is our own annotation rather than customer data, so the
 * row is deleted outright; the caller keeps the previous values in memory to offer undo.
 */
export async function clearProspectReview(companyId: string): Promise<void> {
  const { error } = await supabase.from('prospect_reviews').delete().eq('company_id', companyId);
  if (error) throw error;
}

/**
 * The single permitted CRM write from a review.
 *
 * It routes through the app's own deal writer so `updated_at` and blank-value
 * normalisation behave exactly as they do elsewhere, and it sends ONE field. It never
 * writes `last_outcome`: the interaction modal is the canonical writer for logged
 * touches, and a review note is not a logged touch.
 */
export async function setDealFollowupDate(dealId: string, followupDate: string | null): Promise<void> {
  await updateDeal(dealId, { followup_date: followupDate } as never);
}
