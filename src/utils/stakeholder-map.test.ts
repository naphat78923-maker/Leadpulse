import { describe, expect, it } from 'vitest';
import { deriveMapStatus, mapStatusLabel } from './stakeholder-map';

describe('deriveMapStatus', () => {
  it('unknown when nothing set', () => {
    expect(deriveMapStatus({})).toBe('unknown');
    expect(deriveMapStatus({ champion_contact_id: null, decision_maker_contact_id: null })).toBe('unknown');
  });

  it('partial when only champion or only DM or only blocker', () => {
    expect(deriveMapStatus({ champion_contact_id: 'c1' })).toBe('partial');
    expect(deriveMapStatus({ decision_maker_contact_id: 'd1' })).toBe('partial');
    expect(deriveMapStatus({ blocker_label: 'Procurement' })).toBe('partial');
    expect(deriveMapStatus({ champion_contact_id: 'c1', blocker_contact_id: 'b1' })).toBe('partial');
  });

  it('complete when champion + DM (blocker optional)', () => {
    expect(deriveMapStatus({ champion_contact_id: 'c1', decision_maker_contact_id: 'd1' })).toBe('complete');
    expect(
      deriveMapStatus({
        champion_contact_id: 'c1',
        decision_maker_contact_id: 'd1',
        blocker_label: 'Procurement',
      })
    ).toBe('complete');
  });

  it('labels', () => {
    expect(mapStatusLabel('unknown')).toBe('Unknown');
    expect(mapStatusLabel('partial')).toBe('Partial');
    expect(mapStatusLabel('complete')).toBe('Complete');
  });
});
