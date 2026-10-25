import { describe, expect, it } from 'vitest';
import { accountMarket, marketFromRules, marketLabel, matchesMarket, type MarketCompany } from './account-market';

const account = (extra: Partial<MarketCompany> = {}): MarketCompany => ({
  name: 'Larna House', industry: 'Cake shop', tags: ['bakery'], address: null, website: null, what_they_make: null, market: null, ...extra,
});

describe('location rules', () => {
  it('places an account in Thailand from its address, name, tags or a .th website', () => {
    expect(marketFromRules(account({ address: '123 Sukhumvit Rd, Bangkok 10110' })).market).toBe('local');
    expect(marketFromRules(account({ name: 'Capella Bangkok' })).market).toBe('local');
    expect(marketFromRules(account({ tags: ['hotel', 'Thailand'] })).market).toBe('local');
    expect(marketFromRules(account({ website: 'https://alicebakery.co.th/' })).market).toBe('local');
    expect(marketFromRules(account({ address: 'ถนนสุขุมวิท กรุงเทพฯ' })).market).toBe('local');
  });

  it('places an account abroad and names the country', () => {
    expect(marketFromRules(account({ tags: ['retailer', 'Vietnam'] }))).toEqual({ market: 'export', source: 'rule', country: 'Vietnam' });
    expect(marketFromRules(account({ name: 'Green Common (HK)' })).country).toBe('Hong Kong');
    expect(marketFromRules(account({ website: 'https://shop.gerald.ph' })).country).toBe('Philippines');
  });

  it('reads contacts: +66 or a .th email is Thai, a foreign calling code is abroad', () => {
    expect(marketFromRules(account(), [{ phone: '+66 81 234 5678', phone_second: null, email: null }]).market).toBe('local');
    expect(marketFromRules(account(), [{ phone: null, phone_second: null, email: 'buyer@shop.co.th' }]).market).toBe('local');
    expect(marketFromRules(account(), [{ phone: '+855 12 345 678', phone_second: null, email: null }]).country).toBe('Cambodia');
    expect(marketFromRules(account(), [{ phone: '+84 90 123 4567', phone_second: null, email: null }]).country).toBe('Vietnam');
  });

  it('uses a local 0-number only when nothing else places the account', () => {
    expect(marketFromRules(account(), [{ phone: '081-234-5678', phone_second: null, email: null }]).market).toBe('local');
    expect(marketFromRules(account({ tags: ['Vietnam'] }), [{ phone: '090 123 4567', phone_second: null, email: null }]).market).toBe('export');
  });

  it('trusts a country named in the address over a Thai-sounding street', () => {
    expect(marketFromRules(account({ address: '56B Jalan Siam, 10400 George Town, Penang, Malaysia' }))).toEqual({ market: 'export', source: 'rule', country: 'Malaysia' });
    expect(marketFromRules(account({ address: 'Ekamai earth' })).market).toBe('local');
  });

  it('leaves it to Pat when the evidence points both ways or nowhere', () => {
    expect(marketFromRules(account({ tags: ['Thailand', 'export'] })).market).toBeNull();
    expect(marketFromRules(account()).market).toBeNull();
    expect(marketFromRules(account({ name: 'Kyo Roll En', industry: 'Japanese dessert cafe' })).market).toBeNull();
  });
});

describe("Pat's choice", () => {
  it('wins over the rules', () => {
    expect(accountMarket(account({ market: 'export', address: 'Bangkok' }))).toEqual({ market: 'export', source: 'pat', country: null });
    expect(accountMarket(account({ market: 'local', tags: ['Vietnam'] }))).toEqual({ market: 'local', source: 'pat', country: null });
  });

  it("keeps the rules' country on an export account Pat set", () => {
    expect(accountMarket(account({ market: 'export', tags: ['Vietnam'] })).country).toBe('Vietnam');
  });
});

describe('filter and label', () => {
  it('filters Local, Export and Not sure', () => {
    const unsure = marketFromRules(account());
    const local = marketFromRules(account({ name: 'Siam Kempinski' }));
    expect(matchesMarket(unsure, 'unsure')).toBe(true);
    expect(matchesMarket(local, 'unsure')).toBe(false);
    expect(matchesMarket(local, 'local')).toBe(true);
    expect(matchesMarket(local, 'all')).toBe(true);
  });

  it('labels a row', () => {
    expect(marketLabel({ market: 'export', source: 'rule', country: 'Vietnam' })).toBe('Export · Vietnam');
    expect(marketLabel({ market: 'export', source: 'pat', country: null })).toBe('Export');
    expect(marketLabel({ market: 'local', source: 'rule', country: null })).toBe('Local');
    expect(marketLabel({ market: null, source: null, country: null })).toBe('Not sure');
  });
});
