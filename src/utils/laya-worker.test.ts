// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LAYA_ALL_FROZEN_QUESTIONS } from './laya-buyer-response';
import { buildScoreRequest, judgmentRowFromResponse, skipReason, type WorkerDeal } from './laya-worker';

const deal: WorkerDeal = {
  id: '11111111-1111-1111-1111-111111111111',
  product: 'Butter',
  buyer_reply: 'Please send us a quotation for 20 kg.',
  last_outcome: null,
  stage: 'proposal',
  workflow_action: 'sample',
};

const model = {
  repository: 'aac6fef/laya-typed-decisions-coreml',
  source_revision: 'f9ab0b228f0fc0f14d873dbc99038f135c2da1b2',
  package_sha256: '517a8071290a29c2f1e19b38356fdc5c59dfdc801711a92606de6bba67596c85',
  engine: 'cpu_gpu',
};

/** A valid worker answer set for the deal set, echoing the exact request. */
function workerPayload(sent: object) {
  const answers: Record<string, unknown> = {
    buyer_response: {
      choice: 'requested_next_step', confidence: 0.6,
      probabilities: { unclear: 0.1, no_commitment: 0.1, declined: 0.05, deferred: 0.05, requested_next_step: 0.7 },
    },
  };
  for (const id of Object.keys(LAYA_ALL_FROZEN_QUESTIONS)) {
    if (id !== 'buyer_response') answers[id] = { type: 'noul', noul: 0.2, confidence: 0.8 };
  }
  return {
    answers,
    usage: { input_tokens: 129, output_tokens: 0 },
    trace: { scored_input: sent, model, scored_at: '2026-10-01T12:00:00+00:00' },
  };
}

describe('skipReason', () => {
  it('lets an open deal with an English verbatim reply through', () => {
    expect(skipReason(deal)).toBeNull();
  });

  it('skips closed or parked deals, deals without a reply, and Thai replies', () => {
    expect(skipReason({ ...deal, stage: 'closed_lost' })).toBe('closed_or_parked');
    expect(skipReason({ ...deal, workflow_action: 'parked' })).toBe('closed_or_parked');
    expect(skipReason({ ...deal, buyer_reply: '  ' })).toBe('no_verbatim_reply');
    expect(skipReason({ ...deal, buyer_reply: 'ขอใบเสนอราคาครับ' })).toBe('thai_reply');
  });
});

describe('buildScoreRequest', () => {
  it('builds the deal set request and hashes the exact body the app will rebuild', () => {
    const request = buildScoreRequest(deal)!;
    expect(Object.keys(request.sent.questions)).toEqual(Object.keys(LAYA_ALL_FROZEN_QUESTIONS));
    expect(request.body).toBe(JSON.stringify(request.sent));
    expect(request.inputSha256).toBe(createHash('sha256').update(request.body, 'utf8').digest('hex'));
    expect(request.inputSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(request.questionsSha256).toBe(createHash('sha256').update(JSON.stringify(LAYA_ALL_FROZEN_QUESTIONS)).digest('hex'));
  });

  it('changes the input hash when the reply changes, but not the questions hash', () => {
    const a = buildScoreRequest(deal)!;
    const b = buildScoreRequest({ ...deal, buyer_reply: 'We chose another supplier.' })!;
    expect(a.inputSha256).not.toBe(b.inputSha256);
    expect(a.questionsSha256).toBe(b.questionsSha256);
  });

  it('returns null for a skipped deal', () => {
    expect(buildScoreRequest({ ...deal, buyer_reply: null })).toBeNull();
  });
});

describe('judgmentRowFromResponse', () => {
  it('turns a valid scored response into a row the table constraints accept', () => {
    const request = buildScoreRequest(deal)!;
    const row = judgmentRowFromResponse(request, { status: 200, payload: workerPayload(request.sent) }, model)!;
    expect(row).toMatchObject({
      deal_id: deal.id, question_set: 'terminal', status: 'scored', not_scored_code: null,
      input_sha256: request.inputSha256, questions_sha256: request.questionsSha256,
      scored_state: request.sent.state, usage_input_tokens: 129, engine: 'cpu_gpu',
      model_package_sha256: model.package_sha256, scored_at: '2026-10-01T12:00:00+00:00',
    });
    expect(Object.keys(row.answers!)).toEqual(Object.keys(LAYA_ALL_FROZEN_QUESTIONS));
  });

  it('records a refusal the table knows, with no answers', () => {
    const request = buildScoreRequest(deal)!;
    const row = judgmentRowFromResponse(request, { status: 422, payload: { status: 'not_scored', code: 'contact_opt_out' } }, model)!;
    expect(row).toMatchObject({ status: 'not_scored', not_scored_code: 'contact_opt_out', answers: null });
  });

  it('saves nothing for a busy or failed worker, an unknown refusal, or a malformed payload', () => {
    const request = buildScoreRequest(deal)!;
    expect(judgmentRowFromResponse(request, { status: 503, payload: { error: 'busy' } }, model)).toBeNull();
    expect(judgmentRowFromResponse(request, { status: 422, payload: { status: 'not_scored', code: 'model_error' } }, model)).toBeNull();
    const tampered = workerPayload({ ...request.sent, state: 'different text' });
    expect(judgmentRowFromResponse(request, { status: 200, payload: tampered }, model)).toBeNull();
    const partial = workerPayload(request.sent);
    delete (partial.answers as Record<string, unknown>).concern_price;
    expect(judgmentRowFromResponse(request, { status: 200, payload: partial }, model)).toBeNull();
  });
});
