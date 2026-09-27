// Contract checks between the TypeScript builder and the Python worker that
// actually serves the model. scripts/test_laya_score_server.py already
// transpiles the builder and round-trips it through the real worker; this file
// guards the two source texts from drifting apart (the worker compares with
// 400 "Unsupported scoring schema" on any difference, and option order is part
// of the measured contract — reversed order was the winning eval variant).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildLayaBuyerResponseInput,
  LAYA_ALL_FROZEN_QUESTIONS,
  LAYA_BUYER_FROZEN_QUESTIONS,
  LAYA_FIT_FROZEN_QUESTIONS,
} from './laya-buyer-response';

const RULES_PATH = join(__dirname, 'laya-buyer-response.ts');
const WORKER_PATH = join(__dirname, '../../scripts/laya_score_server.py');

const rulesSource = readFileSync(RULES_PATH, 'utf8');
const workerSource = readFileSync(WORKER_PATH, 'utf8');

// Slice to the actual question definitions: the interfaces above them also
// contain `type`/`instructions` keys that must not be matched.
const rulesDef = rulesSource.slice(rulesSource.indexOf('const BUYER_RESPONSE_QUESTION'));
const workerDef = workerSource.slice(workerSource.indexOf('BUYER_RESPONSE_QUESTION = '));
const rulesDealDef = rulesSource.slice(rulesSource.indexOf('const DEAL_AMOUNT_QUESTION'));
const workerDealDef = workerSource.slice(workerSource.indexOf('DEAL_AMOUNT_QUESTION = '));
const rulesFitDef = rulesSource.slice(rulesSource.indexOf('const ARCHETYPE_SELECT_QUESTION'));
const workerFitDef = workerSource.slice(workerSource.indexOf('ARCHETYPE_SELECT_QUESTION = '));

// The buyer-detail additions: one slice per question, from its definition to
// the end of each source — `field`/`criteriaPairs` read the first match.
const DETAIL_DEFS: Array<{ key: string; tsConst: string; pyConst: string }> = [
  { key: 'next_step_commitment', tsConst: 'const NEXT_STEP_COMMITMENT_QUESTION', pyConst: 'NEXT_STEP_COMMITMENT_QUESTION = ' },
  { key: 'sample_trial_report', tsConst: 'const SAMPLE_TRIAL_REPORT_QUESTION', pyConst: 'SAMPLE_TRIAL_REPORT_QUESTION = ' },
  { key: 'commercial_info_request', tsConst: 'const COMMERCIAL_INFO_REQUEST_QUESTION', pyConst: 'COMMERCIAL_INFO_REQUEST_QUESTION = ' },
  { key: 'obstacle_kind', tsConst: 'const OBSTACLE_KIND_QUESTION', pyConst: 'OBSTACLE_KIND_QUESTION = ' },
  { key: 'obstacle_strength', tsConst: 'const OBSTACLE_STRENGTH_QUESTION', pyConst: 'OBSTACLE_STRENGTH_QUESTION = ' },
];
const detailSlice = (defs: Array<{ tsConst: string; pyConst: string }>, index: number) => ({
  rules: rulesSource.slice(rulesSource.indexOf(defs[index].tsConst)),
  worker: workerSource.slice(workerSource.indexOf(defs[index].pyConst)),
});

const PAIR = (key: string) =>
  new RegExp(`"?${key}"?\\s*:\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)')`);

/** A `key: "value"` / `key: 'value'` field, tolerant of TS and Python quoting. */
function field(text: string, key: string): string | null {
  const match = PAIR(key).exec(text);
  return match ? (match[1] ?? match[2]) : null;
}

