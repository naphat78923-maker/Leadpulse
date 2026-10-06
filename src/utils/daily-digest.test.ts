import { describe, expect, it } from 'vitest';
import { buildDailyDigest } from './daily-digest';
import type { AttentionCandidate } from './followup-policy';
import type { ThisWeekQueue } from './this-week-queue';

const TODAY = '2026-10-06';

const item = (over: Partial<AttentionCandidate>): AttentionCandidate => ({
  id: over.companyName ?? 'x',
  action: 'honor_saved_followup',
  section: 'saved',
  reasonCode: 'saved',
  reason: '',
  sourceRefs: [],
  dueDate: TODAY,
  originalDueDate: null,
  dueDateSource: null,
  companyId: null,
  companyName: 'Mello Vegan',
  dealId: 'd1',
  dealTitle: 'Mello Vegan — Butter',
  nextAction: 'Call chef',
  priority: 'medium',
  holds: [],
  ...over,
});

const queue = (over: Partial<ThisWeekQueue> = {}): ThisWeekQueue => ({
  needsReview: [], overdue: [], dueThisWeek: [], checkIns: [], needsDate: [], ...over,
});

describe('buildDailyDigest', () => {
  it('is empty when nothing needs attention', () => {
    const digest = buildDailyDigest({ queue: queue(), waiting: [], today: TODAY });
    expect(digest.isEmpty).toBe(true);
    expect(digest.text).toContain('Nothing due today.');
  });

  it('leads with the date and a one-line count of each list', () => {
    const digest = buildDailyDigest({
      queue: queue({
        overdue: [item({ companyName: 'Late Co', dueDate: '2026-09-29' })],
        dueThisWeek: [item({ companyName: 'Today Co' }), item({ companyName: 'Friday Co', dueDate: '2026-10-09' })],
        checkIns: [{ companyId: 'c1', companyName: 'Plenti', dueDate: TODAY, tier: 'at_risk', reorder: null }],
      }),
      waiting: [{ name: 'The Sukhothai', label: 'Buyer replied 7 days ago, nothing sent since' }],
      today: TODAY,
      appUrl: 'https://example.test',
    });
    const lines = digest.text.split('\n');
    expect(lines[0]).toBe('<b>LeadPulse · Tue 6 Oct</b>');
    expect(lines[1]).toBe('1 waiting on you · 1 due today · 1 overdue · 1 check-in');
    expect(digest.counts).toEqual({ waiting: 1, overdue: 1, dueToday: 1, checkIns: 1, needsReview: 0 });
    // Later this week is not today's business.
    expect(digest.text).not.toContain('Friday Co');
    expect(digest.text).toContain('• <b>Late Co</b> · 7d · Call chef');
    expect(digest.text).toContain('1 due (1 at-risk)');
    expect(lines.at(-1)).toBe('<a href="https://example.test">Open This week</a>');
  });

  it('lists the most overdue first and caps each list', () => {
    const overdue = Array.from({ length: 7 }, (_, i) => item({ companyName: `Co ${i}`, dueDate: `2026-09-${String(10 + i).padStart(2, '0')}` }));
    const { text } = buildDailyDigest({ queue: queue({ overdue: [...overdue].reverse() }), waiting: [], today: TODAY });
    expect(text.indexOf('Co 0')).toBeLessThan(text.indexOf('Co 4'));
    expect(text).not.toContain('Co 5');
    expect(text).toContain('…and 2 more');
  });

  it('keeps held contacts out of the chase lists', () => {
    const held = item({ companyName: 'Held Co', holds: [{} as AttentionCandidate['holds'][number]] });
    const digest = buildDailyDigest({ queue: queue({ needsReview: [held], overdue: [held] }), waiting: [], today: TODAY });
    expect(digest.counts.overdue).toBe(0);
    expect(digest.text).toContain('1 need a decision');
    expect(digest.text).not.toContain('Held Co');
  });

  it('escapes names and actions', () => {
    const { text } = buildDailyDigest({
      queue: queue({ dueThisWeek: [item({ companyName: 'Salt & <Butter>', nextAction: 'Ask "5 < 10kg?"' })] }),
      waiting: [],
      today: TODAY,
    });
    expect(text).toContain('<b>Salt &amp; &lt;Butter&gt;</b> · Ask "5 &lt; 10kg?"');
  });
});
