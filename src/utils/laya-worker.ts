// ─── Laya judgment worker: pure parts (no network, no model) ───
// The script (scripts/laya-judgment-worker.ts) does the I/O; this module decides
// which deals qualify, builds the exact /score request, hashes it, and turns a
// worker response into a laya_judgments row. Design: docs/laya-judgments-store.md.
//
// The request is built by the SAME builder and question set the app uses, and the
// hash is sha256(JSON.stringify({ state, questions })) — so the app can recompute it
// from the current CRM row and tell a fresh judgment from a stale one.

import { createHash } from 'node:crypto';
import type { Deal } from '../types/crm.ts';
import { parseLayaScore } from './laya-answers.ts';
import { buildLayaBuyerResponseInput, hasThaiScript, LAYA_ALL_FROZEN_QUESTIONS } from './laya-buyer-response.ts';

export const DEAL_QUESTION_SET = 'terminal';

export type WorkerDeal = Pick<Deal, 'id' | 'product' | 'buyer_reply' | 'last_outcome' | 'stage' | 'workflow_action'>;

export type SkipReason = 'closed_or_parked' | 'no_verbatim_reply' | 'thai_reply';

export interface ScoreRequest {
  dealId: string;
  body: string;
  sent: { state: string; questions: Record<string, unknown> };
  inputSha256: string;
  questionsSha256: string;
}

export const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Why a deal is not sent to Laya, or null when it should be. Deterministic gates only. */
export function skipReason(deal: WorkerDeal): SkipReason | null {
  if (deal.stage === 'closed_won' || deal.stage === 'closed_lost' ||
      deal.workflow_action === 'parked' || deal.workflow_action === 'success') return 'closed_or_parked';
  if (!deal.buyer_reply?.trim()) return 'no_verbatim_reply';
  // Thai routes to Pat in grade.ts; scoring it would only store unreliable answers.
  if (hasThaiScript(deal.buyer_reply)) return 'thai_reply';
  return null;
}

/** The exact /score request for one deal, with its hashes. */
export function buildScoreRequest(deal: WorkerDeal): ScoreRequest | null {
  if (skipReason(deal)) return null;
  const built = buildLayaBuyerResponseInput({ deal });
  if (!built?.verbatim) return null;
  const sent = { state: built.state, questions: LAYA_ALL_FROZEN_QUESTIONS as Record<string, unknown> };
  const body = JSON.stringify(sent);
  return {
    dealId: deal.id,
    body,
    sent,
    inputSha256: sha256(body),
    questionsSha256: sha256(JSON.stringify(sent.questions)),
  };
}

export interface JudgmentRow {
  deal_id: string;
  question_set: string;
  questions_sha256: string;
  input_sha256: string;
  scored_state: string;
  status: 'scored' | 'not_scored';
  not_scored_code: string | null;
  answers: Record<string, unknown> | null;
  usage_input_tokens: number | null;
  model_repository: string;
  model_revision: string;
  model_package_sha256: string;
  engine: string;
  scored_at: string;
}

export interface ModelIdentity {
  repository: string;
  source_revision: string;
  package_sha256: string;
  engine: string;
}

const NOT_SCORED_CODES = new Set(['contact_opt_out', 'input_too_long']);

/**
 * Turn one /score response into a row, or null when nothing should be saved (a
 * transport error, a busy worker, or a malformed payload — the next pass retries).
 */
export function judgmentRowFromResponse(
  request: ScoreRequest,
  response: { status: number; payload: unknown },
  model: ModelIdentity,
  now: Date = new Date(),
): JudgmentRow | null {
  const base = {
    deal_id: request.dealId,
    question_set: DEAL_QUESTION_SET,
    questions_sha256: request.questionsSha256,
    input_sha256: request.inputSha256,
    scored_state: request.sent.state,
  };
  const p = response.payload as { status?: unknown; code?: unknown; answers?: unknown; usage?: { input_tokens?: unknown } } | null;

  if (response.status === 422 && p?.status === 'not_scored' && typeof p.code === 'string' && NOT_SCORED_CODES.has(p.code)) {
    return {
      ...base, status: 'not_scored', not_scored_code: p.code, answers: null, usage_input_tokens: null,
      model_repository: model.repository, model_revision: model.source_revision,
      model_package_sha256: model.package_sha256, engine: model.engine, scored_at: now.toISOString(),
    };
  }
  if (response.status !== 200) return null;

  // The shared parser checks every answer and that the trace echoes this exact request.
  const run = parseLayaScore(response.payload, request.sent);
  if (!run) return null;
  const tokens = p?.usage?.input_tokens;
  return {
    ...base,
    status: 'scored',
    not_scored_code: null,
    answers: p!.answers as Record<string, unknown>,
    usage_input_tokens: typeof tokens === 'number' && Number.isInteger(tokens) && tokens > 0 ? tokens : null,
    model_repository: run.trace.model.repository,
    model_revision: run.trace.model.source_revision,
    model_package_sha256: run.trace.model.package_sha256,
    engine: run.trace.model.engine,
    scored_at: run.trace.scored_at,
  };
}
