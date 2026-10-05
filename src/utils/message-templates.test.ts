import { describe, expect, it } from 'vitest';
import { buildDraft, defaultTemplateKind, segmentPainFor } from './message-templates';

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
  const pain = segmentPainFor({ name: 'Crumb House', industry: 'bakery chain', tags: ['bakery', 'chain'] });

  it('writes a first outreach: their problem, who we are, one small ask', () => {
    const draft = buildDraft({ kind: 'first_outreach', language: 'english', companyName: 'Crumb House', contactName: 'Nok Srisuk', product: 'Butter', pain });

    expect(draft.subject).toBe('VG Saveur x Crumb House');
    expect(draft.body.startsWith('Hi Nok,')).toBe(true);
    expect(draft.body).toContain(pain.opener.english);
    expect(draft.body).toContain('dairy-free butter');
    expect(draft.body).toMatch(/Want me to send one over\?/);
    // Nothing left for Pat to fill in by hand.
    expect(draft.body).not.toMatch(/[[\]{}]/);
  });

  it('greets generically without a person, and names the right product', () => {
    const draft = buildDraft({ kind: 'sample_followup', language: 'english', companyName: 'Crumb House', product: 'Condensed Milk', pain });
    expect(draft.body.startsWith('Hi there,')).toBe(true);
    expect(draft.body).toContain('plant-based condensed milk sample');
  });

  it('writes Thai drafts in Thai', () => {
    const draft = buildDraft({ kind: 'first_outreach', language: 'thai', companyName: 'Crumb House', contactName: 'นก', product: 'Butter', pain });
    expect(draft.body.startsWith('สวัสดีครับคุณนก')).toBe(true);
    expect(draft.body).toContain(pain.opener.thai);
    expect(draft.body).not.toMatch(/Hi |Best,/);
  });

  it('asks an existing customer about stock', () => {
    const draft = buildDraft({ kind: 'check_in', language: 'english', companyName: 'Crumb House', pain });
    expect(draft.body).toContain('stock at Crumb House');
  });
});

describe('defaultTemplateKind', () => {
  it('follows where the deal is', () => {
    expect(defaultTemplateKind({ lane: 'outreach', companyStatus: 'prospect' })).toBe('first_outreach');
    expect(defaultTemplateKind({ lane: 'testing', companyStatus: 'prospect' })).toBe('sample_followup');
    expect(defaultTemplateKind({ lane: 'reschedule', companyStatus: 'active_customer' })).toBe('check_in');
  });
});
