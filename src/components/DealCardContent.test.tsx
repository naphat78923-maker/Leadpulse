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
    expect(screen.getByText('Mello Vegan').getAttribute('title')).toBe('Mello Vegan');
    expect(screen.getByText(longRole).getAttribute('title')).toBe(longRole);
    expect(screen.getByRole('heading').getAttribute('title')).toBe(`${longName} +1`);
  });

  it('renders contact first and keeps action context ahead of quiet footer metadata', () => {
    const { container } = render(
      <DealCardContent
        deal={deal}
        presentation={presentation}
        whyNow="Follow-up is overdue"
        reviewLabels={[]}
        nudge={null}
      />
    );

    expect(screen.getByRole('heading', { name: 'Nok S. +1' })).toBeTruthy();
    expect(screen.getByText('Mello Vegan')).toBeTruthy();
    expect(screen.getByText('Pastry Chef')).toBeTruthy();
    expect(screen.getByText('Overdue')).toBeTruthy();
    expect(screen.getByText('25 Aug')).toBeTruthy();
    expect(screen.getByText('Butter + Condensed Milk')).toBeTruthy();
    expect(screen.getByText('Next action')).toBeTruthy();
    expect(screen.getByText(presentation.nextAction)).toBeTruthy();
    expect(screen.getByText('Why now · Follow-up is overdue')).toBeTruthy();
    expect(screen.getByText('Research')).toBeTruthy();

    const text = container.textContent || '';
    expect(text.indexOf('Nok S.')).toBeLessThan(text.indexOf('Next action'));
    // The concrete next action leads the body; commercial metadata follows it.
    expect(text.indexOf('Next action')).toBeLessThan(text.indexOf('Butter + Condensed Milk'));
    expect(text.indexOf('Next action')).toBeLessThan(text.indexOf('Why now'));
    expect(text.indexOf('Why now')).toBeLessThan(text.indexOf('Research'));
    expect(text).not.toContain(deal.title);
  });

  it('renders a quiet missing-contact warning with the known company as the primary identity', () => {
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
    const warning = screen.getByText('Contact not identified');
    expect(warning.tagName).toBe('P');
    expect(warning.className).toContain('text-[10px]');
    expect(screen.getByText('Mello Vegan').getAttribute('title')).toBe('Mello Vegan');
    expect(screen.getByText('?')).toBeTruthy();
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

  it('keeps a named contact initial avatar even when the linked company has a logo', () => {
    render(
      <DealCardContent
        deal={deal}
        presentation={{ ...presentation, companyLogoUrl: 'https://example.test/company-logo.webp' }}
        whyNow={null}
        reviewLabels={[]}
        nudge={null}
      />
    );

    expect(screen.getByText('NS')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Mello Vegan logo' })).toBeNull();
  });

  it('leads a compact card with the concrete next action and its reason', () => {
    render(
      <DealCardContent
        deal={deal}
        presentation={presentation}
        whyNow="Follow-up is overdue"
        reviewLabels={[]}
        nudge={null}
        compact
      />
    );

    expect(screen.getByRole('heading', { name: 'Nok S. +1' })).toBeTruthy();
    // The compact journey card used to omit the action entirely — that was the defect.
    expect(screen.getByText('Next action')).toBeTruthy();
    expect(screen.getByText(presentation.nextAction)).toBeTruthy();
    expect(screen.getByText('Why now · Follow-up is overdue')).toBeTruthy();
    // Still no full-card footer metadata in the compact variant.
    expect(screen.queryByText('Research')).toBeNull();
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

});
