import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { DealGrade } from '@/utils/grade';
import LayaGradeChip from './LayaGradeChip';

const grade = (over: Partial<DealGrade>): DealGrade => ({
  status: 'graded', baseTier: 'B', tier: 'B', suggestedTier: 'B', momentum: 0, reasons: [], review: [], quantity: 'none', ...over,
});

describe('LayaGradeChip', () => {
  afterEach(cleanup);

  it('shows nothing without a grade or for an ungraded deal', () => {
    expect(render(<LayaGradeChip />).container.textContent).toBe('');
    cleanup();
    expect(render(<LayaGradeChip grade={grade({ status: 'not_graded' })} />).container.textContent).toBe('');
  });

  it('flags a deal that needs review, with the reasons as a tooltip', () => {
    const chip = render(<LayaGradeChip grade={grade({ status: 'needs_review', review: ['Thai reply — review it yourself'] })} />)
      .container.querySelector('[data-laya-chip]')!;
    expect(chip.textContent).toBe('Laya: review');
    expect(chip.getAttribute('data-laya-chip')).toBe('review');
    expect(chip.getAttribute('title')).toMatch(/Thai reply/);
  });

  it('shows a tier move up or down, and a kept tier quietly', () => {
    expect(render(<LayaGradeChip grade={grade({ tier: 'A' })} />).container.textContent).toBe('Laya ↑ A');
    cleanup();
    expect(render(<LayaGradeChip grade={grade({ tier: 'D' })} />).container.textContent).toBe('Laya ↓ D');
    cleanup();
    const kept = render(<LayaGradeChip grade={grade({})} />).container.querySelector('[data-laya-chip]')!;
    expect(kept.textContent).toBe('Laya B');
    expect(kept.getAttribute('data-laya-chip')).toBe('kept');
  });
});
