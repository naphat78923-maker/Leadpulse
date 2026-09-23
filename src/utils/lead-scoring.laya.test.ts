import { describe, expect, it } from 'vitest';
import type { Company, Deal } from '@/types/crm';
import { buildLayaAttentionInput } from './lead-scoring';

const deal: Pick<Deal, 'product' | 'stage' | 'value' | 'followup_date' | 'last_outcome'> = {
  stage: 'contacted', product: 'Butter', value: 30000, followup_date: '2026-09-21',
  last_outcome: 'Buyer asked for a sample price',
};
const company: Pick<Company, 'industry' | 'size' | 'tags'> = {
  industry: 'Bakery', size: 'B', tags: ['bakery'],
};

function build(outcome: string) {
  return buildLayaAttentionInput({ deal: { ...deal, last_outcome: outcome }, company, today: '2026-09-21' });
}

describe('buildLayaAttentionInput', () => {
  it('preserves a late refusal or no-contact request instead of turning it into a positive signal', () => {
    const outcome = 'Buyer asked for a sample price but later declined and requested no contact';
    expect(build(outcome).state).toContain(`Outcome: ${outcome}.`);
  });

  it.each([
    'ลูกค้าขอราคา แต่ภายหลังปฏิเสธและขอไม่ให้ติดต่ออีก',
    'Interested initially.\nLater: NOT interested; do not contact.',
    'Buyer asked for a sample price '.repeat(200) + 'but declined; do not contact',
  ])('preserves complete multilingual or long outcomes: %s', outcome => {
    expect(build(outcome).state).toContain(outcome);
  });

  it('does not shorten industry, product, or tags to force a prompt to fit', () => {
    const industry = 'Bakery supplier but not a customer';
    const product = 'Butter not suitable for this application';
    const tags = ['bakery', 'not a purchasing account', 'do not contact'];
    const input = buildLayaAttentionInput({
      deal: { ...deal, product }, company: { ...company, industry, tags }, today: '2026-09-21',
    });
    expect(input.state).toContain(industry);
    expect(input.state).toContain(product);
    tags.forEach(tag => expect(input.state).toContain(tag));
  });

  it('keeps the short baseline unchanged and omits fields outside the declared input recipe', () => {
    const extraCompany = { ...company, name: 'Private business', notes: 'Private company notes', website: 'https://private.invalid' };
    const extraDeal = { ...deal, client: 'Private client', title: 'Private deal title' };
    const input = buildLayaAttentionInput({ deal: extraDeal, company: extraCompany, today: '2026-09-21' });
    expect(input.state).toBe('Industry: Bakery. Tags: bakery. Product: Butter. Stage: contacted. Value: THB 30000. Follow-up: today. Outcome: Buyer asked for a sample price.');
    expect(input.state).not.toContain('Private');
    expect(input.state).not.toContain('https://private.invalid');
    expect(input.questions.attention.type).toBe('choice');
    expect(Object.keys(input.questions.attention.criteria)).toEqual(['priority', 'nurture', 'research', 'deprioritize']);
  });

  it('labels absent evidence as unknown without inventing facts', () => {
    const input = buildLayaAttentionInput({
      deal: { ...deal, value: null, followup_date: null, last_outcome: null }, today: '2026-09-21',
    });
    expect(input.state).toContain('Industry: unknown.');
    expect(input.state).toContain('Tags: unknown.');
    expect(input.state).toContain('Value: unknown.');
    expect(input.state).toContain('Follow-up: unscheduled.');
    expect(input.state).toContain('Outcome: unknown.');
  });
});
