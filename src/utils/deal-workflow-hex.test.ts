import { describe, expect, it } from 'vitest';
import { LANE_HEX_KIND, WORKFLOW_LANES } from './deal-workflow';

describe('LANE_HEX_KIND', () => {
  it('maps every workflow lane to the audited HexFace kind', () => {
    expect(LANE_HEX_KIND).toEqual({
      outreach: 'call',
      reply: 'message',
      sample: 'package',
      testing: 'search',
      reschedule: 'pause',
      parked: 'pause',
      success: 'success',
    });
  });

  it('covers every WORKFLOW_LANES id', () => {
    for (const lane of WORKFLOW_LANES) {
      expect(LANE_HEX_KIND[lane.id]).toBeTruthy();
    }
  });
});
