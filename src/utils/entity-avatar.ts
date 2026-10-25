/** Stable clay accent + initials helpers for shaped entity avatars. */

export type ClayAccent =
  | 'lavender'
  | 'ochre'
  | 'teal'
  | 'pink'
  | 'coral'
  | 'mint'
  | 'peach';

export const CLAY_ACCENTS: readonly ClayAccent[] = [
  'lavender',
  'ochre',
  'teal',
  'pink',
  'coral',
  'mint',
  'peach',
] as const;

/** Background CSS color + contrasting mark color (ink or cream). */
export const CLAY_ACCENT_STYLE: Record<
  ClayAccent,
  { bg: string; fg: string; ring: string }
> = {
  lavender: {
    bg: 'color-mix(in srgb, var(--color-clay-lavender) 55%, var(--color-clay-surface))',
    fg: 'var(--color-clay-ink)',
    ring: 'var(--color-clay-lavender)',
  },
  ochre: {
    bg: 'color-mix(in srgb, var(--color-clay-ochre) 58%, var(--color-clay-surface))',
    fg: 'var(--color-clay-ink)',
    ring: 'var(--color-clay-ochre)',
  },
  teal: {
    bg: 'color-mix(in srgb, var(--color-clay-teal) 78%, var(--color-clay-surface))',
    fg: 'var(--color-clay-canvas)',
    ring: 'var(--color-clay-teal)',
  },
  pink: {
    bg: 'color-mix(in srgb, var(--color-clay-pink) 55%, var(--color-clay-surface))',
    fg: 'var(--color-clay-ink)',
    ring: 'var(--color-clay-pink)',
  },
  coral: {
    bg: 'color-mix(in srgb, var(--color-clay-coral) 58%, var(--color-clay-surface))',
    fg: 'var(--color-clay-ink)',
    ring: 'var(--color-clay-coral)',
  },
  mint: {
    bg: 'color-mix(in srgb, var(--color-clay-mint) 55%, var(--color-clay-surface))',
    fg: 'var(--color-clay-ink)',
    ring: 'var(--color-clay-mint)',
  },
  peach: {
    bg: 'color-mix(in srgb, var(--color-clay-peach) 58%, var(--color-clay-surface))',
    fg: 'var(--color-clay-ink)',
    ring: 'var(--color-clay-peach)',
  },
};

/** FNV-1a 32-bit — stable across sessions for the same seed. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function accentFromSeed(seed: string): ClayAccent {
  const idx = hashSeed(seed || 'entity') % CLAY_ACCENTS.length;
  return CLAY_ACCENTS[idx]!;
}

const lettersOnly = (word: string) => word.replace(/[^\p{L}\p{N}]/gu, '');

/** 1–2 character mark from a display name (Unicode-safe). People: first + last word.
 *  Accounts: the first two words of the trading name (see accountMarkWords). */
export function entityInitials(name: string, kind: 'person' | 'org' = 'person'): string {
  const parts = kind === 'org' ? accountMarkWords(name) : [];
  if (kind === 'org' && parts.length > 0) {
    if (parts.length === 1) return Array.from(parts[0]!).slice(0, 2).join('').toUpperCase();
    return `${Array.from(parts[0]!)[0]}${Array.from(parts[1]!)[0]}`.toUpperCase();
  }
  const words = name.trim().split(/\s+/).map(lettersOnly).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return Array.from(words[0]!).slice(0, 2).join('').toUpperCase();
  return `${Array.from(words[0]!)[0]}${Array.from(words.at(-1)!)[0]}`.toUpperCase();
}

// Words that say what kind of company it is, not which one: dropped from the end of an account
// name (PT and บริษัท from the start) before its initials are picked. Compared letters-only.
const LEGAL_SUFFIXES = new Set(
  ['co', 'company', 'ltd', 'limited', 'plc', 'pcl', 'public', 'corp', 'corporation', 'inc', 'llc', 'pte', 'sdn', 'bhd', 'gmbh', 'จำกัด', 'มหาชน']
    .map(lettersOnly),
);
const LEGAL_PREFIXES = new Set(['pt', 'บริษัท', 'the'].map(lettersOnly));
const isIn = (set: Set<string>, word: string) => set.has(lettersOnly(word).toLowerCase());

/** The words an account's initials come from: "Alice Bakery & Foods Co., Ltd." → Alice, Bakery;
 *  "Healthy Lux Co., Ltd. (Head Office)" → Healthy, Lux. Text in brackets, a branch after " - ",
 *  " / " or a comma, legal words and a leading "The" are dropped. Empty when nothing is left. */
export function accountMarkWords(name: string): string[] {
  const unbracketed = name.replace(/\([^)]*\)?|（[^）]*）?|\[[^\]]*\]?/g, ' ');
  for (const segment of unbracketed.split(/\s[-–—|]\s|\/|,/)) {
    const words = segment.trim().split(/\s+/).filter((w) => lettersOnly(w));
    while (words.length > 1 && isIn(LEGAL_SUFFIXES, words.at(-1)!)) words.pop();
    while (words.length > 1 && isIn(LEGAL_PREFIXES, words[0]!)) words.shift();
    if (words.length > 0) return words.map(lettersOnly);
  }
  return [];
}

/** Person = soft squircle; org = tighter rounded square (subtle shape variant). */
export function maskRadius(kind: 'person' | 'org'): string {
  return kind === 'person' ? '36%' : '22%';
}
