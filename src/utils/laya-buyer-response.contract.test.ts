// The frozen questions live once, in laya-questions.json. These checks keep
// both the TypeScript builder and the Python worker reading that one file, so
// the two sides cannot drift apart.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import LAYA_QUESTIONS from './laya-questions.json';
import LAYA_CUTOFFS from './laya-cutoffs.json';
import { FIT_THRESHOLD } from './prospectFit';
import {
  LAYA_ALL_FROZEN_QUESTIONS,
  LAYA_BUYER_FROZEN_QUESTIONS,
  LAYA_FIT_FROZEN_QUESTIONS,
} from './laya-buyer-response';

const rulesSource = readFileSync(join(__dirname, 'laya-buyer-response.ts'), 'utf8');
const workerSource = readFileSync(join(__dirname, '../../scripts/laya_score_server.py'), 'utf8');

describe('frozen question source', () => {
  it('the exported sets are exactly the named sets of laya-questions.json, in order', () => {
    const expand = (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, LAYA_QUESTIONS.questions[id as keyof typeof LAYA_QUESTIONS.questions]]));
    expect(JSON.stringify(LAYA_BUYER_FROZEN_QUESTIONS)).toBe(JSON.stringify(expand(LAYA_QUESTIONS.sets.buyer)));
    expect(JSON.stringify(LAYA_ALL_FROZEN_QUESTIONS)).toBe(JSON.stringify(expand(LAYA_QUESTIONS.sets.terminal)));
    expect(JSON.stringify(LAYA_FIT_FROZEN_QUESTIONS)).toBe(JSON.stringify(expand(LAYA_QUESTIONS.sets.fit)));
  });

  it('keeps the measured buyer_response option order (reversed, eval variant v_verbatim_revopts)', () => {
    expect(Object.keys(LAYA_BUYER_FROZEN_QUESTIONS.buyer_response.criteria)).toEqual([
      'unclear', 'no_commitment', 'declined', 'deferred', 'requested_next_step',
    ]);
  });

  it('the worker loads the same file and declares no question text of its own', () => {
    expect(workerSource).toContain('src/utils/laya-questions.json');
    expect(workerSource).not.toMatch(/"instructions":/);
  });
});

describe('cut-offs file', () => {
  const deal = LAYA_CUTOFFS.deal as Record<string, { tier: string; cutoff?: number }>;

  it('covers exactly the deal set, with a known tier for every question', () => {
    expect(Object.keys(deal).sort()).toEqual([...LAYA_QUESTIONS.sets.terminal].sort());
    for (const [id, entry] of Object.entries(deal)) {
      expect(Object.keys(LAYA_CUTOFFS.tiers), id).toContain(entry.tier);
    }
  });

  it('gives every signal-tier question a cut-off inside (0, 1), and no other tier one', () => {
    for (const [id, entry] of Object.entries(deal)) {
      if (entry.tier === 'signal') {
        expect(entry.cutoff, id).toBeGreaterThan(0);
        expect(entry.cutoff, id).toBeLessThan(1);
      } else {
        expect(entry.cutoff, id).toBeUndefined();
      }
    }
  });

  it('keeps the fit cut-off and prospectFit.ts in step', () => {
    expect(LAYA_CUTOFFS.fit.cutoff).toBe(FIT_THRESHOLD);
  });

  it('routes Thai replies to Pat and does not judge name-only accounts', () => {
    expect(LAYA_CUTOFFS.routing.thai_script).toBe('owner_review');
    expect(LAYA_CUTOFFS.routing.name_only_account).toBe('not_judged');
  });
});

describe('rules module constraints', () => {
  it('imports nothing at runtime but the question file — the worker test transpiles it standalone', () => {
    const runtimeImports = rulesSource.split('\n').filter(
      line => /^\s*import\s/.test(line) && !/^\s*import\s+type\s/.test(line),
    );
    expect(runtimeImports).toEqual(["import LAYA_QUESTIONS from './laya-questions.json';"]);
  });

  it('no longer declares the retired attention schema the worker rejects', () => {
    for (const retired of ['LayaAttentionLevel', 'LayaAttentionInput', 'LAYAAttention_QUESTION', 'buildLayaAttentionInput']) {
      expect(rulesSource).not.toContain(retired);
      expect(workerSource).not.toContain(retired);
    }
  });
});
