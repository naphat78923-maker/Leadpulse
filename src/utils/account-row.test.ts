import { describe, expect, it } from 'vitest';
import type { Company, Contact, Deal, Meeting } from '@/types/crm';
import { followUpLabel, furthestStages, isAccountSort, lastTouchLabel, lastTouches, nextFollowUps, rowWhen, sortAccounts } from './account-row';

const TODAY = '2026-10-25'; // a Sunday

const deal = (company_id: string | null, followup_date: string | null, extra: Partial<Deal> = {}) =>
  ({ id: `${company_id}-${followup_date}`, title: 'Butter', stage: 'contacted', company_id, followup_date, workflow_action: null, ...extra }) as Deal;
const meeting = (extra: Partial<Meeting>) =>
  ({ date: '2026-10-01', type: 'call', direction: 'outbound', company_id: null, contact_ids: [], ...extra }) as Meeting;
const company = (id: string, name: string, extra: Partial<Company> = {}) =>
  ({ id, name, last_contact_date: null, last_human_touch: null, ...extra }) as Company;

describe('follow-up label', () => {
  it('names today, tomorrow, the weekday within a week, then the date', () => {
    expect(followUpLabel('2026-10-25', TODAY)).toMatchObject({ text: 'Follow up today', short: 'Today', tone: 'today' });
    expect(followUpLabel('2026-10-26', TODAY)).toMatchObject({ text: 'Follow up tomorrow', tone: 'ahead' });
    expect(followUpLabel('2026-10-27', TODAY).text).toBe('Follow up Tue');
    expect(followUpLabel('2026-10-31', TODAY).text).toBe('Follow up Sat');
    expect(followUpLabel('2026-11-01', TODAY).text).toBe('Follow up 1 Nov');
    expect(followUpLabel('2027-01-08', TODAY).text).toBe('Follow up 8 Jan 2027');
  });

  it('says how late an overdue follow-up is', () => {
    expect(followUpLabel('2026-09-09', TODAY)).toMatchObject({ text: 'Overdue 46d', tone: 'late' });
    expect(followUpLabel('2026-06-01', TODAY).text).toBe('Overdue 5mo');
  });
});

describe('last touch label', () => {
  it('counts back from today, short on a phone', () => {
    expect(lastTouchLabel('2026-10-25', TODAY)).toMatchObject({ text: 'Last touch today', short: 'Touched today' });
    expect(lastTouchLabel('2026-10-13', TODAY)).toMatchObject({ text: 'Last touch 12d ago', short: '12d ago', tone: 'past' });
    expect(lastTouchLabel('2026-07-22', TODAY).text).toBe('Last touch 3mo ago');
    expect(lastTouchLabel('2025-01-02', TODAY).text).toBe('Last touch 2y ago');
  });
});

describe('next follow-ups', () => {
  it('takes the soonest dated follow-up on an open deal', () => {
    const map = nextFollowUps([
      deal('c1', '2026-11-15'),
      deal('c1', '2026-10-27T09:00:00'),
      deal('c1', '2026-10-01', { stage: 'closed_won' }),
      deal('c1', '2026-10-02', { workflow_action: 'parked' }),
      deal('c2', null),
      deal(null, '2026-10-26'),
    ]);
    expect(map.get('c1')).toBe('2026-10-27');
    expect(map.has('c2')).toBe(false);
    expect(map.size).toBe(1);
  });
});

describe('last touches', () => {
  it('takes the latest contact with the account or its people, not internal notes', () => {
    const companies = [company('c1', 'A', { last_contact_date: '2026-09-01' }), company('c2', 'B'), company('c3', 'C')];
    const contacts = [{ id: 'p1', company_id: 'c2' }, { id: 'p2', company_id: null }] as Contact[];
    const map = lastTouches(companies, contacts, [
      meeting({ company_id: 'c1', date: '2026-10-20' }),
      meeting({ company_id: 'c1', date: '2026-10-24', direction: 'internal' }),
      meeting({ company_id: 'c1', date: '2026-10-23', type: 'note', direction: 'unknown' }),
      meeting({ contact_ids: ['p1'], date: '2026-10-11', direction: 'inbound' }),
      meeting({ contact_ids: ['p2'], date: '2026-10-12' }),
    ]);
    expect(map.get('c1')).toBe('2026-10-20');
    expect(map.get('c2')).toBe('2026-10-11');
    expect(map.has('c3')).toBe(false);
  });

  it('keeps a saved contact date that is later than any logged touch', () => {
    const map = lastTouches([company('c1', 'A', { last_contact_date: '2026-10-21', last_human_touch: '2026-10-22T03:00:00Z' })], [], [
      meeting({ company_id: 'c1', date: '2026-10-15' }),
    ]);
    expect(map.get('c1')).toBe('2026-10-22');
  });
});

