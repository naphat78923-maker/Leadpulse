import { describe, expect, it } from 'vitest';
import { applyMissing, existingAccount, leadDetailCount, leadNotes, leadRoute, linkInText, missingDetails, routeContact } from './lead-apply';
import type { PageLead } from './page-extract';

const lead: PageLead = {
  name: 'Maison Verte',
  description: 'Pastry made without dairy.',
  website: 'https://maisonverte.co.th',
  email: 'hello@maisonverte.co.th',
  phone: '+66 2 123 4567',
  line: '@maisonverte',
  instagram: 'maisonverte.bkk',
  facebook: null,
  address: '12 Sukhumvit 49, Bangkok',
  logoUrl: 'https://maisonverte.co.th/touch.png',
};
const bare: PageLead = { ...lead, description: null, email: null, phone: null, line: null, instagram: null, address: null, logoUrl: null };

describe('new account from a lead', () => {
  it('writes the description and socials into notes', () => {
    expect(leadNotes(lead)).toBe('Pastry made without dairy.\nInstagram: @maisonverte.bkk');
    expect(leadNotes(bare)).toBe('');
  });

  it('keeps email, phone and LINE as a route, or nothing', () => {
    expect(leadRoute(lead)).toEqual({ email: 'hello@maisonverte.co.th', phone: '+66 2 123 4567', line: '@maisonverte' });
    expect(leadRoute(bare)).toBeNull();
  });

  it('counts the details found', () => {
    expect(leadDetailCount(lead)).toBe(8);
    expect(leadDetailCount(bare)).toBe(1);
  });

  it('stores a route as a company-route contact, not a person', () => {
    expect(routeContact('c1', 'Maison Verte', leadRoute(lead)!)).toMatchObject({
      name: 'Maison Verte general contact',
      identity_quality: 'company_route',
      company_id: 'c1',
      email: 'hello@maisonverte.co.th',
    });
  });
});

describe('missingDetails', () => {
  it('lists only what the account and its contacts lack', () => {
    const company = { address: 'Already here', logo_url: null, notes: 'IG is maisonverte.bkk' };
    const contacts = [{ email: 'HELLO@maisonverte.co.th', phone: '021234567', phone_second: null, line: null }];
    expect(missingDetails(company, contacts, lead).map(d => d.key)).toEqual(['line', 'logo']);
  });

  it('lists everything for an empty account', () => {
    expect(missingDetails({ address: null, logo_url: null, notes: null }, [], lead).map(d => d.key))
      .toEqual(['address', 'email', 'phone', 'line', 'instagram', 'logo']);
  });

  it('turns the missing list into one company patch and one route', () => {
    const company = { address: null, logo_url: null, notes: 'Met at THAIFEX' };
    const missing = missingDetails(company, [], lead);
    expect(applyMissing(company, lead, missing)).toEqual({
      companyPatch: {
        address: '12 Sukhumvit 49, Bangkok',
        logo_url: 'https://maisonverte.co.th/touch.png',
        notes: 'Met at THAIFEX\nInstagram: @maisonverte.bkk',
      },
      route: { email: 'hello@maisonverte.co.th', phone: '+66 2 123 4567', line: '@maisonverte' },
    });
    expect(applyMissing(company, lead, [{ key: 'logo', label: 'Logo' }])).toEqual({
      companyPatch: { logo_url: 'https://maisonverte.co.th/touch.png' },
      route: null,
    });
  });
});

describe('existingAccount', () => {
  const companies = [
    { name: 'After You Dessert Cafe', website: 'https://www.afteryoudessertcafe.com/' },
    { name: 'Veganerie', website: 'https://instagram.com/veganerie' },
  ];
  it('matches on name or on website, ignoring case and www', () => {
    expect(existingAccount(companies, ' after you dessert cafe ', '')?.name).toBe('After You Dessert Cafe');
    expect(existingAccount(companies, 'Something else', 'afteryoudessertcafe.com/menu')?.name).toBe('After You Dessert Cafe');
  });
  it('tells two profiles on the same social site apart', () => {
    expect(existingAccount(companies, '', 'https://www.instagram.com/veganerie/')?.name).toBe('Veganerie');
    expect(existingAccount(companies, '', 'https://www.instagram.com/someoneelse/')).toBeNull();
  });
  it('matches nothing for a blank form', () => {
    expect(existingAccount(companies, '', '')).toBeNull();
  });
});

describe('linkInText', () => {
  it('finds the link in shared text', () => {
    expect(linkInText('Check this out https://www.instagram.com/veganerie/ .')).toBe('https://www.instagram.com/veganerie/');
    expect(linkInText('maisonverte.co.th')).toBe('maisonverte.co.th');
    expect(linkInText('just some words')).toBeNull();
    expect(linkInText(null)).toBeNull();
  });
});
