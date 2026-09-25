// ─── Laya buyer-response rules ───
// The only model-facing rules LeadPulse sends to the local Laya worker
// (POST /score on 127.0.0.1, or the tailnet host from a phone).
//
// Two hard constraints live in this file:
//
// 1. NO RUNTIME IMPORTS. scripts/test_laya_score_server.py transpiles this file
//    with the TypeScript compiler and runs it standalone — no bundler, no path
//    aliases — to build the exact request the worker then validates. A runtime
//    import here breaks that boundary test, which is why no date/format helper
//    is used on this path. `import type` is erased and stays fine.
//
// 2. THE QUESTION IS FROZEN. The worker compares what arrives with its own
//    BUYER_RESPONSE_QUESTION (scripts/laya_score_server.py) and rejects any
//    difference with 400 "Unsupported scoring schema". Option order is part of
//    that contract. laya-buyer-response.contract.test.ts fails on any drift.
//
// Evidence: scripts/eval_results/2026-09-23-buyer-response-eval-report.md

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

// Frozen, reversed option order (eval variant v_verbatim_revopts): measured 8/8
// requested_next_step recall on verbatim replies with 2 false positives, versus
// visible decline over-prediction in the original order. Byte-identical to
// BUYER_RESPONSE_QUESTION in scripts/laya_score_server.py — do not reformat.
const BUYER_RESPONSE_QUESTION: LayaBuyerResponseInput['questions'] = {
  buyer_response: {
    type: 'choice',
    instructions: "Which option best describes the buyer's latest message?",
    criteria: {
      unclear: 'no buyer response is stated, or responses conflict with no stated order',
      no_commitment: 'only acknowledges or shows interest, with no request',
      declined: 'says no, not interested, or that they chose another supplier',
      deferred: 'asks to revisit later or after a stated time, without declining',
      requested_next_step: 'requests a sample, quotation, order, contract, or pricing to proceed with a purchase',
    },
  },
};

// The same frozen object, exported for the Laya terminal UI: it needs the
// exact question to build a /score body (and to render in its Questions pane)
// before any deal exists to derive it from. Same bytes as the constant above.
export const LAYA_BUYER_FROZEN_QUESTIONS: LayaBuyerResponseInput['questions'] = BUYER_RESPONSE_QUESTION;

/**
 * Small sentence-form state for the narrow buyer-response question.
 *
 * Prefers `buyer_reply` (verbatim, first-person) and marks the result verbatim;
 * falls back to the paraphrased `last_outcome` note marked verbatim: false so the
 * caller can route those to human review. Returns null when there is no buyer
 * text at all — a needs_evidence safeguard handled in code, never by the model.
 * The complete selected text is preserved; the worker's input-budget guard
 * refuses oversized input instead of cutting it.
 */
export function buildLayaBuyerResponseInput(input: {
  deal: { product?: string | null; last_outcome?: string | null; buyer_reply?: string | null };
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
