import { describe, expect, it } from 'vitest';
import { JOURNEY_LANE_IDS } from './deal-workflow';
import { LANE_PLAYBOOKS, lanePrefill } from './lane-playbook';

const TODAY = '2026-10-25';

describe('LANE_PLAYBOOKS', () => {
  it('gives every journey lane after Outreach a date and a next action', () => {
    for (const lane of JOURNEY_LANE_IDS.filter(id => id !== 'outreach')) {
      expect(LANE_PLAYBOOKS[lane]?.days).toBeGreaterThan(0);
      expect(LANE_PLAYBOOKS[lane]?.nextAction.trim()).not.toBe('');
    }
  });

  it('leaves Outreach to the nudge ladder', () => {
    expect(LANE_PLAYBOOKS.outreach).toBeUndefined();
  });

  it('starts from the agreed defaults', () => {
    expect(LANE_PLAYBOOKS.reply).toEqual({ days: 2, nextAction: 'Send product sheet / ask for address' });
    expect(LANE_PLAYBOOKS.sample).toEqual({ days: 3, nextAction: 'Check the sample arrived' });
    expect(LANE_PLAYBOOKS.testing).toEqual({ days: 7, nextAction: 'Ask how the test went' });
    expect(LANE_PLAYBOOKS.reschedule?.days).toBe(14);
  });
});

describe('lanePrefill', () => {
  it('fills the lane default on a deal with no follow-up date', () => {
    expect(lanePrefill({ followup_date: null }, 'reply', TODAY)).toEqual({
      followupDate: '2026-10-27',
      dateIsDefault: true,
      defaultDate: '2026-10-27',
      days: 2,
      nextAction: 'Send product sheet / ask for address',
    });
    expect(lanePrefill({ followup_date: null }, 'testing', TODAY).followupDate).toBe('2026-11-01');
    expect(lanePrefill({ followup_date: null }, 'reschedule', TODAY).followupDate).toBe('2026-11-08');
  });

  it('never replaces a date already on the deal, even a past one', () => {
    for (const saved of ['2026-12-01', '2026-09-01']) {
      const prefill = lanePrefill({ followup_date: saved }, 'sample', TODAY);
      expect(prefill.followupDate).toBe(saved);
      expect(prefill.dateIsDefault).toBe(false);
      // The default is still offered, for Pat to choose.
      expect(prefill.defaultDate).toBe('2026-10-28');
      expect(prefill.nextAction).toBe('Check the sample arrived');
    }
  });

  it('fills nothing for a lane with no playbook', () => {
    expect(lanePrefill({ followup_date: null }, 'outreach', TODAY)).toEqual({
      followupDate: null, dateIsDefault: false, defaultDate: null, days: null, nextAction: null,
    });
    expect(lanePrefill({ followup_date: '2026-11-02' }, 'outreach', TODAY).followupDate).toBe('2026-11-02');
  });
});
