// Contract checks between the TypeScript builder and the Python worker that
// actually serves the model. scripts/test_laya_score_server.py already
// transpiles the builder and round-trips it through the real worker; this file
// guards the two source texts from drifting apart (the worker compares with
// 400 "Unsupported scoring schema" on any difference, and option order is part
// of the measured contract — reversed order was the winning eval variant).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLayaBuyerResponseInput } from './laya-buyer-response';

const RULES_PATH = join(__dirname, 'laya-buyer-response.ts');
const WORKER_PATH = join(__dirname, '../../scripts/laya_score_server.py');

const rulesSource = readFileSync(RULES_PATH, 'utf8');
const workerSource = readFileSync(WORKER_PATH, 'utf8');

// Slice to the actual question definitions: the interfaces above them also
// contain `type`/`instructions` keys that must not be matched.
const rulesDef = rulesSource.slice(rulesSource.indexOf('const BUYER_RESPONSE_QUESTION'));
const workerDef = workerSource.slice(workerSource.indexOf('BUYER_RESPONSE_QUESTION = '));

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

  it('the worker only accepts this one question shape', () => {
    expect(workerSource).toContain('ALLOWED_QUESTIONS = (BUYER_RESPONSE_QUESTION,)');
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
