import { describe, expect, it } from 'vitest';
import {
  dbdSearchUrl,
  decisionText,
  displayUrl,
  parseProposalCallback,
  proposalButtons,
  proposalMessage,
  stillAsProposed,
  type EnrichmentProposal,
} from './proposals';

const ID = '3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b';

const proposal = (over: Partial<EnrichmentProposal> = {}): EnrichmentProposal => ({
  id: ID,
  entity_type: 'company',
  entity_id: 'c0ffee00-0000-4000-8000-000000000001',
  company_id: 'c0ffee00-0000-4000-8000-000000000001',
  field: 'website',
  value: 'https://www.gateauxhouse.co.th/',
  current_value: null,
  source_url: 'https://www.gateauxhouse.co.th/',
  source_tier: 'own_site',
  quote: 'Gateaux House — Bakery & Café since 1998',
  quote_check: 'passed',
  reason: 'search result 1 for "Gateaux House Bangkok"; the homepage names the company',
  status: 'pending',
  decision_note: null,
  run_ref: 'website-finder 2026-10-14T20:00+07:00',
  proposed_at: '2026-10-14T13:00:00Z',
  telegram_message_id: null,
  sent_at: null,
  decided_at: null,
  ...over,
});

describe('proposalMessage', () => {
  it('asks one question with the value, the exact quote and where it came from', () => {
    const text = proposalMessage(proposal(), 'Gateaux House');
    const lines = text.split('\n');
    expect(lines[0]).toBe('<b>Website for Gateaux House?</b>');
    expect(lines[1]).toBe('<a href="https://www.gateauxhouse.co.th/">gateauxhouse.co.th</a>');
    expect(text).toContain('<i>“Gateaux House — Bakery &amp; Café since 1998”</i>');
    expect(text).toContain('(their own site)');
    expect(text).not.toContain('Replaces:');
  });

  it('escapes names and quotes, and shortens a long quote', () => {
    const text = proposalMessage(proposal({ quote: `<script>${'x'.repeat(400)}` }), 'Salt & <Butter>');
    expect(text).toContain('Website for Salt &amp; &lt;Butter&gt;?');
    expect(text).not.toContain('<script>');
    expect(text).toContain('…”</i>');
  });

  it('says what it would replace', () => {
    expect(proposalMessage(proposal({ current_value: 'http://old.example' }), 'X')).toContain('Replaces: http://old.example');
  });
});

describe('owner / decision-maker proposals', () => {
  const owner = proposal({
    field: 'decision_maker', value: 'Janista Lewchalermvongse (Bam)', source_url: 'https://www.audreygroup.com/About.html',
    quote: 'Janista Lewchalermvongse (Bam), the founder of Audrey Café & Restaurant chain',
    details: { job_title: 'Founder', dbd_keyword: 'ออเดรย์ กรุ๊ป' }, reason: null,
  });

  it('names the person and role, quotes the source and links DBD for a manual check', () => {
    const text = proposalMessage(owner, 'Audrey Group');
    const lines = text.split('\n');
    expect(lines[0]).toBe('<b>Owner / decision maker for Audrey Group?</b>');
    expect(lines[1]).toBe('<b>Janista Lewchalermvongse (Bam)</b> — Founder');
    expect(text).toContain(`<a href="${dbdSearchUrl('ออเดรย์ กรุ๊ป')}">DBD search</a>`);
    expect(text).toContain('Save adds them as a new contact (uncontacted)');
  });

  it('searches DBD by company name when no legal name is known', () => {
    expect(proposalMessage({ ...owner, details: { job_title: 'Founder' } }, 'Audrey Group')).toContain(dbdSearchUrl('Audrey Group'));
  });

  it('encodes the DBD keyword', () => {
    expect(dbdSearchUrl(' กาโตว์ เฮ้าส์ ')).toBe('https://datawarehouse.dbd.go.th/juristic/searchInfo?keyword=%E0%B8%81%E0%B8%B2%E0%B9%82%E0%B8%95%E0%B8%A7%E0%B9%8C%20%E0%B9%80%E0%B8%AE%E0%B9%89%E0%B8%B2%E0%B8%AA%E0%B9%8C');
  });

  it('labels a press source plainly', () => {
    expect(proposalMessage({ ...owner, source_tier: 'press' }, 'Audrey Group')).toContain('(a press interview, article or guide)');
  });
});

