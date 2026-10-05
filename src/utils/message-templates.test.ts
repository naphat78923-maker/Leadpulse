import { describe, expect, it } from 'vitest';
import { TEMPLATE_KINDS, buildDraft, defaultDraftLanguage, defaultTemplateKind, hasBlanks, nudgeStep, segmentPainFor } from './message-templates';

describe('segmentPainFor', () => {
  it('picks the pain line from the account role', () => {
    expect(segmentPainFor({ name: 'Crumb House', industry: 'bakery chain', tags: ['bakery', 'chain'] }).segment).toBe('Bakery and patisserie');
    expect(segmentPainFor({ name: 'Grand Riverside', industry: 'hotel', tags: ['hotel'] }).segment).toBe('Hotel kitchens');
  });

  it('falls back to a general line when the role is unknown or there is no account', () => {
    expect(segmentPainFor({ name: 'Mystery Co', industry: null, tags: [] }).segment).toBe('General');
    expect(segmentPainFor(null).segment).toBe('General');
  });
});

describe('buildDraft', () => {
  const base = { language: 'english' as const, companyName: 'Crumb House', product: 'Butter' };

  it('writes a first approach: their menu item, one sample ask, proof and link', () => {
    const draft = buildDraft({ ...base, kind: 'first_approach', contactName: 'Nok Srisuk', application: 'croissants' });

    expect(draft.subject).toBe('VG Saveur x Crumb House');
    expect(draft.body.startsWith('Hi Nok, Pat from VG Saveur here. I saw croissants on your menu.')).toBe(true);
    expect(draft.body).toContain('free 2 × 500g sample of our dairy-free butter');
    expect(draft.body).toContain('St. Regis and Le Cordon Bleu Dusit Thani');
    expect(draft.body).toContain('https://vgsaveur.com/pages/wholesale');
    expect(draft.body.match(/\?/g)).toHaveLength(1);
    expect(hasBlanks(draft.body)).toBe(false);
  });

  it('leaves a blank for a fact the CRM does not hold, and greets the team without a person', () => {
    const draft = buildDraft({ ...base, kind: 'first_approach' });
    expect(draft.body.startsWith('Hi Crumb House team,')).toBe(true);
    expect(draft.body).toContain('[menu item]');
    expect(hasBlanks(draft.body)).toBe(true);

    expect(buildDraft({ ...base, kind: 'paid_trial' }).body).toContain('[pack size] at [price]');
    expect(buildDraft({ ...base, kind: 'confirm_receipt' }).body).toContain('[date sent]');
  });

  it('keeps the 2 × 500g offer and the butter proof line off condensed milk', () => {
    const draft = buildDraft({ ...base, kind: 'first_approach', product: 'Condensed Milk', application: 'Thai tea' });
    expect(draft.body).toContain('free sample of our plant-based condensed milk');
    expect(draft.body).not.toMatch(/500g|St\. Regis/);
  });

  it('drafts the nudge that matches the unanswered sends, and stops at the fourth', () => {
    const nudge = (sendCount: number) => buildDraft({ ...base, kind: 'nudge', application: 'croissants', sendCount }).body;
    expect(nudge(1)).toMatch(/following up on my message about dairy-free butter for croissants/);
    expect(nudge(2)).toMatch(/Testing in just croissants keeps it simple/);
    expect(nudge(3)).toMatch(/still interested .* or would it be better if I came back at a later time\?/);
    expect(nudge(4)).toMatch(/I'll leave the dairy-free butter discussion here for now/);
    expect(nudge(4)).not.toContain('?');
    expect(nudge(9)).toBe(nudge(4));
    expect(nudgeStep(0)).toBe(1);
  });

  it('asks one thing per sample step', () => {
    for (const kind of ['confirm_receipt', 'test_plan', 'test_result'] as const) {
      expect(buildDraft({ ...base, kind, application: 'brioche' }).body.match(/\?/g)).toHaveLength(1);
    }
  });

  it('writes every situation in Thai without English sentences', () => {
    for (const kind of TEMPLATE_KINDS) {
      const { body } = buildDraft({ ...base, kind, language: 'thai', contactName: 'นก', application: 'ครัวซองต์', sendCount: 2 });
      expect(body.startsWith('สวัสดีครับคุณนก')).toBe(true);
      expect(body).not.toMatch(/Hi |Would |\bthe\b/);
    }
    expect(buildDraft({ ...base, kind: 'first_approach', language: 'thai' }).body).toContain('ตัวอย่างฟรีขนาด 500 กรัม 2 ก้อน');
  });
});

describe('defaultTemplateKind', () => {
  it('follows where the deal is', () => {
    expect(defaultTemplateKind({ lane: 'outreach', companyStatus: 'prospect', sendCount: 0 })).toBe('first_approach');
    expect(defaultTemplateKind({ lane: 'outreach', companyStatus: 'prospect', sendCount: 2 })).toBe('nudge');
    expect(defaultTemplateKind({ lane: 'sample', sampleStatus: 'sent' })).toBe('confirm_receipt');
    expect(defaultTemplateKind({ lane: 'sample', sampleStatus: 'received' })).toBe('test_plan');
    expect(defaultTemplateKind({ lane: 'testing' })).toBe('test_result');
    expect(defaultTemplateKind({ lane: 'reschedule', companyStatus: 'active_customer', sendCount: 3 })).toBe('check_in');
  });
});

describe('defaultDraftLanguage', () => {
  it('uses the language set on the contact first', () => {
    expect(defaultDraftLanguage({ contactLanguage: 'english', company: { address: 'Bangkok' } })).toBe('english');
    expect(defaultDraftLanguage({ contactLanguage: 'thai' })).toBe('thai');
  });

  it('then the language the buyer wrote in', () => {
    expect(defaultDraftLanguage({ contactLanguage: 'autodetect', buyerReply: 'สนใจครับ', company: { name: 'Acme' } })).toBe('thai');
    expect(defaultDraftLanguage({ buyerReply: 'Please send the spec sheet', company: { address: 'Bangkok' } })).toBe('english');
  });

  it('starts hotels in English, unless the buyer wrote in Thai', () => {
    const hotel = { name: 'Grand Riverside', industry: 'hotel', tags: ['hotel'], address: 'Sukhumvit, Bangkok' };
    expect(defaultDraftLanguage({ company: hotel, contactPhone: '02 000 0000' })).toBe('english');
    expect(defaultDraftLanguage({ company: hotel, buyerReply: 'สนใจครับ' })).toBe('thai');
  });

  it('then Thai for an account that looks Thai, English otherwise', () => {
    expect(defaultDraftLanguage({ contactName: 'นก' })).toBe('thai');
    expect(defaultDraftLanguage({ company: { name: 'Crumb House', address: 'Sukhumvit, Bangkok' } })).toBe('thai');
    expect(defaultDraftLanguage({ company: { name: 'Crumb House', website: 'https://crumb.co.th' } })).toBe('thai');
    expect(defaultDraftLanguage({ contactPhone: '094 848 9669' })).toBe('thai');
    expect(defaultDraftLanguage({ contactPhone: '+65 6123 4567', company: { name: 'Crumb House', address: 'Singapore' } })).toBe('english');
  });
});
