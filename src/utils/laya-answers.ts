// ─── Laya /score response parser ───
// The one client-side check of a /score payload, shared by the score card, the
// terminal and the prospect-fit judge. The worker already validates every
// answer; this re-check exists because the browser must never render a result
// it cannot account for. Anything malformed returns null — nothing partial.
//
// A payload is accepted only when:
//   • trace.scored_input is exactly the request that was sent,
//   • trace.model names a local engine and scored_at is a real timestamp,
//   • `answers` has one entry per sent question and nothing else,
//   • each answer fits its question's own type and options.

import type { LayaArchetypeChoice, LayaFitAnswers } from './laya-buyer-response';

export type LayaChoiceAnswer = {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};
export type LayaNoulAnswer = { type: 'noul'; noul: number; confidence: number };
export type LayaScoreAnswer = {
  type: 'score';
  score: number;
  confidence: number;
  /** legend text per level, index-aligned with probabilities */
  legend: string[];
  probabilities: number[];
};
export type LayaAnswer = LayaChoiceAnswer | LayaNoulAnswer | LayaScoreAnswer;

export interface LayaTrace {
  scored_input: { state: string; questions: Record<string, unknown> };
  model: { repository: string; source_revision: string; package_sha256: string; engine: string };
  scored_at: string;
}

export interface LayaScoreRun {
  answers: Record<string, LayaAnswer>;
  usage: { input_tokens?: number | null; output_tokens?: number | null } | null;
  trace: LayaTrace;
}

type QuestionDef = {
  type: 'choice' | 'noul' | 'score';
  criteria: Record<string, string> | readonly string[];
};

// The worker enforces the same tolerance.
const PROBABILITY_TOLERANCE = 0.002;
const LOCAL_ENGINES = ['cpu_ne', 'cpu_gpu'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isProbability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function sumsToOne(values: number[]): boolean {
  return Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) <= PROBABILITY_TOLERANCE;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function parseAnswer(def: QuestionDef, raw: unknown): LayaAnswer | null {
  if (!isRecord(raw) || !isProbability(raw.confidence)) return null;
  if (raw.type !== undefined && raw.type !== def.type) return null;
  const confidence = raw.confidence;

  if (def.type === 'noul') {
    const noul = raw.noul;
    if (!isProbability(noul)) return null;
    if (Math.abs(confidence - Math.max(noul, 1 - noul)) > PROBABILITY_TOLERANCE) return null;
    return { type: 'noul', noul, confidence };
  }

  if (!isRecord(raw.probabilities)) return null;
  const distribution = raw.probabilities;

  if (def.type === 'choice') {
    const options = Object.keys(def.criteria);
    const choice = raw.choice;
    if (typeof choice !== 'string' || !options.includes(choice)) return null;
    if (Object.keys(distribution).length !== options.length) return null;
    const probabilities: Record<string, number> = {};
    for (const option of options) {
      const value = hasOwn(distribution, option) ? distribution[option] : undefined;
      if (!isProbability(value)) return null;
      probabilities[option] = value;
    }
    if (!sumsToOne(Object.values(probabilities))) return null;
    return { type: 'choice', choice, confidence, probabilities };
  }

  const criteria = def.criteria as readonly string[];
  const score = raw.score;
  if (!isRecord(raw.legend) || typeof score !== 'number' || !Number.isFinite(score)) return null;
  const legendMap = raw.legend;
  if (Object.keys(legendMap).length !== criteria.length) return null;
  if (Object.keys(distribution).length !== criteria.length) return null;
  const legend: string[] = [];
  const probabilities: number[] = [];
  for (let index = 0; index < criteria.length; index += 1) {
    const entry = legendMap[String(index)];
    const value = distribution[String(index)];
    if (entry !== criteria[index] || !isProbability(value)) return null;
    legend.push(entry);
    probabilities.push(value);
  }
  if (!sumsToOne(probabilities) || score < 0 || score > criteria.length - 1) return null;
  const expected = probabilities.reduce((sum, value, index) => sum + index * value, 0);
  if (Math.abs(score - expected) > PROBABILITY_TOLERANCE) return null;
  return { type: 'score', score, confidence, legend, probabilities };
}

/** Validate a /score payload against the exact request that produced it. */
export function parseLayaScore(
  payload: unknown,
  sent: { state: string; questions: Record<string, unknown> },
): LayaScoreRun | null {
  if (!isRecord(payload) || !isRecord(payload.answers) || !isRecord(payload.trace)) return null;
  const trace = payload.trace;
  if (!isRecord(trace.scored_input) || JSON.stringify(trace.scored_input) !== JSON.stringify(sent)) return null;
  const model = trace.model;
  if (
    !isRecord(model) ||
    typeof model.repository !== 'string' ||
    typeof model.source_revision !== 'string' ||
    typeof model.package_sha256 !== 'string' ||
    typeof model.engine !== 'string' ||
    !LOCAL_ENGINES.includes(model.engine)
  ) {
    return null;
  }
  if (typeof trace.scored_at !== 'string' || !Number.isFinite(Date.parse(trace.scored_at))) return null;

  const ids = Object.keys(sent.questions);
  const raw = payload.answers;
  if (ids.length === 0 || Object.keys(raw).length !== ids.length) return null;
  const answers: Record<string, LayaAnswer> = {};
  for (const id of ids) {
    if (!hasOwn(raw, id)) return null;
    const answer = parseAnswer(sent.questions[id] as QuestionDef, raw[id]);
    if (!answer) return null;
    answers[id] = answer;
  }

  return {
    answers,
    usage: isRecord(payload.usage)
      ? (payload.usage as { input_tokens?: number | null; output_tokens?: number | null })
      : null,
    trace: {
      scored_input: sent,
      model: model as LayaTrace['model'],
      scored_at: trace.scored_at,
    },
  };
}

/** The prospect-fit pair out of a parsed run, or null when either is missing. */
export function fitAnswersFromRun(run: LayaScoreRun | null): LayaFitAnswers | null {
  const select = run?.answers.archetype_select;
  const support = run?.answers.role_support;
  if (select?.type !== 'choice' || support?.type !== 'noul') return null;
  return {
    archetype_select: {
      choice: select.choice as LayaArchetypeChoice,
      confidence: select.confidence,
      probabilities: select.probabilities as Record<LayaArchetypeChoice, number>,
    },
    role_support: { noul: support.noul, confidence: support.confidence },
  };
}
