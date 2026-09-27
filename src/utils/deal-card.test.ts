import { describe, expect, it } from 'vitest';
import type { Company, Contact, Deal } from '@/types/crm';
import { buildDealCardPresentation, isConcreteNextAction, primaryCardAction } from './deal-card';

const baseDeal: Deal = {
  id: 'deal-1',
  title: 'Mello Vegan — Butter + Condensed Milk',
  stage: 'research',
  product: 'Butter + Condensed Milk',
  client: 'Mello Vegan',
  company_id: 'company-1',
  contact_ids: [],
  value: null,
  priority: 'medium',
  next_action: 'Verify the two conflicting numbers, then call about the butter swap',
  followup_date: '2026-08-25',
  last_outcome: null,
  nudge_count: 0,
  workflow_action: 'outreach',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

const company = (overrides: Partial<Company> = {}): Company => ({
  id: 'company-1',
  name: 'Mello Vegan',
  status: 'prospect',
  lead_source: 'Outbound',
  account_owner: 'Pat',
  last_contact_date: null,
  tags: [],
  industry: null,
  size: null,
  address: null,
  website: null,
  notes: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  ...overrides,
});

const contact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'contact-1',
  name: 'Nok S.',
  email: null,
  phone: null,
  phone_second: null,
  line: null,
  job_title: 'Pastry Chef',
  company_id: 'company-1',
  status: 'active',
  identity_quality: 'named',
  last_contacted_date: null,
  notes: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  ...overrides,
});

describe('card primary action and actionable empty state', () => {
  it('offers one contextual action per lane and opens the form rather than sending', () => {
    const outreach = primaryCardAction({ ...baseDeal, workflow_action: 'outreach' });
    const reply = primaryCardAction({ ...baseDeal, workflow_action: 'reply' });
    const testing = primaryCardAction({ ...baseDeal, workflow_action: 'testing' });

    expect(outreach.label).toBe('Log outreach');
    expect(reply.label).toBe('Record reply');
    expect(testing.label).toBe('Log follow-up');
    for (const action of [outreach, reply, testing]) {
      expect(action.opensLogForm).toBe(true);
      expect(action.hint).toMatch(/open/i);
      expect(action.hint).not.toMatch(/will send|sends it|automatically sends/i);
    }
  });

  it('turns an empty next action into an actionable state instead of a dash', () => {
    const action = primaryCardAction({ ...baseDeal, next_action: null });

    expect(action.id).toBe('set-next-action');
    expect(action.label).toBe('Set next action');
    expect(action.opensLogForm).toBe(false);
  });

  it('treats a passive next action as missing', () => {
    expect(isConcreteNextAction('Awaiting their reply')).toBe(false);
    expect(isConcreteNextAction('Waiting on the sample')).toBe(false);
    expect(isConcreteNextAction('   ')).toBe(false);
    expect(isConcreteNextAction('Follow up on the offer')).toBe(true);
    expect(primaryCardAction({ ...baseDeal, next_action: 'Awaiting the buyer' }).id).toBe('set-next-action');
  });

  it('does not invent a lane action for a parked or won deal', () => {
    expect(primaryCardAction({ ...baseDeal, workflow_action: 'parked' }).id).toBe('set-next-action');
    expect(primaryCardAction({ ...baseDeal, workflow_action: 'success' }).id).toBe('set-next-action');
  });
});