/** Ordered [key, value] pairs from the `criteria` body of a source text. */
function criteriaPairs(text: string): Array<[string, string]> {
  const start = text.search(/"?criteria"?\s*:\s*\{/);
  expect(start, 'criteria block not found').toBeGreaterThan(-1);
  const open = text.indexOf('{', start);
  const close = text.indexOf('}', open);
  expect(open, 'criteria body not found').toBeGreaterThan(-1);
  expect(close, 'criteria body not closed').toBeGreaterThan(-1);
  return [...text.slice(open + 1, close).matchAll(
    /"?([A-Za-z_][A-Za-z0-9_]*)"?\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g,
  )].map(([, key, double, single]) => [key, double ?? single]);
}

/** Ordered items of the list-form `criteria: [ ... ]` used by score questions. */
function criteriaList(text: string): string[] {
  const start = text.search(/"?criteria"?\s*:\s*\[/);
  expect(start, 'criteria list not found').toBeGreaterThan(-1);
  const open = text.indexOf('[', start);
  const close = text.indexOf(']', open);
  expect(open, 'criteria list not opened').toBeGreaterThan(-1);
  expect(close, 'criteria list not closed').toBeGreaterThan(-1);
  return [...text.slice(open + 1, close).matchAll(
    /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g,
  )].map(([, double, single]) => double ?? single);
}

describe('TS ↔ Python worker prompt parity', () => {
  it('criteria keys appear in the same order in TypeScript and Python', () => {
    expect(criteriaPairs(rulesDef).map(([key]) => key)).toEqual(
      criteriaPairs(workerDef).map(([key]) => key),
    );
  });

  it('criteria texts are byte-identical in TypeScript and Python', () => {
    expect(criteriaPairs(rulesDef)).toEqual(criteriaPairs(workerDef));
  });

  it('type and instructions match the worker', () => {
    for (const key of ['type', 'instructions']) {
      expect(field(rulesDef, key), key).toBe(field(workerDef, key));
    }
    expect(field(rulesDef, 'type')).toBe('choice');
  });

  it('the live builder emits exactly the frozen contract', () => {
    const built = buildLayaBuyerResponseInput({
      deal: { product: 'Butter', buyer_reply: 'Please quote 20 kg.' },
    })!;
    expect(Object.keys(built.questions.buyer_response.criteria)).toEqual([
      'unclear', 'no_commitment', 'declined', 'deferred', 'requested_next_step',
    ]);
    expect(criteriaPairs(rulesDef))
      .toEqual(Object.entries(built.questions.buyer_response.criteria));
  });

  it('the worker accepts the buyer, combined-deal and fit frozen question sets', () => {
    expect(workerSource).toContain(
      'ALLOWED_QUESTIONS = (BUYER_RESPONSE_QUESTION, ALL_FROZEN_QUESTIONS, FIT_FROZEN_QUESTIONS)',
    );
    expect(workerSource).toContain(
      'ALL_FROZEN_QUESTIONS = {**BUYER_RESPONSE_QUESTION, **DEAL_AMOUNT_QUESTION, **NEXT_STEP_COMMITMENT_QUESTION, **SAMPLE_TRIAL_REPORT_QUESTION, **COMMERCIAL_INFO_REQUEST_QUESTION, **OBSTACLE_KIND_QUESTION, **OBSTACLE_STRENGTH_QUESTION}',
    );
    expect(workerSource).toContain(
      'FIT_FROZEN_QUESTIONS = {**ARCHETYPE_SELECT_QUESTION, **ROLE_SUPPORT_QUESTION}',
    );
  });
});

describe('deal_amount question parity', () => {
  it('the ordered bucket list is byte-identical in TypeScript and Python', () => {
    expect(criteriaList(rulesDealDef)).toEqual(criteriaList(workerDealDef));
    expect(criteriaList(rulesDealDef)).toEqual([
      '0-2500', '2501-5000', '5001-15000', '15001-35000', '35001-50000', '50001+', 'no amount stated',
    ]);
  });

  it('type and instructions match the worker', () => {
    expect(field(rulesDealDef, 'type')).toBe('score');
    for (const key of ['type', 'instructions']) {
      expect(field(rulesDealDef, key), key).toBe(field(workerDealDef, key));
    }
  });

  it('the exported combined payload is every frozen question, in worker order', () => {
    expect(Object.keys(LAYA_ALL_FROZEN_QUESTIONS)).toEqual([
      'buyer_response',
      'deal_amount',
      'next_step_commitment',
      'sample_trial_report',
      'commercial_info_request',
      'obstacle_kind',
      'obstacle_strength',
    ]);
    expect(LAYA_ALL_FROZEN_QUESTIONS.buyer_response).toBe(LAYA_BUYER_FROZEN_QUESTIONS.buyer_response);
    expect(criteriaList(rulesDealDef)).toEqual(
      Object.values(LAYA_ALL_FROZEN_QUESTIONS.deal_amount.criteria),
    );
  });
});

describe('fit questions parity', () => {
  it('archetype criteria keys and texts are byte-identical in TypeScript and Python', () => {
    expect(criteriaPairs(rulesFitDef).map(([key]) => key)).toEqual([
      'plant_based_restaurant_cafe',
      'modern_trade_specialty_retail',
      'bakery_patisserie_brands',
      'no_fit',
    ]);
    expect(criteriaPairs(rulesFitDef)).toEqual(criteriaPairs(workerFitDef));
  });

  it('choice type and instructions match the worker on both fit questions', () => {
    expect(field(rulesFitDef, 'type')).toBe('choice');
    for (const key of ['type', 'instructions']) {
      expect(field(rulesFitDef, key), key).toBe(field(workerFitDef, key));
    }
    const rulesSupportDef = rulesSource.slice(rulesSource.indexOf('const ROLE_SUPPORT_QUESTION'));
    const workerSupportDef = workerSource.slice(workerSource.indexOf('ROLE_SUPPORT_QUESTION = '));
    expect(field(rulesSupportDef, 'type')).toBe('noul');
    for (const key of ['type', 'instructions']) {
      expect(field(rulesSupportDef, key), key).toBe(field(workerSupportDef, key));
    }
    expect(criteriaPairs(rulesSupportDef)).toEqual(criteriaPairs(workerSupportDef));
  });

  it('the exported fit payload is archetype_select + role_support, in worker order', () => {
    expect(Object.keys(LAYA_FIT_FROZEN_QUESTIONS)).toEqual(['archetype_select', 'role_support']);
    expect(criteriaPairs(rulesFitDef)).toEqual(
      Object.entries(LAYA_FIT_FROZEN_QUESTIONS.archetype_select.criteria),
    );
  });
});

describe('buyer-detail questions parity', () => {
  const EXPECTED_KEYS: Record<string, string[]> = {
    next_step_commitment: ['false', 'true'],
    sample_trial_report: [
      'not_established', 'received', 'testing_planned', 'positive_result', 'negative_result', 'mixed_result',
    ],
    commercial_info_request: ['false', 'true'],
    obstacle_kind: [
      'no_obstacle_stated', 'application_technical', 'price_terms', 'delivery',
      'internal_approval', 'timing', 'unclear',
    ],
  };
  const EXPECTED_TYPES: Record<string, string> = {
    next_step_commitment: 'noul',
    sample_trial_report: 'choice',
    commercial_info_request: 'noul',
    obstacle_kind: 'choice',
    obstacle_strength: 'score',
  };

  it('every buyer-detail question has identical type, instructions and criteria in TypeScript and Python', () => {
    DETAIL_DEFS.forEach((def, index) => {
      const { rules, worker } = detailSlice(DETAIL_DEFS, index);
      expect(field(rules, 'type'), def.key).toBe(EXPECTED_TYPES[def.key]);
      for (const name of ['type', 'instructions']) {
        expect(field(rules, name), `${def.key}.${name}`).toBe(field(worker, name));
      }
      if (def.key === 'obstacle_strength') {
        expect(criteriaList(rules), def.key).toEqual(criteriaList(worker));
        expect(criteriaList(rules), def.key).toEqual([
          'No obstacle stated: nothing in the supplied text blocks progress.',
          'Minor friction: a question or concern exists, but progress can continue.',
          'Material obstacle: progress needs this addressed before moving on.',
          'Explicit blocker: the buyer states progress cannot continue until this is resolved.',
        ]);
      } else {
        expect(criteriaPairs(rules), def.key).toEqual(criteriaPairs(worker));
        expect(criteriaPairs(rules).map(([key]) => key), def.key).toEqual(EXPECTED_KEYS[def.key]);
      }
    });
  });

  it('the frozen criteria texts of the new choice questions match the exported payload', () => {
    const detail = LAYA_ALL_FROZEN_QUESTIONS;
    expect(Object.entries(detail.sample_trial_report.criteria)).toEqual(
      criteriaPairs(detailSlice(DETAIL_DEFS, 1).rules),
    );
    expect(Object.entries(detail.obstacle_kind.criteria)).toEqual(
      criteriaPairs(detailSlice(DETAIL_DEFS, 3).rules),
    );
    expect([...detail.obstacle_strength.criteria]).toEqual(
      criteriaList(detailSlice(DETAIL_DEFS, 4).rules),
    );
  });
});

describe('rules module constraints', () => {
  it('has no runtime imports — scripts/test_laya_score_server.py transpiles it standalone', () => {
    const runtimeImports = rulesSource.split('\n').filter(
      line => /^\s*import\s/.test(line) && !/^\s*import\s+type\s/.test(line),
    );
    expect(runtimeImports).toEqual([]);
  });

  it('no longer declares the retired attention schema the worker rejects', () => {
    for (const retired of ['LayaAttentionLevel', 'LayaAttentionInput', 'LAYAAttention_QUESTION', 'buildLayaAttentionInput']) {
      expect(rulesSource).not.toContain(retired);
      expect(workerSource).not.toContain(retired);
    }
  });
});
