// Tests for the saved-review vocabulary and validation.
//
// These lock the rules a saved decision must never break:
//   1. no decision or reason label may read as a qualification, an approval or
//      permission to contact
//   2. a rejection cannot be saved without a stated reason, and the criterion it
//      cites must be a real committed criterion — never a requirement invented
//      during the review
//   3. the only CRM-shaped payload this feature can build is one `followup_date`
//      field on one existing open deal
//   4. the evaluator never reads a review: fit is computed from CRM rows alone

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  ALL_DECISIONS,
  ALL_REASON_CODES,
  DECISION_SCOPE_NOTE,
  REVIEW_DECISIONS,
  REVIEW_REASONS,
  buildReviewRowPayload,
  criterionOptions,
  decisionSpec,
  draftFromReview,
  emptyDraft,
  followupTargetFor,
  formatReviewDate,
  isOverdue,
  parseCriterionRef,
  planFollowupWrite,
  reasonCodesFor,
  reasonSpec,
  summariseReviews,
  validateReviewDraft,
  type FollowupDeal,
  type ReviewDecision,
  type ReviewDraft,
} from './prospectReviewDecision.ts';
import { CAMPAIGN_ARCHETYPES_V1 } from './campaignArchetypes.ts';

function draft(over: Partial<ReviewDraft> = {}): ReviewDraft {
  return { ...emptyDraft('c1'), ...over };
}

function deal(over: Partial<FollowupDeal> = {}): FollowupDeal {
  return {
    id: 'd1',
    company_id: 'c1',
    stage: 'research',
    title: 'Butter · Cafe',
    followup_date: null,
    ...over,
  };
}

const FORBIDDEN_IN_LABELS = /qualif|clear|approv|permission|ready to contact|verified/i;

describe('decision and reason vocabulary', () => {
  it('partitions every reason code across exactly one decision', () => {
    for (const decision of ALL_DECISIONS) {
      const codes = reasonCodesFor(decision);
      expect(codes.length).toBeGreaterThan(0);
      for (const spec of codes) expect(spec.decision).toBe(decision);
    }
    const total = ALL_DECISIONS.reduce((n, d) => n + reasonCodesFor(d).length, 0);
    expect(total).toBe(REVIEW_REASONS.length);
    expect(new Set(ALL_REASON_CODES).size).toBe(ALL_REASON_CODES.length);
  });

  it('never renders a decision or reason as a qualification, approval or clearance', () => {
    for (const d of REVIEW_DECISIONS) {
      expect(d.label).not.toMatch(FORBIDDEN_IN_LABELS);
      expect(d.short).not.toMatch(FORBIDDEN_IN_LABELS);
    }
    for (const r of REVIEW_REASONS) {
      expect(r.label).not.toMatch(FORBIDDEN_IN_LABELS);
    }
  });

  it('says on the shortlist option itself that it is not an approval to contact', () => {
    expect(decisionSpec('shortlist').blurb).toMatch(/not an approval/);
    expect(DECISION_SCOPE_NOTE).toMatch(/does not qualify/);
  });

  it('requires a note for every reason that rules an account out', () => {
    for (const r of reasonCodesFor('not_a_fit')) {
      expect(r.requiresNote).toBe(true);
    }
  });

  it('keeps the code values in snake_case, matching the database check constraint', () => {
    for (const code of ALL_REASON_CODES) expect(code).toMatch(/^[a-z_]+$/);
    for (const d of ALL_DECISIONS) expect(d).toMatch(/^[a-z_]+$/);
  });
});

describe('committed criteria', () => {
  it('offers exactly the published criteria, with nothing added', () => {
    for (const archetype of CAMPAIGN_ARCHETYPES_V1) {
      const options = criterionOptions(archetype.id);
      expect(options.map((o) => o.text)).toEqual(archetype.criteria);
    }
    expect(criterionOptions('no_such_archetype')).toEqual([]);
  });

  it('resolves a stored reference only when it points at a real criterion', () => {
    const first = CAMPAIGN_ARCHETYPES_V1[0];
    expect(parseCriterionRef(`${first.id}#1`)?.text).toBe(first.criteria[0]);
    expect(parseCriterionRef(`${first.id}#99`)).toBeNull();
    expect(parseCriterionRef('invented_archetype#1')).toBeNull();
    expect(parseCriterionRef('a physical store is required')).toBeNull();
    expect(parseCriterionRef(null)).toBeNull();
  });
});

