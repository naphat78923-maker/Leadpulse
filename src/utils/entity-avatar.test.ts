import { describe, expect, it } from 'vitest';
import {
  accentFromSeed,
  entityInitials,
  hashSeed,
  maskRadius,
} from './entity-avatar';

describe('entity-avatar helpers', () => {
  it('hashes stably and maps to a clay accent', () => {
    expect(hashSeed('Ada Lovelace')).toBe(hashSeed('Ada Lovelace'));
    expect(accentFromSeed('Ada Lovelace')).toBe(accentFromSeed('Ada Lovelace'));
    const accents = new Set(['lavender', 'ochre', 'teal', 'pink', 'coral', 'mint', 'peach']);
    expect(accents.has(accentFromSeed('Ada Lovelace'))).toBe(true);
    expect(accents.has(accentFromSeed('Grace Hopper'))).toBe(true);
  });

  it('builds 1-2 character initials', () => {
    expect(entityInitials('Nok S.')).toBe('NS');
    expect(entityInitials('Madonna')).toBe('MA');
    expect(entityInitials('  ')).toBe('?');
  });

  it('uses squircle vs rounded-square mask radii', () => {
    expect(maskRadius('person')).toBe('36%');
    expect(maskRadius('org')).toBe('22%');
  });
});

