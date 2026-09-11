// ─── LeadPulse Intelligence — Prospect Review: saved decision vocabulary ───
//
// Pure. No React, no Supabase, no I/O. This module exists so the two rules that
// make a saved review safe live in one auditable place:
//
//   1. A decision is a REVIEW record. It is not a sales qualification and it is
//      not permission to make contact, so nothing in this file may produce a word
//      that implies either. `prospectReviewDecision.test.ts` asserts the whole
//      vocabulary stays clean.
//   2. A "not a fit" verdict must cite a reason from a CLOSED vocabulary and may
//      cite the committed archetype criterion it contradicts. An account is never
//      ruled out on a requirement invented during the review — the rule the
//      qualification pilot had to learn the hard way.
//
// Nothing here reads or writes CRM state. The one CRM write this slice performs
// (`deals.followup_date`) is a separate, explicitly-shaped payload built by
// `planFollowupWrite`, which can only ever carry that single field.

import { CAMPAIGN_ARCHETYPES_V1 } from './campaignArchetypes.ts';

// ─── Decisions ───

export type ReviewDecision = 'shortlist' | 'needs_research' | 'not_a_fit';

export interface ReviewDecisionSpec {
  id: ReviewDecision;
  label: string;
  blurb: string;
  /** short form used on the row badge and in filters */
  short: string;
}

export const REVIEW_DECISIONS: ReviewDecisionSpec[] = [
  {
    id: 'shortlist',
    label: 'Shortlist',
    short: 'Shortlisted',
    blurb:
      'Worth a closer look next. This is not an approval, not a qualification, and not permission to make contact.',
  },
  {
    id: 'needs_research',
    label: 'Needs research',
    short: 'Needs research',
    blurb: 'A specific gap has to be closed before this can be decided either way.',
  },
  {
    id: 'not_a_fit',
    label: 'Not a fit',
    short: 'Not a fit',
    blurb: 'Ruled out with a stated reason, and where possible the committed criterion the evidence contradicts.',
  },
];

export function decisionSpec(id: ReviewDecision): ReviewDecisionSpec {
  const found = REVIEW_DECISIONS.find((d) => d.id === id);
  if (!found) throw new Error(`unknown review decision: ${id}`);
  return found;
}

// ─── Reason codes (closed vocabulary) ───

export type ReviewReasonCode =
  | 'plausible_application'
  | 'relationship_history'
  | 'verified_route'
  | 'strategic_priority'
  | 'insufficient_evidence'
  | 'route_unverified'
  | 'buying_process_unknown'
  | 'identity_unconfirmed'
  | 'wrong_business_type'
  | 'no_plausible_application'
  | 'cannot_serve_logistically'
  | 'possible_duplicate'
  | 'outside_scope_overseas_hold'
  | 'other_contradicted_criterion';

export interface ReviewReasonSpec {
  code: ReviewReasonCode;
  /** the only decision this code may accompany */
  decision: ReviewDecision;
  label: string;
  /** the free note is required: the code alone is not enough to act on or audit */
  requiresNote: boolean;
  hint: string;
}

