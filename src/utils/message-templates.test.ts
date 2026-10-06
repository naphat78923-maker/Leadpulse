import { describe, expect, it } from 'vitest';
import { TEMPLATE_KINDS, buildDraft, defaultDraftLanguage, defaultTemplateKind, hasBlanks, isTradeAccount, nudgeStep, segmentPainFor } from './message-templates';

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

    expect(buildDraft({ ...base, kind: 'paid_trial' }).body).toContain('[pack size] at [price and terms]');
    expect(buildDraft({ ...base, kind: 'confirm_receipt' }).body).toContain('[date sent]');
  });

  it('offers condensed milk no free sample: it asks how they would use it, and says plant-based', () => {
    const milk = { ...base, product: 'Condensed Milk', application: 'Thai tea' };
    for (const trade of [false, true]) {
      for (const language of ['english', 'thai'] as const) {
        for (const kind of ['first_approach', 'nudge'] as const) {
          for (const sendCount of [1, 2, 3, 4]) {
            const { body } = buildDraft({ ...milk, kind, language, trade, sendCount });
            expect(body).not.toMatch(/free|500|ฟรี|St\. Regis/);
            expect(body).toMatch(/plant-based condensed milk|นมข้นหวานจากพืช/);
          }
        }
      }
    }
    expect(buildDraft({ ...milk, kind: 'first_approach' }).body).toMatch(/How would your team want to use it in that recipe\?/);
    expect(buildDraft({ ...milk, kind: 'first_approach', trade: true }).body).toMatch(/Which customer group would you have in mind for it\?/);
  });

  it('drafts the nudge that matches the unanswered sends, and stops at the fourth', () => {
    const nudge = (sendCount: number) => buildDraft({ ...base, kind: 'nudge', application: 'croissants', sendCount }).body;
    // The first nudge repeats the sample that was offered and never sent.
    expect(nudge(1)).toMatch(/following up on my message about dairy-free butter for croissants.*the free 2 × 500g sample/);
    // The second needs a real new fact, left as a blank.
    expect(nudge(2)).toContain('[new relevant information]');
    expect(nudge(2)).not.toMatch(/sample/);
    expect(nudge(3)).toMatch(/still be interested .* or would it be better for me to reconnect at a later time\?/);
    expect(nudge(4)).toMatch(/I'll leave the VG Saveur dairy-free butter discussion here for now/);
    expect(nudge(4)).not.toContain('?');
    expect(nudge(9)).toBe(nudge(4));
    expect(nudgeStep(0)).toBe(1);
  });

  it('words each stage\'s nudges for that stage, keeps the recipe in every step, and never offers a new sample', () => {
    const at = (kind: 'nudge_receipt' | 'nudge_plan' | 'nudge_test', sendCount: number, language: 'english' | 'thai' = 'english') =>
      buildDraft({ ...base, kind, language, contactName: 'Nok', application: 'Shibuya toast', sendCount }).body;

    // Receipt nudges speak to a team (a distributor has no kitchen) and never park a missing parcel.
    expect(at('nudge_receipt', 1)).toMatch(/Has your team received it\?/);
    expect(at('nudge_receipt', 2)).toContain('[tracking link]');
    expect(at('nudge_receipt', 4)).toMatch(/hasn't arrived or there's a delivery issue/);
    // No claim that one batch settles it.
    expect(at('nudge_plan', 2)).not.toMatch(/enough to judge/);
    // A tested deal is never asked whether it tested.
    expect(at('nudge_test', 2)).toMatch(/a good fit for Shibuya toast overall\?/);
    expect(at('nudge_test', 2)).not.toMatch(/not tested/);
    for (const kind of ['nudge_plan', 'nudge_test'] as const) {
      for (const n of [1, 2, 3, 4]) {
        for (const language of ['english', 'thai'] as const) expect(at(kind, n, language)).toContain('Shibuya toast');
      }
    }
    for (const kind of ['nudge_receipt', 'nudge_plan', 'nudge_test'] as const) {
      for (const n of [1, 2, 3, 4]) {
        expect(at(kind, n)).not.toMatch(/free (2|sample)|500g/);
        // (The second test-plan nudge talks about the recipe and names no product.)
        if (!(kind === 'nudge_plan' && n === 2)) expect(at(kind, n)).toContain('dairy-free');
        // Latin text is never glued to the Thai word after it.
        expect(at(kind, n, 'thai')).not.toMatch(/VG Saveur[\u0E00-\u0E7F]|dairy-free[\u0E00-\u0E7F]/);
      }
    }
  });

  it('speaks of a range, not a menu, to accounts that resell', () => {
    const distributor = { name: 'Fine Foods Trading', industry: 'importer/distributor', tags: ['distributor'] };
    expect(isTradeAccount(distributor)).toBe(true);
    expect(isTradeAccount({ name: 'Crumb House', industry: 'bakery chain', tags: ['bakery'] })).toBe(false);

    const first = buildDraft({ ...base, kind: 'first_approach', trade: true, application: 'Elle & Vire butter' }).body;
    expect(first).toContain('I saw you carry Elle & Vire butter.');
    expect(first).toContain('useful to assess for your range?');
    expect(first).toContain('St. Regis and Le Cordon Bleu Dusit Thani');
    for (const sendCount of [1, 2, 3, 4]) {
      for (const language of ['english', 'thai'] as const) {
        expect(buildDraft({ ...base, kind: 'nudge', language, trade: true, application: 'Elle & Vire butter', sendCount }).body).not.toMatch(/menu|kitchen|เมนู|ครัว/);
      }
    }
    expect(buildDraft({ ...base, kind: 'first_approach', language: 'thai', trade: true }).body).toContain('[สินค้าที่จำหน่าย]');
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
  it('follows where the deal is, and switches to that stage\'s nudge once a message goes unanswered', () => {
    expect(defaultTemplateKind({ lane: 'outreach', companyStatus: 'prospect', sendCount: 0 })).toBe('first_approach');
    expect(defaultTemplateKind({ lane: 'reply', companyStatus: 'prospect', sendCount: 2 })).toBe('nudge');
    expect(defaultTemplateKind({ lane: 'sample', sampleStatus: 'sent' })).toBe('confirm_receipt');
    expect(defaultTemplateKind({ lane: 'sample', sampleStatus: 'sent', sendCount: 3 })).toBe('nudge_receipt');
    expect(defaultTemplateKind({ lane: 'sample', sampleStatus: 'received' })).toBe('test_plan');
    expect(defaultTemplateKind({ lane: 'testing' })).toBe('test_plan');
    expect(defaultTemplateKind({ lane: 'testing', sendCount: 2 })).toBe('nudge_plan');
    expect(defaultTemplateKind({ lane: 'reschedule' })).toBe('test_result');
    expect(defaultTemplateKind({ lane: 'reschedule', sendCount: 1 })).toBe('nudge_test');
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
