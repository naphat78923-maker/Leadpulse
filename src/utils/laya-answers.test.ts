import { describe, expect, it } from 'vitest';
import { LAYA_ALL_FROZEN_QUESTIONS, LAYA_FIT_FROZEN_QUESTIONS } from './laya-buyer-response';
import { fitAnswersFromRun, parseLayaScore } from './laya-answers';

const fitSent = { state: 'Candidate account: name "April\'s Bakery".', questions: LAYA_FIT_FROZEN_QUESTIONS };
const trace = (sent: { state: string; questions: object }) => ({
  scored_input: sent,
  model: { repository: 'aac6fef/laya-multilingual-coreml', source_revision: 'rev', package_sha256: 'sha', engine: 'cpu_gpu' },
  scored_at: '2026-09-29T00:00:00+00:00',
});

const fitPayload = () => ({
  answers: {
    archetype_select: {
      choice: 'bakery_patisserie_brands',
      confidence: 0.8,
      probabilities: {
        plant_based_restaurant_cafe: 0.05,
        modern_trade_specialty_retail: 0.05,
        bakery_patisserie_brands: 0.8,
        no_fit: 0.1,
      } as Record<string, number>,
    },
    role_support: { noul: 0.2, confidence: 0.8 },
  } as Record<string, Record<string, unknown>>,
  usage: { input_tokens: 150, output_tokens: 0 },
  trace: trace(fitSent),
});

const fit = (payload: unknown) => fitAnswersFromRun(parseLayaScore(payload, fitSent));

describe('parseLayaScore — prospect-fit pair', () => {
  it('accepts a well-formed fit run and returns both answers', () => {
    const result = fit(fitPayload());
    expect(result!.archetype_select.choice).toBe('bakery_patisserie_brands');
    expect(result!.archetype_select.probabilities.no_fit).toBe(0.1);
    expect(result!.role_support).toEqual({ noul: 0.2, confidence: 0.8 });
  });

  it('rejects non-objects and payloads without answers or trace', () => {
    expect(fit(null)).toBeNull();
    expect(fit('archetype_select')).toBeNull();
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

  it('rejects missing, extra, or partial answers', () => {
    const missing = fitPayload();
    delete missing.answers.role_support;
    expect(fit(missing)).toBeNull();

    const extra = fitPayload();
    extra.answers.deal_amount = { score: 0 };
    expect(fit(extra)).toBeNull();

    const partial = fitPayload();
    delete partial.answers.archetype_select.probabilities;
    expect(fit(partial)).toBeNull();
  });

  it('rejects a choice outside the frozen criteria or a declared type that disagrees', () => {
    const unknown = fitPayload();
    unknown.answers.archetype_select.choice = 'foodservice_restaurant';
    expect(fit(unknown)).toBeNull();
    const wrongType = fitPayload();
    wrongType.answers.archetype_select.type = 'noul';
    expect(fit(wrongType)).toBeNull();
  });

  it('rejects a distribution that does not key exactly like the criteria or total one', () => {
    const wrongKey = fitPayload();
    wrongKey.answers.archetype_select.probabilities = {
      plant_based_restaurant_cafe: 0.5,
      modern_trade_specialty_retail: 0.05,
      bakery_patisserie_brands: 0.05,
      bakery: 0.4,
    };
    expect(fit(wrongKey)).toBeNull();

    const badTotal = fitPayload();
    (badTotal.answers.archetype_select.probabilities as Record<string, number>).no_fit = 0.5;
    expect(fit(badTotal)).toBeNull();

    const extraKey = fitPayload();
    (extraKey.answers.archetype_select.probabilities as Record<string, number>).other = 0;
    expect(fit(extraKey)).toBeNull();
  });

  it.each(['constructor', 'toString', '__proto__'])('rejects inherited choice key %s', (key) => {
    const inherited = fitPayload();
    inherited.answers.archetype_select.choice = key;
    expect(fit(inherited)).toBeNull();
  });

  it('rejects out-of-range or non-finite values', () => {
    const outOfRange = fitPayload();
    outOfRange.answers.role_support.noul = 1.5;
    expect(fit(outOfRange)).toBeNull();

    const nan = fitPayload();
    nan.answers.archetype_select.confidence = Number.NaN;
    expect(fit(nan)).toBeNull();

    const bool = fitPayload();
    bool.answers.archetype_select.confidence = true;
    expect(fit(bool)).toBeNull();
  });

  it('rejects a noul whose confidence does not match max(noul, 1 − noul)', () => {
    const mismatch = fitPayload();
    mismatch.answers.role_support = { noul: 0.2, confidence: 0.5 };
    expect(fit(mismatch)).toBeNull();

    const boundary = fitPayload();
    boundary.answers.role_support = { noul: 0, confidence: 1 };
    expect(fit(boundary)).not.toBeNull();
  });
});

describe('parseLayaScore — score answers', () => {
  const criteria = LAYA_ALL_FROZEN_QUESTIONS.obstacle_strength.criteria;
  const sent = { state: 'The buyer says the price is too high.', questions: { obstacle_strength: LAYA_ALL_FROZEN_QUESTIONS.obstacle_strength } };
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
