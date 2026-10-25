import { describe, expect, it } from 'vitest';
import {
  HONEYPOT_FIELD,
  matchWebsiteLead,
  parseWebsiteLead,
  sameContact,
  websiteAcquisition,
  websiteDeal,
  websiteLeadMessage,
  type WebsiteLead,
} from './website-lead';

const lead = (over: Partial<WebsiteLead> = {}): WebsiteLead => ({
  business_name: 'Baan Khanom', contact_name: 'Khun Nok', phone: '081-234-5678', line_id: null, email: null,
  message: null, utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, fbclid: null, ...over,
});

describe('websiteAcquisition', () => {
  it('tags Facebook, Instagram and Meta utm sources as a Meta ad', () => {
    for (const source of ['facebook', 'Instagram', 'meta', 'fb', 'ig', 'facebook_ads', 'm.facebook.com']) {
      expect(websiteAcquisition(lead({ utm_source: source })).acquisition_source).toBe('meta_ad');
    }
  });

  it('tags a click with an fbclid as a Meta ad even without utm values', () => {
    expect(websiteAcquisition(lead({ fbclid: 'IwAR0abc' }))).toEqual({ acquisition_source: 'meta_ad', acquisition_campaign: null });
  });

  it('tags anything else as other inbound', () => {
    expect(websiteAcquisition(lead()).acquisition_source).toBe('inbound_other');
    expect(websiteAcquisition(lead({ utm_source: 'google' })).acquisition_source).toBe('inbound_other');
    expect(websiteAcquisition(lead({ utm_source: 'metallica' })).acquisition_source).toBe('inbound_other');
  });

  it('records the campaign, then the ad, and drops Meta placeholders left unfilled', () => {
    expect(websiteAcquisition(lead({ utm_source: 'facebook', utm_campaign: 'Croissant Oct', utm_content: 'video 2' })).acquisition_campaign)
      .toBe('Croissant Oct · video 2');
    expect(websiteAcquisition(lead({ utm_source: 'facebook', utm_campaign: 'Croissant Oct' })).acquisition_campaign).toBe('Croissant Oct');
    expect(websiteAcquisition(lead({ utm_source: 'facebook', utm_campaign: '{{campaign.name}}', utm_content: 'video 2' })).acquisition_campaign)
      .toBe('video 2');
  });
});

describe('parseWebsiteLead', () => {
  const body = { business_name: 'Baan Khanom', phone: '081 234 5678' };

  it('reads the known fields and ignores everything else', () => {
    const parsed = parseWebsiteLead({ ...body, utm_source: ' facebook ', is_admin: true, acquisition_source: 'referral' });
    expect(parsed).toEqual({ ok: true, lead: expect.objectContaining({ business_name: 'Baan Khanom', utm_source: 'facebook', contact_name: null }) });
    expect(parsed.ok && Object.keys(parsed.lead)).not.toContain('is_admin');
    expect(parsed.ok && Object.keys(parsed.lead)).not.toContain('acquisition_source');
  });

  it('needs a business name and a way to reach them', () => {
    expect(parseWebsiteLead({ phone: '0812345678' })).toMatchObject({ ok: false, field: 'business_name' });
    expect(parseWebsiteLead({ business_name: 'Baan Khanom' })).toMatchObject({ ok: false, field: 'phone' });
    expect(parseWebsiteLead({ business_name: 'Baan Khanom', line_id: 'nok.bakes' }).ok).toBe(true);
  });

  it('rejects fields over their limit, non-text values and bad contact details', () => {
    expect(parseWebsiteLead({ ...body, message: 'x'.repeat(2001) })).toMatchObject({ ok: false, field: 'message' });
    expect(parseWebsiteLead({ ...body, business_name: 'x'.repeat(121) })).toMatchObject({ ok: false, field: 'business_name' });
    expect(parseWebsiteLead({ ...body, contact_name: { $ne: 1 } })).toMatchObject({ ok: false, field: 'contact_name' });
    expect(parseWebsiteLead({ ...body, email: 'not an email' })).toMatchObject({ ok: false, field: 'email' });
    expect(parseWebsiteLead({ ...body, phone: 'call me' })).toMatchObject({ ok: false, field: 'phone' });
    expect(parseWebsiteLead('business_name=x')).toMatchObject({ ok: false });
    expect(parseWebsiteLead([body])).toMatchObject({ ok: false });
  });

  it('flags a filled honeypot as spam', () => {
    expect(parseWebsiteLead({ ...body, [HONEYPOT_FIELD]: '555-0100' })).toEqual({ ok: false, spam: true });
    expect(parseWebsiteLead({ ...body, [HONEYPOT_FIELD]: '' }).ok).toBe(true);
  });

  it('strips control characters but keeps line breaks in the message', () => {
    const parsed = parseWebsiteLead({ ...body, business_name: 'Baan\u0000Khanom', message: 'Hi\nWe use 20 kg\u0007 a month' });
    expect(parsed.ok && parsed.lead.business_name).toBe('Baan Khanom');
    expect(parsed.ok && parsed.lead.message).toBe('Hi\nWe use 20 kg  a month');
  });
});

