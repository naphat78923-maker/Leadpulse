import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import {
  currentDealSchedule,
  describeDealSchedule,
  scheduleUpdateForIntent,
  validateScheduleIntent,
} from './deal-schedule';

const deal: Deal = {
  id: 'deal-1',
  title: 'Butter · Alice Bakery',
  stage: 'research',
  product: 'Butter',
  client: 'Alice Bakery',
  company_id: null,
  contact_ids: [],
  value: null,
  priority: 'medium',
  next_action: 'Follow up on the offer',
  followup_date: '2026-09-15',
  last_outcome: null,
  nudge_count: 0,
  workflow_action: 'outreach',
  nudge_stage: null,
  sample_status: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

describe('current deal schedule', () => {
  it('reads the deal as the one authoritative schedule', () => {
    expect(currentDealSchedule(deal)).toEqual({ next_action: 'Follow up on the offer', followup_date: '2026-09-15' });
  });

  it('reports an unset schedule as unknown rather than as a date', () => {
    expect(currentDealSchedule({ ...deal, followup_date: null })).toEqual({
      next_action: 'Follow up on the offer',
      followup_date: null,
    });
  });

  it('describes the schedule so the form can show what it is about to change', () => {
    // Same month formatting as the board's compactDate (en-GB short month).
    expect(describeDealSchedule(currentDealSchedule(deal))).toBe('Follow up on the offer · 15 Sept 2026');
    expect(describeDealSchedule({ next_action: null, followup_date: '2026-09-15' })).toBe('No next action · 15 Sept 2026');
    expect(describeDealSchedule({ next_action: 'Follow up on the offer', followup_date: null })).toBe(
      'Follow up on the offer · no date'
    );
    expect(describeDealSchedule({ next_action: null, followup_date: null })).toBe('No next action · no date');
  });
});

describe('schedule intent', () => {
  it('preserves the current schedule by default and writes nothing', () => {
    expect(scheduleUpdateForIntent(deal, { mode: 'preserve' })).toEqual({});
  });

  it('never lets an empty field erase an existing schedule', () => {
    // The form's date field is empty here; preserve must still write nothing.
    expect(scheduleUpdateForIntent(deal, { mode: 'preserve' })).not.toHaveProperty('followup_date');
  });

  it('replaces the schedule with the chosen date', () => {
    expect(scheduleUpdateForIntent(deal, { mode: 'replace', date: '2026-09-22' })).toEqual({ followup_date: '2026-09-22' });
  });

  it('clears the schedule only when the user says clear', () => {
    expect(scheduleUpdateForIntent(deal, { mode: 'clear' })).toEqual({ followup_date: null });
  });

  it('treats clearing an already-empty schedule as a no-op', () => {
    expect(scheduleUpdateForIntent({ ...deal, followup_date: null }, { mode: 'clear' })).toEqual({});
  });

  it('rejects a replacement with no real date', () => {
    expect(validateScheduleIntent({ mode: 'replace', date: '' })).toMatch(/date/i);
    expect(validateScheduleIntent({ mode: 'replace', date: 'next tuesday' })).toMatch(/date/i);
    expect(validateScheduleIntent({ mode: 'replace', date: '2026-09-22' })).toBeNull();
    expect(validateScheduleIntent({ mode: 'preserve' })).toBeNull();
    expect(validateScheduleIntent({ mode: 'clear' })).toBeNull();
  });

  it('never writes a schedule for a deal that is not linked', () => {
    // An unlinked note has no deal to schedule: the caller passes no deal and gets no patch.
    expect(scheduleUpdateForIntent(null, { mode: 'replace', date: '2026-09-22' })).toEqual({});
    expect(scheduleUpdateForIntent(null, { mode: 'clear' })).toEqual({});
  });
});
