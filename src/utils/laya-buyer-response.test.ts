import { describe, expect, it } from 'vitest';
import {
  buildLayaBuyerResponseInput,
  buildLayaProspectFitInput,
  buyerResponseSignal,
  scoreFitFromLaya,
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

  it('adds the recorded deal value only when the terminal opts in', () => {
    const deal = { product: 'Butter', last_outcome: null, buyer_reply: 'Please quote 20 kg.', value: 30000 };
    // The score card keeps the exact eval-measured state — value never leaks in.
    expect(buildLayaBuyerResponseInput({ deal })!.state).not.toContain('Deal value');
    expect(buildLayaBuyerResponseInput({ deal, includeDealValue: false })!.state)
      .not.toContain('Deal value');
    expect(buildLayaBuyerResponseInput({ deal, includeDealValue: true })!.state).toBe(
      'We supply Butter to this account. The buyer\'s latest reply: "Please quote 20 kg." Deal value on record: ฿30,000.',
    );
  });

  it('skips the value sentence for null, zero or non-finite values and appends it to note states too', () => {
    for (const value of [null, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        buildLayaBuyerResponseInput({ deal: { ...baseDeal, value }, includeDealValue: true })!.state,
      ).not.toContain('Deal value on record');
    }
    expect(
      buildLayaBuyerResponseInput({ deal: { ...baseDeal, value: 1500.5 }, includeDealValue: true })!.state,
    ).toContain(' Deal value on record: ฿1,501.');
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
  it('builds the sentence-form identity with the criteria-derived candidate archetypes', () => {
    const input = buildLayaProspectFitInput({
      name: "April's Bakery",
      industry: 'Bakery',
      tags: ['bakery', 'chain'],
      taxonomyVersion: 'v1',
    });
    expect(input).not.toBeNull();
    expect(input!.state).toBe(
      'Candidate account: name "April\'s Bakery", industry "Bakery", tags "bakery | chain". ' +
        'Candidate archetypes (taxonomy v1): plant_based_restaurant_cafe, modern_trade_specialty_retail, bakery_patisserie_brands.',
    );
    // The state's candidate list and the question's criteria cannot drift: both
    // derive from the same frozen criteria (minus no_fit).
    expect(input!.state).not.toContain('no_fit');
    expect(Object.keys(input!.questions)).toEqual(['archetype_select', 'role_support']);
  });

  it('carries only the fields the question restricts itself to — name, industry, tags', () => {
    const input = buildLayaProspectFitInput({
      name: 'Green Eats',
      industry: 'Restaurant',
      tags: ['vegan'],
      taxonomyVersion: 'v1',
      website: 'https://example.com',
      status: 'prospect',
    } as never);
    expect(input!.state).not.toContain('example.com');
    expect(input!.state).not.toContain('prospect');
  });

  it('omits absent identity fields instead of inventing them', () => {
    const input = buildLayaProspectFitInput({
      name: null,
      industry: '  ',
      tags: ['', ' plant-based '],
      taxonomyVersion: 'v1',
    });
    expect(input!.state).toBe(
      'Candidate account: tags "plant-based". ' +
        'Candidate archetypes (taxonomy v1): plant_based_restaurant_cafe, modern_trade_specialty_retail, bakery_patisserie_brands.',
    );
  });

  it('returns null when the account states nothing — a code-layer needs_evidence safeguard', () => {
    expect(buildLayaProspectFitInput({ taxonomyVersion: 'v1' })).toBeNull();
    expect(buildLayaProspectFitInput({ name: '  ', industry: null, tags: [], taxonomyVersion: 'v1' })).toBeNull();
  });

  it('preserves multilingual identity text without shortening', () => {
    const name = 'ร้านขนมเบเกอรี่ไทย'.repeat(20);
    expect(buildLayaProspectFitInput({ name, taxonomyVersion: 'v1' })!.state).toContain(name);
  });
});

describe('scoreFitFromLaya', () => {
  const validPayload = () => ({
    question: 'archetype_select',
    archetype: 'bakery_patisserie_brands',
    answers: {
      archetype_select: {
        choice: 'bakery_patisserie_brands',
        confidence: 0.8,
        probabilities: {
          plant_based_restaurant_cafe: 0.05,
          modern_trade_specialty_retail: 0.05,
          bakery_patisserie_brands: 0.8,
          no_fit: 0.1,
        },
      },
      role_support: { noul: 0.2, confidence: 0.8 },
    },
    usage: { input_tokens: 150, output_tokens: 0 },
  });

  it('accepts a well-formed fit run and returns both answers', () => {
    const result = scoreFitFromLaya(validPayload());
    expect(result).not.toBeNull();
    expect(result!.archetype_select.choice).toBe('bakery_patisserie_brands');
    expect(result!.archetype_select.probabilities.no_fit).toBe(0.1);
    expect(result!.role_support).toEqual({ noul: 0.2, confidence: 0.8 });
  });

  it('rejects a buyer-response payload — the wrong question never parses as a fit', () => {
    expect(scoreFitFromLaya({ question: 'buyer_response', answers: validPayload().answers })).toBeNull();
    expect(scoreFitFromLaya({ question: 'archetype_select' })).toBeNull();
    expect(scoreFitFromLaya(null)).toBeNull();
    expect(scoreFitFromLaya('archetype_select')).toBeNull();
  });

  it('rejects missing, extra, or partial answers', () => {
    const missing = validPayload();
    delete (missing.answers as Record<string, unknown>).role_support;
    expect(scoreFitFromLaya(missing)).toBeNull();

    const extra = validPayload();
    (extra.answers as Record<string, unknown>).deal_amount = { score: 0 };
    expect(scoreFitFromLaya(extra)).toBeNull();

    const partial = validPayload();
    delete (partial.answers.archetype_select as Record<string, unknown>).probabilities;
    expect(scoreFitFromLaya(partial)).toBeNull();
  });

  it('rejects a choice outside the frozen criteria', () => {
    const unknown = validPayload();
    unknown.answers.archetype_select.choice = 'foodservice_restaurant' as never;
    expect(scoreFitFromLaya(unknown)).toBeNull();
  });

  it('rejects a distribution that does not key exactly like the criteria or total one', () => {
    const wrongKey = validPayload();
    wrongKey.answers.archetype_select.probabilities = {
      plant_based_restaurant_cafe: 0.5,
      modern_trade_specialty_retail: 0.05,
      bakery_patisserie_brands: 0.05,
      bakery: 0.4, // a key that is not in the frozen criteria
    } as never;
    expect(scoreFitFromLaya(wrongKey)).toBeNull();

    const badTotal = validPayload();
    badTotal.answers.archetype_select.probabilities.no_fit = 0.5; // 1.4 total
    expect(scoreFitFromLaya(badTotal)).toBeNull();

    const extraKey = validPayload();
    (extraKey.answers.archetype_select.probabilities as Record<string, number>).other = 0;
    expect(scoreFitFromLaya(extraKey)).toBeNull();
  });

  it('rejects out-of-range or non-finite values', () => {
    const outOfRange = validPayload();
    outOfRange.answers.role_support.noul = 1.5;
    expect(scoreFitFromLaya(outOfRange)).toBeNull();

    const nan = validPayload();
    nan.answers.archetype_select.confidence = Number.NaN;
    expect(scoreFitFromLaya(nan)).toBeNull();

    const bool = validPayload();
    bool.answers.archetype_select.confidence = true as never;
    expect(scoreFitFromLaya(bool)).toBeNull();
  });

  it('rejects a noul whose confidence does not match max(noul, 1 − noul)', () => {
    const mismatch = validPayload();
    mismatch.answers.role_support = { noul: 0.2, confidence: 0.5 };
    expect(scoreFitFromLaya(mismatch)).toBeNull();

    // The identity holds at the boundaries too.
    const boundary = validPayload();
    boundary.answers.role_support = { noul: 0, confidence: 1 };
    expect(scoreFitFromLaya(boundary)).not.toBeNull();
  });
});
