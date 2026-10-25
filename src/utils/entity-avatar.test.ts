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

  it('picks account initials from the trading name, not the legal words or branch', () => {
    expect(entityInitials('Alice Bakery & Foods Co., Ltd.', 'org')).toBe('AB');
    expect(entityInitials('Healthy Lux Co., Ltd. (Head Office)', 'org')).toBe('HL');
    expect(entityInitials('The Mall Group Co., Ltd.', 'org')).toBe('MG');
    expect(entityInitials('CP Axtra Public Co., Ltd.', 'org')).toBe('CA');
    expect(entityInitials('KCG Corporation PCL', 'org')).toBe('KC');
    expect(entityInitials('Atasco Pte Ltd', 'org')).toBe('AT');
    expect(entityInitials('Matahari Sdn Bhd (Matahari Organic)', 'org')).toBe('MA');
    expect(entityInitials('PT Rubiyat Indonesia', 'org')).toBe('RI');
    expect(entityInitials('Ohkajhu (PLUK PHAK PRAW RAK MAE PCL)', 'org')).toBe('OH');
    expect(entityInitials('Bread Ahead - Siam Paragon', 'org')).toBe('BA');
    expect(entityInitials('Bread Ahead Bangkok, Siam Paragon', 'org')).toBe('BA');
    expect(entityInitials('GALLOTHAI CO., LTD. / Bakery House', 'org')).toBe('GA');
    expect(entityInitials('Buarys / บริษัท ทาสามา จำกัด', 'org')).toBe('BU');
    expect(entityInitials('บริษัท ทาสามา จำกัด', 'org')).toBe('ทา');
    expect(entityInitials('Kyo-Roll En', 'org')).toBe('KE');
  });

  it('keeps an account name that is only legal words or brackets readable', () => {
    expect(entityInitials('Co., Ltd.', 'org')).toBe('CO');
    expect(entityInitials('(Head Office)', 'org')).toBe('HO');
    expect(entityInitials('', 'org')).toBe('?');
  });

  it('still uses first and last name for people', () => {
    expect(entityInitials('Ada Byron Lovelace', 'person')).toBe('AL');
    expect(entityInitials('Ada Byron Lovelace')).toBe('AL');
  });

  it('uses squircle vs rounded-square mask radii', () => {
    expect(maskRadius('person')).toBe('36%');
    expect(maskRadius('org')).toBe('22%');
  });
});

