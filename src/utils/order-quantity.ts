// ─── Order quantity from the buyer's own words (deterministic, no model) ───
// Pat's tiers (2026-10-01): small < 5 kg, moderate 5–15 kg (both ends included),
// large > 15 kg, or none. A Laya Choice scored 12/24 on these tiers; this rule 24/24
// on the tier set and 29/29 on the independent buyer-detail set
// (scripts/evaluate_laya_quantity.py, which holds the same rule in Python).
//
// Sentences that mention a sample are skipped: a sample amount is not an order, but
// "We tested the sample. Please quote 40 kg" still states an order of 40 kg.
// Unreadable phrasing ("a few cases") gets no amount rather than a guess.

export type QuantityTier = 'none' | 'small' | 'moderate' | 'large';

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10 };
const KG_UNIT = '(?:kg|kgs|kilo|kilos|kilogram|kilograms|กิโลกรัม|กิโล|กก\\.?)';
const G_UNIT = '(?:g|gram|grams|กรัม)';
const SAMPLE = /\bsamples?\b|ตัวอย่าง/;

export function kilogramsStated(text: string | null | undefined): number | null {
  if (!text?.trim()) return null;
  const kept = text
    .toLowerCase()
    .split(/(?<=[.!?])\s+|\n+/)
    .filter(sentence => !SAMPLE.test(sentence))
    .join(' ');
  if (!kept.trim()) return null;
  if (/half\s+a?\s*kilo|ครึ่งกิโล/.test(kept)) return 0.5;

  // "two 10 kg cases" -> 2 x 10
  const multiplied = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')}|\\d+)\\s+(\\d+(?:\\.\\d+)?)\\s*${KG_UNIT}`).exec(kept);
  if (multiplied) {
    const count = NUMBER_WORDS[multiplied[1]] ?? Number(multiplied[1]);
    return count * Number(multiplied[2]);
  }
  const kg = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${KG_UNIT}`).exec(kept);
  if (kg) return Number(kg[1]);
  const grams = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${G_UNIT}\\b`).exec(kept);
  if (grams) return Number(grams[1]) / 1000;
  return null;
}

export function quantityTier(kg: number | null): QuantityTier {
  if (kg === null) return 'none';
  if (kg < 5) return 'small';
  return kg <= 15 ? 'moderate' : 'large';
}
