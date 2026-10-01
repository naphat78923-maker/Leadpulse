import { describe, expect, it } from 'vitest';
import {
  buildLayaBuyerResponseInput,
  buildLayaProspectFitInput,
  buyerResponseSignal,
  LAYA_PUBLISHED_ARCHETYPES,
} from './laya-buyer-response';

describe('buildLayaBuyerResponseInput', () => {
  const baseDeal = { product: 'Butter', last_outcome: 'Buyer asked for a sample price' };

  it('prefers the verbatim buyer reply and marks the state as verbatim', () => {
    const input = buildLayaBuyerResponseInput({
      deal: { ...baseDeal, buyer_reply: 'Please send us a quotation for 20 kg.' },
    });
    expect(input).not.toBeNull();
    expect(input!.verbatim).toBe(true);
    expect(input!.state).toBe(
      'We supply Butter to this account. The buyer\'s latest reply: "Please send us a quotation for 20 kg."',
    );
    // Frozen reversed option order — the measured v_verbatim_revopts configuration.
    expect(Object.keys(input!.questions.buyer_response.criteria)).toEqual([
      'unclear', 'no_commitment', 'declined', 'deferred', 'requested_next_step',
    ]);
  });

  it('falls back to the paraphrased outcome note and marks it as not verbatim', () => {
    const input = buildLayaBuyerResponseInput({ deal: baseDeal });
    expect(input!.verbatim).toBe(false);
    expect(input!.state).toBe(
      'We supply Butter to this account. The latest recorded outcome note says: "Buyer asked for a sample price"',
    );
  });

  it('returns null when there is no buyer text — a code-layer needs_evidence safeguard', () => {
    expect(buildLayaBuyerResponseInput({ deal: { product: 'Butter', last_outcome: null } })).toBeNull();
    expect(buildLayaBuyerResponseInput({
      deal: { product: 'Butter', last_outcome: '  ', buyer_reply: '' },
    })).toBeNull();
  });

  it('preserves long or multilingual replies without shortening', () => {
    const reply = 'กรุณาส่งใบเสนอราคาเนย 20 กก. ให้หน่อยครับ ' + 'x'.repeat(500);
    const input = buildLayaBuyerResponseInput({ deal: { ...baseDeal, buyer_reply: reply } });
    expect(input!.state).toContain(reply);
  });

  it('preserves a late refusal or no-contact request instead of turning it into a positive signal', () => {
    const reply = 'Buyer asked for a sample price but later declined and requested no contact';
    expect(buildLayaBuyerResponseInput({ deal: { product: 'Butter', last_outcome: null, buyer_reply: reply } })!.state)
      .toContain(reply);
  });

  it('preserves complete multilingual or long verbatim replies: %s', () => {
    for (const reply of [
      'ลูกค้าขอราคา แต่ภายหลังปฏิเสธและขอไม่ให้ติดต่ออีก',
      'Interested initially.\nLater: NOT interested; do not contact.',
      'Buyer asked for a sample price '.repeat(200) + 'but declined; do not contact',
    ]) {
      const input = buildLayaBuyerResponseInput({ deal: { product: 'Butter', last_outcome: null, buyer_reply: reply } });
      expect(input!.state).toContain(reply);
    }
  });

  it('excludes fields outside the declared recipe and handles missing product', () => {
    const input = buildLayaBuyerResponseInput({
      deal: { product: '', last_outcome: null, buyer_reply: 'No, thank you.',
        client: 'Private client', stage: 'contacted' } as never,
    });
    expect(input!.state).toBe(
      'We supply our products to this account. The buyer\'s latest reply: "No, thank you."',
    );
    expect(input!.state).not.toContain('Private');
    expect(input!.state).not.toContain('contacted');
  });

  it('never adds a deal value — deal size is bucketed in code, not asked of the model', () => {
    const deal = { product: 'Butter', last_outcome: null, buyer_reply: 'Please quote 20 kg.', value: 30000 };
    expect(buildLayaBuyerResponseInput({ deal })!.state).toBe(
      'We supply Butter to this account. The buyer\'s latest reply: "Please quote 20 kg."',
    );
  });
});

describe('buyerResponseSignal — shipped 2-class slice (eval report option 1)', () => {
  it('flags a verbatim requested_next_step as buyer_requested', () => {
    expect(buyerResponseSignal('requested_next_step', true)).toBe('buyer_requested');
  });

  it('routes every other verbatim class to manual triage — they measured ~1/4 each', () => {
    for (const level of ['deferred', 'declined', 'no_commitment', 'unclear'] as const) {
      expect(buyerResponseSignal(level, true)).toBe('manual_triage');
    }
  });

  it('never raises the flag on paraphrased notes, even for requested_next_step', () => {
    // Third-person notes measured 2/8 on requested_next_step — human review only.
    expect(buyerResponseSignal('requested_next_step', false)).toBe('manual_triage');
    expect(buyerResponseSignal('declined', false)).toBe('manual_triage');
  });
});

describe('buildLayaProspectFitInput', () => {
  it('builds a plain sentence of the identity, with one fit Noul per published archetype', () => {
    const input = buildLayaProspectFitInput({ name: "April's Bakery", industry: 'Bakery', tags: ['bakery', 'chain'] });
    expect(input!.state).toBe('The account is named "April\'s Bakery"; its industry is "Bakery"; its tags are "bakery, chain".');
    expect(Object.keys(input!.questions)).toEqual([
      'fit_plant_based_restaurant_cafe',
      'fit_modern_trade_specialty_retail',
      'fit_bakery_patisserie_brands',
    ]);
  });

  it('never names an archetype in the state — that made every fit Noul answer yes', () => {
    const state = buildLayaProspectFitInput({ name: 'Green Eats', industry: 'Restaurant', tags: ['vegan'] })!.state;
    for (const archetype of LAYA_PUBLISHED_ARCHETYPES) expect(state).not.toContain(archetype);
    expect(state).not.toMatch(/archetype/i);
  });

  it('carries only name, industry and tags', () => {
    const input = buildLayaProspectFitInput({
      name: 'Green Eats',
      industry: 'Restaurant',
      tags: ['vegan'],
      website: 'https://example.com',
      status: 'prospect',
    } as never);
    expect(input!.state).not.toContain('example.com');
    expect(input!.state).not.toContain('prospect');
  });

  it('omits absent identity fields instead of inventing them', () => {
    const input = buildLayaProspectFitInput({ name: null, industry: '  ', tags: ['', ' plant-based '] });
    expect(input!.state).toBe('its tags are "plant-based".');
  });

  it('returns null when the account states nothing — a code-layer needs_evidence safeguard', () => {
    expect(buildLayaProspectFitInput({})).toBeNull();
    expect(buildLayaProspectFitInput({ name: '  ', industry: null, tags: [] })).toBeNull();
  });

  it('preserves multilingual identity text without shortening', () => {
    const name = 'ร้านขนมเบเกอรี่ไทย'.repeat(20);
    expect(buildLayaProspectFitInput({ name })!.state).toContain(name);
  });
});