describe('buildDealCardPresentation', () => {
  it('uses the deal contact order, not database order, and counts the remaining linked contacts', () => {
    const first = contact({ id: 'contact-1', name: 'Nok S.', job_title: 'Pastry Chef' });
    const second = contact({ id: 'contact-2', name: 'Pat P.', job_title: 'Purchasing' });
    const deal = { ...baseDeal, contact_ids: ['contact-2', 'contact-1'] };

    const card = buildDealCardPresentation(deal, [first, second], [company()], 'overdue');

    expect(card.contact).toEqual({
      name: 'Pat P.',
      role: 'Purchasing',
      initials: 'PP',
      additionalCount: 1,
      missing: false,
    });
    expect(card.companyName).toBe('Mello Vegan');
  });

  it('flags a missing contact instead of inferring one from the company', () => {
    const card = buildDealCardPresentation(baseDeal, [contact()], [company()], 'overdue');

    expect(card.contact).toEqual({
      name: 'Contact not identified',
      role: null,
      initials: '?',
      additionalCount: 0,
      missing: true,
    });
  });

  it('does not treat a company route (info@, general LINE) as the deal\'s person', () => {
    const route = contact({ id: 'route-1', name: 'Mello Vegan - public route', identity_quality: 'company_route' });
    const person = contact({ id: 'contact-1', name: 'Nok S.', job_title: 'Pastry Chef' });

    const onlyRoute = buildDealCardPresentation({ ...baseDeal, contact_ids: ['route-1'] }, [route], [company()], null);
    expect(onlyRoute.contact.missing).toBe(true);

    const routeFirst = buildDealCardPresentation({ ...baseDeal, contact_ids: ['route-1', 'contact-1'] }, [route, person], [company()], null);
    expect(routeFirst.contact).toMatchObject({ name: 'Nok S.', additionalCount: 0, missing: false });
  });

  it('carries the linked company brand logo for a missing-contact action card', () => {
    const logoUrl = 'https://example.test/company-logo.webp';

    const card = buildDealCardPresentation(
      baseDeal,
      [],
      [company({ logo_url: logoUrl })],
      'overdue'
    );

    expect(card.companyLogoUrl).toBe(logoUrl);
  });

  it('keeps the company logo empty when no brand logo is stored', () => {
    const card = buildDealCardPresentation(baseDeal, [], [company()], 'overdue');

    expect(card.companyLogoUrl).toBeNull();
  });

  it('marks an unknown role explicitly', () => {
    const deal = { ...baseDeal, contact_ids: ['contact-1'] };
    const card = buildDealCardPresentation(deal, [contact({ job_title: null })], [company()], 'today');

    expect(card.contact.role).toBe('Role unknown');
  });

  it('falls back to the linked contact company and then the stored client label', () => {
    const linked = contact({ company_id: 'company-2' });
    const deal = { ...baseDeal, company_id: null, contact_ids: ['contact-1'] };

    expect(buildDealCardPresentation(deal, [linked], [company({ id: 'company-2', name: 'Linked Company' })], null).companyName).toBe('Linked Company');
    expect(buildDealCardPresentation({ ...deal, contact_ids: [] }, [], [], null).companyName).toBe('Mello Vegan');
  });

  it('keeps urgency and the formatted follow-up date in one presentation object', () => {
    expect(buildDealCardPresentation(baseDeal, [], [], 'overdue').timing).toEqual({
      label: 'Overdue',
      date: '25 Aug',
      tone: 'overdue',
    });
    expect(buildDealCardPresentation(baseDeal, [], [], 'today').timing).toEqual({
      label: 'Due today',
      date: '25 Aug',
      tone: 'today',
    });
    expect(buildDealCardPresentation(baseDeal, [], [], null).timing).toEqual({
      label: 'Scheduled',
      date: '25 Aug',
      tone: 'scheduled',
    });
    expect(buildDealCardPresentation({ ...baseDeal, followup_date: null }, [], [], null).timing).toEqual({
      label: 'No date',
      date: null,
      tone: 'none',
    });
  });

  it('keeps product and next action independent from the redundant stored deal title', () => {
    const card = buildDealCardPresentation(baseDeal, [], [], 'overdue');

    expect(card.product).toBe('Butter + Condensed Milk');
    expect(card.nextAction).toBe('Verify the two conflicting numbers, then call about the butter swap');
    expect(JSON.stringify(card)).not.toContain(baseDeal.title);
  });

  it('shows honest empty states for missing product and next action', () => {
    const card = buildDealCardPresentation({ ...baseDeal, product: ' ', next_action: ' ' }, [], [], null);

    expect(card.product).toBe('Product not set');
    expect(card.nextAction).toBe('No next action set');
  });
});