describe('validateReviewDraft', () => {
  it('refuses a decision with no reason', () => {
    const result = validateReviewDraft(draft({ decision: 'shortlist' }));
    expect(result.ok).toBe(false);
    expect(result.errors.reasonCode).toBeTruthy();
  });

  it('refuses a reason that belongs to a different decision', () => {
    const result = validateReviewDraft(
      draft({ decision: 'shortlist', reasonCode: 'possible_duplicate', reasonNote: 'x' })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.reasonCode).toContain('different decision');
  });

  it('refuses a "not a fit" with no note: an exclusion states what it saw', () => {
    const result = validateReviewDraft(
      draft({ decision: 'not_a_fit', reasonCode: 'wrong_business_type', reasonNote: '   ' })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.reasonNote).toBeTruthy();
  });

  it('refuses an invented criterion reference', () => {
    const result = validateReviewDraft(
      draft({ decision: 'not_a_fit', reasonCode: 'no_plausible_application', reasonNote: 'omnivore menu', criterionRef: 'not_a_criterion' })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.criterionRef).toBeTruthy();
  });

  it('refuses a next action with no owner, and a due date with no action', () => {
    const noOwner = validateReviewDraft(draft({ decision: 'shortlist', reasonCode: 'plausible_application', nextAction: 'Call them' }));
    expect(noOwner.errors.nextActionOwner).toBeTruthy();

    const orphanDue = validateReviewDraft(draft({ decision: 'shortlist', reasonCode: 'plausible_application', nextActionDue: '2026-09-20' }));
    expect(orphanDue.errors.nextActionDue).toBeTruthy();
  });

  it('stores only http(s) links and rejects anything else instead of repairing it', () => {
    const bad = validateReviewDraft(
      draft({ decision: 'needs_research', reasonCode: 'insufficient_evidence', reasonNote: 'no menu online', evidenceLinks: 'see their menu' })
    );
    expect(bad.ok).toBe(false);
    expect(bad.errors.evidenceLinks).toContain('see their menu');
  });

  it('accepts a complete, sourced draft', () => {
    const result = validateReviewDraft(
      draft({
        decision: 'not_a_fit',
        reasonCode: 'other_contradicted_criterion',
        reasonNote: 'omnivore menu across the whole group',
        criterionRef: `${CAMPAIGN_ARCHETYPES_V1[0].id}#1`,
        nextAction: 'Archive the research note',
        nextActionOwner: 'Pat',
        nextActionDue: '2026-09-30',
        evidenceLinks: 'https://example.test/menu',
        needsDataReview: true,
      })
    );
    expect(result).toEqual({ ok: true, errors: {} });
  });
});

describe('buildReviewRowPayload', () => {
  it('sends only review columns — never a company, deal or status field', () => {
    const payload = buildReviewRowPayload(
      draft({ decision: 'shortlist', reasonCode: 'verified_route', reasonNote: '' }),
      new Date('2026-09-11T10:00:00Z')
    );
    expect(Object.keys(payload).sort()).toEqual(
      [
        'company_id',
        'criterion_ref',
        'decision',
        'evidence_links',
        'evidence_note',
        'needs_data_review',
        'next_action',
        'next_action_due',
        'next_action_owner',
        'reason_code',
        'reason_note',
        'reviewed_at',
      ].sort()
    );
    expect(payload.reason_note).toBeNull();
    expect(payload.evidence_links).toBeNull();
    expect(payload.reviewed_at).toBe('2026-09-11T10:00:00.000Z');
  });

  it('refuses to build a payload without a decision or a reason', () => {
    expect(() => buildReviewRowPayload(draft({ decision: 'shortlist' }), new Date())).toThrow();
    expect(() => buildReviewRowPayload(draft({ decision: 'shortlist', reasonCode: '' }), new Date())).toThrow();
  });
});

