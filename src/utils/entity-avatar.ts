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

/** 1–2 character mark from a display name (Unicode-safe). */
export function entityInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .map(part => part.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return Array.from(parts[0]!).slice(0, 2).join('').toUpperCase();
  return `${Array.from(parts[0]!)[0]}${Array.from(parts.at(-1)!)[0]}`.toUpperCase();
}

/** Person = soft squircle; org = tighter rounded square (subtle shape variant). */
export function maskRadius(kind: 'person' | 'org'): string {
  return kind === 'person' ? '36%' : '22%';
}
