import { describe, expect, it } from 'vitest';
import { LAYA_ALL_FROZEN_QUESTIONS, LAYA_FIT_FROZEN_QUESTIONS } from './laya-buyer-response';
import { fitAnswersFromRun, parseLayaScore } from './laya-answers';

const fitSent = { state: 'The account is named "April\'s Bakery".', questions: LAYA_FIT_FROZEN_QUESTIONS };
const trace = (sent: { state: string; questions: object }) => ({
  scored_input: sent,
  model: { repository: 'aac6fef/laya-multilingual-coreml', source_revision: 'rev', package_sha256: 'sha', engine: 'cpu_gpu' },
  scored_at: '2026-09-29T00:00:00+00:00',
});

const fitPayload = () => ({
  answers: {
    fit_plant_based_restaurant_cafe: { type: 'noul', noul: 0.01, confidence: 0.99 },
    fit_modern_trade_specialty_retail: { type: 'noul', noul: 0.1, confidence: 0.9 },
    fit_bakery_patisserie_brands: { type: 'noul', noul: 0.82, confidence: 0.82 },
  } as Record<string, Record<string, unknown>>,
  usage: { input_tokens: 150, output_tokens: 0 },
  trace: trace(fitSent),
});

const fit = (payload: unknown) => fitAnswersFromRun(parseLayaScore(payload, fitSent));

describe('parseLayaScore — prospect-fit Nouls', () => {
  it('accepts a well-formed fit run and returns every archetype\'s Noul', () => {
    expect(fit(fitPayload())!.support).toEqual({
      plant_based_restaurant_cafe: { noul: 0.01, confidence: 0.99 },
      modern_trade_specialty_retail: { noul: 0.1, confidence: 0.9 },
      bakery_patisserie_brands: { noul: 0.82, confidence: 0.82 },
    });
  });

  it('rejects non-objects and payloads without answers or trace', () => {
    expect(fit(null)).toBeNull();
    expect(fit('fit')).toBeNull();
    expect(fit({ ...fitPayload(), answers: undefined })).toBeNull();
    expect(fit({ ...fitPayload(), trace: undefined })).toBeNull();
  });

  it('rejects a trace that does not echo the exact request', () => {
    const other = fitPayload();
    other.trace = trace({ ...fitSent, state: 'something else' });
    expect(fit(other)).toBeNull();
  });

  it('rejects a non-local engine or an unparseable timestamp', () => {
    const remote = fitPayload();
    remote.trace.model.engine = 'cloud';
    expect(fit(remote)).toBeNull();
    const badTime = fitPayload();
    badTime.trace.scored_at = 'yesterday';
    expect(fit(badTime)).toBeNull();
  });

  it('rejects missing or extra answers', () => {
    const missing = fitPayload();
    delete missing.answers.fit_bakery_patisserie_brands;
    expect(fit(missing)).toBeNull();

    const extra = fitPayload();
    extra.answers.role_support = { noul: 0.2, confidence: 0.8 };
    expect(fit(extra)).toBeNull();
  });

  it('rejects a declared type that disagrees with the question', () => {
    const wrongType = fitPayload();
    wrongType.answers.fit_bakery_patisserie_brands.type = 'choice';
    expect(fit(wrongType)).toBeNull();
  });

  it('rejects out-of-range or non-finite values', () => {
    const outOfRange = fitPayload();
    outOfRange.answers.fit_bakery_patisserie_brands = { noul: 1.5, confidence: 1.5 };
    expect(fit(outOfRange)).toBeNull();

    const nan = fitPayload();
    nan.answers.fit_bakery_patisserie_brands.confidence = Number.NaN;
    expect(fit(nan)).toBeNull();

    const bool = fitPayload();
    bool.answers.fit_bakery_patisserie_brands.noul = true;
    expect(fit(bool)).toBeNull();
  });

  it('rejects a noul whose confidence does not match max(noul, 1 − noul)', () => {
    const mismatch = fitPayload();
    mismatch.answers.fit_bakery_patisserie_brands = { noul: 0.2, confidence: 0.5 };
    expect(fit(mismatch)).toBeNull();

    const boundary = fitPayload();
    boundary.answers.fit_bakery_patisserie_brands = { noul: 0, confidence: 1 };
    expect(fit(boundary)).not.toBeNull();
  });
});

