import { describe, expect, it, vi } from 'vitest';
import type { CustomerEvidenceItem, CustomerEvidencePacket } from './customer-evidence';
import {
  buildLayaCustomerSignalsInput,
  LAYA_CUSTOMER_SIGNAL_SCHEMA_VERSION,
  LAYA_CUSTOMER_SIGNAL_QUESTIONS,
  parseLayaCustomerSignalsResponse,
  readLayaCustomerSignals,
  type LayaCustomerSignalsInputOptions,
  type LayaCustomerSignalsReadyInput,
} from './laya-customer-signals';

function evidenceItem(text: string, index: number): CustomerEvidenceItem {
  return {
    sourceRef: `deal:fixture-${index}:buyer_reply`,
    entityId: 'deal-fixture',
    sourceKind: 'deal.buyer_reply',
    provenance: 'buyer_verbatim',
    direction: 'inbound',
    observedAt: `2026-09-${String(index + 1).padStart(2, '0')}T03:00:00.000Z`,
    text,
    eligibleForCustomerJudgment: true,
  };
}

function readyPacket(texts: string[], requiresReview = false): CustomerEvidencePacket {
  const evidence = texts.map(evidenceItem);
  const modelEvidence = evidence.map(({ sourceKind, direction, observedAt, text }) => ({
    source_kind: sourceKind,
    direction,
    observed_at: observedAt,
    text,
  }));
  const modelInput = JSON.stringify({ evidence: modelEvidence });
  return {
    status: 'ready',
    entityId: 'deal-fixture-private-id',
    evidence,
    modelEvidence: evidence,
    modelInput,
    inputBytes: new TextEncoder().encode(modelInput).byteLength,
    requiresReview,
  };
}

function makeReadyInput(
  texts: string[] = ['Could you explain the sample size?'],
  options: LayaCustomerSignalsInputOptions = {},
) {
  const prepared = buildLayaCustomerSignalsInput(readyPacket(texts), options);
  if (prepared.status !== 'ready') throw new Error(`Expected ready input, got ${prepared.status}`);
  return prepared;
}

function noul(noul: number) {
  return { type: 'noul', confidence: Math.max(noul, 1 - noul), action: { act_probability: 0 }, noul };
}

function choice(options: Record<string, string>, selected: string) {
  const probabilities = Object.fromEntries(
    Object.keys(options).map((key) => [key, key === selected ? 1 : 0]),
  );
  return { type: 'choice', confidence: 1, action: { act_probability: 0 }, choice: selected, probabilities };
}

function validResponse(request: LayaCustomerSignalsReadyInput, overrides: Record<string, unknown> = {}) {
  const answers: Record<string, unknown> = {
    possible_contact_stop: noul(0.08),
    requested_deferral: noul(0.15),
    unresolved_problem: noul(0.12),
    main_customer_need: choice(LAYA_CUSTOMER_SIGNAL_QUESTIONS.main_customer_need.criteria, 'answer_question'),
  };
  const dateQuestion = request.questions.callback_date_selection;
  if (dateQuestion) answers.callback_date_selection = choice(dateQuestion.criteria, 'date_1');
  return {
    customer_signal_schema: LAYA_CUSTOMER_SIGNAL_SCHEMA_VERSION,
    answers: { ...answers, ...overrides },
    usage: { input_tokens: 120, output_tokens: 40 },
    trace: {
      scored_input: { state: request.state, questions: request.questions },
      model: {
        repository: 'synthetic-test-model',
        source_revision: 'synthetic',
        package_sha256: 'a'.repeat(64),
        engine: 'cpu_gpu',
      },
      scored_at: '2026-09-26T12:00:00.000Z',
    },
  };
}

function mutableResponse(response: ReturnType<typeof validResponse>) {
  return structuredClone(response) as {
    customer_signal_schema: string;
    answers: Record<string, unknown>;
    trace: { scored_input: { state: string; questions: unknown } };
  };
}


