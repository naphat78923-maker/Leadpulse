import { describe, expect, it } from 'vitest';
import { fitChipLabel, fitFromAnswers, percent, shortUrl, sourceChipLabel, sourcesFor, type EvidenceRow } from './account-profile';

const answers = (bakery: number, grocery: number, cafe: number) => ({
  fit_bakery_patisserie_brands: { noul: bakery },
  fit_modern_trade_specialty_retail: { noul: grocery },
  fit_plant_based_restaurant_cafe: { noul: cafe },
});

describe('fitFromAnswers', () => {
  it('ranks the three grades and applies the 30% cutoff', () => {
    const fit = fitFromAnswers(answers(0.65, 0.21, 0.17), '2026-10-14T13:02:00Z')!;
    expect(fit.grades.map(g => [g.archetype, g.noul])).toEqual([
      ['bakery_patisserie_brands', 0.65], ['modern_trade_specialty_retail', 0.21], ['plant_based_restaurant_cafe', 0.17],
    ]);
    expect(fit.fits).toBe(true);
    expect(fitChipLabel(fit)).toBe('Bakery 65%');
  });

  it('says no fit below the cutoff', () => {
    const fit = fitFromAnswers(answers(0.16, 0.13, 0.14), 'x')!;
    expect(fit.fits).toBe(false);
    expect(fitChipLabel(fit)).toBe('No fit');
    expect(percent(fit.best.noul)).toBe('16%');
  });

  it('refuses incomplete or impossible answers', () => {
    expect(fitFromAnswers(null, 'x')).toBeNull();
    expect(fitFromAnswers({ fit_bakery_patisserie_brands: { noul: 0.5 } }, 'x')).toBeNull();
    expect(fitFromAnswers(answers(1.4, 0.1, 0.1), 'x')).toBeNull();
  });
});

describe('sourcesFor', () => {
  const row = (over: Partial<EvidenceRow>): EvidenceRow => ({
    entity_type: 'company', entity_id: 'c1', field: 'website', value: 'https://www.gateauxhouse.co.th/',
    source_url: 'https://www.gateauxhouse.co.th/', source_tier: 'own_site', quote: 'Gateaux House', recorded_at: '2026-10-14T05:00:00Z',
    ...over,
  });

  it('finds the newest source for a value still saved', () => {
    const lookup = sourcesFor([row({}), row({ recorded_at: '2026-10-15T05:00:00Z', quote: 'newer' })]);
    expect(lookup('company', 'c1', 'website', 'https://www.gateauxhouse.co.th/')?.quote).toBe('newer');
  });

  it('drops the chip once Pat changed the value', () => {
    const lookup = sourcesFor([row({})]);
    expect(lookup('company', 'c1', 'website', 'https://typed-by-pat.example')).toBeNull();
    expect(lookup('company', 'c1', 'website', '')).toBeNull();
  });

  it('keeps contact sources apart from company sources', () => {
    const lookup = sourcesFor([row({ entity_type: 'contact', entity_id: 'k1', field: 'line', value: 'https://lin.ee/87jU1Qi' })]);
    expect(lookup('contact', 'k1', 'line', 'https://lin.ee/87jU1Qi')).not.toBeNull();
    expect(lookup('company', 'k1', 'line', 'https://lin.ee/87jU1Qi')).toBeNull();
  });

  it('labels a source plainly in Bangkok time', () => {
    expect(sourceChipLabel({ source_tier: 'own_site', recorded_at: '2026-10-14T20:00:00Z' })).toBe('own site · 15 Oct');
    expect(shortUrl('https://www.gateauxhouse.co.th/contactus/')).toBe('gateauxhouse.co.th/contactus');
  });
});