describe('row date', () => {
  it('shows the follow-up, falling back to the last touch; last touch when sorting by it', () => {
    expect(rowWhen('name', '2026-10-27', '2026-10-20', TODAY)?.text).toBe('Follow up Tue');
    expect(rowWhen('follow_up', undefined, '2026-10-20', TODAY)?.text).toBe('Last touch 5d ago');
    expect(rowWhen('last_touch', '2026-10-27', '2026-10-20', TODAY)?.text).toBe('Last touch 5d ago');
    expect(rowWhen('last_touch', '2026-10-27', undefined, TODAY)).toBeNull();
    expect(rowWhen('name', undefined, undefined, TODAY)).toBeNull();
  });
});

describe('sorting accounts', () => {
  const list = [company('a', 'banana'), company('b', 'Apple'), company('c', 'Cherry'), company('d', 'date')];
  const followUps = new Map([['c', '2026-10-27'], ['d', '2026-09-09']]);
  const touches = new Map([['a', '2026-07-22'], ['c', '2026-10-24']]);

  it('sorts by name, ignoring case', () => {
    expect(sortAccounts(list, 'name', followUps, touches).map((c) => c.name)).toEqual(['Apple', 'banana', 'Cherry', 'date']);
  });

  it('puts the soonest follow-up first, overdue on top, the rest A–Z', () => {
    expect(sortAccounts(list, 'follow_up', followUps, touches).map((c) => c.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('puts the most recent touch first, never-touched last', () => {
    expect(sortAccounts(list, 'last_touch', followUps, touches).map((c) => c.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('puts the oldest touch first for gone quiet, never-touched last', () => {
    expect(sortAccounts(list, 'gone_quiet', followUps, touches).map((c) => c.id)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('puts the highest sales, fit or stage first, accounts without one last A–Z', () => {
    const sales = new Map([['b', 1200], ['d', 56000]]);
    expect(sortAccounts(list, 'sales_90d', followUps, touches, { sales }).map((c) => c.id)).toEqual(['d', 'b', 'a', 'c']);
    const fits = new Map([['a', 0.41], ['c', 0.83]]);
    expect(sortAccounts(list, 'laya_fit', followUps, touches, { fits }).map((c) => c.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(sortAccounts(list, 'sales_90d', followUps, touches).map((c) => c.name)).toEqual(['Apple', 'banana', 'Cherry', 'date']);
  });

  it('puts the newest account first', () => {
    const dated = [company('a', 'A', { created_at: '2026-01-01' }), company('b', 'B', { created_at: '2026-10-20' }), company('c', 'C')];
    expect(sortAccounts(dated, 'newest', followUps, touches).map((c) => c.id)).toEqual(['b', 'a', 'c']);
  });

  it('keeps the old saved sort keys valid and rejects unknown ones', () => {
    expect(isAccountSort('last_touch')).toBe(true);
    expect(isAccountSort('gone_quiet')).toBe(true);
    expect(isAccountSort('revenue')).toBe(false);
  });

  it('does not reorder the list it was given', () => {
    sortAccounts(list, 'follow_up', followUps, touches);
    expect(list.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('furthest deal stage', () => {
  it('ranks testing above sample above outreach, ignoring closed deals', () => {
    const stages = furthestStages([
      deal('a', null, { workflow_action: 'outreach' }),
      deal('a', null, { workflow_action: 'sample' }),
      deal('b', null, { workflow_action: 'testing', stage: 'closed_lost' }),
      deal('c', null, { workflow_action: 'testing' }),
    ]);
    expect(stages.get('a')).toBe(4);
    expect(stages.has('b')).toBe(false);
    expect(stages.get('c')).toBe(5);
  });
});

describe('row date while sorting by gone quiet', () => {
  it('shows the last touch, like Recently touched', () => {
    expect(rowWhen('gone_quiet', '2026-10-27', '2026-10-20', TODAY)?.text).toBe('Last touch 5d ago');
  });
});