describe('Laya customer-signal question contract', () => {
  it('versions the bounded deferral/problem revision separately from the evaluated v1 contract', () => {
    expect(LAYA_CUSTOMER_SIGNAL_SCHEMA_VERSION).toBe('customer_signals_v2');
    expect(LAYA_CUSTOMER_SIGNAL_QUESTIONS.requested_deferral.instructions).toContain('explicitly ask');
    expect(LAYA_CUSTOMER_SIGNAL_QUESTIONS.unresolved_problem.instructions).toContain('still unresolved');
  });

  it('asks three independent Nouls and one bounded Choice, without Score', () => {
    expect(Object.keys(LAYA_CUSTOMER_SIGNAL_QUESTIONS)).toEqual([
      'possible_contact_stop',
      'requested_deferral',
      'unresolved_problem',
      'main_customer_need',
    ]);
    expect(LAYA_CUSTOMER_SIGNAL_QUESTIONS.possible_contact_stop.type).toBe('noul');
    expect(LAYA_CUSTOMER_SIGNAL_QUESTIONS.requested_deferral.type).toBe('noul');
    expect(LAYA_CUSTOMER_SIGNAL_QUESTIONS.unresolved_problem.type).toBe('noul');
    expect(LAYA_CUSTOMER_SIGNAL_QUESTIONS.main_customer_need.type).toBe('choice');
    expect(Object.keys(LAYA_CUSTOMER_SIGNAL_QUESTIONS.main_customer_need.criteria)).toEqual([
      'answer_question',
      'resolve_problem',
      'arrange_sample',
      'order_request',
      'reconnect_later',
      'unclear',
    ]);
    expect(JSON.stringify(LAYA_CUSTOMER_SIGNAL_QUESTIONS)).not.toContain('score');
  });

  it('builds a local-only request from attributed buyer evidence and omits CRM identity', () => {
    const prepared = makeReadyInput(['Could you explain the sample size?']);
    expect(prepared.schemaVersion).toBe(LAYA_CUSTOMER_SIGNAL_SCHEMA_VERSION);
    expect(prepared.entityId).toBe('deal-fixture-private-id');
    expect(prepared.requiresReview).toBe(false);
    const body = JSON.parse(prepared.body);
    expect(Object.keys(body)).toEqual(['state', 'questions']);
    expect(body.state).not.toContain('deal-fixture-private-id');
    expect(body.state).not.toContain('sourceRef');
    expect(body.state).toContain('Could you explain the sample size?');
    expect(body.questions).toEqual(LAYA_CUSTOMER_SIGNAL_QUESTIONS);
    expect(prepared.state).toBe(body.state);
  });

  it('keeps an unknown source time review-required even when the caller omits its caveat', () => {
    const packet = readyPacket(['Received, thanks.']);
    if (packet.status !== 'ready') throw new Error('Expected fixture packet');
    const state = JSON.parse(packet.modelInput);
    state.evidence[0].observed_at = null;
    const request = buildLayaCustomerSignalsInput({ ...packet, modelInput: JSON.stringify(state) });
    expect(request.status).toBe('ready');
    if (request.status !== 'ready') return;
    expect(request.requiresReview).toBe(true);
    expect(parseLayaCustomerSignalsResponse(validResponse(request), request)).toMatchObject({
      status: 'scored', requiresHumanReview: true, outreachAuthorization: 'not_established',
    });
  });

  it('keeps callback-date extraction out of the default customer-signal request', () => {
    const prepared = makeReadyInput(['Please call on 16/10/2026.']);
    expect(prepared.candidateDates).toEqual([]);
    expect(prepared.questions.callback_date_selection).toBeUndefined();
    expect(JSON.parse(prepared.state).date_candidates).toEqual([]);
  });

  it('extracts explicit date spans, lets Laya select among them, and marks ambiguous formats for confirmation', () => {
    const prepared = makeReadyInput([
      'Please call on 16/10/2026. The event is 03/04/2026; that date format is unclear.',
    ], { includeCallbackDateCandidates: true });
    expect(prepared.status).toBe('ready');
    expect(prepared.candidateDates).toEqual([
      expect.objectContaining({ text: '16/10/2026', normalizedDate: '2026-10-16', parseStatus: 'parsed' }),
      expect.objectContaining({ text: '03/04/2026', normalizedDate: null, parseStatus: 'ambiguous' }),
    ]);
    expect(prepared.questions.callback_date_selection?.type).toBe('choice');
    expect(Object.keys(prepared.questions.callback_date_selection!.criteria)).toEqual([
      'date_1',
      'date_2',
      'unclear',
    ]);
    const state = JSON.parse(prepared.state);
    expect(state.date_candidates).toEqual([
      { id: 'date_1', evidence_index: 0, text: '16/10/2026' },
      { id: 'date_2', evidence_index: 0, text: '03/04/2026' },
    ]);
  });

  it('does not invent a date or add date options for relative-only timing language', () => {
    const prepared = makeReadyInput(['Please reconnect next month, not this week.'], { includeCallbackDateCandidates: true });
    expect(prepared.candidateDates).toEqual([]);
    expect(prepared.questions.callback_date_selection).toBeUndefined();
    expect(JSON.parse(prepared.state).date_candidates).toEqual([]);
  });

  it('keeps packet source-review caveats and refuses packets that are not ready', () => {
    const review = buildLayaCustomerSignalsInput(readyPacket(['Could you call Friday?'], true));
    expect(review.status).toBe('ready');
    if (review.status === 'ready') expect(review.requiresReview).toBe(true);

    const missing = buildLayaCustomerSignalsInput({
      status: 'not_assessed',
      entityId: 'deal-fixture',
      evidence: [],
      reason: 'no_attributed_buyer_text',
      modelInput: null,
    });
    expect(missing).toMatchObject({ status: 'not_assessed', reason: 'no_attributed_buyer_text' });

    const conflict = buildLayaCustomerSignalsInput({
      status: 'needs_review',
      entityId: 'deal-fixture',
      evidence: [],
      reason: 'buyer_evidence_order_unknown',
      modelInput: null,
    });
    expect(conflict).toMatchObject({ status: 'needs_review', reason: 'buyer_evidence_order_unknown' });
  });
});