export const REVIEW_REASONS: ReviewReasonSpec[] = [
  // ── shortlist ──
  {
    code: 'plausible_application',
    decision: 'shortlist',
    label: 'A plausible product application exists',
    requiresNote: false,
    hint: 'Name the application you have in mind. Plausible is not confirmed — the account still has to prove it.',
  },
  {
    code: 'relationship_history',
    decision: 'shortlist',
    label: 'Existing relationship history',
    requiresNote: true,
    hint:
      'Existing history informs the approach. It is not a prerequisite and it is not permission to contact.',
  },
  {
    code: 'verified_route',
    decision: 'shortlist',
    label: 'A route worth testing is published',
    requiresNote: false,
    hint:
      'A published route proves reachability only. It says nothing about purchasing authority or about being allowed to contact.',
  },
  {
    code: 'strategic_priority',
    decision: 'shortlist',
    label: 'Strategic priority this pass',
    requiresNote: true,
    hint: 'Say what makes it a priority now, so a later reader can disagree with the reason and not just the verdict.',
  },
  // ── needs research ──
  {
    code: 'insufficient_evidence',
    decision: 'needs_research',
    label: 'Not enough evidence yet',
    requiresNote: true,
    hint: 'Name the evidence that is missing, not just that something is.',
  },
  {
    code: 'route_unverified',
    decision: 'needs_research',
    label: 'No usable route identified yet',
    requiresNote: false,
    hint: 'Contact research belongs here, not in an outreach plan.',
  },
  {
    code: 'buying_process_unknown',
    decision: 'needs_research',
    label: 'Buying process unknown',
    requiresNote: false,
    hint:
      'A published procurement page or a team page naming a buying role can establish some of this without contact.',
  },
  {
    code: 'identity_unconfirmed',
    decision: 'needs_research',
    label: 'Business or buying entity unconfirmed',
    requiresNote: false,
    hint: 'Unresolved identity is a research task, never a reason to rule the account out.',
  },
  // ── not a fit (every one of these needs a note: an exclusion cites its source) ──
  {
    code: 'wrong_business_type',
    decision: 'not_a_fit',
    label: 'Wrong kind of business',
    requiresNote: true,
    hint: 'Say what it actually is, and what evidence that came from.',
  },
  {
    code: 'no_plausible_application',
    decision: 'not_a_fit',
    label: 'No plausible application for the product',
    requiresNote: true,
    hint: 'A menu or marketing mention is not enough either way. Cite the subject\'s own description.',
  },
  {
    code: 'cannot_serve_logistically',
    decision: 'not_a_fit',
    label: 'Cannot be served commercially or logistically',
    requiresNote: true,
    hint:
      'Delivery terms are confirmed per account, so state which confirmed term rules this out. One product\'s claim, or a guess about coverage, does not.',
  },
  {
    code: 'possible_duplicate',
    decision: 'not_a_fit',
    label: 'Possible duplicate or parent/subsidiary record',
    requiresNote: true,
    hint:
      'This flags a record for review. It never merges anything: name the counterpart record and leave the merge to a deliberate step.',
  },
  {
    code: 'outside_scope_overseas_hold',
    decision: 'not_a_fit',
    label: 'Outside this pass (overseas, on hold)',
    requiresNote: true,
    hint:
      'This is a scope hold, not a verdict on fit. There is no export operation today, so the account is set aside for this sales pass.',
  },
  {
    code: 'other_contradicted_criterion',
    decision: 'not_a_fit',
    label: 'A committed criterion is contradicted',
    requiresNote: true,
    hint:
      'Name the criterion and the evidence. A requirement that is not in the committed criteria cannot be used to rule an account out.',
  },
];

export function reasonCodesFor(decision: ReviewDecision): ReviewReasonSpec[] {
  return REVIEW_REASONS.filter((r) => r.decision === decision);
}

export function reasonSpec(code: ReviewReasonCode): ReviewReasonSpec {
  const found = REVIEW_REASONS.find((r) => r.code === code);
  if (!found) throw new Error(`unknown review reason code: ${code}`);
  return found;
}

/** The vocabulary as stored values, in the order the UI offers them. */
export const ALL_REASON_CODES: ReviewReasonCode[] = REVIEW_REASONS.map((r) => r.code);
export const ALL_DECISIONS: ReviewDecision[] = REVIEW_DECISIONS.map((d) => d.id);

/**
 * No reviewer identity is recorded: the app has no login, so a typed name would
 * look like accountability without being verifiable. Said out loud, in the panel.
 */
export const NO_REVIEWER_NOTE = 'No reviewer identity is recorded: this app has no login yet.';

/** Shown wherever a decision is saved, so a record can never read as an approval. */
export const DECISION_SCOPE_NOTE =
  'A saved decision is a review note. It does not qualify the account, does not clear it for contact, and does not change what the evaluator computes.';

