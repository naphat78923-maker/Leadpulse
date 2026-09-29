// ─── Laya buyer-response rules ───
// The only model-facing rules LeadPulse sends to the local Laya worker
// (POST /score on 127.0.0.1, or the tailnet host from a phone).
//
// Two hard constraints live in this file:
//
// 1. NO RUNTIME IMPORTS except ./laya-questions.json. The Python worker test
//    transpiles this file standalone to build the exact request the worker then
//    validates, so a bundler-only import here breaks that boundary test.
//    `import type` is erased and stays fine.
//
// 2. THE QUESTIONS ARE FROZEN. Their text lives once, in laya-questions.json,
//    which scripts/laya_score_server.py loads too. The worker accepts only the
//    sets named there and rejects anything else with 400 "Unsupported scoring
//    schema". Option and bucket order is part of the measured contract:
//    buyer_response keeps the reversed order (eval variant v_verbatim_revopts,
//    8/8 requested_next_step recall on verbatim replies); deal_amount ends with
//    an explicit "no amount stated" bucket; every buyer-detail question scores in
//    its own sequence and fits the 1024-token budget (worst case obstacle_kind at
//    152 tokens of overhead). Edit the JSON only with a fresh eval.
//
// Evidence: scripts/eval_results/2026-09-23-buyer-response-eval-report.md

import LAYA_QUESTIONS from './laya-questions.json';

export type LayaBuyerResponseLevel =
  | 'requested_next_step'
  | 'deferred'
  | 'declined'
  | 'no_commitment'
  | 'unclear';

export interface LayaBuyerResponseInput {
  state: string;
  questions: {
    buyer_response: {
      type: 'choice';
      instructions: string;
      criteria: Record<LayaBuyerResponseLevel, string>;
    };
  };
  /** false when the state paraphrases an outcome note instead of the buyer's verbatim reply */
  verbatim: boolean;
}

type FrozenQuestion = {
  type: 'choice' | 'noul' | 'score';
  instructions: string;
  criteria: Record<string, string> | readonly string[];
};
type Questions = typeof LAYA_QUESTIONS.questions;
type QuestionId = keyof Questions;

/** One named set from laya-questions.json, in the file's order. */
function frozenSet(name: keyof typeof LAYA_QUESTIONS.sets): Record<string, FrozenQuestion> {
  const set: Record<string, FrozenQuestion> = {};
  for (const id of LAYA_QUESTIONS.sets[name]) {
    set[id] = LAYA_QUESTIONS.questions[id as QuestionId] as FrozenQuestion;
  }
  return set;
}

const BUYER_RESPONSE_QUESTION = frozenSet('buyer') as unknown as LayaBuyerResponseInput['questions'];
const ARCHETYPE_SELECT_QUESTION = { archetype_select: LAYA_QUESTIONS.questions.archetype_select };

/** The buyer-only set: the score card's request and the terminal's Questions pane. */
export const LAYA_BUYER_FROZEN_QUESTIONS: LayaBuyerResponseInput['questions'] = BUYER_RESPONSE_QUESTION;

/** Every buyer question — the terminal's Run sends exactly this in one pass. */
export const LAYA_ALL_FROZEN_QUESTIONS = frozenSet('terminal') as unknown as Pick<
  Questions,
  | 'buyer_response'
  | 'deal_amount'
  | 'next_step_commitment'
  | 'sample_trial_report'
  | 'commercial_info_request'
  | 'obstacle_kind'
  | 'obstacle_strength'
>;

/** The prospect-fit pair — archetype (choice) and its evidential support (noul). */
export const LAYA_FIT_FROZEN_QUESTIONS = frozenSet('fit') as unknown as Pick<Questions, 'archetype_select' | 'role_support'>;

export type LayaArchetypeChoice = keyof typeof ARCHETYPE_SELECT_QUESTION.archetype_select.criteria;

export interface LayaFitAnswers {
  archetype_select: {
    choice: LayaArchetypeChoice;
    confidence: number;
    probabilities: Record<LayaArchetypeChoice, number>;
  };
  role_support: { noul: number; confidence: number };
}