describe('the one permitted CRM write', () => {
  it('ignores closed deals and reports nothing to write when no deal is open', () => {
    const target = followupTargetFor([deal({ stage: 'closed_won' }), deal({ id: 'd2', stage: 'closed_lost' })], 'c1');
    expect(target.kind).toBe('none');

    const plan = planFollowupWrite({
      draft: draft({ nextActionDue: '2026-09-30' }),
      deals: [deal({ stage: 'closed_won' })],
      previousReview: null,
    });
    expect(plan.patch).toBeNull();
    expect(plan.note).toContain('No open deal');
  });

  it('writes exactly one field, on the single open deal', () => {
    const plan = planFollowupWrite({
      draft: draft({ nextActionDue: '2026-09-30' }),
      deals: [deal()],
      previousReview: null,
    });
    expect(plan.dealId).toBe('d1');
    expect(plan.patch).toEqual({ followup_date: '2026-09-30' });
    expect(Object.keys(plan.patch!)).toEqual(['followup_date']);
  });

  it('asks which deal when more than one is open instead of guessing', () => {
    const deals = [deal(), deal({ id: 'd2', title: 'Second deal' })];
    const noChoice = planFollowupWrite({ draft: draft({ nextActionDue: '2026-09-30' }), deals, previousReview: null });
    expect(noChoice.patch).toBeNull();
    expect(noChoice.note).toContain('more than one open deal');

    const chosen = planFollowupWrite({
      draft: draft({ nextActionDue: '2026-09-30', followupDealId: 'd2' }),
      deals,
      previousReview: null,
    });
    expect(chosen.dealId).toBe('d2');
  });

  it('clears the date only when this review set it, never someone else\u2019s follow-up', () => {
    const weSetIt = planFollowupWrite({
      draft: draft({ nextActionDue: '' }),
      deals: [deal({ followup_date: '2026-09-30' })],
      previousReview: { next_action_due: '2026-09-30' },
    });
    expect(weSetIt.patch).toEqual({ followup_date: null });

    const someoneElse = planFollowupWrite({
      draft: draft({ nextActionDue: '' }),
      deals: [deal({ followup_date: '2026-10-15' })],
      previousReview: { next_action_due: '2026-09-30' },
    });
    expect(someoneElse.patch).toBeNull();
  });

  it('writes nothing when the review carries no due date and no prior review existed', () => {
    const plan = planFollowupWrite({ draft: draft({ nextAction: 'Call them' }), deals: [deal()], previousReview: null });
    expect(plan.patch).toBeNull();
    expect(plan.note).toContain('left alone');
  });
});

describe('summariseReviews', () => {
  it('reconciles the four buckets against the candidate set', () => {
    const summary = summariseReviews(
      [
        { company_id: 'c1', decision: 'shortlist' as ReviewDecision },
        { company_id: 'c2', decision: 'not_a_fit' as ReviewDecision },
      ],
      ['c1', 'c2', 'c3']
    );
    expect(summary).toMatchObject({ total: 3, shortlist: 1, needs_research: 0, not_a_fit: 1, unreviewed: 1, reconciles: true });
  });

  it('counts a company once and keeps reviews for non-candidates out of the buckets', () => {
    const summary = summariseReviews(
      [
        { company_id: 'c1', decision: 'shortlist' as ReviewDecision },
        { company_id: 'c1', decision: 'shortlist' as ReviewDecision },
        { company_id: 'gone', decision: 'shortlist' as ReviewDecision },
      ],
      ['c1']
    );
    expect(summary.shortlist).toBe(1);
    expect(summary.outside_candidates).toBe(1);
    expect(summary.reconciles).toBe(true);
  });
});

describe('dates', () => {
  it('flags a past due date and leaves today alone', () => {
    const today = new Date('2026-09-11T05:00:00Z');
    expect(isOverdue('2026-09-10', today)).toBe(true);
    expect(isOverdue('2026-09-11', today)).toBe(false);
    expect(isOverdue('2026-09-12', today)).toBe(false);
    expect(isOverdue(null, today)).toBe(false);
  });

  it('reports an unreadable timestamp as never reviewed rather than a broken date', () => {
    expect(formatReviewDate(null)).toBe('never reviewed');
    expect(formatReviewDate('not a date')).toBe('never reviewed');
    expect(formatReviewDate('2026-09-11T10:00:00.000Z')).toBe('2026-09-11');
  });

  it('reopens a saved row into an editable draft without inventing values', () => {
    const reopened = draftFromReview({
      company_id: 'c1',
      decision: 'needs_research',
      reason_code: 'route_unverified',
      reason_note: null,
      criterion_ref: null,
      next_action: null,
      next_action_owner: null,
      next_action_due: null,
      evidence_note: 'checked their site',
      evidence_links: ['https://example.test'],
      needs_data_review: false,
    });
    expect(reopened.reasonNote).toBe('');
    expect(reopened.nextActionDue).toBe('');
    expect(reopened.evidenceLinks).toBe('https://example.test');
    expect(reasonSpec(reopened.reasonCode as 'route_unverified').decision).toBe('needs_research');
    expect(decisionSpec(reopened.decision as 'needs_research').label).toBe('Needs research');
  });
});

// The evaluator must stay a pure function of CRM rows. If a review ever became an
// INPUT to fit scoring, a human note would silently rewrite the evidence the screen
// shows — so the evaluator modules are asserted to import nothing from this feature.
describe('the evaluator never reads a review', () => {
  const evaluatorModules = ['prospectFit.ts', 'prospectReview.ts', 'companyRole.ts'];

  it('keeps review modules out of the evaluator and classifier', () => {
    for (const file of evaluatorModules) {
      const source = readFileSync(join(process.cwd(), 'src', 'utils', file), 'utf8');
      expect(source).not.toContain('prospectReviewDecision');
      expect(source).not.toContain('prospectReviews');
      expect(source).not.toContain('prospect_reviews');
    }
  });
});