describe('profile and new-lead proposals', () => {
  it('shows a text field as text, not a link', () => {
    const text = proposalMessage(proposal({ field: 'what_they_make', value: 'mille-feuille & opera cake' }), 'Gateaux House');
    expect(text.split('\n').slice(0, 2)).toEqual(['<b>What they make for Gateaux House?</b>', '<b>mille-feuille &amp; opera cake</b>']);
  });

  it('introduces a new lead with its type, area, Laya fit and what Save does', () => {
    const lead = proposal({
      field: 'new_company', value: 'Kind Kones Bakery', entity_id: null, company_id: null, source_tier: 'press',
      details: { industry: 'Bakery', area: 'Ari', what_they_make: 'vegan croissants', archetype: 'bakery', fit_noul: 0.814 },
    });
    const text = proposalMessage(lead, 'Kind Kones Bakery');
    const lines = text.split('\n');
    expect(lines[0]).toBe('<b>New lead: Kind Kones Bakery?</b>');
    expect(lines[1]).toBe('Bakery · Ari');
    expect(text).toContain('Makes: vegan croissants');
    expect(text).toContain('Laya: bakery 81%');
    expect(text).toContain('Save adds it to Accounts as a prospect');
  });
});

describe('buttons', () => {
  it('round-trips both buttons within Telegram’s 64-byte limit', () => {
    const [[save, reject]] = proposalButtons(ID);
    expect(Buffer.byteLength(save.callback_data)).toBeLessThanOrEqual(64);
    expect(parseProposalCallback(save.callback_data)).toEqual({ id: ID, action: 'save' });
    expect(parseProposalCallback(reject.callback_data)).toEqual({ id: ID, action: 'reject' });
  });

  it('labels the buttons for what Save does', () => {
    expect(proposalButtons(ID, 'new_company')[0].map(b => b.text)).toEqual(['✅ Add', '❌ Skip']);
    expect(proposalButtons(ID, 'decision_maker')[0].map(b => b.text)).toEqual(['✅ Save', '❌ Not right']);
    expect(proposalButtons(ID, 'address')[0].map(b => b.text)).toEqual(['✅ Save', '❌ Not theirs']);
    expect(parseProposalCallback(proposalButtons(ID, 'new_company')[0][0].callback_data)).toEqual({ id: ID, action: 'save' });
  });

  it('ignores anything else', () => {
    for (const data of [undefined, 42, '', 'p:not-a-uuid:s', `p:${ID}:x`, `p:${ID}:s extra`, `q:${ID}:s`]) {
      expect(parseProposalCallback(data)).toBeNull();
    }
  });
});

describe('stillAsProposed', () => {
  it('fills only what the proposal saw', () => {
    expect(stillAsProposed(proposal(), null)).toBe(true);
    expect(stillAsProposed(proposal(), '')).toBe(true);
    expect(stillAsProposed(proposal(), 'https://typed-by-pat.example')).toBe(false);
    expect(stillAsProposed(proposal({ current_value: 'http://old.example' }), 'http://old.example')).toBe(true);
  });
});

describe('displayUrl / decisionText', () => {
  it('shows a bare host and path', () => {
    expect(displayUrl('https://www.restaurant-stage.co/contact/')).toBe('restaurant-stage.co/contact');
    expect(displayUrl('not a url')).toBe('not a url');
  });

  it('says plainly what happened', () => {
    expect(decisionText('applied').footer).toContain('Saved to LeadPulse');
    expect(decisionText('rejected').footer).toContain('Not saved');
    expect(decisionText('stale', 'website is now https://x.example').footer).toContain('website is now https://x.example');
  });
});
