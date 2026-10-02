import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import type { DealCardPresentation } from '@/utils/deal-card';
import DealCardContent from './DealCardContent';

const deal: Deal = {
  id: 'deal-1',
  title: 'Mello Vegan — Butter + Condensed Milk',
  stage: 'research',
  product: 'Butter + Condensed Milk',
  client: 'Mello Vegan',
  company_id: 'company-1',
  contact_ids: ['contact-1'],
  value: null,
  priority: 'medium',
  next_action: 'Verify the two conflicting numbers, then call about the butter swap',
  followup_date: '2026-08-25',
  last_outcome: null,
  nudge_count: 0,
  workflow_action: 'outreach',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

const presentation: DealCardPresentation = {
  contact: {
    name: 'Nok S.',
    role: 'Pastry Chef',
    initials: 'NS',
    additionalCount: 1,
    missing: false,
  },
  companyName: 'Mello Vegan',
  companyLogoUrl: null,
  product: 'Butter + Condensed Milk',
  nextAction: 'Verify the two conflicting numbers, then call about the butter swap',
  timing: {
    label: 'Overdue',
    date: '25 Aug',
    tone: 'overdue',
  },
};

afterEach(() => cleanup());

describe('DealCardContent', () => {
  it('shows a set value and tags only high priority', () => {
    render(
      <DealCardContent
        deal={{ ...deal, value: 12000, priority: 'high' }}
        presentation={presentation}
        whyNow={null}
        reviewLabels={[]}
        nudge={null}
      />
    );
    expect(screen.getByTitle('Deal value').textContent).toMatch(/12,000/);
    expect(screen.getByText('High')).toBeTruthy();
  });


  it('keeps company identity independent from a long role and preserves full identity labels', () => {
    const longRole = 'Regional purchasing and pastry development lead';
    const longName = 'ประภัสสร จันทร์สุวรรณกุล';
    render(
      <DealCardContent
        deal={deal}
        presentation={{ ...presentation, contact: { ...presentation.contact, name: longName, role: longRole } }}
        whyNow={null}
        reviewLabels={[]}
        nudge={null}
        showGrip
      />
    );
    expect(screen.getByRole('heading', { name: 'Mello Vegan' }).getAttribute('title')).toBe('Mello Vegan');
    expect(screen.getByText(longName + ' +1 · ' + longRole).getAttribute('title')).toBe(`${longName} · ${longRole}`);
    expect(screen.getByRole('img', { name: 'Mello Vegan logo' })).toBeTruthy();
  });

  it('leads with company identity and keeps product, next action and timing visible, with no value filler', () => {
    const { container } = render(
      <DealCardContent
        deal={deal}
        presentation={presentation}
        whyNow="Follow-up is overdue"
        reviewLabels={[]}
        nudge={null}
      />
    );

    expect(screen.getByRole('heading', { name: 'Mello Vegan' })).toBeTruthy();
    expect(screen.getByText('Nok S. +1 · Pastry Chef')).toBeTruthy();
    expect(screen.getByText('Overdue · 25 Aug')).toBeTruthy();
    expect(screen.getByText('Butter + Condensed Milk')).toBeTruthy();
    expect(screen.getByText(presentation.nextAction)).toBeTruthy();
    // An unset value shows nothing rather than "Value —".
    expect(screen.queryByTitle('Deal value')).toBeNull();
    expect(screen.getByText('Overdue · 25 Aug').getAttribute('title')).toBe('Follow-up is overdue');

    const text = container.textContent || '';
    expect(text.indexOf('Mello Vegan')).toBeLessThan(text.indexOf('Nok S.'));
    expect(text.indexOf('Butter + Condensed Milk')).toBeLessThan(text.indexOf(presentation.nextAction));
    expect(text.indexOf(presentation.nextAction)).toBeLessThan(text.indexOf('Overdue'));
    expect(text).not.toContain(deal.title);
  });

  it('shows only the company when no contact is identified, with no filler line', () => {
    render(
      <DealCardContent
        deal={{ ...deal, contact_ids: [] }}
        presentation={{
          ...presentation,
          contact: {
            name: 'Contact not identified',
            role: null,
            initials: '?',
            additionalCount: 0,
            missing: true,
          },
        }}
        whyNow={null}
        reviewLabels={[]}
        nudge={null}
      />
    );

    expect(screen.getByRole('heading', { name: 'Mello Vegan' })).toBeTruthy();
    expect(screen.queryByText('Contact not identified')).toBeNull();
    expect(screen.getByRole('img', { name: 'Mello Vegan logo' })).toBeTruthy();
    expect(screen.queryByText('?')).toBeNull();
  });

  it('shows the linked company brand logo instead of the question-mark avatar for a missing contact', () => {
    const logoUrl = 'https://example.test/company-logo.webp';

    render(
      <DealCardContent
        deal={{ ...deal, contact_ids: [] }}
        presentation={{
          ...presentation,
          companyLogoUrl: logoUrl,
          contact: {
            name: 'Contact not identified',
            role: null,
            initials: '?',
            additionalCount: 0,
            missing: true,
          },
        }}
        whyNow={null}
        reviewLabels={[]}
        nudge={null}
      />
    );

    const logo = screen.getByRole('img', { name: 'Mello Vegan logo' });
    expect(logo.getAttribute('src')).toBe(logoUrl);
    expect(screen.queryByText('?')).toBeNull();
  });

  it('shows the linked company logo even when a named contact exists', () => {
    const logoUrl = 'https://example.test/company-logo.webp';
    render(
      <DealCardContent
        deal={deal}
        presentation={{ ...presentation, companyLogoUrl: logoUrl }}
        whyNow={null}
        reviewLabels={[]}
        nudge={null}
      />
    );

    expect(screen.getByText('Nok S. +1 · Pastry Chef')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Mello Vegan logo' }).getAttribute('src')).toBe(logoUrl);
  });

  it('keeps a compact card actionable without opening the detail panel', () => {
    render(
      <DealCardContent
        deal={{ ...deal, value: 4500 }}
        presentation={presentation}
        whyNow="Follow-up is overdue"
        reviewLabels={[]}
        nudge={null}
        compact
      />
    );

    expect(screen.getByRole('heading', { name: 'Mello Vegan' })).toBeTruthy();
    expect(screen.getByText('Butter + Condensed Milk')).toBeTruthy();
    expect(screen.getByText(presentation.nextAction)).toBeTruthy();
    expect(screen.getByText('Overdue · 25 Aug')).toBeTruthy();
    expect(screen.getByText('฿4,500')).toBeTruthy();
    expect(screen.queryByText('Why now · Follow-up is overdue')).toBeNull();
  });

  it('offers an actionable empty state instead of a dash when no next action is set', () => {
    render(
      <DealCardContent
        deal={{ ...deal, next_action: null }}
        presentation={{ ...presentation, nextAction: 'No next action set' }}
        whyNow={null}
        reviewLabels={[]}
        nudge={null}
        compact
      />
    );

    expect(screen.getByText('No next action set yet')).toBeTruthy();
    expect(screen.queryByText('No next action set')).toBeNull();
  });

  it('renders a high-contrast nudge badge on compact cards without the implementation code', () => {
    render(
      <DealCardContent
        deal={deal}
        presentation={presentation}
        whyNow={null}
        reviewLabels={[]}
        nudge="2/4 Remind NG-002"
        nudgeStage="remind"
        compact
      />
    );
    const badge = screen.getByText('2/4 Remind');
    expect(badge.hasAttribute('data-nudge-badge')).toBe(true);
    expect(badge.className).toMatch(/text-\[11px\]/);
    expect(badge.className).toMatch(/font-semibold/);
    // The technical code stays discoverable in the tooltip rather than shouting on the card.
    expect(badge.getAttribute('title')).toBe('2/4 Remind NG-002');
  });

  it('notes chases since the buyer last replied next to the nudge badge', () => {
    const { container, rerender } = render(
      <DealCardContent deal={deal} presentation={presentation} whyNow={null} reviewLabels={[]} nudge="3/4 Firm NG-003" chasesSinceReply={1} />
    );
    expect(container.querySelector('[data-since-reply]')!.textContent).toBe('1 since reply');
    rerender(
      <DealCardContent deal={deal} presentation={presentation} whyNow={null} reviewLabels={[]} nudge="3/4 Firm NG-003" chasesSinceReply={0} />
    );
    expect(container.querySelector('[data-since-reply]')!.textContent).toBe('none since reply');
  });

  it('shows no since-reply note without one, or without a nudge badge', () => {
    const { container, rerender } = render(
      <DealCardContent deal={deal} presentation={presentation} whyNow={null} reviewLabels={[]} nudge="3/4 Firm NG-003" />
    );
    expect(container.querySelector('[data-since-reply]')).toBeNull();
    rerender(
      <DealCardContent deal={deal} presentation={presentation} whyNow={null} reviewLabels={[]} nudge={null} chasesSinceReply={1} />
    );
    expect(container.querySelector('[data-since-reply]')).toBeNull();
  });

  it('shows the order size the buyer stated, with its tier in the tooltip', () => {
    const { container } = render(
      <DealCardContent deal={{ ...deal, buyer_reply: 'We tested the sample. Please quote 40 kg per month.' }}
        presentation={presentation} whyNow={null} reviewLabels={[]} nudge={null} />
    );
    const chip = container.querySelector('[data-order-size]')!;
    expect(chip.textContent).toBe('40 kg');
    expect(chip.getAttribute('data-order-size')).toBe('large');
    expect(chip.getAttribute('title')).toMatch(/over 15 kg.*not saved to the deal/);
  });

  it('formats small and fractional amounts without trailing zeros', () => {
    const size = (reply: string) => render(
      <DealCardContent deal={{ ...deal, buyer_reply: reply }} presentation={presentation} whyNow={null} reviewLabels={[]} nudge={null} />
    ).container.querySelector('[data-order-size]')?.textContent;
    expect(size('We only need 500 g for a menu test order.')).toBe('0.5 kg');
    cleanup();
    expect(size('Send us 12.5 kg please.')).toBe('12.5 kg');
  });

  it('shows no order size without a stated amount, a reply, or for a sample amount', () => {
    for (const reply of [null, 'Can you send your price list?', 'Please send 2 kg of samples.']) {
      const { container } = render(
        <DealCardContent deal={{ ...deal, buyer_reply: reply }} presentation={presentation} whyNow={null} reviewLabels={[]} nudge={null} />
      );
      expect(container.querySelector('[data-order-size]'), String(reply)).toBeNull();
      cleanup();
    }
  });
});