/**
 * Build the frozen one-pass prospect-fit input: a sentence-form identity of the
 * candidate account plus the frozen fit pair. The state carries ONLY the name,
 * industry and tags — exactly the fields the question restricts itself to — so
 * the judgment cannot lean on anything else. The candidate archetype list is
 * derived from the question's own criteria (minus `no_fit`), so state and
 * question can never name different sets.
 *
 * Returns null when the account states nothing at all: a needs_evidence
 * safeguard handled in code, never by the model.
 *
 * `taxonomyVersion` comes from the caller's archetype source (TAXONOMY_VERSION
 * in src/utils/companyRole.ts) because this file takes no runtime imports.
 */
export function buildLayaProspectFitInput(account: {
  name?: string | null;
  industry?: string | null;
  tags?: string[] | null;
  taxonomyVersion: string;
}): { state: string; questions: typeof LAYA_FIT_FROZEN_QUESTIONS } | null {
  const name = account.name?.trim();
  const industry = account.industry?.trim();
  const tags = (account.tags ?? []).map((tag) => tag.trim()).filter(Boolean);

  const identity: string[] = [];
  if (name) identity.push(`name "${name}"`);
  if (industry) identity.push(`industry "${industry}"`);
  if (tags.length > 0) identity.push(`tags "${tags.join(' | ')}"`);
  if (identity.length === 0) return null;

  const candidateArchetypes = Object.keys(ARCHETYPE_SELECT_QUESTION.archetype_select.criteria)
    .filter((key) => key !== 'no_fit')
    .join(', ');
  return {
    state:
      `Candidate account: ${identity.join(', ')}. ` +
      `Candidate archetypes (taxonomy ${account.taxonomyVersion}): ${candidateArchetypes}.`,
    questions: LAYA_FIT_FROZEN_QUESTIONS,
  };
}

/**
 * Small sentence-form state for the narrow buyer-response question.
 *
 * Prefers `buyer_reply` (verbatim, first-person) and marks the result verbatim;
 * falls back to the paraphrased `last_outcome` note marked verbatim: false so the
 * caller can route those to human review. Returns null when there is no buyer
 * text at all — a needs_evidence safeguard handled in code, never by the model.
 * The complete selected text is preserved; the worker's input-budget guard
 * refuses oversized input instead of cutting it.
 *
 * `includeDealValue: true` appends "Deal value on record: ฿X." when the CRM has
 * one — the deal-amount question's grounding. Only the terminal opts in: the
 * score card stays on the exact eval-measured state, so nothing else about the
 * buyer-response contract (or its privacy story) changes.
 */
export function buildLayaBuyerResponseInput(input: {
  deal: {
    product?: string | null;
    last_outcome?: string | null;
    buyer_reply?: string | null;
    value?: number | null;
  };
  /** append the recorded CRM deal value — only the deal-amount question needs it */
  includeDealValue?: boolean;
}): LayaBuyerResponseInput | null {
  const product = input.deal.product?.trim() || 'our products';
  const reply = input.deal.buyer_reply?.trim();
  const note = input.deal.last_outcome?.trim();
  const value = Math.round(input.deal.value ?? 0);
  const valueSentence =
    input.includeDealValue && Number.isFinite(value) && value > 0
      ? ` Deal value on record: ฿${value.toLocaleString('en-US')}.`
      : '';

  if (reply) {
    return {
      state: `We supply ${product} to this account. The buyer's latest reply: "${reply}"${valueSentence}`,
      questions: BUYER_RESPONSE_QUESTION,
      verbatim: true,
    };
  }
  if (note) {
    return {
      state: `We supply ${product} to this account. The latest recorded outcome note says: "${note}"${valueSentence}`,
      questions: BUYER_RESPONSE_QUESTION,
      verbatim: false,
    };
  }
  return null;
}

// ─── Shipped handling: 2-class slice only (eval report option 1) ───
// On verbatim replies the model recalls requested_next_step 8/8 with only 2
// false positives, while the other four classes collapse into each other
// (~1/4 each) — so ONLY a verbatim requested_next_step raises the flag.
// Paraphrased notes never raise it (the same question measured 2/8 on
// third-person notes). Everything else routes to manual triage with no label.

export type LayaBuyerSignal = 'buyer_requested' | 'manual_triage';

export const LAYA_BUYER_REQUEST_LABEL = 'Buyer-request signal — review this deal';

export function buyerResponseSignal(
  level: LayaBuyerResponseLevel,
  verbatim: boolean,
): LayaBuyerSignal {
  return verbatim && level === 'requested_next_step' ? 'buyer_requested' : 'manual_triage';
}