describe('parseLayaScore — choice answers', () => {
  const sent = { state: 'The buyer asks for a quote.', questions: { buyer_response: LAYA_ALL_FROZEN_QUESTIONS.buyer_response } };
  const payload = () => ({
    answers: {
      buyer_response: {
        choice: 'requested_next_step',
        confidence: 0.6,
        probabilities: { unclear: 0.1, no_commitment: 0.1, declined: 0.1, deferred: 0.1, requested_next_step: 0.6 } as Record<string, number>,
      } as Record<string, unknown>,
    },
    trace: trace(sent),
  });

  it('accepts a choice inside the frozen options with a unit total', () => {
    expect(parseLayaScore(payload(), sent)!.answers.buyer_response).toMatchObject({ type: 'choice', choice: 'requested_next_step' });
  });

  it.each(['constructor', 'toString', '__proto__', 'priority'])('rejects choice key %s', (key) => {
    const bad = payload();
    bad.answers.buyer_response.choice = key;
    expect(parseLayaScore(bad, sent)).toBeNull();
  });

  it('rejects a distribution with a foreign key or a bad total', () => {
    const foreign = payload();
    foreign.answers.buyer_response.probabilities = { unclear: 0.1, no_commitment: 0.1, declined: 0.1, deferred: 0.1, other: 0.6 };
    expect(parseLayaScore(foreign, sent)).toBeNull();
    const total = payload();
    (total.answers.buyer_response.probabilities as Record<string, number>).unclear = 0.5;
    expect(parseLayaScore(total, sent)).toBeNull();
  });
});

describe('parseLayaScore — score answers', () => {
  // No frozen set uses Score today; the parser still supports the type.
  const criteria = ['No obstacle', 'Minor friction', 'Material obstacle', 'Explicit blocker'];
  const strengthQuestion = { type: 'score', instructions: 'How strongly does the obstacle block progress?', criteria };
  const sent = { state: 'The buyer says the price is too high.', questions: { obstacle_strength: strengthQuestion } };
  const payload = () => ({
    answers: {
      obstacle_strength: {
        type: 'score',
        score: 1.3,
        confidence: 0.6,
        legend: Object.fromEntries(criteria.map((text, index) => [String(index), text])) as Record<string, string>,
        probabilities: { '0': 0.1, '1': 0.6, '2': 0.2, '3': 0.1 } as Record<string, number>,
      },
    },
    trace: trace(sent),
  });

  it('returns legend and probabilities index-aligned with the criteria', () => {
    const answer = parseLayaScore(payload(), sent)!.answers.obstacle_strength;
    expect(answer).toEqual({ type: 'score', score: 1.3, confidence: 0.6, legend: [...criteria], probabilities: [0.1, 0.6, 0.2, 0.1] });
  });

  it('rejects a score that is not the distribution expected value', () => {
    const drifted = payload();
    drifted.answers.obstacle_strength.score = 2.5;
    expect(parseLayaScore(drifted, sent)).toBeNull();
  });

  it('rejects a legend that differs from the frozen criteria', () => {
    const relabelled = payload();
    relabelled.answers.obstacle_strength.legend['3'] = 'Something else';
    expect(parseLayaScore(relabelled, sent)).toBeNull();
  });

  it('rejects a bucket count that differs from the criteria', () => {
    const short = payload();
    delete short.answers.obstacle_strength.probabilities['3'];
    expect(parseLayaScore(short, sent)).toBeNull();
  });
});
