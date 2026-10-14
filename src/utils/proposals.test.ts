import { describe, expect, it } from 'vitest';
import {
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

describe('buttons', () => {
  it('round-trips both buttons within Telegram’s 64-byte limit', () => {
    const [[save, reject]] = proposalButtons(ID);
    expect(Buffer.byteLength(save.callback_data)).toBeLessThanOrEqual(64);
    expect(parseProposalCallback(save.callback_data)).toEqual({ id: ID, action: 'save' });
    expect(parseProposalCallback(reject.callback_data)).toEqual({ id: ID, action: 'reject' });
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
