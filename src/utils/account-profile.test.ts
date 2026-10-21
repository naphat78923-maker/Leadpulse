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

import { nextStep, openDeals, readableNotes } from './account-profile';

describe('panel helpers', () => {
  const deal = (id: string, over: Record<string, unknown> = {}) => ({ id, title: id, stage: 'contacted', followup_date: null, next_action: null, ...over });

  it('lists open deals, soonest follow-up first', () => {
    const deals = [deal('b', { followup_date: '2026-10-30' }), deal('won', { stage: 'closed_won' }), deal('a', { followup_date: '2026-10-23' }),
      deal('parked', { workflow_action: 'parked' }), deal('undated')];
    expect(openDeals(deals).map((d) => d.id)).toEqual(['a', 'b', 'undated']);
  });

  it('names the next follow-up and how overdue it is', () => {
    expect(nextStep([deal('a', { followup_date: '2026-10-23' })], '2026-10-21')).toMatchObject({ date: '2026-10-23', overdueDays: 0 });
    expect(nextStep([deal('a', { followup_date: '2026-10-18' })], '2026-10-21')?.overdueDays).toBe(3);
    expect(nextStep([deal('a')], '2026-10-21')).toBeNull();
  });

  it("drops the enrichment job's route-update paragraphs and keeps Pat's notes", () => {
    const notes = 'Met at THAIFEX. Likes the 500g pack.\n\n[ROUTE UPDATE 2026-10-15]\nOfficial website links the company LINE OA.\n\nCall after Songkran.';
    expect(readableNotes(notes)).toBe('Met at THAIFEX. Likes the 500g pack.\n\nCall after Songkran.');
    expect(readableNotes('Sources: x [ROUTE UPDATE 2026-10-15] Official site links LINE.')).toBe('Sources: x');
    expect(readableNotes(null)).toBe('');
  });
});

import { dealLabel } from './account-profile';

describe('dealLabel', () => {
  it('drops the account name the panel already shows', () => {
    expect(dealLabel('GALLOTHAI CO., LTD. / Bakery House — Butter', 'GALLOTHAI CO., LTD. / Bakery House')).toBe('Butter');
    expect(dealLabel('Gateaux House — Butter + Condensed Milk', 'Gateaux House')).toBe('Butter + Condensed Milk');
    expect(dealLabel('Butter trial', 'Gateaux House')).toBe('Butter trial');
    expect(dealLabel('Gateaux House', 'Gateaux House')).toBe('Gateaux House');
  });
});

import { roleOf, rolePatch, suggestDecider } from './account-profile';

describe('roles on people', () => {
  const company = { decision_maker_contact_id: null, champion_contact_id: 'k2', blocker_contact_id: null, blocker_label: 'Head office approves' };

  it('reads and sets one role per person', () => {
    expect(roleOf(company, 'k2')).toBe('champion');
    const patch = rolePatch(company, 'k2', 'decides');
    expect(patch).toMatchObject({ champion_contact_id: null, decision_maker_contact_id: 'k2' });
    expect(rolePatch(company, 'k2', null)).toMatchObject({ champion_contact_id: null });
    expect(rolePatch(company, 'k2', null)).not.toHaveProperty('decision_maker_contact_id');
  });

  it('a blocker contact replaces the blocker note, and the map status follows', () => {
    const patch = rolePatch(company, 'k3', 'blocker');
    expect(patch).toMatchObject({ blocker_contact_id: 'k3', blocker_label: null });
    expect(['unknown', 'partial', 'complete']).toContain(patch.map_status);
  });

  it('suggests a published decider only when nobody decides yet', () => {
    const people = [{ id: 'k1', job_title: 'Pastry chef' }, { id: 'k4', job_title: 'Founder' }];
    expect(suggestDecider(company, people)?.id).toBe('k4');
    expect(suggestDecider({ ...company, decision_maker_contact_id: 'k1' }, people)).toBeNull();
    expect(suggestDecider(company, [{ id: 'k1', job_title: 'Barista' }])).toBeNull();
    // Belén: the co-founder outranks the head chef listed first.
    expect(suggestDecider(company, [{ id: 'chef', job_title: 'Head Chef' }, { id: 'tao', job_title: 'Restaurateur & Co-Founder' }])?.id).toBe('tao');
  });
});
