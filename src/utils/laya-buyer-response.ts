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
//    schema". Option order is part of the measured contract: buyer_response keeps
//    the reversed order (eval variant v_verbatim_revopts, 8/8 requested_next_step
//    recall on verbatim replies); every buyer-detail question scores in its own
//    sequence and fits the 1024-token budget (worst case obstacle_kind at 152
//    tokens of overhead). Edit the JSON only with a fresh eval.
//
// Deal size is not a model question: the CRM value is already a number, and
// lead-scoring.ts buckets it in code.
//
// Evidence: scripts/eval_results/2026-09-23-buyer-response-eval-report.md,
//           scripts/evaluate_laya_prospect_fit.py (fit Nouls)

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
  /** a Noul may omit it and use the model's default yes/no wording */
  criteria?: Record<string, string> | readonly string[];
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

/** The buyer-only set: the score card's request and the terminal's Questions pane. */
export const LAYA_BUYER_FROZEN_QUESTIONS: LayaBuyerResponseInput['questions'] = BUYER_RESPONSE_QUESTION;

/** Every buyer question — the terminal's Run sends exactly this in one pass. */
export const LAYA_ALL_FROZEN_QUESTIONS = frozenSet('terminal') as unknown as Pick<
  Questions,
  | 'buyer_response'
  | 'next_step_commitment'
  | 'sample_trial_report'
  | 'commercial_info_request'
  | 'obstacle_kind'
  | 'obstacle_strength'
>;

/**
 * The prospect-fit set: one yes/no Noul per published archetype, asked in one
 * pass. Code picks the fit (see judgmentFromAnswers in prospectFit.ts), so the
 * support number is the fit number — there is no second question to disagree.
 */
export const LAYA_FIT_FROZEN_QUESTIONS = frozenSet('fit') as unknown as Pick<
  Questions,
  'fit_plant_based_restaurant_cafe' | 'fit_modern_trade_specialty_retail' | 'fit_bakery_patisserie_brands'
>;

export type LayaPublishedArchetype =
  | 'plant_based_restaurant_cafe'
  | 'modern_trade_specialty_retail'
  | 'bakery_patisserie_brands';
export type LayaArchetypeChoice = LayaPublishedArchetype | 'no_fit';

/** Published archetype ids, in fit-set order (fit_<id> in laya-questions.json). */
export const LAYA_PUBLISHED_ARCHETYPES = LAYA_QUESTIONS.sets.fit.map((id) =>
  id.replace(/^fit_/, ''),
) as LayaPublishedArchetype[];

export interface LayaFitAnswers {
  /** fit Noul per published archetype: probability the account is that type */
  support: Record<LayaPublishedArchetype, { noul: number; confidence: number }>;
}

/**
 * Build the frozen one-pass prospect-fit input: a plain sentence of the
 * candidate account's name, industry and tags, and nothing else. The state must
 * not list archetype names — measured on the dev set, naming them in the state
 * made every support Noul answer "yes".
 *
 * Returns null when the account states nothing at all: a needs_evidence
 * safeguard handled in code, never by the model.
 */
export function buildLayaProspectFitInput(account: {
  name?: string | null;
  industry?: string | null;
  tags?: string[] | null;
}): { state: string; questions: typeof LAYA_FIT_FROZEN_QUESTIONS } | null {
  const name = account.name?.trim();
  const industry = account.industry?.trim();
  const tags = (account.tags ?? []).map((tag) => tag.trim()).filter(Boolean);

  const parts: string[] = [];
  if (name) parts.push(`The account is named "${name}"`);
  if (industry) parts.push(`its industry is "${industry}"`);
  if (tags.length > 0) parts.push(`its tags are "${tags.join(', ')}"`);
  if (parts.length === 0) return null;
  return { state: `${parts.join('; ')}.`, questions: LAYA_FIT_FROZEN_QUESTIONS };
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
 */
export function buildLayaBuyerResponseInput(input: {
  deal: {
    product?: string | null;
    last_outcome?: string | null;
    buyer_reply?: string | null;
  };
}): LayaBuyerResponseInput | null {
  const product = input.deal.product?.trim() || 'our products';
  const reply = input.deal.buyer_reply?.trim();
  const note = input.deal.last_outcome?.trim();

  if (reply) {
    return {
      state: `We supply ${product} to this account. The buyer's latest reply: "${reply}"`,
      questions: BUYER_RESPONSE_QUESTION,
      verbatim: true,
    };
  }
  if (note) {
    return {
      state: `We supply ${product} to this account. The latest recorded outcome note says: "${note}"`,
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