// ─── Committed criteria (no invented requirements) ───

export interface CriterionOption {
  /** `<archetype_id>#<1-based index>` */
  value: string;
  label: string;
  text: string;
}

export function criterionOptions(archetypeId: string): CriterionOption[] {
  const archetype = CAMPAIGN_ARCHETYPES_V1.find((a) => a.id === archetypeId);
  if (!archetype) return [];
  return archetype.criteria.map((text, i) => ({
    value: `${archetype.id}#${i + 1}`,
    label: `criterion ${i + 1}: ${text}`,
    text,
  }));
}

/** Resolve a stored reference back to the committed criterion, or null if it is not one. */
export function parseCriterionRef(
  ref: string | null | undefined
): { archetypeId: string; index: number; text: string } | null {
  if (!ref) return null;
  const match = /^([a-z_]+)#(\d+)$/.exec(ref.trim());
  if (!match) return null;
  const [, archetypeId, rawIndex] = match;
  const index = Number(rawIndex);
  const archetype = CAMPAIGN_ARCHETYPES_V1.find((a) => a.id === archetypeId);
  if (!archetype) return null;
  const text = archetype.criteria[index - 1];
  if (!text) return null;
  return { archetypeId, index, text };
}

// ─── Draft validation ───

export interface ReviewDraft {
  companyId: string;
  decision: ReviewDecision | '';
  reasonCode: ReviewReasonCode | '';
  reasonNote: string;
  criterionRef: string;
  nextAction: string;
  nextActionOwner: string;
  /** 'YYYY-MM-DD' or '' for none */
  nextActionDue: string;
  evidenceNote: string;
  /** one link per line */
  evidenceLinks: string;
  needsDataReview: boolean;
  /** chosen deal when the company has more than one open deal */
  followupDealId: string;
}

export function emptyDraft(companyId: string): ReviewDraft {
  return {
    companyId,
    decision: '',
    reasonCode: '',
    reasonNote: '',
    criterionRef: '',
    nextAction: '',
    nextActionOwner: '',
    nextActionDue: '',
    evidenceNote: '',
    evidenceLinks: '',
    needsDataReview: false,
    followupDealId: '',
  };
}

/** Reopen a saved review for editing. Shape-matched structurally, so the lib row type fits. */
export function draftFromReview(row: {
  company_id: string;
  decision: ReviewDecision;
  reason_code: ReviewReasonCode;
  reason_note: string | null;
  criterion_ref: string | null;
  next_action: string | null;
  next_action_owner: string | null;
  next_action_due: string | null;
  evidence_note: string | null;
  evidence_links: string[] | null;
  needs_data_review: boolean;
}): ReviewDraft {
  return {
    companyId: row.company_id,
    decision: row.decision,
    reasonCode: row.reason_code,
    reasonNote: row.reason_note ?? '',
    criterionRef: row.criterion_ref ?? '',
    nextAction: row.next_action ?? '',
    nextActionOwner: row.next_action_owner ?? '',
    nextActionDue: row.next_action_due ?? '',
    evidenceNote: row.evidence_note ?? '',
    evidenceLinks: (row.evidence_links ?? []).join('\n'),
    needsDataReview: row.needs_data_review,
    followupDealId: '',
  };
}

