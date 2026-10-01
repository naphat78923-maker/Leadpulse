// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { kilogramsStated, quantityTier } from './order-quantity';

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, '../../scripts/fixtures', name), 'utf8')).cases as Array<Record<string, unknown>>;

const TIER_FROM_LABEL: Record<string, string> = { none_stated: 'none', small: 'small', moderate: 'moderate', large: 'large' };

describe('kilogramsStated / quantityTier', () => {
  it('matches every labelled tier in the quantity audit set (same fixture as the Python rule)', () => {
    for (const c of fixture('laya_quantity.audit.json').filter(c => c.quantity)) {
      expect(quantityTier(kilogramsStated(c.reply as string)), c.id as string).toBe(TIER_FROM_LABEL[c.quantity as string]);
    }
  });

  it('finds an amount exactly where the independent buyer-detail set says one is stated', () => {
    for (const c of fixture('laya_buyer_detail.audit.json').filter(c => c.quantity_stated !== null)) {
      expect(kilogramsStated(c.reply as string) !== null, c.id as string).toBe(c.quantity_stated);
    }
  });

  it('keeps tier boundaries exactly at 5 and 15 kg', () => {
    expect(quantityTier(4.99)).toBe('small');
    expect(quantityTier(5)).toBe('moderate');
    expect(quantityTier(15)).toBe('moderate');
    expect(quantityTier(15.01)).toBe('large');
    expect(quantityTier(null)).toBe('none');
  });

  it('skips only the sentence that mentions a sample', () => {
    expect(kilogramsStated('Please send 2 kg of samples.')).toBeNull();
    expect(kilogramsStated('We tested the sample. Please quote 40 kg per month.')).toBe(40);
  });

  it('gives no amount for unreadable phrasing or empty text', () => {
    expect(kilogramsStated("We'd probably take a few cases a month.")).toBeNull();
    expect(kilogramsStated(null)).toBeNull();
    expect(kilogramsStated('   ')).toBeNull();
  });
});