describe('matchWebsiteLead', () => {
  const companies = [
    { id: 'c1', name: 'Gateaux House Co., Ltd.', website: 'https://gateauxhouse.co.th' },
    { id: 'c2', name: 'Earthling Cafe', website: null },
    { id: 'c3', name: 'Sweet Corner', website: null },
  ];
  const aliases = [
    { company_id: 'c2', kind: 'name' as const, value: 'Earth House' },
    { company_id: 'c3', kind: 'phone' as const, value: '+66 2 111 2222' },
  ];
  const contacts = [
    { company_id: 'c3', email: 'owner@sweetcorner.co.th', phone: null, phone_second: '089 999 0000', line: '@sweetcorner' },
  ];
  const known = { companies, aliases, contacts };
  const match = (over: Partial<WebsiteLead>) => matchWebsiteLead(lead({ business_name: 'Somewhere New', phone: null, ...over }), known);

  it('links a business Pat already has by name, ignoring Co., Ltd.', () => {
    expect(match({ business_name: 'gateaux house' })).toEqual({ company: companies[0], by: 'name' });
  });

  it('links by an alias name or phone from the skip-reasons work', () => {
    expect(match({ business_name: 'Earth House' })).toMatchObject({ company: { id: 'c2' }, by: 'alias' });
    expect(match({ phone: '02-111-2222' })).toMatchObject({ company: { id: 'c3' }, by: 'alias' });
  });

  it("links by a contact's phone, email or LINE", () => {
    expect(match({ phone: '+66 89 999 0000' })).toMatchObject({ company: { id: 'c3' }, by: 'phone' });
    expect(match({ email: 'Owner@SweetCorner.co.th' })).toMatchObject({ company: { id: 'c3' }, by: 'email' });
    expect(match({ line_id: 'sweetcorner' })).toMatchObject({ company: { id: 'c3' }, by: 'line' });
  });

  it('returns null for a business it does not know', () => {
    expect(match({ phone: '081 000 0000' })).toBeNull();
  });

  it('finds the person who wrote among the account contacts', () => {
    expect(sameContact(contacts, { phone: null, email: null, line_id: '@SweetCorner' })).toBe(contacts[0]);
    expect(sameContact(contacts, { phone: '081 000 0000', email: null, line_id: null })).toBeNull();
  });
});

describe('websiteDeal', () => {
  it('starts as a Research deal like an approved new lead, but due today with the sender on it', () => {
    expect(websiteDeal('c9', 'Baan Khanom', 'p1', '2026-10-22')).toMatchObject({
      title: 'Baan Khanom — Butter', stage: 'research', workflow_action: 'outreach', company_id: 'c9',
      priority: 'high', followup_date: '2026-10-22', contact_ids: ['p1'], next_action: 'Reply to their website enquiry',
    });
  });
});

describe('websiteLeadMessage', () => {
  it('says where it came from, how to reach them and what was saved, escaping their text', () => {
    const html = websiteLeadMessage(
      lead({ utm_source: 'facebook', utm_campaign: 'Croissant Oct', line_id: 'nok.bakes', message: 'Price for <20kg>?' }),
      { companyName: 'Baan Khanom', matched: null, deal: { created: true, title: 'Baan Khanom — Butter' } },
    );
    expect(html).toContain('Meta ad enquiry: Baan Khanom');
    expect(html).toContain('Croissant Oct');
    expect(html).toContain('081-234-5678');
    expect(html).toContain('https://line.me/R/ti/p/~nok.bakes');
    expect(html).toContain('Price for &lt;20kg&gt;?');
    expect(html).toContain('On This week today');
  });

  it('says when it joined an account and deal that already exist', () => {
    const html = websiteLeadMessage(lead(), { companyName: 'Sweet Corner', matched: 'phone', deal: { created: false, title: 'Sweet Corner — Butter' } });
    expect(html).toContain('Website enquiry');
    expect(html).toContain('Already in LeadPulse as <b>Sweet Corner</b> (same phone)');
    expect(html).toContain('Open deal: Sweet Corner — Butter');
  });
});