export interface ReviewValidation {
  ok: boolean;
  /** field name → message; empty when ok */
  errors: Record<string, string>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateReviewDraft(draft: ReviewDraft): ReviewValidation {
  const errors: Record<string, string> = {};

  if (!draft.companyId) errors.companyId = 'No company is attached to this review.';
  if (!draft.decision) errors.decision = 'Choose a decision.';

  if (draft.decision) {
    if (!draft.reasonCode) {
      errors.reasonCode = 'Choose a reason. A decision is never saved on the note alone.';
    } else {
      const spec = reasonSpec(draft.reasonCode as ReviewReasonCode);
      if (spec.decision !== draft.decision) {
        errors.reasonCode = `"${spec.label}" belongs to a different decision.`;
      } else if (spec.requiresNote && !draft.reasonNote.trim()) {
        errors.reasonNote = 'This reason needs a note: the code alone does not say what you saw.';
      }
    }
  }

  if (draft.criterionRef.trim() && !parseCriterionRef(draft.criterionRef.trim())) {
    errors.criterionRef = 'That is not one of the published criteria. Pick one from the list.';
  }

  if (draft.nextAction.trim() && !draft.nextActionOwner.trim()) {
    errors.nextActionOwner = 'A next action needs an owner.';
  }
  if (!draft.nextAction.trim() && draft.nextActionDue.trim()) {
    errors.nextActionDue = 'A due date needs a next action.';
  }
  if (draft.nextActionDue.trim() && !ISO_DATE.test(draft.nextActionDue.trim())) {
    errors.nextActionDue = 'Use a date in YYYY-MM-DD form.';
  }

  const links = parseEvidenceLinks(draft.evidenceLinks);
  if (links.invalid.length > 0) {
    errors.evidenceLinks = `Only http(s) links are stored: ${links.invalid.join(', ')}`;
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/** Split the evidence textarea into storable links. Non-http lines are rejected, never repaired. */
export function parseEvidenceLinks(raw: string): { links: string[]; invalid: string[] } {
  const parts = raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const links: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if (/^https?:\/\/\S+$/i.test(p)) links.push(p);
    else invalid.push(p);
  }
  return { links, invalid };
}

// ─── Persistence payloads (everything the writers may send) ───

export interface ReviewRowPayload {
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
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * The exact columns the review writer may send. Blank strings become null; nothing
 * outside this shape is ever written, which is what keeps a review save out of the
 * company, deal and contact records.
 */
export function buildReviewRowPayload(draft: ReviewDraft, now: Date): ReviewRowPayload {
  if (!draft.decision) throw new Error('buildReviewRowPayload called without a decision');
  if (!draft.reasonCode) throw new Error('buildReviewRowPayload called without a reason code');
  const { links } = parseEvidenceLinks(draft.evidenceLinks);
  return {
    company_id: draft.companyId,
    decision: draft.decision,
    reason_code: draft.reasonCode as ReviewReasonCode,
    reason_note: orNull(draft.reasonNote),
    criterion_ref: orNull(draft.criterionRef),
    reviewed_at: now.toISOString(),
    next_action: orNull(draft.nextAction),
    next_action_owner: orNull(draft.nextActionOwner),
    next_action_due: orNull(draft.nextActionDue),
    evidence_note: orNull(draft.evidenceNote),
    evidence_links: links.length > 0 ? links : null,
    needs_data_review: draft.needsDataReview,
  };
}

// ─── The one permitted CRM write: deals.followup_date ───

export interface FollowupDeal {
  id: string;
  company_id: string | null;
  stage: string;
  title: string;
  followup_date: string | null;
}

const CLOSED_STAGES = ['closed_won', 'closed_lost'];

export function openDealsForCompany(deals: FollowupDeal[], companyId: string): FollowupDeal[] {
  return deals.filter((d) => d.company_id === companyId && !CLOSED_STAGES.includes(d.stage));
}

export type FollowupTarget =
  | { kind: 'none' }
  | { kind: 'single'; deal: FollowupDeal }
  | { kind: 'multiple'; deals: FollowupDeal[] };

/** Which deal the follow-up date belongs on. More than one open deal is a human choice. */
export function followupTargetFor(deals: FollowupDeal[], companyId: string, chosenDealId?: string): FollowupTarget {
  const open = openDealsForCompany(deals, companyId);
  if (open.length === 0) return { kind: 'none' };
  if (open.length === 1) return { kind: 'single', deal: open[0] };
  const chosen = chosenDealId ? open.find((d) => d.id === chosenDealId) : undefined;
  if (chosen) return { kind: 'single', deal: chosen };
  return { kind: 'multiple', deals: open };
}

export interface FollowupPlan {
  dealId: string;
  /** exactly one field, or null when there is nothing to write */
  patch: { followup_date: string | null } | null;
  /** why nothing is written, for the panel to state plainly */
  note: string;
}

/**
 * Decide the follow-up write for one save.
 *
 * Rules, all of them deliberate:
 *   - writing happens only when the review carries a due date
 *   - exactly one existing open deal is touched; a deal is never created
 *   - the previous value is only cleared when WE were the ones who set it, so a
 *     follow-up date entered elsewhere is never silently erased
 */
export function planFollowupWrite(args: {
  draft: ReviewDraft;
  deals: FollowupDeal[];
  previousReview: { next_action_due: string | null } | null;
}): FollowupPlan {
  const { draft, deals, previousReview } = args;
  const target = followupTargetFor(deals, draft.companyId, draft.followupDealId);
  const due = draft.nextActionDue.trim();

  if (target.kind === 'none') {
    return {
      dealId: '',
      patch: null,
      note: 'No open deal is linked to this company, so nothing is written to the deal board.',
    };
  }
  if (target.kind === 'multiple') {
    return {
      dealId: '',
      patch: null,
      note: 'This company has more than one open deal. Choose the one the follow-up belongs to, or the deal board is left alone.',
    };
  }

  const deal = target.deal;
  if (due) {
    return { dealId: deal.id, patch: { followup_date: due }, note: `Sets the follow-up date on "${deal.title}".` };
  }
  const previousDue = previousReview?.next_action_due ?? null;
  if (previousDue && deal.followup_date === previousDue) {
    return {
      dealId: deal.id,
      patch: { followup_date: null },
      note: `Clears the follow-up date this review set on "${deal.title}".`,
    };
  }
  return { dealId: deal.id, patch: null, note: 'No due date on this review, so the deal board is left alone.' };
}

// ─── Summaries ───

export interface ReviewLike {
  company_id: string;
  decision: ReviewDecision;
  next_action_due?: string | null;
}

export interface ReviewSummary {
  total: number;
  shortlist: number;
  needs_research: number;
  not_a_fit: number;
  unreviewed: number;
  /** reviews whose company is no longer in the candidate set */
  outside_candidates: number;
  /** true when the four buckets add up to the candidate count */
  reconciles: boolean;
}

/**
 * Progress counts, derived from the review rows and the candidate ids — never typed,
 * and computed against the candidate set so the two cannot silently diverge.
 */
export function summariseReviews(reviews: ReviewLike[], candidateIds: string[]): ReviewSummary {
  const candidates = new Set(candidateIds);
  const summary: ReviewSummary = {
    total: candidates.size,
    shortlist: 0,
    needs_research: 0,
    not_a_fit: 0,
    unreviewed: 0,
    outside_candidates: 0,
    reconciles: false,
  };
  const seen = new Set<string>();
  for (const r of reviews) {
    if (!candidates.has(r.company_id)) {
      summary.outside_candidates += 1;
      continue;
    }
    if (seen.has(r.company_id)) continue; // one row per company; a duplicate would be a defect
    seen.add(r.company_id);
    summary[r.decision] += 1;
  }
  summary.unreviewed = candidates.size - seen.size;
  summary.reconciles =
    summary.shortlist + summary.needs_research + summary.not_a_fit + summary.unreviewed === summary.total;
  return summary;
}

/** Reviews that belong to companies no longer in the candidate set, by id. */
export function reviewsOutsideCandidates(reviews: ReviewLike[], candidateIds: string[]): string[] {
  const candidates = new Set(candidateIds);
  return reviews.filter((r) => !candidates.has(r.company_id)).map((r) => r.company_id);
}

export function isOverdue(due: string | null | undefined, today: Date): boolean {
  if (!due) return false;
  if (!ISO_DATE.test(due)) return false;
  return due < today.toISOString().slice(0, 10);
}

export function formatReviewDate(iso: string | null | undefined): string {
  if (!iso) return 'never reviewed';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never reviewed';
  return d.toISOString().slice(0, 10);
}