describe('parseLayaCustomerSignalsResponse', () => {
  it('validates the native result and never treats a negative stop-contact Noul as clearance', () => {
    const request = makeReadyInput();
    const result = parseLayaCustomerSignalsResponse(validResponse(request), request);
    expect(result.status).toBe('scored');
    if (result.status !== 'scored') return;
    expect(result.answers.main_customer_need.choice).toBe('answer_question');
    expect(result.contactHold).toBe('not_flagged');
    expect(result.timingHold).toBe('not_flagged');
    expect(result.serviceRecoveryReview).toBe('not_flagged');
    expect(result.outreachAuthorization).toBe('not_established');
    expect(result.schemaVersion).toBe(LAYA_CUSTOMER_SIGNAL_SCHEMA_VERSION);
  });

  it('flags a positive stop-contact judgment for human review', () => {
    const request = makeReadyInput();
    const result = parseLayaCustomerSignalsResponse(validResponse(request, {
      possible_contact_stop: noul(0.82),
    }), request);
    expect(result.status).toBe('scored');
    if (result.status !== 'scored') return;
    expect(result.contactHold).toBe('review_required');
    expect(result.outreachAuthorization).toBe('not_established');
  });

  it('flags a timing hold or unresolved problem for review rather than automating the next action', () => {
    const request = makeReadyInput();
    const result = parseLayaCustomerSignalsResponse(validResponse(request, {
      requested_deferral: noul(0.71),
      unresolved_problem: noul(0.66),
    }), request);
    expect(result.status).toBe('scored');
    if (result.status !== 'scored') return;
    expect(result.timingHold).toBe('review_required');
    expect(result.serviceRecoveryReview).toBe('review_required');
    expect(result.requiresHumanReview).toBe(true);
    expect(result.outreachAuthorization).toBe('not_established');
  });

  it('requires confirmation before acting on a selected callback date when candidates are ambiguous', () => {
    const request = makeReadyInput(['Could you call 16/10/2026, or perhaps 03/04/2026?'], { includeCallbackDateCandidates: true });
    const result = parseLayaCustomerSignalsResponse(validResponse(request), request);
    expect(result.status).toBe('scored');
    if (result.status !== 'scored') return;
    expect(result.callbackDate).toMatchObject({
      status: 'selected',
      candidateId: 'date_1',
      normalizedDate: '2026-10-16',
      confirmationRequired: true,
    });
  });

  it('consumes the deterministic contact-opt-out short circuit as a hold without requiring other answers', () => {
    const request = makeReadyInput();
    const result = parseLayaCustomerSignalsResponse({
      status: 'not_scored',
      code: 'contact_opt_out',
      customer_signal_schema: LAYA_CUSTOMER_SIGNAL_SCHEMA_VERSION,
    }, request);
    expect(result).toMatchObject({
      status: 'held',
      reason: 'contact_opt_out',
      contactHold: 'review_required',
      outreachAuthorization: 'not_established',
    });
  });

  it('rejects incomplete, stale-input, wrong-version, and malformed native output', () => {
    const request = makeReadyInput(['Please call 2026-10-16.'], { includeCallbackDateCandidates: true });
    const valid = validResponse(request);
    const incomplete = mutableResponse(valid);
    delete incomplete.answers.requested_deferral;
    expect(parseLayaCustomerSignalsResponse(incomplete, request).status).toBe('invalid_result');

    const stale = mutableResponse(valid);
    stale.trace.scored_input.state = 'different evidence';
    expect(parseLayaCustomerSignalsResponse(stale, request).status).toBe('invalid_result');

    const wrongVersion = mutableResponse(valid);
    wrongVersion.customer_signal_schema = 'customer_signals_v999';
    expect(parseLayaCustomerSignalsResponse(wrongVersion, request).status).toBe('invalid_result');

    const badProbability = mutableResponse(valid);
    const mainNeed = badProbability.answers.main_customer_need as Record<string, unknown>;
    const probabilities = mainNeed.probabilities as Record<string, unknown>;
    probabilities.unclear = 0.5;
    expect(parseLayaCustomerSignalsResponse(badProbability, request).status).toBe('invalid_result');

    const absentCandidate = mutableResponse(valid);
    const callbackSelection = absentCandidate.answers.callback_date_selection as Record<string, unknown>;
    callbackSelection.choice = 'date_99';
    expect(parseLayaCustomerSignalsResponse(absentCandidate, request).status).toBe('invalid_result');
  });
});

describe('readLayaCustomerSignals', () => {
  it('keeps the Laya advisory disabled when real judgments have not passed evaluation', async () => {
    const request = makeReadyInput();
    const transport = vi.fn(async () => ({ ok: true, status: 200, payload: validResponse(request) }));
    const result = await readLayaCustomerSignals(request, transport, new AbortController().signal);
    expect(result).toMatchObject({
      status: 'disabled',
      entityId: request.entityId,
      requestKey: request.requestKey,
      reason: 'evaluation_required',
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it('does not call Laya when evidence is not ready', async () => {
    const input = buildLayaCustomerSignalsInput({
      status: 'not_assessed',
      entityId: 'deal-fixture',
      evidence: [],
      reason: 'no_attributed_buyer_text',
      modelInput: null,
    });
    const transport = vi.fn();
    const result = await readLayaCustomerSignals(input, transport, new AbortController().signal);
    expect(result).toMatchObject({ status: 'not_assessed', reason: 'no_attributed_buyer_text' });
    expect(transport).not.toHaveBeenCalled();
  });
});
