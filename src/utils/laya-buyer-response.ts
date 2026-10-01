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
//    recall on verbatim replies); every question scores in its own sequence and
//    fits the 1024-token budget. Edit the JSON only with a fresh eval. The
//    sample_trial_report, obstacle_kind and obstacle_strength Choices were cut on
//    2026-10-01: below their majority-class baseline on both checkpoints
//    (scripts/evaluate_laya_buyer_detail.py).
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
  /** true when the buyer text contains Thai script — routed to Pat, not graded */
  thai: boolean;
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
  | 'commercial_info_request'
  | 'next_step_commitment'
  | 'trial_reported'
  | 'trial_positive'
  | 'trial_negative'
  | 'concern_price'
  | 'concern_technical'
  | 'concern_delivery'
  | 'concern_approval'
  | 'concern_timing'
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
 * Returns null when the account states no industry and no tags: a name alone is
 * not evidence of a business type (a bare trading-company name was judged a
 * bakery), so it is a needs_evidence safeguard handled in code, never by the model.
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
  if (!industry && tags.length === 0) return null;
  return { state: `${parts.join('; ')}.`, questions: LAYA_FIT_FROZEN_QUESTIONS };
}

// last_outcome is an append-only activity log ("\n---\n"-separated, oldest first):
// timestamps, workflow/system lines, internal notes and, sometimes, a logged client
// reply. Only the reply entries are buyer evidence, written in exactly two forms:
//   💬 Client replied — <sentiment>: <summary>          (lane-gate.ts, deal-board.ts)
//   💬 Customer reply (<sentiment>): <description>      (interaction-workflow.ts)
// optionally prefixed with "[<timestamp>] ".
const LOG_ENTRY_SEPARATOR = /\n---\n/;
const LOG_TIMESTAMP_PREFIX = /^\[[^\]]*\]\s*/;
const LOGGED_REPLY_PATTERNS = [
  /^💬 Client replied — [a-z_]+(?::\s*([\s\S]*))?$/,
  /^💬 Customer reply \([^)]*\)(?::\s*([\s\S]*))?$/,
];

/**
 * The rep's note of the buyer's LATEST logged reply, or null. Only the newest reply
 * entry counts: when it carries no words, an older reply is not the latest one, so
 * nothing is returned rather than stale text.
 */
export function latestLoggedReplyNote(log: string | null | undefined): string | null {
  if (!log?.trim()) return null;
  const entries = log.split(LOG_ENTRY_SEPARATOR);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index].trim().replace(LOG_TIMESTAMP_PREFIX, '');
    for (const pattern of LOGGED_REPLY_PATTERNS) {
      const match = pattern.exec(entry);
      if (match) return match[1]?.trim() || null;
    }
  }
  return null;
}

/**
 * Small sentence-form state for the narrow buyer-response question.
 *
 * Prefers `buyer_reply` (the buyer's words, verbatim) and marks the result verbatim.
 * Otherwise falls back to the rep's note of the latest LOGGED client reply in the
 * `last_outcome` log, marked verbatim: false so callers route it to human review.
 * The rest of the log (system lines, internal notes, older entries) is never sent.
 * Returns null when neither exists — a needs_evidence safeguard handled in code,
 * never by the model. Selected text is preserved; the worker's input-budget guard
 * refuses oversized input instead of cutting it.
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

  if (reply) {
    return {
      state: `We supply ${product} to this account. The buyer's latest reply: "${reply}"`,
      questions: BUYER_RESPONSE_QUESTION,
      verbatim: true,
      thai: hasThaiScript(reply),
    };
  }
  const note = latestLoggedReplyNote(input.deal.last_outcome);
  if (note) {
    return {
      state: `We supply ${product} to this account. Our note of the buyer's latest reply: "${note}"`,
      questions: BUYER_RESPONSE_QUESTION,
      verbatim: false,
      thai: hasThaiScript(note),
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

export type LayaBuyerSignal = 'buyer_requested' | 'manual_triage' | 'owner_review';

export const LAYA_BUYER_REQUEST_LABEL = 'Buyer-request signal — review this deal';
export const LAYA_OWNER_REVIEW_LABEL = 'Thai reply — review it yourself; Laya is unreliable on Thai';

// Thai script block (U+0E00–U+0E7F). Typed Decisions has an English tokenizer: on
// Thai replies its scores bunch around 0.3–0.55 whatever the reply says, so any
// Thai text routes to Pat (laya-cutoffs.json routing.thai_script).
const THAI_SCRIPT = /[\u0E00-\u0E7F]/;

export function hasThaiScript(text: string | null | undefined): boolean {
  return !!text && THAI_SCRIPT.test(text);
}

export function buyerResponseSignal(
  level: LayaBuyerResponseLevel,
  verbatim: boolean,
  thai = false,
): LayaBuyerSignal {
  if (thai) return 'owner_review';
  return verbatim && level === 'requested_next_step' ? 'buyer_requested' : 'manual_triage';
}
